/**
 * Permission Engine — minimal usable allow / ask / deny decision layer.
 *
 * Capabilities in Phase 2:
 *  - once / session / project scope rules
 *  - path-prefix rules
 *  - interactive requestPermission callback hook
 *  - permission decision event log for demo/diagnostics
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { PermissionDecision, RuntimeContext, ToolSpec } from '../shared/contracts.js';
import {
  ensureDataLayerDir,
  isPathInside,
  normalizeSlashes,
  toAbsolutePath,
  toProjectRelativePath,
} from '../shared/data-paths.js';
import type {
  PermissionDecisionContext,
  PermissionDecisionEvent,
  PermissionRequestCallback,
  PermissionRule,
} from './permission-types.js';

const PROJECT_RULE_FILE_NAME = 'project-rules.json';

export interface PermissionEngineOptions {
  dataRoot?: string;
  projectRoot?: string;
  requestPermission?: PermissionRequestCallback;
}

export class PermissionEngine {
  private onceRules: PermissionRule[] = [];
  private sessionRules: PermissionRule[] = [];
  private projectRules: PermissionRule[] = [];
  private readonly projectRoot: string;
  private readonly projectRuleFile: string;
  private requestPermissionHandler?: PermissionRequestCallback;
  private decisionLog: PermissionDecisionEvent[] = [];

  constructor(options: PermissionEngineOptions = {}) {
    const permissionDir = ensureDataLayerDir('permissions', options.dataRoot);
    this.projectRoot = path.resolve(options.projectRoot ?? process.cwd());
    this.projectRuleFile = path.join(permissionDir, PROJECT_RULE_FILE_NAME);
    this.requestPermissionHandler = options.requestPermission;
    this.projectRules = this.loadProjectRules();
  }

  setRequestPermissionHandler(handler: PermissionRequestCallback): void {
    this.requestPermissionHandler = handler;
  }

  addRule(rule: PermissionRule): void {
    const normalized: PermissionRule = {
      ...rule,
      scope: rule.scope ?? 'session',
      pathPrefix: this.normalizePathPrefix(rule.pathPrefix),
    };

    switch (normalized.scope) {
      case 'once':
        this.onceRules.push(normalized);
        break;
      case 'project':
        this.projectRules.push(normalized);
        this.persistProjectRules();
        break;
      case 'session':
      default:
        this.sessionRules.push(normalized);
        break;
    }
  }

  async evaluate(spec: ToolSpec, input: unknown, ctx: RuntimeContext): Promise<PermissionDecision> {
    if (spec.checkPermission) {
      const decision = await spec.checkPermission(input, ctx);
      this.recordDecision(spec.name, this.getTargetPath(input), decision, 'tool_check');
      return decision;
    }

    if (!spec.requiresPermission) {
      const decision: PermissionDecision = { decision: 'allow', reason: 'Tool does not require permission' };
      this.recordDecision(spec.name, this.getTargetPath(input), decision, 'default');
      return decision;
    }

    const targetPath = this.getTargetPath(input);
    const matched = this.findMatchingRule(spec.name, targetPath);
    if (matched) {
      const decision: PermissionDecision = {
        decision: matched.rule.verdict,
        reason: matched.rule.reason,
        scope: matched.rule.scope,
      };
      this.recordDecision(spec.name, targetPath, decision, matched.source);
      return decision;
    }

    if (spec.isDestructive) {
      const decision: PermissionDecision = {
        decision: 'deny',
        reason: `Tool "${spec.name}" is destructive and requires explicit override`,
      };
      this.recordDecision(spec.name, targetPath, decision, 'default');
      return decision;
    }

    if (!spec.isReadOnly) {
      const decision: PermissionDecision = {
        decision: 'ask',
        reason: `Tool "${spec.name}" has side effects`,
        scope: 'once',
      };
      this.recordDecision(spec.name, targetPath, decision, 'default');
      return decision;
    }

    const decision: PermissionDecision = { decision: 'allow' };
    this.recordDecision(spec.name, targetPath, decision, 'default');
    return decision;
  }

  async requestPermission(context: PermissionDecisionContext): Promise<PermissionDecision> {
    const handler = this.requestPermissionHandler;
    const fallback: PermissionDecision = {
      decision: 'allow',
      scope: 'once',
      reason: `No interactive handler configured; default-allow for "${context.tool.name}"`,
    };

    const decision = handler ? await handler(context) : fallback;
    this.recordDecision(context.tool.name, context.targetPath, decision, 'callback');

    if ((decision.scope === 'session' || decision.scope === 'project') && decision.decision !== 'ask') {
      this.addRule({
        toolName: context.tool.name,
        verdict: decision.decision,
        reason: decision.reason,
        scope: decision.scope,
        pathPrefix: context.targetPath,
      });
    }

    return decision;
  }

  getTargetPath(input: unknown): string | undefined {
    if (!input || typeof input !== 'object') {
      return undefined;
    }
    const maybePath = (input as { path?: unknown }).path;
    if (typeof maybePath !== 'string' || maybePath.trim().length === 0) {
      return undefined;
    }

    const absolute = toAbsolutePath(this.projectRoot, maybePath);
    if (isPathInside(this.projectRoot, absolute)) {
      return normalizeSlashes(toProjectRelativePath(this.projectRoot, absolute));
    }
    return normalizeSlashes(absolute);
  }

  listRules(): PermissionRule[] {
    return [...this.onceRules, ...this.sessionRules, ...this.projectRules];
  }

  listDecisionLog(): PermissionDecisionEvent[] {
    return [...this.decisionLog];
  }

  private normalizePathPrefix(pathPrefix?: string): string | undefined {
    if (!pathPrefix || pathPrefix.trim().length === 0) {
      return undefined;
    }
    const absolute = toAbsolutePath(this.projectRoot, pathPrefix);
    if (isPathInside(this.projectRoot, absolute)) {
      return normalizeSlashes(toProjectRelativePath(this.projectRoot, absolute));
    }
    return normalizeSlashes(absolute);
  }

  private findMatchingRule(
    toolName: string,
    targetPath?: string,
  ): { rule: PermissionRule; source: PermissionDecisionEvent['source'] } | undefined {
    const onceIndex = this.onceRules.findIndex((rule) => this.matchesRule(rule, toolName, targetPath));
    if (onceIndex >= 0) {
      const [rule] = this.onceRules.splice(onceIndex, 1);
      return { rule, source: 'rule:once' };
    }

    const sessionRule = this.sessionRules.find((rule) => this.matchesRule(rule, toolName, targetPath));
    if (sessionRule) {
      return { rule: sessionRule, source: 'rule:session' };
    }

    const projectRule = this.projectRules.find((rule) => this.matchesRule(rule, toolName, targetPath));
    if (projectRule) {
      return { rule: projectRule, source: 'rule:project' };
    }

    return undefined;
  }

  private matchesRule(rule: PermissionRule, toolName: string, targetPath?: string): boolean {
    if (rule.toolName && rule.toolName !== toolName) {
      return false;
    }
    if (rule.pathPrefix) {
      if (!targetPath) {
        return false;
      }
      return targetPath === rule.pathPrefix || targetPath.startsWith(`${rule.pathPrefix}/`);
    }
    return true;
  }

  private recordDecision(
    toolName: string,
    targetPath: string | undefined,
    decision: PermissionDecision,
    source: PermissionDecisionEvent['source'],
  ): void {
    this.decisionLog.push({
      timestamp: new Date().toISOString(),
      toolName,
      targetPath,
      decision: decision.decision,
      scope: decision.scope,
      reason: decision.reason,
      source,
    });
  }

  private loadProjectRules(): PermissionRule[] {
    if (!existsSync(this.projectRuleFile)) {
      return [];
    }
    try {
      const raw = readFileSync(this.projectRuleFile, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter((item): item is PermissionRule => {
          if (!item || typeof item !== 'object') {
            return false;
          }
          const rule = item as Partial<PermissionRule>;
          return rule.verdict === 'allow' || rule.verdict === 'ask' || rule.verdict === 'deny';
        })
        .map((rule) => ({
          ...rule,
          scope: 'project',
          pathPrefix: this.normalizePathPrefix(rule.pathPrefix),
        }));
    } catch {
      return [];
    }
  }

  private persistProjectRules(): void {
    writeFileSync(this.projectRuleFile, `${JSON.stringify(this.projectRules, null, 2)}\n`, 'utf8');
  }
}
