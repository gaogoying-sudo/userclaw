/**
 * userclaw V1 Skeleton Demo
 *
 * This script validates the runtime skeleton by running a complete
 * "inject → execute → return result" chain through all unified layers:
 *
 *  1. Seed mock knowledge / skill / rule items (guided injection simulation)
 *  2. Register mock tools in Tool Registry
 *  3. Configure Permission Engine
 *  4. Submit a natural-language task through unified Submit Entry
 *  5. Query Runtime drives state machine: idle → dispatching → running → completed
 *  6. Tool calls go through Tool Contract and Permission checks
 *  7. Doctor runs a health check
 *  8. Metrics are collected
 *
 * Run:  npm run demo
 */

import { ToolRegistry } from './tools/tool-registry.js';
import { registerMockTools } from './tools/mock-tools.js';
import { PermissionEngine } from './permissions/permission-engine.js';
import { KnowledgeStore } from './knowledge/knowledge-store.js';
import { SkillStore } from './skills/skill-store.js';
import { RuleStore } from './rules/rule-store.js';
import { QueryRuntime } from './runtime/query-runtime.js';
import { SubmitEntry } from './submit/submit-entry.js';
import { Doctor } from './observability/doctor.js';
import { generateId } from './shared/id.js';

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
  separator('userclaw V1 Runtime Skeleton Demo');

  // ── Phase A: Guided Injection Simulation ──────────────────────────────
  separator('Phase A: Guided Injection — Seeding Knowledge / Skill / Rule');

  const knowledgeStore = new KnowledgeStore();
  const skillStore = new SkillStore();
  const ruleStore = new RuleStore();

  knowledgeStore.add({
    id: generateId(),
    title: 'Project Tech Stack',
    content: 'The project uses TypeScript, Node.js, and follows a layered runtime architecture.',
    tags: ['tech', 'stack'],
    source: 'guided_injection',
  });
  knowledgeStore.add({
    id: generateId(),
    title: 'API Conventions',
    content: 'All API responses use { ok, data, error } envelope. Errors include category and retryable flag.',
    tags: ['api', 'conventions'],
    source: 'guided_injection',
  });

  skillStore.add({
    id: generateId(),
    name: 'bugfix-workflow',
    description: 'Standard workflow for investigating and fixing bugs',
    steps: [
      'Read error logs and stack traces',
      'Search codebase for related files',
      'Identify root cause',
      'Apply minimal fix',
      'Verify fix with tests',
    ],
    allowedTools: ['mock_search', 'mock_file_write'],
  });

  ruleStore.add({
    id: generateId(),
    name: 'minimal-change-principle',
    ruleText: 'Always prefer the smallest possible change. Do not refactor unrelated code.',
    priority: 10,
    scope: 'global',
  });
  ruleStore.add({
    id: generateId(),
    name: 'verify-before-commit',
    ruleText: 'Never commit changes without verifying they work first.',
    priority: 9,
    scope: 'global',
  });

  console.log(`  Knowledge items: ${knowledgeStore.count()}`);
  console.log(`  Skills:          ${skillStore.count()}`);
  console.log(`  Rules:           ${ruleStore.count()}`);

  // ── Phase B: Tool & Permission Setup ──────────────────────────────────
  separator('Phase B: Registering Tools & Permission Rules');

  const toolRegistry = new ToolRegistry();
  registerMockTools(toolRegistry);

  const permissionEngine = new PermissionEngine();
  permissionEngine.addRule({
    toolName: 'mock_file_write',
    verdict: 'ask',
    reason: 'File write requires confirmation',
  });

  console.log(`  Registered tools: ${toolRegistry.listNames().join(', ')}`);
  console.log(`  Permission rules: ${permissionEngine.listRules().length}`);

  // ── Phase C: Doctor Health Check ──────────────────────────────────────
  separator('Phase C: Doctor Health Check');

  const doctor = new Doctor({
    toolRegistry,
    permissionEngine,
    knowledgeStore,
    skillStore,
    ruleStore,
  });
  const report = doctor.run();
  printJson('Doctor Report', report);

  // ── Phase D: Submit & Execute ─────────────────────────────────────────
  separator('Phase D: Natural Language Task Execution');

  const runtime = new QueryRuntime({
    toolRegistry,
    permissionEngine,
    knowledgeStore,
    skillStore,
    ruleStore,
  });
  const entry = new SubmitEntry(runtime);

  console.log('\n  Submitting task: "Find information about our API conventions and update the docs"');

  const result = await entry.submit(
    'Find information about our API conventions and update the docs',
  );

  printJson('Query Session', result.session);
  printJson('Tool Results', result.toolResults);
  printJson('Session Metrics', result.metrics);

  if (result.error) {
    printJson('Execution Error', result.error);
  }

  // ── Phase E: State Flow Summary ───────────────────────────────────────
  separator('Phase E: State Flow Summary');

  console.log(`
  The Query Runtime drove the following state transitions:

    idle → dispatching → running → ${result.session.state}

  ${result.session.state === 'completed'
    ? 'The full chain completed successfully through unified runtime.'
    : `Final state: ${result.session.state} (reason: ${result.session.failureReason ?? 'N/A'})`}

  Layers exercised:
    [✓] Unified Submit Entry
    [✓] Query Runtime with explicit state machine
    [✓] Tool Registry & Tool Contract
    [✓] Tool Executor
    [✓] Permission Engine (ask → auto-approved for demo)
    [✓] Knowledge Store (${knowledgeStore.count()} items)
    [✓] Skill Store (${skillStore.count()} items)
    [✓] Rule Store (${ruleStore.count()} items)
    [✓] Doctor health check
    [✓] Metrics collection
  `);

  separator('Demo Complete');
}

main().catch((err) => {
  console.error('Demo failed:', err);
  process.exit(1);
});
