import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { RuleItem } from '../shared/contracts.js';

export function writeRuleItem(directory: string, item: RuleItem): string {
  const filePath = path.join(directory, `${item.id}.json`);
  writeFileSync(filePath, `${JSON.stringify(item, null, 2)}\n`, 'utf8');
  return filePath;
}
