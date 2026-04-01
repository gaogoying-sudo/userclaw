import type { ErrorCategory, QueryState, TaskType } from '../shared/contracts.js';
import type { QueryModelTrace } from '../runtime/runtime-trace.js';

export interface SessionRecord {
  id: string; // query session id
  submitSessionId: string;
  requestId: string;
  taskType: TaskType;
  state: QueryState;
  startedAt?: string;
  endedAt?: string;
  model: {
    provider: QueryModelTrace['provider'];
    model: string;
    usedMockFallback: boolean;
    fallbackReason?: string;
  };
  context: {
    contextStrategy?: string;
    usedKnowledgeIds: string[];
    usedSkillIds: string[];
    usedRuleIds: string[];
  };
  errorCategory?: ErrorCategory;
  errorCode?: string;
  artifactUris?: string[];
}

export type HistoryEntryType =
  | 'submit_request'
  | 'runtime_result'
  | 'artifact_written';

export interface HistoryEntry {
  id: string;
  timestamp: string;
  type: HistoryEntryType;
  submitSessionId: string;
  requestId: string;
  querySessionId?: string;
  taskType?: TaskType;
  state?: QueryState;
  model?: SessionRecord['model'];
  errorCategory?: ErrorCategory;
  details?: Record<string, unknown>;
}

