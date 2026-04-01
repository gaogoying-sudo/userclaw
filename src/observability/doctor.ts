/**
 * Doctor — minimal runtime health check.
 *
 * Reports the health of core subsystems so operators can quickly
 * identify what layer is broken when something fails.
 *
 * Current status: checks tool count, data root writability, runtime dirs,
 * knowledge/skill/rule counts, permission rule presence, and model config readiness.
 * It still does not perform live upstream connectivity probes.
 */

import type { ToolRegistry } from '../tools/tool-registry.js';
import type { PermissionEngine } from '../permissions/permission-engine.js';
import type { KnowledgeStore } from '../knowledge/knowledge-store.js';
import type { SkillStore } from '../skills/skill-store.js';
import type { RuleStore } from '../rules/rule-store.js';
import { loadModelConfig } from '../models/model-config.js';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { SessionStore } from '../session/session-store.js';

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
  sessionStore: SessionStore;
}

export class Doctor {
  private deps: DoctorDeps;

  constructor(deps: DoctorDeps) {
    this.deps = deps;
  }

  run(): DoctorReport {
    const checks: DoctorCheckResult[] = [
      this.checkTools(),
      this.checkDataRootWritable(),
      this.checkSessionHistoryDirs(),
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

  private checkDataRootWritable(): DoctorCheckResult {
    const dataRoot = this.deps.sessionStore.getDataRoot();
    const probePath = path.join(dataRoot, `.doctor-write-probe-${Date.now()}.tmp`);

    try {
      writeFileSync(probePath, 'ok', 'utf8');
      rmSync(probePath, { force: true });
      return {
        name: 'data_root_write',
        status: 'ok',
        detail: `Writable data root: ${dataRoot}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        name: 'data_root_write',
        status: 'error',
        detail: `Data root not writable (${dataRoot}): ${message}`,
      };
    }
  }

  private checkSessionHistoryDirs(): DoctorCheckResult {
    const sessionDir = this.deps.sessionStore.getSessionDir();
    const historyDir = this.deps.sessionStore.getHistoryDir();
    const artifactDir = this.deps.sessionStore.getArtifactDir();

    const missing = [
      !existsSync(sessionDir) ? sessionDir : '',
      !existsSync(historyDir) ? historyDir : '',
      !existsSync(artifactDir) ? artifactDir : '',
    ].filter(Boolean);

    if (missing.length > 0) {
      return {
        name: 'session_history_dirs',
        status: 'error',
        detail: `Missing runtime dirs: ${missing.join(', ')}`,
      };
    }

    return {
      name: 'session_history_dirs',
      status: 'ok',
      detail: `sessions/history/artifacts dirs present`,
    };
  }

  private checkModelConfig(): DoctorCheckResult {
    const config = loadModelConfig();
    if (config.enabled && config.config) {
      return {
        name: 'model_config',
        status: 'ok',
        detail: `Real model enabled (${config.config.provider}:${config.config.modelName})`,
      };
    }

    if ((config.reason ?? '').includes('Unsupported USERCLAW_MODEL_PROVIDER')) {
      return {
        name: 'model_config',
        status: 'error',
        detail: config.reason ?? 'Unsupported model provider',
      };
    }

    return {
      name: 'model_config',
      status: 'warn',
      detail: config.reason ?? 'Real model not configured; runtime will use mock fallback',
    };
  }
}
