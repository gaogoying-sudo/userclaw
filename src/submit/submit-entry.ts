/**
 * Unified Submit Entry.
 *
 * All inputs — user text, guided injection payloads, system commands,
 * future external bridges — must pass through this single entry point
 * before reaching the Query Runtime.
 *
 * Responsibilities:
 *  - Validate input (reject empty / illegal)
 *  - Determine source and triggerMode
 *  - Assign IDs and timestamp
 *  - Build SubmitRequest
 *  - Dispatch to QueryRuntime
 *
 * Placeholder status: validation is minimal; history recording is a stub.
 * Phase 2 (Codex) will add history persistence, queue handling,
 * abort-controller creation, attachment expansion, and slash-command routing.
 */

import type { SubmitRequest, SubmitSource, TriggerMode } from '../shared/contracts.js';
import type { QueryRuntime, QueryRunResult } from '../runtime/query-runtime.js';
import { generateId } from '../shared/id.js';

export interface SubmitOptions {
  source?: SubmitSource;
  triggerMode?: TriggerMode;
  structuredPayload?: Record<string, unknown>;
}

export class SubmitEntry {
  private runtime: QueryRuntime;
  private sessionId: string;

  constructor(runtime: QueryRuntime, sessionId?: string) {
    this.runtime = runtime;
    this.sessionId = sessionId ?? generateId();
  }

  async submit(inputText: string, options: SubmitOptions = {}): Promise<QueryRunResult> {
    this.validateInput(inputText, options);

    const request: SubmitRequest = {
      id: generateId(),
      source: options.source ?? 'user_input',
      sessionId: this.sessionId,
      inputText: inputText.trim(),
      structuredPayload: options.structuredPayload,
      triggerMode: options.triggerMode ?? 'interactive',
      createdAt: new Date().toISOString(),
    };

    // Placeholder: history recording stub.
    // Phase 2 (Codex) will persist to a session history store.
    this.recordHistory(request);

    return this.runtime.execute(request);
  }

  private validateInput(inputText: string, _options: SubmitOptions): void {
    if (!inputText || inputText.trim().length === 0) {
      throw new Error('Submit rejected: input text is empty');
    }
  }

  /**
   * Stub: record to session history.
   * Phase 2 will implement real persistence.
   */
  private recordHistory(_request: SubmitRequest): void {
    // no-op in V1 skeleton
  }
}
