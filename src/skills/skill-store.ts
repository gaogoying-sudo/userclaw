/**
 * Skill Store — minimal in-memory store for SkillItems.
 *
 * Skills answer "how to do this kind of task" — step templates,
 * operation patterns, execution workflows.
 * They do NOT store facts (that's knowledge) or constraints (that's rules).
 *
 * Placeholder status: in-memory array; no frontmatter parsing or hot-reload.
 * Phase 2 (Codex) will add markdown-based skill loading with frontmatter,
 * hot-reload on file change, and skill matching by task type.
 */

import type { SkillItem } from '../shared/contracts.js';

export class SkillStore {
  private items: SkillItem[] = [];

  add(item: SkillItem): void {
    this.items.push(item);
  }

  get(id: string): SkillItem | undefined {
    return this.items.find((i) => i.id === id);
  }

  listIds(): string[] {
    return this.items.map((i) => i.id);
  }

  listAll(): SkillItem[] {
    return [...this.items];
  }

  count(): number {
    return this.items.length;
  }
}
