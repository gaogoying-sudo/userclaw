import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { ToolRegistry } from './tools/tool-registry.js';
import { registerCoreTools } from './tools/index.js';
import { PermissionEngine } from './permissions/permission-engine.js';
import { createScriptedPermissionCallback } from './permissions/permission-callback.js';
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
    requestPermission: createScriptedPermissionCallback([
      {
        decision: 'allow',
        scope: 'project',
        reason: 'smoke scripted allow project',
      },
      {
        decision: 'deny',
        scope: 'once',
        reason: 'smoke scripted deny once',
      },
    ]),
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

  const runAllowProject = await entry.submit(
    'Smoke write with ask -> allow(project)',
    {
      structuredPayload: {
        toolCalls: [
          {
            toolName: 'file_write',
            input: {
              path: 'userclaw-data/generated/smoke-project.txt',
              content: 'smoke project scope write\n',
            },
          },
        ],
      },
    },
  );

  assert(runAllowProject.modelTrace, 'modelTrace should exist');
  assert(runAllowProject.modelTrace.contextTrace, 'contextTrace should exist');
  assert(runAllowProject.modelTrace.contextStrategy.length > 0, 'context strategy should be present');
  assert(runAllowProject.modelTrace.usedKnowledgeIds.length > 0, 'knowledge ids should be recorded');
  assert(runAllowProject.modelTrace.usedSkillIds.length > 0, 'skill ids should be recorded');
  assert(runAllowProject.modelTrace.usedRuleIds.length > 0, 'rule ids should be recorded');
  assert(
    runAllowProject.permissionDecisions.some(
      (decision) => decision.source === 'callback' && decision.decision === 'allow' && decision.scope === 'project',
    ),
    'first permission decision should be callback allow(project)',
  );
  assert(typeof runAllowProject.metrics.modelId === 'string' && runAllowProject.metrics.modelId.length > 0, 'metrics modelId should exist');
  assert(typeof runAllowProject.metrics.fallbackUsed === 'boolean', 'metrics fallback flag should exist');

  const runDeny = await entry.submit(
    'Smoke write with ask -> deny',
    {
      structuredPayload: {
        toolCalls: [
          {
            toolName: 'file_write',
            input: {
              path: 'userclaw-data/generated/smoke-deny.txt',
              content: 'smoke deny write\n',
            },
          },
        ],
      },
    },
  );
  assert(runDeny.session.state === 'failed', 'deny run should fail');
  assert(runDeny.error?.category === 'permission_denied', 'deny run should map to permission_denied');
  assert(
    runDeny.permissionDecisions.some(
      (decision) => decision.source === 'callback' && decision.decision === 'deny',
    ),
    'deny run should contain callback deny decision',
  );

  const reloadedPermissionEngine = new PermissionEngine({ dataRoot });
  const reloadedRuntime = new QueryRuntime({
    toolRegistry,
    permissionEngine: reloadedPermissionEngine,
    knowledgeStore,
    skillStore,
    ruleStore,
    sessionStore,
  });
  const reloadedEntry = new SubmitEntry(reloadedRuntime, undefined, sessionStore);
  const runProjectReuse = await reloadedEntry.submit(
    'Smoke write with project scope reuse',
    {
      structuredPayload: {
        toolCalls: [
          {
            toolName: 'file_write',
            input: {
              path: 'userclaw-data/generated/smoke-project.txt',
              content: 'smoke project scope reused\n',
            },
          },
        ],
      },
    },
  );
  assert(runProjectReuse.session.state === 'completed', 'project scope reuse run should complete');
  assert(
    runProjectReuse.permissionDecisions.some(
      (decision) => decision.source === 'rule:project' && decision.decision === 'allow',
    ),
    'project scope reuse should be resolved by project rule',
  );

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
  console.log(`[smoke] model=${runAllowProject.modelTrace.model} fallback=${runAllowProject.modelTrace.usedMockFallback}`);
  console.log(`[smoke] projectScopeReuse=${runProjectReuse.permissionDecisions.some((d) => d.source === 'rule:project')}`);
  console.log(`[smoke] denyConfirmed=${runDeny.permissionDecisions.some((d) => d.decision === 'deny')}`);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[smoke] FAIL: ${message}`);
  process.exit(1);
});
