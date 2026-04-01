/**
 * Skill Store — local-file-backed store for SkillItems.
 *
 * Skills answer "how to do this kind of task" — step templates,
 * operation patterns, execution workflows.
 */

import path from 'node:path';
import type { SkillItem } from '../shared/contracts.js';
import { ensureDataLayerDir, resolveDataRoot } from '../shared/data-paths.js';
import { loadSkillItems } from './skill-loader.js';
import { writeSkillItem } from './skill-writer.js';

export interface SkillStoreOptions {
  dataRoot?: string;
  autoLoad?: boolean;
}

export class SkillStore {
  private items = new Map<string, SkillItem>();
  private readonly dataRoot: string;
  private readonly storageDir: string;

  constructor(options: SkillStoreOptions = {}) {
    this.dataRoot = resolveDataRoot(options.dataRoot);
    this.storageDir = ensureDataLayerDir('skills', this.dataRoot);

    if (options.autoLoad !== false) {
      this.reloadFromDisk();
    }
  }

  add(item: SkillItem): string {
    this.items.set(item.id, item);
    return writeSkillItem(this.storageDir, item);
  }

  get(id: string): SkillItem | undefined {
    return this.items.get(id);
  }

  listIds(): string[] {
    return Array.from(this.items.keys());
  }

  listAll(): SkillItem[] {
    return Array.from(this.items.values());
  }

  count(): number {
    return this.items.size;
  }

  reloadFromDisk(): number {
    const loaded = loadSkillItems(this.storageDir);
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
    return path.join(this.storageDir, `${id}.md`);
  }
}
