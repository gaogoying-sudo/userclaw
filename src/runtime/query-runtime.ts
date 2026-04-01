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
 *
 * Placeholder status: model call is mocked; tool loop runs 1 pass.
 * Phase 2 (Codex) will replace mock model call with real LLM integration,
 * add streaming, auto-compact, multi-turn tool loop, and abort handling.
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

export interface QueryRuntimeDeps {
  toolRegistry: ToolRegistry;
  permissionEngine: PermissionEngine;
  knowledgeStore: KnowledgeStore;
  skillStore: SkillStore;
  ruleStore: RuleStore;
}

export interface QueryRunResult {
  session: QuerySession;
  toolResults: ToolResult[];
  metrics: SessionMetrics;
  permissionDecisions: PermissionDecisionEvent[];
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

      const runtimeCtx = this.buildRuntimeContext(request);

      // -- running --
      sm.transition('running');
      session.state = sm.state;

      // Branch by task type: injection deposits into stores; execution runs tools.
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

      // Mock model call: in Phase 2 this becomes a real LLM request that
      // may return tool_use blocks in a streaming loop.
      const modelDecision = await this.mockModelCall(request, runtimeCtx);

      // Process tool calls from model decision
      for (const tc of modelDecision.toolCalls) {
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

        // Permission check
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

  private buildRuntimeContext(request: SubmitRequest): RuntimeContext {
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
        modelMode: 'local',
        selectedModel: 'mock-model-v1',
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
   *
   * Placeholder: uses mock parsing that extracts from structuredPayload or
   * derives mock items from inputText. Phase 2 (Codex) will replace with
   * real extraction (LLM-assisted or structured form parsing).
   */
  private handleInjection(request: SubmitRequest): ToolResult {
    const payload = request.structuredPayload ?? {};
    const text = request.inputText ?? '';

    const deposited: string[] = [];
    const existingKnowledge = this.deps.knowledgeStore.listAll();
    const existingSkills = this.deps.skillStore.listAll();
    const existingRules = this.deps.ruleStore.listAll();

    // Deposit knowledge items from payload or derive from text
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

    // Deposit skill items from payload
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

    // Deposit rule items from payload
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

  /**
   * Mock model call.
   *
   * Placeholder: returns a hardcoded tool call plan with per-tool valid inputs.
   * Phase 2 (Codex) replaces with real LLM streaming call that
   * parses tool_use blocks from the model response.
   */
  private async mockModelCall(
    request: SubmitRequest,
    _ctx: RuntimeContext,
  ): Promise<{ response: string; toolCalls: ToolCall[] }> {
    const availableTools = this.deps.toolRegistry.listNames();
    const taskText = request.inputText ?? '';

    const toolCalls: ToolCall[] = availableTools.map((name) => ({
      id: generateId(),
      toolName: name,
      input: this.buildMockToolInput(name, taskText),
      invokedAt: new Date().toISOString(),
    }));

    return {
      response: `[mock-model] Analyzed task "${taskText}". Invoking ${toolCalls.length} tool(s).`,
      toolCalls,
    };
  }

  /**
   * Generate schema-compliant mock input per tool name.
   * Ensures Tool Contract validation actually exercises real checks.
   */
  private buildMockToolInput(toolName: string, taskText: string): unknown {
    const lowerTask = taskText.toLowerCase();

    switch (toolName) {
      case 'file_read':
        return { path: 'docs/planning/userclaw-v1-project-charter.md', maxBytes: 5000 };
      case 'file_write':
        return {
          path: lowerTask.includes('docs')
            ? 'docs/runtime-generated.md'
            : 'userclaw-data/generated/runtime-notes.md',
          content: `Generated from task: ${taskText}\n`,
        };
      case 'directory_list':
        return { path: 'src', maxEntries: 20 };
      case 'local_search':
        return { query: taskText, path: 'src', maxResults: 8 };
      default:
        return { query: taskText };
    }
  }
}
