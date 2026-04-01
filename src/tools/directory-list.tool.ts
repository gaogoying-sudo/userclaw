import { readdir } from 'node:fs/promises';
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

interface DirectoryListInput {
  path?: string;
  maxEntries?: number;
  includeHidden?: boolean;
}

const DEFAULT_MAX_ENTRIES = 100;
const HARD_MAX_ENTRIES = 500;

function validateDirectoryListInput(input: unknown): ValidationResult {
  if (input === undefined) {
    return { valid: true };
  }
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Input must be an object'] };
  }

  const payload = input as Partial<DirectoryListInput>;
  const errors: string[] = [];

  if (payload.path !== undefined && (typeof payload.path !== 'string' || payload.path.trim().length === 0)) {
    errors.push('Field "path" must be a non-empty string when provided');
  }
  if (
    payload.maxEntries !== undefined &&
    (!Number.isInteger(payload.maxEntries) || payload.maxEntries <= 0 || payload.maxEntries > HARD_MAX_ENTRIES)
  ) {
    errors.push(`Field "maxEntries" must be an integer between 1 and ${HARD_MAX_ENTRIES}`);
  }
  if (payload.includeHidden !== undefined && typeof payload.includeHidden !== 'boolean') {
    errors.push('Field "includeHidden" must be a boolean when provided');
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}

export const directoryListTool: ToolSpec = {
  name: 'directory_list',
  description: 'List files and directories under a given path',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative directory path (default: project root)' },
      maxEntries: { type: 'number', description: `Maximum entries to return (default ${DEFAULT_MAX_ENTRIES})` },
      includeHidden: { type: 'boolean', description: 'Whether to include dot-prefixed names' },
    },
  },
  isReadOnly: true,
  isDestructive: false,
  isConcurrencySafe: true,
  requiresPermission: false,

  async validateInput(input: unknown, _ctx: RuntimeContext): Promise<ValidationResult> {
    return validateDirectoryListInput(input);
  },

  async execute(input: unknown, _ctx: RuntimeContext): Promise<ToolResult> {
    const payload = (input as DirectoryListInput | undefined) ?? {};
    const projectRoot = process.cwd();
    const requestedPath = payload.path ?? '.';
    const absolutePath = toAbsolutePath(projectRoot, requestedPath);

    if (!isPathInside(projectRoot, absolutePath)) {
      return {
        ok: false,
        previewText: `Blocked path outside project root: ${requestedPath}`,
        errorCode: 'PATH_OUTSIDE_PROJECT',
      };
    }

    const dirEntries = await readdir(absolutePath, { withFileTypes: true });
    const includeHidden = payload.includeHidden ?? false;
    const maxEntries = payload.maxEntries ?? DEFAULT_MAX_ENTRIES;

    const filtered = dirEntries
      .filter((entry) => includeHidden || !entry.name.startsWith('.'))
      .map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const truncated = filtered.length > maxEntries;
    const entries = filtered.slice(0, maxEntries);
    const relativePath = normalizeSlashes(toProjectRelativePath(projectRoot, absolutePath));

    return {
      ok: true,
      previewText: `[directory_list] ${relativePath || '.'} — ${entries.length}${truncated ? `/${filtered.length}` : ''} entries`,
      data: {
        path: relativePath || '.',
        entries,
        totalEntries: filtered.length,
      },
      artifactUri: relativePath || '.',
      truncated,
    };
  },
};

