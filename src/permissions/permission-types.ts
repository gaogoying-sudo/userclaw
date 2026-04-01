import type {
  PermissionDecision,
  PermissionScope,
  PermissionVerdict,
  RuntimeContext,
  ToolSpec,
} from '../shared/contracts.js';

export interface PermissionRule {
  toolName?: string;
  verdict: PermissionVerdict;
  reason?: string;
  scope?: PermissionScope;
  pathPrefix?: string;
}

export interface PermissionDecisionContext {
  sessionId: string;
  submitRequestId?: string;
  tool: Pick<
    ToolSpec,
    'name' | 'description' | 'isReadOnly' | 'isDestructive' | 'requiresPermission'
  >;
  input: unknown;
  runtimeContext: RuntimeContext;
  initialDecision: PermissionDecision;
  targetPath?: string;
}

export interface PermissionDecisionEvent {
  timestamp: string;
  toolName: string;
  targetPath?: string;
  decision: PermissionVerdict;
  scope?: PermissionScope;
  reason?: string;
  source: 'tool_check' | 'rule:once' | 'rule:session' | 'rule:project' | 'default' | 'callback';
}

export type PermissionRequestCallback = (
  context: PermissionDecisionContext,
) => Promise<PermissionDecision>;

