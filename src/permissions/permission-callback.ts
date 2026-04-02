import type { PermissionDecision, PermissionScope } from '../shared/contracts.js';
import type { PermissionRequestCallback } from './permission-types.js';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { promptPermissionDecision } from '../interaction/permission-prompt.js';
import type { ScriptedPermissionAction } from '../interaction/interaction-types.js';
import { withLocalTimestamp } from '../shared/local-time.js';

export function createAutoApprovePermissionCallback(
  scope: PermissionScope = 'once',
): PermissionRequestCallback {
  return async (context): Promise<PermissionDecision> => ({
    decision: 'allow',
    scope,
    reason: `Auto-approved in demo for tool "${context.tool.name}"`,
  });
}

export function createScriptedPermissionCallback(
  actions: ScriptedPermissionAction[],
  fallback: ScriptedPermissionAction = {
    decision: 'allow',
    scope: 'once',
    reason: 'Script exhausted; default allow once',
  },
): PermissionRequestCallback {
  let cursor = 0;
  return async (context): Promise<PermissionDecision> => {
    const action = actions[cursor] ?? fallback;
    cursor += 1;
    return {
      decision: action.decision,
      scope: action.scope,
      reason: action.reason
        ?? `Scripted decision for ${context.tool.name}: ${action.decision} (${action.scope ?? 'once'})`,
    };
  };
}

export function createCliPermissionCallback(): PermissionRequestCallback {
  return async (context): Promise<PermissionDecision> => {
    const rl = createInterface({ input, output });
    try {
      const result = await promptPermissionDecision(context, {
        writeLine(message: string): void {
          output.write(`${withLocalTimestamp(message)}\n`);
        },
        async readLine(promptText: string): Promise<string> {
          return rl.question(withLocalTimestamp(promptText));
        },
      });
      return result.decision;
    } finally {
      rl.close();
    }
  };
}
