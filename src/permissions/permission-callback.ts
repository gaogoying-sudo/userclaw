import type { PermissionDecision, PermissionScope } from '../shared/contracts.js';
import type { PermissionRequestCallback } from './permission-types.js';

export function createAutoApprovePermissionCallback(
  scope: PermissionScope = 'once',
): PermissionRequestCallback {
  return async (context): Promise<PermissionDecision> => ({
    decision: 'allow',
    scope,
    reason: `Auto-approved in demo for tool "${context.tool.name}"`,
  });
}

