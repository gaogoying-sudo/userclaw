/**
 * Query Runtime — the main orchestrator for a single execution turn.
 *
 * Phase 4 hardening scope:
 *  - stable context/trace output
 *  - unified error categorization
 *  - assistant artifact strategy for large outputs
 *  - minimal session/history persistence
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
} from '../models/model-types.js';
import {
  createAssistantOutput,
  type AssistantOutput,
  type QueryModelTrace,
} from './runtime-trace.js';
import { SessionStore } from '../session/session-store.js';
import type { SessionRecord } from '../session/session-types.js';

const TRACE_ARTIFACT_THRESHOLD = 2200;

export interface QueryRuntimeDeps {
  toolRegistry: ToolRegistry;
  permissionEngine: PermissionEngine;
  knowledgeStore: KnowledgeStore;
  skillStore: SkillStore;
  ruleStore: RuleStore;
  sessionStore?: SessionStore;
}

export interface QueryRunResult {
  session: QuerySession;
  toolResults: ToolResult[];
  metrics: SessionMetrics;
  permissionDecisions: PermissionDecisionEvent[];
  assistantResponse?: string;
  assistantOutput?: AssistantOutput;
  modelTrace?: QueryModelTrace;
  traceArtifactUri?: string;
  error?: ExecutionError;
}

interface ModelPlanningResult {
  ok: boolean;
  assistantResponse?: string;
  toolCalls: ToolCall[];
  modelTrace: QueryModelTrace;
  error?: ExecutionError;
}

interface StructuredToolCallInput {
  toolName: string;
  input?: unknown;
}

export class QueryRuntime {
  private deps: QueryRuntimeDeps;
  private sessionStore: SessionStore;

  constructor(deps: QueryRuntimeDeps) {
    this.deps = deps;
    this.sessionStore = deps.sessionStore
      ?? new SessionStore({ dataRoot: deps.knowledgeStore.getDataRoot() });
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

    const finalize = (payload: {
      assistantOutput?: AssistantOutput;
      modelTrace?: QueryModelTrace;
      traceArtifactUri?: string;
      error?: ExecutionError;
    }): QueryRunResult => {
      const result: QueryRunResult = {
        session,
        toolResults: [...toolResults],
        metrics: metrics.snapshot(),
        permissionDecisions: this.getPermissionDecisionsSince(permissionLogStart),
        assistantOutput: payload.assistantOutput,
        assistantResponse: payload.assistantOutput?.fullText ?? payload.assistantOutput?.previewText,
        modelTrace: payload.modelTrace,
        traceArtifactUri: payload.traceArtifactUri,
        error: payload.error,
      };
      this.persistRunRecord(request, result);
      return result;
    };

    try {
      sm.transition('dispatching');
      session.state = sm.state;

      const runtimeCtx = this.buildRuntimeContext(request, modelConfigState);

      sm.transition('running');
      session.state = sm.state;

      if (session.taskType === 'injection') {
        const injectionResult = this.handleInjection(request);
        toolResults.push(injectionResult);

        sm.transition('completed');
        session.state = sm.state;
        session.endedAt = new Date().toISOString();
        metrics.recordEnd(Date.now() - startTime);

        return finalize({});
      }

      const modelStart = Date.now();
      const modelPlanning = await this.planExecutionWithModel(request, runtimeCtx, modelConfigState);
      metrics.recordModelCall(Date.now() - modelStart, modelPlanning.modelTrace.model);
      metrics.recordFallbackUsed(modelPlanning.modelTrace.usedMockFallback);

      const traceArtifactUri = this.maybePersistTraceArtifact(
        request.sessionId,
        request.id,
        session.id,
        modelPlanning.modelTrace,
      );

      if (!modelPlanning.ok || !modelPlanning.assistantResponse) {
        sm.transition('failed');
        session.state = sm.state;
        session.failureReason = modelPlanning.error?.message ?? 'Model planning failed';
        session.endedAt = new Date().toISOString();
        metrics.recordEnd(Date.now() - startTime);

        return finalize({
          modelTrace: modelPlanning.modelTrace,
          traceArtifactUri,
          error: modelPlanning.error ?? {
            code: 'MODEL_PLANNING_FAILED',
            message: session.failureReason,
            category: 'runtime_error',
            retryable: false,
          },
        });
      }

      const assistantOutput = this.buildAssistantOutput(
        modelPlanning.assistantResponse,
        request.sessionId,
        request.id,
        session.id,
      );

      const structuredToolCalls = this.extractStructuredToolCalls(request);
      const plannedToolCalls = [...modelPlanning.toolCalls, ...structuredToolCalls];

      for (const tc of plannedToolCalls) {
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

            return finalize({
              assistantOutput,
              modelTrace: modelPlanning.modelTrace,
              traceArtifactUri,
              error: {
                code: 'PERMISSION_DENIED',
                message: session.failureReason,
                category: 'permission_denied',
                retryable: false,
              },
            });
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

              return finalize({
                assistantOutput,
                modelTrace: modelPlanning.modelTrace,
                traceArtifactUri,
                error: {
                  code: 'PERMISSION_DENIED',
                  message: session.failureReason,
                  category: 'permission_denied',
                  retryable: false,
                },
              });
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

        if (!result.ok && result.errorCode === 'VALIDATION_ERROR') {
          sm.transition('failed');
          session.state = sm.state;
          session.failureReason = `Tool input validation failed for ${tc.toolName}`;
          session.endedAt = new Date().toISOString();
          metrics.recordEnd(Date.now() - startTime);

          return finalize({
            assistantOutput,
            modelTrace: modelPlanning.modelTrace,
            traceArtifactUri,
            error: {
              code: 'TOOL_VALIDATION_ERROR',
              message: session.failureReason,
              category: 'tool_validation_error',
              retryable: false,
            },
          });
        }
      }

      sm.transition('completed');
      session.state = sm.state;
      session.endedAt = new Date().toISOString();
      metrics.recordEnd(Date.now() - startTime);

      return finalize({
        assistantOutput,
        modelTrace: modelPlanning.modelTrace,
        traceArtifactUri,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!sm.isTerminal()) {
        try { sm.transition('failed'); } catch { /* already terminal */ }
      }
      session.state = sm.state;
      session.failureReason = message;
      session.endedAt = new Date().toISOString();
      metrics.recordEnd(Date.now() - startTime);

      return finalize({
        error: {
          code: 'RUNTIME_ERROR',
          message,
          category: 'runtime_error',
          retryable: false,
        },
      });
    }
  }

  private getPermissionDecisionsSince(startIndex: number): PermissionDecisionEvent[] {
    return this.deps.permissionEngine.listDecisionLog().slice(startIndex);
  }

  private extractStructuredToolCalls(request: SubmitRequest): ToolCall[] {
    const payload = request.structuredPayload as { toolCalls?: unknown } | undefined;
    if (!payload || !Array.isArray(payload.toolCalls)) {
      return [];
    }

    return payload.toolCalls
      .filter((item): item is StructuredToolCallInput => {
        if (!item || typeof item !== 'object') {
          return false;
        }
        const maybe = item as Partial<StructuredToolCallInput>;
        return typeof maybe.toolName === 'string' && maybe.toolName.trim().length > 0;
      })
      .map((item) => ({
        id: generateId(),
        toolName: item.toolName.trim(),
        input: item.input,
        invokedAt: new Date().toISOString(),
      }));
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
          retryCount: response.retryCount,
          contextStrategy: context.contextStrategy,
          usedKnowledgeIds: context.usedKnowledge.map((item) => item.id),
          usedSkillIds: context.usedSkills.map((item) => item.id),
          usedRuleIds: context.usedRules.map((item) => item.id),
          contextTrace: context.contextTrace,
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
        retryCount: response.retryCount,
        lastFailureCode: response.code,
        lastFailureMessage: response.message,
        contextStrategy: context.contextStrategy,
        usedKnowledgeIds: context.usedKnowledge.map((item) => item.id),
        usedSkillIds: context.usedSkills.map((item) => item.id),
        usedRuleIds: context.usedRules.map((item) => item.id),
        contextTrace: context.contextTrace,
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
        retryCount: failure.retryCount,
        lastFailureCode: failure.code,
        lastFailureMessage: failure.message,
        contextStrategy,
        usedKnowledgeIds: context.usedKnowledge.map((item) => item.id),
        usedSkillIds: context.usedSkills.map((item) => item.id),
        usedRuleIds: context.usedRules.map((item) => item.id),
        contextTrace: context.contextTrace,
      },
    };
  }

  private mapModelFailureToExecutionError(failure: ModelCallFailure): ExecutionError {
    switch (failure.code) {
      case 'MODEL_TIMEOUT':
      case 'MODEL_CONNECT_ERROR':
      case 'MODEL_HTTP_401':
      case 'MODEL_HTTP_403':
      case 'MODEL_HTTP_429':
      case 'MODEL_HTTP_5XX':
      case 'MODEL_NETWORK_ERROR':
        return {
          code: failure.code,
          message: `${failure.message}\n${failure.retryCount > 0 ? '已自动重试 1 次。' : '未执行自动重试。'}\n建议：${failure.nextAction}`,
          category: 'model_http_error',
          retryable: failure.retryable,
        };
      case 'MODEL_RESPONSE_PARSE_ERROR':
        return {
          code: failure.code,
          message: `${failure.message}\n未执行自动重试。\n建议：${failure.nextAction}`,
          category: 'model_response_error',
          retryable: false,
        };
      case 'MODEL_CONFIG_MISSING':
      case 'MODEL_API_KEY_MISSING':
      default:
        return {
          code: failure.code,
          message: `${failure.message}\n未执行自动重试。\n建议：${failure.nextAction}`,
          category: 'model_config_error',
          retryable: false,
        };
    }
  }

  private buildAssistantOutput(
    text: string,
    submitSessionId: string,
    requestId: string,
    querySessionId: string,
  ): AssistantOutput {
    return createAssistantOutput(
      text,
      (content, hint) => {
        const artifactUri = this.sessionStore.saveArtifact(content, `${hint}-${querySessionId}`);
        this.sessionStore.appendHistoryEntry(submitSessionId, {
          id: generateId(),
          timestamp: new Date().toISOString(),
          type: 'artifact_written',
          submitSessionId,
          requestId,
          querySessionId,
          details: {
            artifactUri,
            artifactType: 'assistant_response',
          },
        });
        return artifactUri;
      },
      {
        maxInlineLength: 1200,
        artifactHint: 'assistant-response',
      },
    );
  }

  private maybePersistTraceArtifact(
    submitSessionId: string,
    requestId: string,
    querySessionId: string,
    modelTrace: QueryModelTrace,
  ): string | undefined {
    const serialized = JSON.stringify(modelTrace.contextTrace, null, 2);
    if (serialized.length <= TRACE_ARTIFACT_THRESHOLD) {
      return undefined;
    }

    const artifactUri = this.sessionStore.saveArtifact(serialized, `runtime-trace-${querySessionId}`);
    this.sessionStore.appendHistoryEntry(submitSessionId, {
      id: generateId(),
      timestamp: new Date().toISOString(),
      type: 'artifact_written',
      submitSessionId,
      requestId,
      querySessionId,
      details: {
        artifactUri,
        artifactType: 'context_trace',
      },
    });
    return artifactUri;
  }

  private persistRunRecord(request: SubmitRequest, result: QueryRunResult): void {
    try {
      const modelTrace = result.modelTrace;
      const sessionRecord: SessionRecord = {
        id: result.session.id,
        submitSessionId: request.sessionId,
        requestId: request.id,
        taskType: result.session.taskType,
        state: result.session.state,
        startedAt: result.session.startedAt,
        endedAt: result.session.endedAt,
        model: {
          provider: modelTrace?.provider ?? 'mock',
          model: modelTrace?.model ?? result.metrics.modelId ?? 'unknown-model',
          usedMockFallback: modelTrace?.usedMockFallback ?? false,
          fallbackReason: modelTrace?.fallbackReason,
        },
        context: {
          contextStrategy: modelTrace?.contextStrategy,
          usedKnowledgeIds: modelTrace?.usedKnowledgeIds ?? [],
          usedSkillIds: modelTrace?.usedSkillIds ?? [],
          usedRuleIds: modelTrace?.usedRuleIds ?? [],
        },
        errorCategory: result.error?.category,
        errorCode: result.error?.code,
        artifactUris: [result.assistantOutput?.artifactUri, result.traceArtifactUri]
          .filter((value): value is string => Boolean(value)),
      };

      this.sessionStore.saveSessionRecord(sessionRecord);
      this.sessionStore.appendHistoryEntry(request.sessionId, {
        id: generateId(),
        timestamp: new Date().toISOString(),
        type: 'runtime_result',
        submitSessionId: request.sessionId,
        requestId: request.id,
        querySessionId: result.session.id,
        taskType: result.session.taskType,
        state: result.session.state,
        model: sessionRecord.model,
        errorCategory: result.error?.category,
        details: {
          fallbackUsed: result.metrics.fallbackUsed ?? false,
          modelRetryCount: modelTrace?.retryCount ?? 0,
          modelLastFailureCode: modelTrace?.lastFailureCode,
          modelLastFailureMessage: modelTrace?.lastFailureMessage,
          modelCallMs: result.metrics.modelCallMs,
          wallTimeMs: result.metrics.wallTimeMs,
          toolExecutionMs: result.metrics.toolExecutionMs,
          permissionDecisionCount: result.permissionDecisions.length,
          permissionDecisions: result.permissionDecisions.map((event) => ({
            toolName: event.toolName,
            targetPath: event.targetPath,
            decision: event.decision,
            scope: event.scope,
            reason: event.reason,
            source: event.source,
            timestamp: event.timestamp,
          })),
          toolResultCount: result.toolResults.length,
          toolResultPreview: result.toolResults.map((toolResult) => ({
            ok: toolResult.ok,
            previewText: toolResult.previewText,
            errorCode: toolResult.errorCode,
            artifactUri: toolResult.artifactUri,
          })),
          assistantArtifactUri: result.assistantOutput?.artifactUri,
          traceArtifactUri: result.traceArtifactUri,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Persistence must not break the runtime result path.
      console.warn(`[runtime] failed to persist session/history: ${message}`);
    }
  }
}
