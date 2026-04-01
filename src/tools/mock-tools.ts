/**
 * Mock tools for V1 skeleton validation.
 *
 * These exist solely to prove the tool contract and execution chain work.
 * They are not real capabilities.
 *
 * Placeholder status: will be removed or replaced in Phase 2 (Codex)
 * when real tool implementations (file read, search, bash, etc.) land.
 */

import type { ToolSpec, ToolResult, RuntimeContext } from '../shared/contracts.js';

export const mockSearchTool: ToolSpec = {
  name: 'mock_search',
  description: 'Mock search tool that simulates searching a knowledge base',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
    },
    required: ['query'],
  },
  isReadOnly: true,
  isDestructive: false,
  isConcurrencySafe: true,
  requiresPermission: false,

  async execute(input: unknown, _ctx: RuntimeContext): Promise<ToolResult> {
    const { query } = input as { query: string };
    return {
      ok: true,
      previewText: `[mock_search] Found 3 results for "${query}"`,
      data: {
        results: [
          { title: 'Result 1', snippet: `Relevant content about ${query}` },
          { title: 'Result 2', snippet: `Another perspective on ${query}` },
          { title: 'Result 3', snippet: `Background reference for ${query}` },
        ],
      },
    };
  },
};

export const mockFileWriteTool: ToolSpec = {
  name: 'mock_file_write',
  description: 'Mock file write tool that simulates writing to a file',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      content: { type: 'string' },
    },
    required: ['path', 'content'],
  },
  isReadOnly: false,
  isDestructive: false,
  isConcurrencySafe: false,
  requiresPermission: true,

  async execute(input: unknown, _ctx: RuntimeContext): Promise<ToolResult> {
    const { path } = input as { path: string; content: string };
    return {
      ok: true,
      previewText: `[mock_file_write] Wrote to ${path ?? 'unknown path'}`,
      data: { path, bytesWritten: 256 },
    };
  },
};

export function registerMockTools(registry: { register(spec: ToolSpec): void }): void {
  registry.register(mockSearchTool);
  registry.register(mockFileWriteTool);
}
