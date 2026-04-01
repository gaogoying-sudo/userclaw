/**
 * userclaw V1 unified contracts.
 *
 * This is the single source of truth for all core runtime types.
 * No module should define parallel versions of these objects.
 *
 * Placeholder status: types are final for V1 skeleton; implementations
 * that consume them are mostly mock/stub in Phase 1.
 * Phase 2 (Codex) will wire real model calls, persistence, and richer validation.
 */

// ---------------------------------------------------------------------------
// Submit Request
// ---------------------------------------------------------------------------

export type SubmitSource =
  | 'user_input'
  | 'guided_injection'
  | 'system_command'
  | 'external_bridge';

export type TriggerMode = 'interactive' | 'injection' | 'command';

export interface Attachment {
  type: string;
  uri?: string;
  name?: string;
  meta?: Record<string, unknown>;
}

export interface SubmitRequest {
  id: string;
  source: SubmitSource;
  sessionId: string;
  inputText?: string;
  structuredPayload?: Record<string, unknown>;
  attachments?: Attachment[];
  triggerMode: TriggerMode;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Query State Machine
// ---------------------------------------------------------------------------

export type QueryState =
  | 'idle'
  | 'dispatching'
  | 'running'
  | 'waiting_permission'
  | 'interrupted'
  | 'failed'
  | 'completed';

export type TaskType = 'injection' | 'execution' | 'command';

export interface QuerySession {
  id: string;
  submitRequestId: string;
  state: QueryState;
  taskType: TaskType;
  startedAt?: string;
  endedAt?: string;
  interruptionReason?: string;
  failureReason?: string;
}

// ---------------------------------------------------------------------------
// Runtime Context (layered)
// ---------------------------------------------------------------------------

export interface SystemContext {
  identity: string;
  principles: string[];
}

export interface RuntimeEnv {
  modelMode: 'local' | 'remote' | 'hybrid';
  selectedModel?: string;
  availableTools: string[];
  permissionMode: 'allow' | 'ask' | 'deny_mixed';
}

export interface TaskContext {
  goal: string;
  currentPlan?: string[];
  recentActions?: string[];
}

export interface InjectionContext {
  knowledgeIds?: string[];
  skillIds?: string[];
  ruleIds?: string[];
}

export interface RuntimeContext {
  systemContext: SystemContext;
  runtimeContext: RuntimeEnv;
  taskContext: TaskContext;
  injectionContext: InjectionContext;
}

// ---------------------------------------------------------------------------
// Tool Contract
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  isReadOnly: boolean;
  isDestructive: boolean;
  isConcurrencySafe: boolean;
  requiresPermission: boolean;
  validateInput?: (input: unknown, ctx: RuntimeContext) => Promise<ValidationResult>;
  checkPermission?: (input: unknown, ctx: RuntimeContext) => Promise<PermissionDecision>;
  execute: (input: unknown, ctx: RuntimeContext) => Promise<ToolResult>;
}

export interface ToolCall {
  id: string;
  toolName: string;
  input: unknown;
  invokedAt: string;
}

export interface ToolResult {
  ok: boolean;
  previewText: string;
  data?: unknown;
  artifactUri?: string;
  truncated?: boolean;
  errorCode?: string;
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Permission Contract
// ---------------------------------------------------------------------------

export type PermissionVerdict = 'allow' | 'ask' | 'deny';
export type PermissionScope = 'once' | 'session' | 'project';

export interface PermissionDecision {
  decision: PermissionVerdict;
  reason?: string;
  scope?: PermissionScope;
}

// ---------------------------------------------------------------------------
// Knowledge / Skill / Rule Items
// ---------------------------------------------------------------------------

export interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  tags?: string[];
  source?: string;
}

export interface SkillItem {
  id: string;
  name: string;
  description: string;
  steps: string[];
  allowedTools?: string[];
}

export interface RuleItem {
  id: string;
  name: string;
  ruleText: string;
  priority: number;
  scope?: 'global' | 'project' | 'task';
}

// ---------------------------------------------------------------------------
// Model Route Decision
// ---------------------------------------------------------------------------

export interface ModelRouteDecision {
  mode: 'local' | 'remote' | 'hybrid';
  selectedModel?: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Execution Error
// ---------------------------------------------------------------------------

export type ErrorCategory =
  | 'model_config_error'
  | 'model_http_error'
  | 'model_response_error'
  | 'tool_validation_error'
  | 'validation_error'
  | 'permission_denied'
  | 'tool_error'
  | 'context_overflow'
  | 'model_error'
  | 'runtime_error'
  | 'external_connection_error';

export interface ExecutionError {
  code: string;
  message: string;
  category: ErrorCategory;
  retryable?: boolean;
}

// ---------------------------------------------------------------------------
// Metrics (minimal)
// ---------------------------------------------------------------------------

export interface SessionMetrics {
  sessionId: string;
  tokenUsage: number;
  wallTimeMs: number;
  toolExecutionMs: number;
  modelCallMs: number;
  modelId?: string;
  fallbackUsed?: boolean;
}
