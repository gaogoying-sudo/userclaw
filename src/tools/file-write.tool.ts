import { mkdir, stat, writeFile } from 'node:fs/promises';
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

interface FileWriteInput {
  path: string;
  content: string;
}

const MAX_CONTENT_BYTES = 512 * 1024;

function validateFileWriteInput(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Input must be an object'] };
  }

  const payload = input as Partial<FileWriteInput>;
  if (typeof payload.path !== 'string' || payload.path.trim().length === 0) {
    errors.push('Field "path" must be a non-empty string');
  }
  if (typeof payload.content !== 'string') {
    errors.push('Field "content" must be a string');
  } else if (Buffer.byteLength(payload.content, 'utf8') > MAX_CONTENT_BYTES) {
    errors.push(`Field "content" exceeds ${MAX_CONTENT_BYTES} bytes`);
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}

export const fileWriteTool: ToolSpec = {
  name: 'file_write',
  description: 'Write content to a file inside the project',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path to file inside project root' },
      content: { type: 'string', description: 'Text content to write' },
    },
    required: ['path', 'content'],
  },
  isReadOnly: false,
  isDestructive: false,
  isConcurrencySafe: false,
  requiresPermission: true,

  async validateInput(input: unknown, _ctx: RuntimeContext): Promise<ValidationResult> {
    return validateFileWriteInput(input);
  },

  async execute(input: unknown, _ctx: RuntimeContext): Promise<ToolResult> {
    const { path: targetPath, content } = input as FileWriteInput;
    const projectRoot = process.cwd();
    const absolutePath = toAbsolutePath(projectRoot, targetPath);

    if (!isPathInside(projectRoot, absolutePath)) {
      return {
        ok: false,
        previewText: `Blocked path outside project root: ${targetPath}`,
        errorCode: 'PATH_OUTSIDE_PROJECT',
        errorMessage: `Path "${targetPath}" is outside project root`,
      };
    }

    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, 'utf8');

    const fileStat = await stat(absolutePath);
    const relativePath = normalizeSlashes(toProjectRelativePath(projectRoot, absolutePath));
    const previewContent = content.slice(0, 120).replace(/\s+/g, ' ').trim();

    return {
      ok: true,
      previewText: `[file_write] ${relativePath} (${fileStat.size} bytes)${previewContent ? ` — ${previewContent}` : ''}`,
      data: {
        path: relativePath,
        bytesWritten: Buffer.byteLength(content, 'utf8'),
        sizeBytes: fileStat.size,
      },
      artifactUri: relativePath,
    };
  },
};

