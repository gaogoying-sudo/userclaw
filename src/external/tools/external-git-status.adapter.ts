import type {
  PermissionDecision,
  RuntimeContext,
  ToolResult,
  ToolSpec,
  ValidationResult,
} from '../../shared/contracts.js';
import type { ExternalToolAdapter } from '../adapters/tool-adapter.js';
import { runExternalCommand } from '../adapters/command-runner.js';
import { EXTERNAL_TOOL_MANIFESTS } from '../manifests/external-tool-manifests.js';

interface ExternalGitStatusInput {
  includeUntracked?: boolean;
  maxLines?: number;
}

const DEFAULT_MAX_LINES = 40;
const HARD_MAX_LINES = 200;

function validateInputPayload(input: unknown): ValidationResult {
  if (input === undefined) {
    return { valid: true };
  }
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Input must be an object'] };
  }

  const payload = input as Partial<ExternalGitStatusInput>;
  const errors: string[] = [];

  if (payload.includeUntracked !== undefined && typeof payload.includeUntracked !== 'boolean') {
    errors.push('Field "includeUntracked" must be a boolean when provided');
  }

  if (
    payload.maxLines !== undefined
    && (!Number.isInteger(payload.maxLines) || payload.maxLines <= 0 || payload.maxLines > HARD_MAX_LINES)
  ) {
    errors.push(`Field "maxLines" must be an integer between 1 and ${HARD_MAX_LINES}`);
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}

const manifest = EXTERNAL_TOOL_MANIFESTS.find((item) => item.toolName === 'external_git_status');
if (!manifest) {
  throw new Error('Missing external tool manifest for external_git_status');
}

export const externalGitStatusAdapter: ExternalToolAdapter = {
  manifest,
  createToolSpec(): ToolSpec {
    return {
      name: 'external_git_status',
      description: 'External adapter: inspect git status through a permission-confirmed command',
      inputSchema: {
        type: 'object',
        properties: {
          includeUntracked: {
            type: 'boolean',
            description: 'Whether to include untracked files (default: true)',
          },
          maxLines: {
            type: 'number',
            description: `Maximum status lines returned (default ${DEFAULT_MAX_LINES})`,
          },
        },
      },
      isReadOnly: true,
      isDestructive: false,
      isConcurrencySafe: true,
      requiresPermission: true,

      async validateInput(input: unknown, _ctx: RuntimeContext): Promise<ValidationResult> {
        return validateInputPayload(input);
      },

      async checkPermission(_input: unknown, _ctx: RuntimeContext): Promise<PermissionDecision> {
        return {
          decision: 'ask',
          scope: 'once',
          reason: 'External command execution requires confirmation even in read-only mode',
        };
      },

      async execute(input: unknown, _ctx: RuntimeContext): Promise<ToolResult> {
        const payload = (input as ExternalGitStatusInput | undefined) ?? {};
        const includeUntracked = payload.includeUntracked ?? true;
        const maxLines = payload.maxLines ?? DEFAULT_MAX_LINES;

        const args = ['status', '--short', '--branch'];
        if (!includeUntracked) {
          args.push('--untracked-files=no');
        }

        const result = await runExternalCommand('git', args, {
          cwd: process.cwd(),
          timeoutMs: 8000,
        });

        const lines = result.stdout
          .split(/\r?\n/)
          .map((line) => line.trimEnd())
          .filter((line) => line.length > 0);

        const branchSummary = lines[0] ?? '(unknown branch)';
        const entries = lines.slice(1);
        const truncated = entries.length > maxLines;
        const visibleEntries = entries.slice(0, maxLines);

        return {
          ok: true,
          previewText: `[external_git_status] ${branchSummary} with ${visibleEntries.length}${truncated ? `/${entries.length}` : ''} changes`,
          data: {
            branchSummary,
            includeUntracked,
            command: `git ${args.join(' ')}`,
            changes: visibleEntries,
            totalChanges: entries.length,
          },
          truncated,
        };
      },
    };
  },
};
