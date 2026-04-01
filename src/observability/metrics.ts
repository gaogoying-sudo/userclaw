/**
 * Metrics Collector — minimal per-session metrics tracking.
 *
 * Placeholder status: in-memory accumulation only; no export or dashboard.
 * Phase 2 (Codex) will add token counting from real model responses,
 * per-model cost breakdown, cache hit tracking, and metrics persistence.
 */

import type { SessionMetrics } from '../shared/contracts.js';

export class MetricsCollector {
  private sessionId: string;
  private toolExecMs = 0;
  private wallTimeMs = 0;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  recordToolExecution(ms: number): void {
    this.toolExecMs += ms;
  }

  recordEnd(totalMs: number): void {
    this.wallTimeMs = totalMs;
  }

  snapshot(): SessionMetrics {
    return {
      sessionId: this.sessionId,
      tokenUsage: 0, // placeholder: Phase 2 will count real tokens
      wallTimeMs: this.wallTimeMs,
      toolExecutionMs: this.toolExecMs,
      modelCallMs: 0, // placeholder: Phase 2 will measure real model latency
      modelId: 'mock-model-v1',
    };
  }
}
