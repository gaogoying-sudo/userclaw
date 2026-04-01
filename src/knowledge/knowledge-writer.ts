import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { KnowledgeItem } from '../shared/contracts.js';

export function writeKnowledgeItem(directory: string, item: KnowledgeItem): string {
  const filePath = path.join(directory, `${item.id}.json`);
  writeFileSync(filePath, `${JSON.stringify(item, null, 2)}\n`, 'utf8');
  return filePath;
}
