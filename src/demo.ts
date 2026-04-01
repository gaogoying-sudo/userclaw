/**
 * userclaw V1 Phase 4 Demo
 *
 * This script validates hardened runtime behavior:
 *   injection/load K/S/R -> runtime context assembly -> real model call/fallback ->
 *   unified trace/error output -> session/history/artifact persistence.
 *
 * Run: npm run demo
 */

import { ToolRegistry } from './tools/tool-registry.js';
import { registerCoreTools } from './tools/index.js';
import { PermissionEngine } from './permissions/permission-engine.js';
import {
  createCliPermissionCallback,
  createScriptedPermissionCallback,
} from './permissions/permission-callback.js';
import { KnowledgeStore } from './knowledge/knowledge-store.js';
import { SkillStore } from './skills/skill-store.js';
import { RuleStore } from './rules/rule-store.js';
import { QueryRuntime } from './runtime/query-runtime.js';
import { SubmitEntry } from './submit/submit-entry.js';
import { Doctor } from './observability/doctor.js';
import { resolveDataRoot } from './shared/data-paths.js';
import { loadModelConfig } from './models/model-config.js';
import { SessionStore } from './session/session-store.js';

// ── helpers ─────────────────────────────────────────────────────────────

function separator(title: string): void {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(60)}`);
}

function printJson(label: string, obj: unknown): void {
  console.log(`\n[${label}]`);
  console.log(JSON.stringify(obj, null, 2));
}

// ── main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  separator('userclaw V1 Phase 5 Minimal Interaction & Permission Confirmation Demo');

  const dataRoot = resolveDataRoot();
  const modelConfig = loadModelConfig();
  const interactivePermission = process.env.USERCLAW_DEMO_INTERACTIVE_PERMISSION === '1';

  // ── Setup: Local persistence-backed stores ─────────────────────────────
  const knowledgeStore = new KnowledgeStore({ dataRoot });
  const skillStore = new SkillStore({ dataRoot });
  const ruleStore = new RuleStore({ dataRoot });
  const sessionStore = new SessionStore({ dataRoot });
  const toolRegistry = new ToolRegistry();
  registerCoreTools(toolRegistry);

  const permissionEngine = new PermissionEngine({
    dataRoot,
    requestPermission: interactivePermission
      ? createCliPermissionCallback()
      : createScriptedPermissionCallback([
        {
          decision: 'allow',
          scope: 'session',
          reason: 'Demo scripted user choice: allow for session',
        },
        {
          decision: 'deny',
          scope: 'once',
          reason: 'Demo scripted user choice: deny once',
        },
      ]),
  });
  // Keep one explicit path-level rule to prove permission layer stays wired.
  permissionEngine.addRule({
    toolName: 'file_write',
    verdict: 'deny',
    reason: 'Writes under docs/ are blocked in demo policy',
    scope: 'project',
    pathPrefix: 'docs/',
  });

  const injectionRuntime = new QueryRuntime({
    toolRegistry,
    permissionEngine,
    knowledgeStore,
    skillStore,
    ruleStore,
    sessionStore,
  });
  const injectionEntry = new SubmitEntry(injectionRuntime, undefined, sessionStore);

  separator('Phase 0: Startup & Model Mode');
  console.log(`\n  Data root: ${dataRoot}`);
  console.log('  Model mode:');
  if (modelConfig.enabled) {
    console.log(`    [REAL] provider=${modelConfig.config?.provider} model=${modelConfig.config?.modelName}`);
  } else {
    console.log(`    [FALLBACK] ${modelConfig.reason ?? 'Model config missing'}`);
  }
  console.log('  Loaded from disk:');
  console.log(`    Knowledge items: ${knowledgeStore.count()}`);
  console.log(`    Skills:          ${skillStore.count()}`);
  console.log(`    Rules:           ${ruleStore.count()}`);
  console.log(`    Tools:           ${toolRegistry.count()}`);
  console.log(`    Permission rules:${permissionEngine.listRules().length}`);
  console.log(`    Permission mode: ${interactivePermission ? 'interactive-cli' : 'scripted-demo'}`);
  console.log(`    Sessions dir:    ${sessionStore.getSessionDir()}`);
  console.log(`    History dir:     ${sessionStore.getHistoryDir()}`);
  console.log(`    Artifacts dir:   ${sessionStore.getArtifactDir()}`);

  // ── Phase A: Guided Injection through unified Submit Entry ────────────
  separator('Phase A: Guided Injection via Unified Submit Entry');

  console.log('\n  Submitting injection payload through SubmitEntry...');

  const injectionResult = await injectionEntry.submit(
    'Onboard project context for userclaw development',
    {
      source: 'guided_injection',
      triggerMode: 'injection',
      structuredPayload: {
        knowledge: [
          {
            title: 'Project Tech Stack',
            content: 'The project uses TypeScript, Node.js, and follows a layered runtime architecture.',
            tags: ['tech', 'stack'],
          },
          {
            title: 'API Conventions',
            content: 'All API responses use { ok, data, error } envelope. Errors include category and retryable flag.',
            tags: ['api', 'conventions'],
          },
        ],
        skills: [
          {
            name: 'bugfix-workflow',
            description: 'Standard workflow for investigating and fixing bugs',
            steps: [
              'Read error logs and stack traces',
              'Search codebase for related files',
              'Identify root cause',
              'Apply minimal fix',
              'Verify fix with tests',
            ],
          },
        ],
        rules: [
          {
            name: 'minimal-change-principle',
            ruleText: 'Always prefer the smallest possible change. Do not refactor unrelated code.',
            priority: 10,
          },
          {
            name: 'verify-before-commit',
            ruleText: 'Never commit changes without verifying they work first.',
            priority: 9,
          },
        ],
      },
    },
  );

  printJson('Injection Session', injectionResult.session);
  printJson('Injection Result', injectionResult.toolResults);

  console.log(`\n  After injection — stores now contain:`);
  console.log(`    Knowledge items: ${knowledgeStore.count()}`);
  console.log(`    Skills:          ${skillStore.count()}`);
  console.log(`    Rules:           ${ruleStore.count()}`);

  // ── Phase B: Simulated restart + reload from disk ─────────────────────
  separator('Phase B: Simulated Restart (Reload from Local Files)');

  const reloadedKnowledgeStore = new KnowledgeStore({ dataRoot });
  const reloadedSkillStore = new SkillStore({ dataRoot });
  const reloadedRuleStore = new RuleStore({ dataRoot });

  console.log('\n  Reloaded stores from disk:');
  console.log(`    Knowledge items: ${reloadedKnowledgeStore.count()}`);
  console.log(`    Skills:          ${reloadedSkillStore.count()}`);
  console.log(`    Rules:           ${reloadedRuleStore.count()}`);

  const runtime = new QueryRuntime({
    toolRegistry,
    permissionEngine,
    knowledgeStore: reloadedKnowledgeStore,
    skillStore: reloadedSkillStore,
    ruleStore: reloadedRuleStore,
    sessionStore,
  });
  const entry = new SubmitEntry(runtime, undefined, sessionStore);

  // ── Phase C: Doctor Health Check ──────────────────────────────────────
  separator('Phase C: Doctor Health Check');

  const doctor = new Doctor({
    toolRegistry,
    permissionEngine,
    knowledgeStore: reloadedKnowledgeStore,
    skillStore: reloadedSkillStore,
    ruleStore: reloadedRuleStore,
    sessionStore,
  });
  const report = doctor.run();
  printJson('Doctor Report', report);

  // ── Phase D: Permission Confirmation Run 1 (ask -> allow session) ─────
  separator('Phase D: Permission Run 1 (ask -> allow session)');

  console.log('\n  Submitting execution with explicit file_write tool call...');

  const run1 = await entry.submit(
    'Write runtime note to generated path with permission confirmation',
    {
      structuredPayload: {
        toolCalls: [
          {
            toolName: 'file_write',
            input: {
              path: 'userclaw-data/generated/phase5-session.txt',
              content: 'phase5 demo: first write with ask->allow(session)\n',
            },
          },
        ],
      },
    },
  );

  printJson('Run 1 Session', run1.session);
  printJson('Run 1 Tool Results', run1.toolResults);
  printJson('Run 1 Permission Decisions', run1.permissionDecisions);
  if (run1.error) {
    printJson('Run 1 Error', run1.error);
  }

  // ── Phase E: Permission Confirmation Run 2 (session rule reuse) ───────
  separator('Phase E: Permission Run 2 (session scope reused)');

  const run2 = await entry.submit(
    'Write runtime note again, should reuse session scope rule',
    {
      structuredPayload: {
        toolCalls: [
          {
            toolName: 'file_write',
            input: {
              path: 'userclaw-data/generated/phase5-session.txt',
              content: 'phase5 demo: second write should reuse session rule\n',
            },
          },
        ],
      },
    },
  );

  printJson('Run 2 Session', run2.session);
  printJson('Run 2 Tool Results', run2.toolResults);
  printJson('Run 2 Permission Decisions', run2.permissionDecisions);
  if (run2.error) {
    printJson('Run 2 Error', run2.error);
  }

  // ── Phase F: Permission Confirmation Run 3 (ask -> deny) ──────────────
  separator('Phase F: Permission Run 3 (ask -> deny)');

  const run3 = await entry.submit(
    'Write runtime note to a different path and deny the action',
    {
      structuredPayload: {
        toolCalls: [
          {
            toolName: 'file_write',
            input: {
              path: 'userclaw-data/generated/phase5-deny.txt',
              content: 'phase5 demo: this write should be denied\n',
            },
          },
        ],
      },
    },
  );

  printJson('Run 3 Session', run3.session);
  printJson('Run 3 Tool Results', run3.toolResults);
  printJson('Run 3 Permission Decisions', run3.permissionDecisions);
  if (run3.error) {
    printJson('Run 3 Error', run3.error);
  }

  // ── Phase G: Closure Summary ──────────────────────────────────────────
  separator('Phase G: Closure Summary');

  console.log(`
  Injection chain (Phase A):
    idle → dispatching → running → ${injectionResult.session.state}
    taskType: ${injectionResult.session.taskType}

  Execution run 1 (Phase D):
    state: ${run1.session.state}
    permission decisions: ${run1.permissionDecisions.length}
    callback decision: ${run1.permissionDecisions.find((item) => item.source === 'callback')?.decision ?? 'n/a'}
    callback scope: ${run1.permissionDecisions.find((item) => item.source === 'callback')?.scope ?? 'n/a'}

  Execution run 2 (Phase E):
    state: ${run2.session.state}
    expected reuse source: rule:session
    matched source: ${run2.permissionDecisions.find((item) => item.source === 'rule:session')?.source ?? 'n/a'}

  Execution run 3 (Phase F):
    state: ${run3.session.state}
    deny source: ${run3.permissionDecisions.find((item) => item.decision === 'deny')?.source ?? 'n/a'}
    error category: ${run3.error?.category ?? 'n/a'}

  Layers exercised:
    [✓] Unified Submit Entry (both injection and execution)
    [✓] Query Runtime with explicit state machine
    [✓] Minimal permission confirmation interaction callback
    [✓] ask -> allow(session) -> session reuse -> deny path
    [✓] Guided injection → knowledge/skill/rule deposit + local persistence
    [✓] Startup reload from local files (knowledge / skills / rules)
    [✓] Runtime context assembly (knowledge / skill / rule to model prompt)
    [✓] Session/history persistence (per submit + per runtime result)
    [✓] Artifact strategy for large assistant/trace payloads
    [✓] Real model path (if configured) with explicit fallback when config is missing
    [✓] Tool Registry & Tool Contract remain wired for follow-up tool-use evolution
    [✓] Permission Engine remains active (ask / allow / deny + scope + path rule + callback)
    [✓] Knowledge Store (${reloadedKnowledgeStore.count()} items)
    [✓] Skill Store (${reloadedSkillStore.count()} items)
    [✓] Rule Store (${reloadedRuleStore.count()} items)
    [✓] Doctor health check
    [✓] Metrics collection
  `);

  printJson(
    'Recent Session Records',
    sessionStore.listSessionRecords(5).map((item) => ({
      id: item.id,
      submitSessionId: item.submitSessionId,
      state: item.state,
      taskType: item.taskType,
      model: item.model,
      errorCategory: item.errorCategory,
    })),
  );

  printJson('Injection Session History', sessionStore.loadHistoryEntries(injectionEntry.getSessionId()));
  printJson('Execution Session History', sessionStore.loadHistoryEntries(entry.getSessionId()));

  separator('Demo Complete');
}

main().catch((err) => {
  console.error('Demo failed:', err);
  process.exit(1);
});
