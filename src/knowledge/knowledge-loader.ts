import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { KnowledgeItem } from '../shared/contracts.js';

function isKnowledgeItem(value: unknown): value is KnowledgeItem {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const item = value as Partial<KnowledgeItem>;
  return (
    typeof item.id === 'string' &&
    typeof item.title === 'string' &&
    typeof item.content === 'string'
  );
}

export function loadKnowledgeItems(directory: string): KnowledgeItem[] {
  const entries = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const items: KnowledgeItem[] = [];
  for (const fileName of entries) {
    const filePath = path.join(directory, fileName);
    try {
      const raw = readFileSync(filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (isKnowledgeItem(parsed)) {
        items.push(parsed);
      }
    } catch {
      // Keep loading other files if one file is malformed.
    }
  }

  return items;
}
