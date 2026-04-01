/**
 * userclaw V1 Phase 2 Demo
 *
 * This script validates Phase 2 minimal real capability by running a complete
 * "inject → execute → return result" chain through all unified layers:
 *
 *  1. Load knowledge / skill / rule from local storage
 *  2. Register real core tools in Tool Registry
 *  3. Configure Permission Engine
 *  4. Submit a natural-language task through unified Submit Entry
 *  5. Query Runtime drives state machine: idle → dispatching → running → completed/failed
 *  6. Tool calls go through Tool Contract and Permission checks
 *  7. Doctor runs a health check
 *  8. Metrics are collected
 *
 * Run:  npm run demo
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
  separator('userclaw V1 Phase 2 Core Demo');

  const dataRoot = resolveDataRoot();

  // ── Setup: Local persistence-backed stores ─────────────────────────────
  const knowledgeStore = new KnowledgeStore({ dataRoot });
  const skillStore = new SkillStore({ dataRoot });
  const ruleStore = new RuleStore({ dataRoot });
  const toolRegistry = new ToolRegistry();
  registerCoreTools(toolRegistry);

  const permissionEngine = new PermissionEngine({
    dataRoot,
    requestPermission: createAutoApprovePermissionCallback('session'),
  });
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
  });
  const injectionEntry = new SubmitEntry(injectionRuntime);

  separator('Phase 0: Startup Load');
  console.log(`\n  Data root: ${dataRoot}`);
  console.log('  Loaded from disk:');
  console.log(`    Knowledge items: ${knowledgeStore.count()}`);
  console.log(`    Skills:          ${skillStore.count()}`);
  console.log(`    Rules:           ${ruleStore.count()}`);
  console.log(`    Tools:           ${toolRegistry.count()}`);
  console.log(`    Permission rules:${permissionEngine.listRules().length}`);

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
  });
  const entry = new SubmitEntry(runtime);

  // ── Phase C: Doctor Health Check ──────────────────────────────────────
  separator('Phase C: Doctor Health Check');

  const doctor = new Doctor({
    toolRegistry,
    permissionEngine,
    knowledgeStore: reloadedKnowledgeStore,
    skillStore: reloadedSkillStore,
    ruleStore: reloadedRuleStore,
  });
  const report = doctor.run();
  printJson('Doctor Report', report);

  // ── Phase D: Natural Language Task Execution (allow/ask path) ─────────
  separator('Phase D: Execution Run 1 (ask → allow)');

  console.log('\n  Submitting task: "Find API conventions and draft runtime notes"');

  const run1 = await entry.submit(
    'Find API conventions and draft runtime notes',
  );

  printJson('Run 1 Session', run1.session);
  printJson('Run 1 Tool Results', run1.toolResults);
  printJson('Run 1 Permission Decisions', run1.permissionDecisions);
  printJson('Run 1 Metrics', run1.metrics);

  if (run1.error) {
    printJson('Run 1 Error', run1.error);
  }

  // ── Phase E: Natural Language Task Execution (deny path) ──────────────
  separator('Phase E: Execution Run 2 (deny by path rule)');

  console.log('\n  Submitting task: "Find API conventions and update docs"');

  const run2 = await entry.submit(
    'Find API conventions and update docs',
  );

  printJson('Run 2 Session', run2.session);
  printJson('Run 2 Tool Results', run2.toolResults);
  printJson('Run 2 Permission Decisions', run2.permissionDecisions);
  printJson('Run 2 Metrics', run2.metrics);

  if (run2.error) {
    printJson('Run 2 Error', run2.error);
  }

  // ── Phase F: State Flow Summary ───────────────────────────────────────
  separator('Phase F: State Flow Summary');

  console.log(`
  Injection chain (Phase A):
    idle → dispatching → running → ${injectionResult.session.state}
    taskType: ${injectionResult.session.taskType}

  Execution chain 1 (Phase D):
    idle → dispatching → running → waiting_permission → running → ${run1.session.state}
    taskType: ${run1.session.taskType}

  Execution chain 2 (Phase E):
    idle → dispatching → running → waiting_permission → ${run2.session.state}
    taskType: ${run2.session.taskType}

  Layers exercised:
    [✓] Unified Submit Entry (both injection and execution)
    [✓] Query Runtime with explicit state machine
    [✓] Guided injection → knowledge/skill/rule deposit + local persistence
    [✓] Startup reload from local files (knowledge / skills / rules)
    [✓] Tool Registry & Tool Contract with real tools and input validation
    [✓] Tool Executor
    [✓] Permission Engine (ask / allow / deny + scope + path rule + callback)
    [✓] Knowledge Store (${reloadedKnowledgeStore.count()} items)
    [✓] Skill Store (${reloadedSkillStore.count()} items)
    [✓] Rule Store (${reloadedRuleStore.count()} items)
    [✓] Doctor health check
    [✓] Metrics collection
  `);

  separator('Demo Complete');
}

main().catch((err) => {
  console.error('Demo failed:', err);
  process.exit(1);
});
