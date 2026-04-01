/**
 * Rule Store — local-file-backed store for RuleItems.
 *
 * Rules answer "what must not be done", "what takes priority",
 * and "how to resolve conflicts".
 */

import path from 'node:path';
import type { RuleItem } from '../shared/contracts.js';
import { ensureDataLayerDir, resolveDataRoot } from '../shared/data-paths.js';
import { loadRuleItems } from './rule-loader.js';
import { writeRuleItem } from './rule-writer.js';

export interface RuleStoreOptions {
  dataRoot?: string;
  autoLoad?: boolean;
}

export class RuleStore {
  private items = new Map<string, RuleItem>();
  private readonly dataRoot: string;
  private readonly storageDir: string;

  constructor(options: RuleStoreOptions = {}) {
    this.dataRoot = resolveDataRoot(options.dataRoot);
    this.storageDir = ensureDataLayerDir('rules', this.dataRoot);

    if (options.autoLoad !== false) {
      this.reloadFromDisk();
    }
  }

  add(item: RuleItem): string {
    this.items.set(item.id, item);
    return writeRuleItem(this.storageDir, item);
  }

  get(id: string): RuleItem | undefined {
    return this.items.get(id);
  }

  listIds(): string[] {
    return Array.from(this.items.keys());
  }

  listAll(): RuleItem[] {
    return Array.from(this.items.values());
  }

  getByScope(scope: RuleItem['scope']): RuleItem[] {
    return this.listAll().filter((item) => item.scope === scope);
  }

  count(): number {
    return this.items.size;
  }

  reloadFromDisk(): number {
    const loaded = loadRuleItems(this.storageDir).sort((a, b) => b.priority - a.priority);
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
