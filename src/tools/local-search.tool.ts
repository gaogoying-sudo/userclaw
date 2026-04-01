import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  RuntimeContext,
  ToolResult,
  ToolSpec,
  ValidationResult,
} from '../shared/contracts.js';
import {
  isPathInside,
  normalizeSlashes,
  toAbsolutePath,
  toProjectRelativePath,
} from '../shared/data-paths.js';

interface LocalSearchInput {
  query: string;
  path?: string;
  maxResults?: number;
  caseSensitive?: boolean;
}

interface SearchMatch {
  path: string;
  line: number;
  snippet: string;
}

const DEFAULT_MAX_RESULTS = 20;
const HARD_MAX_RESULTS = 200;
const MAX_FILE_BYTES = 512 * 1024;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist']);

function validateLocalSearchInput(input: unknown): ValidationResult {
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Input must be an object'] };
  }

  const payload = input as Partial<LocalSearchInput>;
  const errors: string[] = [];

  if (typeof payload.query !== 'string' || payload.query.trim().length < 2) {
    errors.push('Field "query" must be a string with at least 2 characters');
  }
  if (payload.path !== undefined && (typeof payload.path !== 'string' || payload.path.trim().length === 0)) {
    errors.push('Field "path" must be a non-empty string when provided');
  }
  if (
    payload.maxResults !== undefined &&
    (!Number.isInteger(payload.maxResults) || payload.maxResults <= 0 || payload.maxResults > HARD_MAX_RESULTS)
  ) {
    errors.push(`Field "maxResults" must be an integer between 1 and ${HARD_MAX_RESULTS}`);
  }
  if (payload.caseSensitive !== undefined && typeof payload.caseSensitive !== 'boolean') {
    errors.push('Field "caseSensitive" must be a boolean when provided');
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}

function isBinaryContent(content: Buffer): boolean {
  return content.includes(0);
}

async function walkFiles(rootDir: string, onFile: (absolutePath: string) => Promise<boolean>): Promise<void> {
  const queue: string[] = [rootDir];

  while (queue.length > 0) {
    const currentDir = queue.shift();
    if (!currentDir) {
      continue;
    }

    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          queue.push(path.join(currentDir, entry.name));
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }

      const shouldStop = await onFile(path.join(currentDir, entry.name));
      if (shouldStop) {
        return;
      }
    }
  }
}

export const localSearchTool: ToolSpec = {
  name: 'local_search',
  description: 'Search for text across local project files',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Text to search for' },
      path: { type: 'string', description: 'Optional relative root path to search from' },
      maxResults: { type: 'number', description: `Maximum matches to return (default ${DEFAULT_MAX_RESULTS})` },
      caseSensitive: { type: 'boolean', description: 'Whether search is case-sensitive' },
    },
    required: ['query'],
  },
  isReadOnly: true,
  isDestructive: false,
  isConcurrencySafe: true,
  requiresPermission: false,

  async validateInput(input: unknown, _ctx: RuntimeContext): Promise<ValidationResult> {
    return validateLocalSearchInput(input);
  },

  async execute(input: unknown, _ctx: RuntimeContext): Promise<ToolResult> {
    const payload = input as LocalSearchInput;
    const projectRoot = process.cwd();
    const searchRoot = toAbsolutePath(projectRoot, payload.path ?? '.');

    if (!isPathInside(projectRoot, searchRoot)) {
      return {
        ok: false,
        previewText: `Blocked path outside project root: ${payload.path ?? '.'}`,
        errorCode: 'PATH_OUTSIDE_PROJECT',
      };
    }

    const maxResults = payload.maxResults ?? DEFAULT_MAX_RESULTS;
    const matches: SearchMatch[] = [];
    const query = payload.caseSensitive ? payload.query : payload.query.toLowerCase();

    await walkFiles(searchRoot, async (absoluteFilePath) => {
      if (matches.length >= maxResults) {
        return true;
      }

      const contentBuffer = await readFile(absoluteFilePath);
      if (contentBuffer.byteLength > MAX_FILE_BYTES || isBinaryContent(contentBuffer)) {
        return false;
      }

      const content = contentBuffer.toString('utf8');
      const lines = content.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        if (matches.length >= maxResults) {
          return true;
        }
        const line = lines[index];
        const source = payload.caseSensitive ? line : line.toLowerCase();
        if (source.includes(query)) {
          matches.push({
            path: normalizeSlashes(toProjectRelativePath(projectRoot, absoluteFilePath)),
            line: index + 1,
            snippet: line.trim().slice(0, 240),
          });
        }
      }

      return false;
    });

    const truncated = matches.length >= maxResults;
    const rootRelative = normalizeSlashes(toProjectRelativePath(projectRoot, searchRoot)) || '.';

    return {
      ok: true,
      previewText: `[local_search] ${matches.length} match(es) for "${payload.query}" under ${rootRelative}`,
      data: {
        query: payload.query,
        root: rootRelative,
        matches,
      },
      truncated,
    };
  },
};

