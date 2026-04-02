import type {
  PermissionPromptIO,
  PermissionPromptResult,
  PermissionPromptViewModel,
} from './interaction-types.js';
import type { PermissionDecisionContext } from '../permissions/permission-types.js';

const DEFAULT_OPTIONS = [
  { key: '1', decision: 'allow', scope: 'once', label: '仅本次允许' },
  { key: '2', decision: 'allow', scope: 'session', label: '本会话允许' },
  { key: '3', decision: 'allow', scope: 'project', label: '项目级允许' },
  { key: '4', decision: 'deny', scope: undefined, label: '拒绝' },
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
  io.writeLine('--- 权限确认 ---');
  io.writeLine(`工具：${view.toolName}`);
  io.writeLine(`原因：${view.reason ?? '（无）'}`);
  io.writeLine(`目标：${view.targetPath ?? '（无）'}`);
  io.writeLine(`是否高风险：${view.isDestructive ? '是' : '否'}`);
  io.writeLine('可选操作：');
  for (const option of view.options) {
    io.writeLine(`  [${option.key}] ${option.label}`);
  }
  io.writeLine(`默认： [${view.defaultOptionKey}]`);

  const rawInput = await io.readLine('请选择权限决策：');
  const selected = resolveOption(view, rawInput);

  return {
    decision: {
      decision: selected.decision,
      scope: selected.scope,
      reason:
        selected.decision === 'deny'
          ? `用户在终端拒绝了工具 "${view.toolName}" 的调用`
          : `用户在终端批准了工具 "${view.toolName}"（scope=${selected.scope ?? 'once'}）`,
    },
    selectedOption: selected,
    inputRaw: rawInput,
  };
}
