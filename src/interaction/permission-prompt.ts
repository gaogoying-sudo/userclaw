import type {
  PermissionPromptIO,
  PermissionPromptResult,
  PermissionPromptViewModel,
} from './interaction-types.js';
import type { PermissionDecisionContext } from '../permissions/permission-types.js';

const DEFAULT_OPTIONS = [
  { key: '1', decision: 'allow', scope: 'once', label: 'Allow once' },
  { key: '2', decision: 'allow', scope: 'session', label: 'Allow for session' },
  { key: '3', decision: 'allow', scope: 'project', label: 'Allow for project' },
  { key: '4', decision: 'deny', scope: undefined, label: 'Deny' },
] as const;

type PromptOption = (typeof DEFAULT_OPTIONS)[number];

export function buildPermissionPromptViewModel(
  context: PermissionDecisionContext,
): PermissionPromptViewModel {
  return {
    toolName: context.tool.name,
    reason: context.initialDecision.reason ?? context.tool.description,
    targetPath: context.targetPath,
    isDestructive: context.tool.isDestructive,
    options: DEFAULT_OPTIONS.map((option) => ({ ...option })),
    defaultOptionKey: '1',
  };
}

function resolveOption(
  viewModel: PermissionPromptViewModel,
  rawInput: string,
): PromptOption {
  const normalized = rawInput.trim().toLowerCase();
  if (normalized.length === 0) {
    return DEFAULT_OPTIONS.find((item) => item.key === viewModel.defaultOptionKey) ?? DEFAULT_OPTIONS[0];
  }

  const byKey = DEFAULT_OPTIONS.find((item) => item.key === normalized);
  if (byKey) {
    return byKey;
  }

  const byLabel = DEFAULT_OPTIONS.find((item) => item.label.toLowerCase() === normalized);
  if (byLabel) {
    return byLabel;
  }

  return DEFAULT_OPTIONS.find((item) => item.key === viewModel.defaultOptionKey) ?? DEFAULT_OPTIONS[0];
}

export async function promptPermissionDecision(
  context: PermissionDecisionContext,
  io: PermissionPromptIO,
): Promise<PermissionPromptResult> {
  const view = buildPermissionPromptViewModel(context);

  io.writeLine('');
  io.writeLine('--- Permission Confirmation ---');
  io.writeLine(`Tool: ${view.toolName}`);
  io.writeLine(`Reason: ${view.reason ?? '(none)'}`);
  io.writeLine(`Target: ${view.targetPath ?? '(none)'}`);
  io.writeLine(`Destructive: ${view.isDestructive ? 'yes' : 'no'}`);
  io.writeLine('Options:');
  for (const option of view.options) {
    io.writeLine(`  [${option.key}] ${option.label}`);
  }
  io.writeLine(`Default: [${view.defaultOptionKey}]`);

  const rawInput = await io.readLine('Select permission decision: ');
  const selected = resolveOption(view, rawInput);

  return {
    decision: {
      decision: selected.decision,
      scope: selected.scope,
      reason:
        selected.decision === 'deny'
          ? `Denied by user via terminal for tool "${view.toolName}"`
          : `Approved by user via terminal (${selected.scope ?? 'once'}) for tool "${view.toolName}"`,
    },
    selectedOption: selected,
    inputRaw: rawInput,
  };
}

