/**
 * Rule Store — minimal in-memory store for RuleItems.
 *
 * Rules answer "what must not be done", "what takes priority",
 * and "how to resolve conflicts".
 * They do NOT store facts (that's knowledge) or step templates (that's skills).
 *
 * Placeholder status: in-memory array; no priority-based conflict resolution.
 * Phase 2 (Codex) will add priority sorting, scope-aware filtering,
 * and rule evaluation during permission checks.
 */

import type { RuleItem } from '../shared/contracts.js';

export class RuleStore {
  private items: RuleItem[] = [];

  add(item: RuleItem): void {
    this.items.push(item);
  }

  get(id: string): RuleItem | undefined {
    return this.items.find((i) => i.id === id);
  }

  listIds(): string[] {
    return this.items.map((i) => i.id);
  }

  listAll(): RuleItem[] {
    return [...this.items];
  }

  getByScope(scope: RuleItem['scope']): RuleItem[] {
    return this.items.filter((i) => i.scope === scope);
  }

  count(): number {
    return this.items.length;
  }
}
