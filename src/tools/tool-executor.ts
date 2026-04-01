/**
 * Tool Executor — runs a ToolCall through the registered ToolSpec.
 *
 * Responsibilities:
 *  - Resolve tool from registry
 *  - Run optional input validation
 *  - Execute tool
 *  - Return unified ToolResult
 *
 * Placeholder status: no concurrency batching; runs tools sequentially.
 * Phase 2 (Codex) will add read-only concurrent batch execution,
 * serial queue for write tools, and timeout handling.
 */

import type { ToolCall, ToolResult, RuntimeContext } from '../shared/contracts.js';
import type { ToolRegistry } from './tool-registry.js';

export class ToolExecutor {
  private registry: ToolRegistry;

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  async execute(call: ToolCall, ctx: RuntimeContext): Promise<ToolResult> {
    const spec = this.registry.get(call.toolName);
    if (!spec) {
      return {
        ok: false,
        previewText: `Tool not found: ${call.toolName}`,
        errorCode: 'TOOL_NOT_FOUND',
        errorMessage: `Tool "${call.toolName}" is not registered in the tool pool`,
      };
    }

    if (spec.validateInput) {
      const validation = await spec.validateInput(call.input, ctx);
      if (!validation.valid) {
        return {
          ok: false,
          previewText: `Validation failed: ${(validation.errors ?? []).join('; ')}`,
          errorCode: 'VALIDATION_ERROR',
          errorMessage: (validation.errors ?? []).join('; '),
        };
      }
    }

    try {
      return await spec.execute(call.input, ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        previewText: `Tool execution failed: ${message}`,
        errorCode: 'TOOL_EXEC_ERROR',
        errorMessage: message,
      };
    }
  }
}
