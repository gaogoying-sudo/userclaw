import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { SkillItem } from '../shared/contracts.js';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function escapeFrontmatter(value: string): string {
  return value.replace(/\n/g, ' ').trim();
}

function buildFrontmatter(item: SkillItem): string {
  const lines: string[] = [
    '---',
    `id: ${escapeFrontmatter(item.id)}`,
    `name: ${escapeFrontmatter(item.name)}`,
    `description: ${escapeFrontmatter(item.description)}`,
  ];

  if (item.isExternal) {
    lines.push('origin: external');
  }
  if (item.source) {
    lines.push(`source: ${escapeFrontmatter(item.source)}`);
  }
  if (item.adaptedFrom) {
    lines.push(`adapted-from: ${escapeFrontmatter(item.adaptedFrom)}`);
  }
  if (item.whenToUse) {
    lines.push(`when-to-use: ${escapeFrontmatter(item.whenToUse)}`);
  }

  if (item.allowedTools && item.allowedTools.length > 0) {
    lines.push('allowed-tools:');
    for (const toolName of item.allowedTools) {
      lines.push(`  - ${escapeFrontmatter(toolName)}`);
    }
  }

  lines.push('---');
  return lines.join('\n');
}

function buildBody(item: SkillItem): string {
  return item.steps
    .map((step, index) => `${index + 1}. ${step}`)
    .join('\n');
}

export function writeSkillItem(directory: string, item: SkillItem): string {
  const safeName = slugify(item.id) || slugify(item.name) || 'skill';
  const filePath = path.join(directory, `${safeName}.md`);
  const markdown = `${buildFrontmatter(item)}\n\n${buildBody(item)}\n`;
  writeFileSync(filePath, markdown, 'utf8');
  return filePath;
}
