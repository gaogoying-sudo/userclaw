/**
 * Explicit Query State Machine.
 *
 * Enforces legal transitions for QueryState.
 * V1 uses a synchronous, deterministic state machine — not a React state hook.
 *
 * Placeholder status: transition rules are final for V1 skeleton.
 * Phase 2 (Codex) will add event emitters and persistence hooks.
 */

import type { QueryState } from '../shared/contracts.js';

const VALID_TRANSITIONS: Record<QueryState, QueryState[]> = {
  idle:               ['dispatching'],
  dispatching:        ['running', 'failed', 'interrupted'],
  running:            ['waiting_permission', 'completed', 'failed', 'interrupted'],
  waiting_permission: ['running', 'failed', 'interrupted'],
  interrupted:        [],  // terminal
  failed:             [],  // terminal
  completed:          [],  // terminal
};

export class QueryStateMachine {
  private _state: QueryState = 'idle';

  get state(): QueryState {
    return this._state;
  }

  transition(next: QueryState): void {
    const allowed = VALID_TRANSITIONS[this._state];
    if (!allowed.includes(next)) {
      throw new Error(
        `Invalid state transition: ${this._state} -> ${next}. ` +
        `Allowed from ${this._state}: [${allowed.join(', ')}]`
      );
    }
    this._state = next;
  }

  isTerminal(): boolean {
    return VALID_TRANSITIONS[this._state].length === 0;
  }

  reset(): void {
    this._state = 'idle';
  }
}
