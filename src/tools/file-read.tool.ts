import { readFile, stat } from 'node:fs/promises';
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

interface FileReadInput {
  path: string;
  maxBytes?: number;
}

const DEFAULT_MAX_BYTES = 32 * 1024;
const HARD_MAX_BYTES = 256 * 1024;
const PREVIEW_LIMIT = 200;
const INLINE_EXCERPT_BYTES = 4 * 1024;

function validateFileReadInput(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Input must be an object'] };
  }

  const payload = input as Partial<FileReadInput>;
  if (typeof payload.path !== 'string' || payload.path.trim().length === 0) {
    errors.push('Field "path" must be a non-empty string');
  }
  if (
    payload.maxBytes !== undefined &&
    (!Number.isInteger(payload.maxBytes) || payload.maxBytes <= 0 || payload.maxBytes > HARD_MAX_BYTES)
  ) {
    errors.push(`Field "maxBytes" must be an integer between 1 and ${HARD_MAX_BYTES}`);
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}

export const fileReadTool: ToolSpec = {
  name: 'file_read',
  description: 'Read a local file from the current project',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path to file inside project root' },
      maxBytes: {
        type: 'number',
        description: `Optional read cap in bytes (default ${DEFAULT_MAX_BYTES}, max ${HARD_MAX_BYTES})`,
      },
    },
    required: ['path'],
  },
  isReadOnly: true,
  isDestructive: false,
  isConcurrencySafe: true,
  requiresPermission: false,

  async validateInput(input: unknown, _ctx: RuntimeContext): Promise<ValidationResult> {
    return validateFileReadInput(input);
  },

  async execute(input: unknown, _ctx: RuntimeContext): Promise<ToolResult> {
    const { path, maxBytes } = input as FileReadInput;
    const projectRoot = process.cwd();
    const absolutePath = toAbsolutePath(projectRoot, path);

    if (!isPathInside(projectRoot, absolutePath)) {
      return {
        ok: false,
        previewText: `Blocked path outside project root: ${path}`,
        errorCode: 'PATH_OUTSIDE_PROJECT',
        errorMessage: `Path "${path}" is outside project root`,
      };
    }

    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) {
      return {
        ok: false,
        previewText: `Path is not a file: ${path}`,
        errorCode: 'NOT_A_FILE',
      };
    }

    const readLimit = Math.min(maxBytes ?? DEFAULT_MAX_BYTES, HARD_MAX_BYTES);
    const fullContent = await readFile(absolutePath, 'utf8');
    const truncated = Buffer.byteLength(fullContent, 'utf8') > readLimit;
    const content = truncated
      ? Buffer.from(fullContent, 'utf8').subarray(0, readLimit).toString('utf8')
      : fullContent;
    const contentBytes = Buffer.byteLength(content, 'utf8');
    const inlineExcerpt = contentBytes > INLINE_EXCERPT_BYTES
      ? Buffer.from(content, 'utf8').subarray(0, INLINE_EXCERPT_BYTES).toString('utf8')
      : content;

    const relativePath = normalizeSlashes(toProjectRelativePath(projectRoot, absolutePath));
    const previewSnippet = content.slice(0, PREVIEW_LIMIT).replace(/\s+/g, ' ').trim();

    return {
      ok: true,
      previewText: `[file_read] ${relativePath} (${fileStat.size} bytes)${previewSnippet ? ` — ${previewSnippet}` : ''}`,
      data: {
        path: relativePath,
        sizeBytes: fileStat.size,
        excerpt: inlineExcerpt,
        readBytes: contentBytes,
        hasMoreContent: truncated || contentBytes > INLINE_EXCERPT_BYTES,
      },
      artifactUri: relativePath,
      truncated,
    };
  },
};
