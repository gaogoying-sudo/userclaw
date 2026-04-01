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
 * Current status: validation remains minimal, but submit-level history
 * is persisted through SessionStore for runtime hardening.
 */

import type { SubmitRequest, SubmitSource, TriggerMode } from '../shared/contracts.js';
import type { QueryRuntime, QueryRunResult } from '../runtime/query-runtime.js';
import { generateId } from '../shared/id.js';
import { SessionStore } from '../session/session-store.js';

export interface SubmitOptions {
  source?: SubmitSource;
  triggerMode?: TriggerMode;
  structuredPayload?: Record<string, unknown>;
}

export class SubmitEntry {
  private runtime: QueryRuntime;
  private sessionId: string;
  private sessionStore: SessionStore;

  constructor(runtime: QueryRuntime, sessionId?: string, sessionStore?: SessionStore) {
    this.runtime = runtime;
    this.sessionId = sessionId ?? generateId();
    this.sessionStore = sessionStore ?? new SessionStore();
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

    this.recordHistory(request);

    return this.runtime.execute(request);
  }

  getSessionId(): string {
    return this.sessionId;
  }

  private validateInput(inputText: string, _options: SubmitOptions): void {
    if (!inputText || inputText.trim().length === 0) {
      throw new Error('Submit rejected: input text is empty');
    }
  }

  private recordHistory(request: SubmitRequest): void {
    this.sessionStore.appendHistoryEntry(this.sessionId, {
      id: generateId(),
      timestamp: request.createdAt,
      type: 'submit_request',
      submitSessionId: this.sessionId,
      requestId: request.id,
      details: {
        source: request.source,
        triggerMode: request.triggerMode,
        inputPreview: (request.inputText ?? '').slice(0, 160),
      },
    });
  }
}
