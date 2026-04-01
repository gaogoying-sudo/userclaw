/**
 * Query Runtime — the main orchestrator for a single execution turn.
 *
 * Responsibilities:
 *  - Receive a SubmitRequest
 *  - Build QuerySession + RuntimeContext
 *  - Drive the state machine through dispatching → running → completed/failed
 *  - Invoke Tool Runtime when needed
 *  - Consult Permission Engine before risky tool calls
 *  - Record minimal metrics
 */

import type {
  SubmitRequest,
  QuerySession,
  RuntimeContext,
  ToolCall,
  ToolResult,
  SessionMetrics,
  ExecutionError,
} from '../shared/contracts.js';
import { generateId } from '../shared/id.js';
import { QueryStateMachine } from './query-state-machine.js';
import { ToolExecutor } from '../tools/tool-executor.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { PermissionEngine } from '../permissions/permission-engine.js';
import { KnowledgeStore } from '../knowledge/knowledge-store.js';
import { SkillStore } from '../skills/skill-store.js';
import { RuleStore } from '../rules/rule-store.js';
import { MetricsCollector } from '../observability/metrics.js';
import type { PermissionDecisionEvent } from '../permissions/permission-types.js';
import { buildRuntimeModelContext } from './context-builder.js';
import { loadModelConfig } from '../models/model-config.js';
import { callModel } from '../models/model-client.js';
import type {
  ModelCallFailure,
  ModelConfigState,
  ModelProvider,
} from '../models/model-types.js';

export interface QueryRuntimeDeps {
  toolRegistry: ToolRegistry;
  permissionEngine: PermissionEngine;
  knowledgeStore: KnowledgeStore;
  skillStore: SkillStore;
  ruleStore: RuleStore;
}

export interface QueryModelTrace {
  provider: ModelProvider | 'mock';
  model: string;
  usedMockFallback: boolean;
  fallbackReason?: string;
  contextStrategy: string;
  usedKnowledgeIds: string[];
  usedSkillIds: string[];
  usedRuleIds: string[];
}

export interface QueryRunResult {
  session: QuerySession;
  toolResults: ToolResult[];
  metrics: SessionMetrics;
  permissionDecisions: PermissionDecisionEvent[];
  assistantResponse?: string;
  modelTrace?: QueryModelTrace;
  error?: ExecutionError;
}

interface ModelPlanningResult {
  ok: boolean;
  assistantResponse?: string;
  toolCalls: ToolCall[];
  modelTrace: QueryModelTrace;
  error?: ExecutionError;
}

export class QueryRuntime {
  private deps: QueryRuntimeDeps;

  constructor(deps: QueryRuntimeDeps) {
    this.deps = deps;
  }

  async execute(request: SubmitRequest): Promise<QueryRunResult> {
    const sm = new QueryStateMachine();
    const metrics = new MetricsCollector(request.sessionId);
    const startTime = Date.now();
    const permissionLogStart = this.deps.permissionEngine.listDecisionLog().length;
    const modelConfigState = loadModelConfig();

    const session: QuerySession = {
      id: generateId(),
      submitRequestId: request.id,
      state: 'idle',
      taskType: this.resolveTaskType(request),
      startedAt: new Date().toISOString(),
    };

    const toolResults: ToolResult[] = [];

    try {
      // -- dispatching --
      sm.transition('dispatching');
      session.state = sm.state;

      const runtimeCtx = this.buildRuntimeContext(request, modelConfigState);

      // -- running --
      sm.transition('running');
      session.state = sm.state;

      // Branch by task type: injection deposits into stores; execution runs model flow.
      if (session.taskType === 'injection') {
        const injectionResult = this.handleInjection(request);
        sm.transition('completed');
        session.state = sm.state;
        session.endedAt = new Date().toISOString();
        metrics.recordEnd(Date.now() - startTime);
        toolResults.push(injectionResult);
        return {
          session,
          toolResults,
          metrics: metrics.snapshot(),
          permissionDecisions: this.getPermissionDecisionsSince(permissionLogStart),
        };
      }

      const modelStart = Date.now();
      const modelPlanning = await this.planExecutionWithModel(request, runtimeCtx, modelConfigState);
      metrics.recordModelCall(
        Date.now() - modelStart,
        modelPlanning.modelTrace.model,
      );

      if (!modelPlanning.ok || !modelPlanning.assistantResponse) {
        sm.transition('failed');
        session.state = sm.state;
        session.failureReason = modelPlanning.error?.message ?? 'Model planning failed';
        session.endedAt = new Date().toISOString();
        metrics.recordEnd(Date.now() - startTime);

        return {
          session,
          toolResults,
          metrics: metrics.snapshot(),
          permissionDecisions: this.getPermissionDecisionsSince(permissionLogStart),
          modelTrace: modelPlanning.modelTrace,
          error: modelPlanning.error ?? {
            code: 'MODEL_PLANNING_FAILED',
            message: session.failureReason,
            category: 'model_error',
            retryable: false,
          },
        };
      }

      // Process tool calls if future model output includes them.
      for (const tc of modelPlanning.toolCalls) {
        const spec = this.deps.toolRegistry.get(tc.toolName);
        if (!spec) {
          toolResults.push({
            ok: false,
            previewText: `Unknown tool: ${tc.toolName}`,
            errorCode: 'TOOL_NOT_FOUND',
            errorMessage: `Tool "${tc.toolName}" is not registered`,
          });
          continue;
        }

        if (spec.requiresPermission) {
          const decision = await this.deps.permissionEngine.evaluate(spec, tc.input, runtimeCtx);
          if (decision.decision === 'deny') {
            sm.transition('waiting_permission');
            session.state = sm.state;
            toolResults.push({
              ok: false,
              previewText: `Permission denied: ${decision.reason ?? 'no reason'}`,
              errorCode: 'PERMISSION_DENIED',
              errorMessage: decision.reason,
            });
            sm.transition('failed');
            session.state = sm.state;
            session.failureReason = `Permission denied for tool ${tc.toolName}`;
            session.endedAt = new Date().toISOString();
            metrics.recordEnd(Date.now() - startTime);
            return {
              session,
              toolResults,
              metrics: metrics.snapshot(),
              permissionDecisions: this.getPermissionDecisionsSince(permissionLogStart),
              assistantResponse: modelPlanning.assistantResponse,
              modelTrace: modelPlanning.modelTrace,
              error: {
                code: 'PERMISSION_DENIED',
                message: session.failureReason,
                category: 'permission_denied',
                retryable: false,
              },
            };
          }
          if (decision.decision === 'ask') {
            sm.transition('waiting_permission');
            session.state = sm.state;

            const finalDecision = await this.deps.permissionEngine.requestPermission({
              sessionId: session.id,
              submitRequestId: request.id,
              tool: {
                name: spec.name,
                description: spec.description,
                isReadOnly: spec.isReadOnly,
                isDestructive: spec.isDestructive,
                requiresPermission: spec.requiresPermission,
              },
              input: tc.input,
              runtimeContext: runtimeCtx,
              initialDecision: decision,
              targetPath: this.deps.permissionEngine.getTargetPath(tc.input),
            });

            if (finalDecision.decision !== 'allow') {
              sm.transition('failed');
              session.state = sm.state;
              session.failureReason = `Permission ${finalDecision.decision} for tool ${tc.toolName}`;
              session.endedAt = new Date().toISOString();
              metrics.recordEnd(Date.now() - startTime);
              return {
                session,
                toolResults: [
                  ...toolResults,
                  {
                    ok: false,
                    previewText: `Permission ${finalDecision.decision}: ${finalDecision.reason ?? 'no reason'}`,
                    errorCode: 'PERMISSION_DENIED',
                    errorMessage: finalDecision.reason,
                  },
                ],
                metrics: metrics.snapshot(),
                permissionDecisions: this.getPermissionDecisionsSince(permissionLogStart),
                assistantResponse: modelPlanning.assistantResponse,
                modelTrace: modelPlanning.modelTrace,
                error: {
                  code: 'PERMISSION_DENIED',
                  message: session.failureReason,
                  category: 'permission_denied',
                  retryable: false,
                },
              };
            }

            sm.transition('running');
            session.state = sm.state;
          }
        }

        const executor = new ToolExecutor(this.deps.toolRegistry);
        const toolStart = Date.now();
        const result = await executor.execute(tc, runtimeCtx);
        metrics.recordToolExecution(Date.now() - toolStart);
        toolResults.push(result);
      }

      // -- completed --
      sm.transition('completed');
      session.state = sm.state;
      session.endedAt = new Date().toISOString();
      metrics.recordEnd(Date.now() - startTime);

      return {
        session,
        toolResults,
        metrics: metrics.snapshot(),
        permissionDecisions: this.getPermissionDecisionsSince(permissionLogStart),
        assistantResponse: modelPlanning.assistantResponse,
        modelTrace: modelPlanning.modelTrace,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!sm.isTerminal()) {
        try { sm.transition('failed'); } catch { /* already terminal */ }
      }
      session.state = sm.state;
      session.failureReason = message;
      session.endedAt = new Date().toISOString();
      metrics.recordEnd(Date.now() - startTime);

      return {
        session,
        toolResults,
        metrics: metrics.snapshot(),
        permissionDecisions: this.getPermissionDecisionsSince(permissionLogStart),
        error: {
          code: 'RUNTIME_ERROR',
          message,
          category: 'runtime_error',
          retryable: false,
        },
      };
    }
  }

  private getPermissionDecisionsSince(startIndex: number): PermissionDecisionEvent[] {
    return this.deps.permissionEngine.listDecisionLog().slice(startIndex);
  }

  private resolveTaskType(request: SubmitRequest): QuerySession['taskType'] {
    switch (request.triggerMode) {
      case 'injection':   return 'injection';
      case 'command':     return 'command';
      case 'interactive': return 'execution';
      default:            return 'execution';
    }
  }

  private buildRuntimeContext(
    request: SubmitRequest,
    modelConfigState: ModelConfigState,
  ): RuntimeContext {
    const knowledgeIds = this.deps.knowledgeStore.listIds();
    const skillIds = this.deps.skillStore.listIds();
    const ruleIds = this.deps.ruleStore.listIds();

    return {
      systemContext: {
        identity: 'userclaw-v1',
        principles: [
          'Verify before acting',
          'Prefer minimal changes',
          'Fail with clear explanation',
        ],
      },
      runtimeContext: {
        modelMode: modelConfigState.enabled ? 'remote' : 'local',
        selectedModel: modelConfigState.enabled
          ? modelConfigState.config?.modelName
          : 'mock-fallback-v1',
        availableTools: this.deps.toolRegistry.listNames(),
        permissionMode: 'ask',
      },
      taskContext: {
        goal: request.inputText ?? 'No goal specified',
        currentPlan: [],
        recentActions: [],
      },
      injectionContext: {
        knowledgeIds,
        skillIds,
        ruleIds,
      },
    };
  }

  /**
   * Handle guided injection: parse input and deposit into knowledge/skill/rule stores.
   */
  private handleInjection(request: SubmitRequest): ToolResult {
    const payload = request.structuredPayload ?? {};
    const text = request.inputText ?? '';

    const deposited: string[] = [];
    const existingKnowledge = this.deps.knowledgeStore.listAll();
    const existingSkills = this.deps.skillStore.listAll();
    const existingRules = this.deps.ruleStore.listAll();

    const knowledgeEntries = (payload.knowledge as Array<{ title: string; content: string; tags?: string[] }>) ?? [];
    if (knowledgeEntries.length === 0 && text) {
      knowledgeEntries.push({ title: 'Injected knowledge', content: text, tags: ['auto-injected'] });
    }
    for (const k of knowledgeEntries) {
      const duplicate = existingKnowledge.some(
        (item) => item.title === k.title && item.content === k.content,
      );
      if (duplicate) {
        continue;
      }
      this.deps.knowledgeStore.add({
        id: generateId(),
        title: k.title,
        content: k.content,
        tags: k.tags,
        source: 'guided_injection',
      });
      deposited.push(`knowledge: "${k.title}"`);
    }

    const skillEntries = (payload.skills as Array<{ name: string; description: string; steps: string[] }>) ?? [];
    for (const s of skillEntries) {
      const duplicate = existingSkills.some((item) => item.name === s.name);
      if (duplicate) {
        continue;
      }
      this.deps.skillStore.add({
        id: generateId(),
        name: s.name,
        description: s.description,
        steps: s.steps,
      });
      deposited.push(`skill: "${s.name}"`);
    }

    const ruleEntries = (payload.rules as Array<{ name: string; ruleText: string; priority: number }>) ?? [];
    for (const r of ruleEntries) {
      const duplicate = existingRules.some(
        (item) => item.name === r.name && item.ruleText === r.ruleText,
      );
      if (duplicate) {
        continue;
      }
      this.deps.ruleStore.add({
        id: generateId(),
        name: r.name,
        ruleText: r.ruleText,
        priority: r.priority,
        scope: 'project',
      });
      deposited.push(`rule: "${r.name}"`);
    }

    return {
      ok: true,
      previewText: `[injection] Deposited ${deposited.length} item(s): ${deposited.join(', ')}`,
      data: { deposited },
    };
  }

  private async planExecutionWithModel(
    request: SubmitRequest,
    ctx: RuntimeContext,
    modelConfigState: ModelConfigState,
  ): Promise<ModelPlanningResult> {
    const context = buildRuntimeModelContext({
      request,
      runtimeContext: ctx,
      knowledgeItems: this.deps.knowledgeStore.listAll(),
      skillItems: this.deps.skillStore.listAll(),
      ruleItems: this.deps.ruleStore.listAll(),
    });

    const response = await callModel(
      {
        systemPrompt: context.systemPrompt,
        userPrompt: context.userPrompt,
      },
      modelConfigState,
    );

    if (response.ok) {
      return {
        ok: true,
        assistantResponse: response.text,
        toolCalls: [],
        modelTrace: {
          provider: response.provider,
          model: response.modelName,
          usedMockFallback: false,
          contextStrategy: context.contextStrategy,
          usedKnowledgeIds: context.usedKnowledge.map((item) => item.id),
          usedSkillIds: context.usedSkills.map((item) => item.id),
          usedRuleIds: context.usedRules.map((item) => item.id),
        },
      };
    }

    const fallback = this.tryMockFallback(response, request, context.contextStrategy, context);
    if (fallback) {
      return fallback;
    }

    return {
      ok: false,
      toolCalls: [],
      modelTrace: {
        provider: 'openai_compatible',
        model: modelConfigState.config?.modelName ?? 'unknown-model',
        usedMockFallback: false,
        contextStrategy: context.contextStrategy,
        usedKnowledgeIds: context.usedKnowledge.map((item) => item.id),
        usedSkillIds: context.usedSkills.map((item) => item.id),
        usedRuleIds: context.usedRules.map((item) => item.id),
      },
      error: this.mapModelFailureToExecutionError(response),
    };
  }

  private tryMockFallback(
    failure: ModelCallFailure,
    request: SubmitRequest,
    contextStrategy: string,
    context: ReturnType<typeof buildRuntimeModelContext>,
  ): ModelPlanningResult | undefined {
    if (failure.code !== 'MODEL_CONFIG_MISSING' && failure.code !== 'MODEL_API_KEY_MISSING') {
      return undefined;
    }

    const goal = request.inputText ?? 'No goal specified';
    const knowledgeHint = context.usedKnowledge.map((item) => item.title).slice(0, 2).join(', ') || 'none';
    const skillHint = context.usedSkills.map((item) => item.name).slice(0, 1).join(', ') || 'none';
    const ruleHint = context.usedRules.map((item) => item.name).slice(0, 2).join(', ') || 'none';

    const assistantResponse = [
      '[mock-fallback] Real model is not configured; returning a deterministic fallback response.',
      `Reason: ${failure.message}`,
      `Task: ${goal}`,
      `Knowledge hints: ${knowledgeHint}`,
      `Skill hints: ${skillHint}`,
      `Rule hints: ${ruleHint}`,
      'Suggested next step: set USERCLAW_MODEL_API_KEY (and optionally USERCLAW_MODEL_BASE_URL / USERCLAW_MODEL_NAME) to enable real model execution.',
    ].join('\n');

    return {
      ok: true,
      assistantResponse,
      toolCalls: [],
      modelTrace: {
        provider: 'mock',
        model: 'mock-fallback-v1',
        usedMockFallback: true,
        fallbackReason: failure.message,
        contextStrategy,
        usedKnowledgeIds: context.usedKnowledge.map((item) => item.id),
        usedSkillIds: context.usedSkills.map((item) => item.id),
        usedRuleIds: context.usedRules.map((item) => item.id),
      },
    };
  }

  private mapModelFailureToExecutionError(failure: ModelCallFailure): ExecutionError {
    switch (failure.code) {
      case 'MODEL_HTTP_ERROR':
        return {
          code: failure.code,
          message: failure.message,
          category: 'model_error',
          retryable: failure.retryable,
        };
      case 'MODEL_NETWORK_ERROR':
        return {
          code: failure.code,
          message: failure.message,
          category: 'external_connection_error',
          retryable: true,
        };
      case 'MODEL_RESPONSE_INVALID':
        return {
          code: failure.code,
          message: failure.message,
          category: 'model_error',
          retryable: false,
        };
      case 'MODEL_CONFIG_MISSING':
      case 'MODEL_API_KEY_MISSING':
      default:
        return {
          code: failure.code,
          message: failure.message,
          category: 'validation_error',
          retryable: false,
        };
    }
  }
}
