/**
 * Knowledge Store — minimal in-memory store for KnowledgeItems.
 *
 * Knowledge answers "what is this" and "what facts exist".
 * It does NOT decide how to act (that's skills) or what's forbidden (that's rules).
 *
 * Placeholder status: in-memory array; no persistence or indexing.
 * Phase 2 (Codex) will add persistence, embedding-based retrieval,
 * and structured import from guided injection flow.
 */

import type { KnowledgeItem } from '../shared/contracts.js';

export class KnowledgeStore {
  private items: KnowledgeItem[] = [];

  add(item: KnowledgeItem): void {
    this.items.push(item);
  }

  get(id: string): KnowledgeItem | undefined {
    return this.items.find((i) => i.id === id);
  }

  listIds(): string[] {
    return this.items.map((i) => i.id);
  }

  listAll(): KnowledgeItem[] {
    return [...this.items];
  }

  count(): number {
    return this.items.length;
  }
}
