/**
 * Metrics Collector — minimal per-session metrics tracking.
 *
 * Current status: in-memory accumulation only; no export or dashboard.
 * Token/cost accounting remains a placeholder for later phases.
 */

import type { SessionMetrics } from '../shared/contracts.js';

export class MetricsCollector {
  private sessionId: string;
  private toolExecMs = 0;
  private modelCallMs = 0;
  private wallTimeMs = 0;
  private modelId = 'mock-model-v1';
  private fallbackUsed = false;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  recordToolExecution(ms: number): void {
    this.toolExecMs += ms;
  }

  recordModelCall(ms: number, modelId?: string): void {
    this.modelCallMs += ms;
    if (modelId && modelId.trim().length > 0) {
      this.modelId = modelId;
    }
  }

  recordFallbackUsed(fallbackUsed: boolean): void {
    this.fallbackUsed = fallbackUsed;
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
      modelCallMs: this.modelCallMs,
      modelId: this.modelId,
      fallbackUsed: this.fallbackUsed,
    };
  }
}
