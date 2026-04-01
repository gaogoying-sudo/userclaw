/**
 * Doctor — minimal runtime health check.
 *
 * Reports the health of core subsystems so operators can quickly
 * identify what layer is broken when something fails.
 *
 * Placeholder status: checks tool count, knowledge/skill/rule counts,
 * and permission mode. No real external dependency checks.
 * Phase 2 (Codex) will add model connectivity, MCP status,
 * API key validation, directory state checks, and plugin load status.
 */

import type { ToolRegistry } from '../tools/tool-registry.js';
import type { PermissionEngine } from '../permissions/permission-engine.js';
import type { KnowledgeStore } from '../knowledge/knowledge-store.js';
import type { SkillStore } from '../skills/skill-store.js';
import type { RuleStore } from '../rules/rule-store.js';

export interface DoctorCheckResult {
  name: string;
  status: 'ok' | 'warn' | 'error';
  detail: string;
}

export interface DoctorReport {
  timestamp: string;
  checks: DoctorCheckResult[];
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
}

export interface DoctorDeps {
  toolRegistry: ToolRegistry;
  permissionEngine: PermissionEngine;
  knowledgeStore: KnowledgeStore;
  skillStore: SkillStore;
  ruleStore: RuleStore;
}

export class Doctor {
  private deps: DoctorDeps;

  constructor(deps: DoctorDeps) {
    this.deps = deps;
  }

  run(): DoctorReport {
    const checks: DoctorCheckResult[] = [
      this.checkTools(),
      this.checkKnowledge(),
      this.checkSkills(),
      this.checkRules(),
      this.checkPermissions(),
      this.checkModelConfig(),
    ];

    const hasError = checks.some((c) => c.status === 'error');
    const hasWarn = checks.some((c) => c.status === 'warn');

    return {
      timestamp: new Date().toISOString(),
      checks,
      overallStatus: hasError ? 'unhealthy' : hasWarn ? 'degraded' : 'healthy',
    };
  }

  private checkTools(): DoctorCheckResult {
    const count = this.deps.toolRegistry.count();
    if (count === 0) {
      return { name: 'tool_registry', status: 'error', detail: 'No tools registered' };
    }
    return { name: 'tool_registry', status: 'ok', detail: `${count} tool(s) registered` };
  }

  private checkKnowledge(): DoctorCheckResult {
    const count = this.deps.knowledgeStore.count();
    if (count === 0) {
      return { name: 'knowledge_store', status: 'warn', detail: 'No knowledge items loaded' };
    }
    return { name: 'knowledge_store', status: 'ok', detail: `${count} item(s)` };
  }

  private checkSkills(): DoctorCheckResult {
    const count = this.deps.skillStore.count();
    if (count === 0) {
      return { name: 'skill_store', status: 'warn', detail: 'No skills loaded' };
    }
    return { name: 'skill_store', status: 'ok', detail: `${count} skill(s)` };
  }

  private checkRules(): DoctorCheckResult {
    const count = this.deps.ruleStore.count();
    if (count === 0) {
      return { name: 'rule_store', status: 'warn', detail: 'No rules loaded' };
    }
    return { name: 'rule_store', status: 'ok', detail: `${count} rule(s)` };
  }

  private checkPermissions(): DoctorCheckResult {
    const rules = this.deps.permissionEngine.listRules();
    return {
      name: 'permission_engine',
      status: 'ok',
      detail: `${rules.length} explicit rule(s); default policy active`,
    };
  }

  /**
   * Placeholder: always returns warn since no real model is configured.
   * Phase 2 (Codex) will validate API keys / local model availability.
   */
  private checkModelConfig(): DoctorCheckResult {
    return {
      name: 'model_config',
      status: 'warn',
      detail: 'Using mock model (no real model configured)',
    };
  }
}
