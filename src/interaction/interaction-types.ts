import type { PermissionDecision, PermissionScope, PermissionVerdict } from '../shared/contracts.js';
import type { PermissionDecisionContext } from '../permissions/permission-types.js';

export interface PermissionOption {
  key: string;
  decision: PermissionVerdict;
  scope?: PermissionScope;
  label: string;
}

export interface PermissionPromptViewModel {
  toolName: string;
  reason?: string;
  targetPath?: string;
  isDestructive: boolean;
  options: PermissionOption[];
  defaultOptionKey: string;
}

export interface PermissionPromptResult {
  decision: PermissionDecision;
  selectedOption: PermissionOption;
  inputRaw: string;
}

export interface PermissionPromptIO {
  writeLine(message: string): void;
  readLine(promptText: string): Promise<string>;
}

export interface ScriptedPermissionAction {
  decision: PermissionDecision['decision'];
  scope?: PermissionScope;
  reason?: string;
}

export type PermissionPromptHandler = (
  context: PermissionDecisionContext,
) => Promise<PermissionDecision>;

