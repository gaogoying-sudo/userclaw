/**
 * Knowledge Store — local-file-backed store for KnowledgeItems.
 *
 * Knowledge answers "what is this" and "what facts exist".
 * It does NOT decide how to act (that's skills) or what's forbidden (that's rules).
 */

import path from 'node:path';
import type { KnowledgeItem } from '../shared/contracts.js';
import { ensureDataLayerDir, resolveDataRoot } from '../shared/data-paths.js';
import { loadKnowledgeItems } from './knowledge-loader.js';
import { writeKnowledgeItem } from './knowledge-writer.js';

export interface KnowledgeStoreOptions {
  dataRoot?: string;
  autoLoad?: boolean;
}

export class KnowledgeStore {
  private items = new Map<string, KnowledgeItem>();
  private readonly dataRoot: string;
  private readonly storageDir: string;

  constructor(options: KnowledgeStoreOptions = {}) {
    this.dataRoot = resolveDataRoot(options.dataRoot);
    this.storageDir = ensureDataLayerDir('knowledge', this.dataRoot);

    if (options.autoLoad !== false) {
      this.reloadFromDisk();
    }
  }

  add(item: KnowledgeItem): string {
    this.items.set(item.id, item);
    return writeKnowledgeItem(this.storageDir, item);
  }

  get(id: string): KnowledgeItem | undefined {
    return this.items.get(id);
  }

  listIds(): string[] {
    return Array.from(this.items.keys());
  }

  listAll(): KnowledgeItem[] {
    return Array.from(this.items.values());
  }

  count(): number {
    return this.items.size;
  }

  reloadFromDisk(): number {
    const loaded = loadKnowledgeItems(this.storageDir);
    this.items = new Map(loaded.map((item) => [item.id, item]));
    return this.items.size;
  }

  getStorageDir(): string {
    return this.storageDir;
  }

  getDataRoot(): string {
    return this.dataRoot;
  }

  resolveItemPath(id: string): string {
    return path.join(this.storageDir, `${id}.json`);
  }
}
