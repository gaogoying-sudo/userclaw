import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { ToolRegistry } from './tools/tool-registry.js';
import { registerCoreTools } from './tools/index.js';
import { PermissionEngine } from './permissions/permission-engine.js';
import { createAutoApprovePermissionCallback } from './permissions/permission-callback.js';
import { KnowledgeStore } from './knowledge/knowledge-store.js';
import { SkillStore } from './skills/skill-store.js';
import { RuleStore } from './rules/rule-store.js';
import { QueryRuntime } from './runtime/query-runtime.js';
import { SubmitEntry } from './submit/submit-entry.js';
import { SessionStore } from './session/session-store.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`SMOKE_ASSERT_FAILED: ${message}`);
  }
}

async function main(): Promise<void> {
  const dataRoot = path.join('/tmp', `userclaw-smoke-${Date.now()}`);

  const knowledgeStore = new KnowledgeStore({ dataRoot });
  const skillStore = new SkillStore({ dataRoot });
  const ruleStore = new RuleStore({ dataRoot });
  const sessionStore = new SessionStore({ dataRoot });
  const toolRegistry = new ToolRegistry();
  registerCoreTools(toolRegistry);

  const permissionEngine = new PermissionEngine({
    dataRoot,
    requestPermission: createAutoApprovePermissionCallback('session'),
  });

  const runtime = new QueryRuntime({
    toolRegistry,
    permissionEngine,
    knowledgeStore,
    skillStore,
    ruleStore,
    sessionStore,
  });
  const entry = new SubmitEntry(runtime, undefined, sessionStore);

  await entry.submit('Seed smoke context', {
    source: 'guided_injection',
    triggerMode: 'injection',
    structuredPayload: {
      knowledge: [{ title: 'Smoke Knowledge', content: 'Runtime hardening smoke case' }],
      skills: [{ name: 'smoke-skill', description: 'Smoke steps', steps: ['collect', 'verify'] }],
      rules: [{ name: 'smoke-rule', ruleText: 'Prefer minimal output in smoke', priority: 8 }],
    },
  });

  const run = await entry.submit('Use available context and provide a concise runtime check summary.');

  assert(run.modelTrace, 'modelTrace should exist');
  assert(run.modelTrace.contextTrace, 'contextTrace should exist');
  assert(run.modelTrace.contextStrategy.length > 0, 'context strategy should be present');
  assert(run.modelTrace.usedKnowledgeIds.length > 0, 'knowledge ids should be recorded');
  assert(run.modelTrace.usedSkillIds.length > 0, 'skill ids should be recorded');
  assert(run.modelTrace.usedRuleIds.length > 0, 'rule ids should be recorded');
  assert(typeof run.metrics.modelId === 'string' && run.metrics.modelId.length > 0, 'metrics modelId should exist');
  assert(typeof run.metrics.fallbackUsed === 'boolean', 'metrics fallback flag should exist');

  const recent = sessionStore.listSessionRecords(10);
  assert(recent.length >= 2, 'session records should be persisted');

  const historyEntries = sessionStore.loadHistoryEntries(entry.getSessionId());
  assert(historyEntries.length >= 2, 'history entries should be persisted');

  assert(existsSync(sessionStore.getSessionDir()), 'sessions dir should exist');
  assert(existsSync(sessionStore.getHistoryDir()), 'history dir should exist');
  assert(existsSync(sessionStore.getArtifactDir()), 'artifacts dir should exist');

  const sessionFileCount = readdirSync(sessionStore.getSessionDir()).length;
  assert(sessionFileCount > 0, 'at least one session record file should exist');

  console.log('[smoke] PASS');
  console.log(`[smoke] dataRoot=${dataRoot}`);
  console.log(`[smoke] sessionRecords=${recent.length}`);
  console.log(`[smoke] historyEntries=${historyEntries.length}`);
  console.log(`[smoke] model=${run.modelTrace.model} fallback=${run.modelTrace.usedMockFallback}`);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[smoke] FAIL: ${message}`);
  process.exit(1);
});

