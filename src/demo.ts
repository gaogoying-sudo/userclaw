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
import { createAutoApprovePermissionCallback } from './permissions/permission-callback.js';
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
  separator('userclaw V1 Phase 4 Runtime Hardening Demo');

  const dataRoot = resolveDataRoot();
  const modelConfig = loadModelConfig();

  // ── Setup: Local persistence-backed stores ─────────────────────────────
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

  // ── Phase D: Real Model Execution Loop ────────────────────────────────
  separator('Phase D: First Real Usable Loop');

  console.log('\n  Submitting task: "Use current project context to draft a safe runtime execution note."');

  const run = await entry.submit(
    'Use current project context to draft a safe runtime execution note. Respect high-priority rules.',
  );

  printJson('Run Session', run.session);
  printJson('Run Assistant Response', run.assistantResponse);
  printJson('Run Assistant Output', run.assistantOutput);
  printJson('Run Model Trace', run.modelTrace);
  printJson('Run Trace Artifact', run.traceArtifactUri);
  printJson('Run Tool Results', run.toolResults);
  printJson('Run Permission Decisions', run.permissionDecisions);
  printJson('Run Metrics', run.metrics);

  if (run.error) {
    printJson('Run Error', run.error);
  }

  // ── Phase E: Closure Summary ──────────────────────────────────────────
  separator('Phase E: Closure Summary');

  console.log(`
  Injection chain (Phase A):
    idle → dispatching → running → ${injectionResult.session.state}
    taskType: ${injectionResult.session.taskType}

  Execution chain (Phase D):
    idle → dispatching → running → ${run.session.state}
    taskType: ${run.session.taskType}
    model path: ${run.modelTrace?.usedMockFallback ? 'mock fallback' : 'real model'}
    model id: ${run.modelTrace?.model ?? 'n/a'}
    provider: ${run.modelTrace?.provider ?? 'n/a'}
    trace artifact: ${run.traceArtifactUri ?? '(inline)'}
    assistant artifact: ${run.assistantOutput?.artifactUri ?? '(inline)'}
    context strategy: ${run.modelTrace?.contextStrategy ?? 'n/a'}
    used knowledge ids: ${(run.modelTrace?.usedKnowledgeIds ?? []).join(', ') || '(none)'}
    used skill ids: ${(run.modelTrace?.usedSkillIds ?? []).join(', ') || '(none)'}
    used rule ids: ${(run.modelTrace?.usedRuleIds ?? []).join(', ') || '(none)'}

  Layers exercised:
    [✓] Unified Submit Entry (both injection and execution)
    [✓] Query Runtime with explicit state machine
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
