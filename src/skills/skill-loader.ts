import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { SkillItem } from '../shared/contracts.js';

interface FrontmatterParseResult {
  frontmatter: Record<string, string | string[]>;
  body: string;
}

function parseFrontmatter(markdown: string): FrontmatterParseResult {
  if (!markdown.startsWith('---\n')) {
    return { frontmatter: {}, body: markdown };
  }

  const endMarker = '\n---\n';
  const endIndex = markdown.indexOf(endMarker, 4);
  if (endIndex === -1) {
    return { frontmatter: {}, body: markdown };
  }

  const rawFrontmatter = markdown.slice(4, endIndex);
  const body = markdown.slice(endIndex + endMarker.length);
  const lines = rawFrontmatter.split(/\r?\n/);

  const parsed: Record<string, string | string[]> = {};
  let currentKey: string | null = null;

  for (const line of lines) {
    const keyValueMatch = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (keyValueMatch) {
      const [, key, value] = keyValueMatch;
      if (value.length > 0) {
        parsed[key] = value;
        currentKey = null;
      } else {
        parsed[key] = [];
        currentKey = key;
      }
      continue;
    }

    const arrayItemMatch = line.match(/^\s*-\s+(.+)$/);
    if (arrayItemMatch && currentKey) {
      const current = parsed[currentKey];
      if (Array.isArray(current)) {
        current.push(arrayItemMatch[1].trim());
      }
    }
  }

  return { frontmatter: parsed, body };
}

function parseSteps(markdownBody: string): string[] {
  const lines = markdownBody.split(/\r?\n/);
  const bulletSteps = lines
    .map((line) => line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => match[1].trim())
    .filter((step) => step.length > 0);

  if (bulletSteps.length > 0) {
    return bulletSteps;
  }

  return markdownBody
    .split(/\r?\n\r?\n+/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
}

function toSkillItem(filePath: string, markdown: string): SkillItem | null {
  const { frontmatter, body } = parseFrontmatter(markdown);

  const id = typeof frontmatter.id === 'string'
    ? frontmatter.id
    : path.basename(filePath, path.extname(filePath));
  const name = typeof frontmatter.name === 'string' ? frontmatter.name : id;
  const description = typeof frontmatter.description === 'string' ? frontmatter.description : '';

  const allowedToolsValue = frontmatter.allowedTools;
  let allowedTools: string[] | undefined;
  if (Array.isArray(allowedToolsValue)) {
    allowedTools = allowedToolsValue;
  } else if (typeof allowedToolsValue === 'string' && allowedToolsValue.trim().length > 0) {
    allowedTools = allowedToolsValue
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  const steps = parseSteps(body);
  if (steps.length === 0) {
    return null;
  }

  return {
    id,
    name,
    description,
    steps,
    allowedTools,
  };
}

export function loadSkillItems(directory: string): SkillItem[] {
  const files = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const items: SkillItem[] = [];

  for (const fileName of files) {
    const filePath = path.join(directory, fileName);
    try {
      const markdown = readFileSync(filePath, 'utf8');
      const item = toSkillItem(filePath, markdown);
      if (item) {
        items.push(item);
      }
    } catch {
      // Keep loading the rest if one file is malformed.
    }
  }

  return items;
}
