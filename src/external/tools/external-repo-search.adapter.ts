import type {
  RuntimeContext,
  ToolResult,
  ToolSpec,
  ValidationResult,
} from '../../shared/contracts.js';
import {
  isPathInside,
  normalizeSlashes,
  toAbsolutePath,
  toProjectRelativePath,
} from '../../shared/data-paths.js';
import type { ExternalToolAdapter } from '../adapters/tool-adapter.js';
import { runExternalCommand } from '../adapters/command-runner.js';
import { EXTERNAL_TOOL_MANIFESTS } from '../manifests/external-tool-manifests.js';

interface ExternalRepoSearchInput {
  query: string;
  path?: string;
  maxResults?: number;
}

interface SearchMatch {
  path: string;
  line: number;
  snippet: string;
}

const DEFAULT_MAX_RESULTS = 20;
const HARD_MAX_RESULTS = 80;

function validateInputPayload(input: unknown): ValidationResult {
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Input must be an object'] };
  }

  const payload = input as Partial<ExternalRepoSearchInput>;
  const errors: string[] = [];

  if (typeof payload.query !== 'string' || payload.query.trim().length < 2) {
    errors.push('Field "query" must contain at least 2 characters');
  }
  if (payload.path !== undefined && (typeof payload.path !== 'string' || payload.path.trim().length === 0)) {
    errors.push('Field "path" must be a non-empty string when provided');
  }
  if (
    payload.maxResults !== undefined
    && (!Number.isInteger(payload.maxResults) || payload.maxResults <= 0 || payload.maxResults > HARD_MAX_RESULTS)
  ) {
    errors.push(`Field "maxResults" must be an integer between 1 and ${HARD_MAX_RESULTS}`);
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}

function parseMatches(stdout: string, limit: number): SearchMatch[] {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const matches: SearchMatch[] = [];
  for (const line of lines) {
    const parsed = line.match(/^(.+?):(\d+):(.*)$/);
    if (!parsed) {
      continue;
    }

    matches.push({
      path: normalizeSlashes(parsed[1].trim()),
      line: Number(parsed[2]),
      snippet: parsed[3].trim().slice(0, 240),
    });

    if (matches.length >= limit) {
      break;
    }
  }

  return matches;
}

const manifest = EXTERNAL_TOOL_MANIFESTS.find((item) => item.toolName === 'external_repo_search');
if (!manifest) {
  throw new Error('Missing external tool manifest for external_repo_search');
}

export const externalRepoSearchAdapter: ExternalToolAdapter = {
  manifest,
  createToolSpec(): ToolSpec {
    return {
      name: 'external_repo_search',
      description: 'External adapter: search tracked repository files via git grep',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Text pattern to search in repository files' },
          path: { type: 'string', description: 'Optional relative path scope (default: project root)' },
          maxResults: { type: 'number', description: `Maximum matches (default ${DEFAULT_MAX_RESULTS})` },
        },
        required: ['query'],
      },
      isReadOnly: true,
      isDestructive: false,
      isConcurrencySafe: true,
      requiresPermission: true,

      async validateInput(input: unknown, _ctx: RuntimeContext): Promise<ValidationResult> {
        return validateInputPayload(input);
      },

      async execute(input: unknown, _ctx: RuntimeContext): Promise<ToolResult> {
        const payload = input as ExternalRepoSearchInput;
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
        const relativeRoot = normalizeSlashes(toProjectRelativePath(projectRoot, searchRoot)) || '.';
        const pathSpec = relativeRoot === '.' ? '.' : relativeRoot;

        const args = [
          'grep',
          '-n',
          '-I',
          '--no-color',
          '-m',
          String(maxResults),
          '-e',
          payload.query,
          '--',
          pathSpec,
        ];

        const result = await runExternalCommand('git', args, {
          cwd: projectRoot,
          allowExitCodes: [1],
          timeoutMs: 12000,
        });

        const matches = parseMatches(result.stdout, maxResults);
        const truncated = matches.length >= maxResults;

        return {
          ok: true,
          previewText: `[external_repo_search] ${matches.length} match(es) for "${payload.query}" under ${relativeRoot}`,
          data: {
            query: payload.query,
            root: relativeRoot,
            command: `git ${args.join(' ')}`,
            matches,
            exitCode: result.exitCode,
          },
          truncated,
        };
      },
    };
  },
};
