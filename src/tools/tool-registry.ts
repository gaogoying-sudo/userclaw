/**
 * Tool Registry — central store for all registered ToolSpecs.
 *
 * Tools must be registered here before they can be invoked by the runtime.
 * The registry enforces unique names and provides lookup.
 *
 * Placeholder status: in-memory Map; no hot-reload or plugin discovery.
 * Phase 2 (Codex) will add MCP tool merging, plugin-contributed tools,
 * and dynamic registration from skill definitions.
 */

import type { ToolSpec } from '../shared/contracts.js';

export class ToolRegistry {
  private tools = new Map<string, ToolSpec>();

  register(spec: ToolSpec): void {
    if (this.tools.has(spec.name)) {
      throw new Error(`Tool "${spec.name}" is already registered`);
    }
    this.tools.set(spec.name, spec);
  }

  get(name: string): ToolSpec | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  listNames(): string[] {
    return Array.from(this.tools.keys());
  }

  listAll(): ToolSpec[] {
    return Array.from(this.tools.values());
  }

  count(): number {
    return this.tools.size;
  }
}
