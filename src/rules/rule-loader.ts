import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { RuleItem } from '../shared/contracts.js';

function isRuleItem(value: unknown): value is RuleItem {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const item = value as Partial<RuleItem>;
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.ruleText === 'string' &&
    typeof item.priority === 'number'
  );
}

export function loadRuleItems(directory: string): RuleItem[] {
  const entries = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const items: RuleItem[] = [];
  for (const fileName of entries) {
    const filePath = path.join(directory, fileName);
    try {
      const raw = readFileSync(filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (isRuleItem(parsed)) {
        items.push(parsed);
      }
    } catch {
      // Keep loading remaining files when one file is malformed.
    }
  }

  return items;
}
