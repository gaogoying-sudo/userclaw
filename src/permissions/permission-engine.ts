/**
 * Permission Engine — minimal allow / ask / deny decision layer.
 *
 * Evaluates whether a tool invocation should proceed, pause for
 * confirmation, or be blocked outright.
 *
 * Placeholder status: uses a simple rule table keyed by tool name.
 * Phase 2 (Codex) will add path-based rules, domain rules, secret
 * scanning integration, persistent rule storage (session / project),
 * and interactive UI confirmation flow.
 */

import type {
  ToolSpec,
  RuntimeContext,
  PermissionDecision,
  PermissionVerdict,
} from '../shared/contracts.js';

export interface PermissionRule {
  toolName: string;
  verdict: PermissionVerdict;
  reason?: string;
}

export class PermissionEngine {
  private rules = new Map<string, PermissionRule>();

  addRule(rule: PermissionRule): void {
    this.rules.set(rule.toolName, rule);
  }

  async evaluate(
    spec: ToolSpec,
    _input: unknown,
    _ctx: RuntimeContext,
  ): Promise<PermissionDecision> {
    // Tool-specific permission check takes highest priority
    if (spec.checkPermission) {
      return spec.checkPermission(_input, _ctx);
    }

    // Explicit rule lookup
    const rule = this.rules.get(spec.name);
    if (rule) {
      return { decision: rule.verdict, reason: rule.reason, scope: 'session' };
    }

    // Default policy: destructive → deny, non-readonly → ask, readonly → allow
    if (spec.isDestructive) {
      return {
        decision: 'deny',
        reason: `Tool "${spec.name}" is destructive; explicit permission required`,
      };
    }
    if (!spec.isReadOnly) {
      return {
        decision: 'ask',
        reason: `Tool "${spec.name}" has side effects; confirmation recommended`,
        scope: 'once',
      };
    }
    return { decision: 'allow' };
  }

  listRules(): PermissionRule[] {
    return Array.from(this.rules.values());
  }
}
