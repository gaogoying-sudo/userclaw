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
            return { session, toolResults, metrics: metrics.snapshot(), error: {
              code: 'PERMISSION_DENIED',
              message: session.failureReason,
              category: 'permission_denied',
              retryable: false,
            }};
          }
          if (decision.decision === 'ask') {
            // In V1 skeleton, 'ask' is auto-approved for demo purposes.
            // Phase 2 will wire this to an interactive UI confirmation flow.
            sm.transition('waiting_permission');
            session.state = sm.state;
            // simulate approval
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

      return { session, toolResults, metrics: metrics.snapshot() };
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
        error: {
          code: 'RUNTIME_ERROR',
          message,
          category: 'runtime_error',
          retryable: false,
        },
      };
    }
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
   * Mock model call.
   *
   * Placeholder: returns a hardcoded tool call plan.
   * Phase 2 (Codex) replaces with real LLM streaming call that
   * parses tool_use blocks from the model response.
   */
  private async mockModelCall(
    request: SubmitRequest,
    _ctx: RuntimeContext,
  ): Promise<{ response: string; toolCalls: ToolCall[] }> {
    const availableTools = this.deps.toolRegistry.listNames();

    const toolCalls: ToolCall[] = availableTools.map((name) => ({
      id: generateId(),
      toolName: name,
      input: { query: request.inputText ?? '' },
      invokedAt: new Date().toISOString(),
    }));

    return {
      response: `[mock-model] Analyzed task "${request.inputText}". Invoking ${toolCalls.length} tool(s).`,
      toolCalls,
    };
  }
}
