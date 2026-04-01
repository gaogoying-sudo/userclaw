import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { ToolRegistry } from '../tools/tool-registry.js';
import { registerCoreTools } from '../tools/index.js';
import { PermissionEngine } from '../permissions/permission-engine.js';
import type { PermissionRequestCallback } from '../permissions/permission-types.js';
import { createCliPermissionCallback } from '../permissions/permission-callback.js';
import { KnowledgeStore } from '../knowledge/knowledge-store.js';
import { SkillStore } from '../skills/skill-store.js';
import { RuleStore } from '../rules/rule-store.js';
import { QueryRuntime } from '../runtime/query-runtime.js';
import { SubmitEntry } from '../submit/submit-entry.js';
import { SessionStore } from '../session/session-store.js';
import { resolveDataRoot } from '../shared/data-paths.js';

interface CliToolCallPayload {
  toolName: string;
  input: unknown;
}

function parseCommandToolCall(command: string): CliToolCallPayload | undefined {
  const trimmed = command.trim();
  if (!trimmed.startsWith('/write ')) {
    return undefined;
  }

  const rest = trimmed.slice('/write '.length).trim();
  const firstSpace = rest.indexOf(' ');
  if (firstSpace <= 0) {
    return undefined;
  }
  const filePath = rest.slice(0, firstSpace).trim();
  const content = rest.slice(firstSpace + 1).trim();
  if (!filePath || !content) {
    return undefined;
  }

  return {
    toolName: 'file_write',
    input: { path: filePath, content },
  };
}

export async function runMinimalCliInteraction(options: {
  dataRoot?: string;
  permissionCallback?: PermissionRequestCallback;
} = {}): Promise<void> {
  const dataRoot = resolveDataRoot(options.dataRoot);
  const sessionStore = new SessionStore({ dataRoot });
  const knowledgeStore = new KnowledgeStore({ dataRoot });
  const skillStore = new SkillStore({ dataRoot });
  const ruleStore = new RuleStore({ dataRoot });
  const toolRegistry = new ToolRegistry();
  registerCoreTools(toolRegistry);

  const permissionEngine = new PermissionEngine({
    dataRoot,
    requestPermission: options.permissionCallback ?? createCliPermissionCallback(),
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
  const rl = createInterface({ input, output });

  console.log('userclaw minimal CLI');
  console.log('Type plain text to run execution.');
  console.log('Type /write <path> <content> to trigger file_write with permission confirmation.');
  console.log('Type exit to quit.');

  try {
    while (true) {
      const line = (await rl.question('userclaw> ')).trim();
      if (!line) {
        continue;
      }
      if (line === 'exit' || line === 'quit') {
        break;
      }

      const toolCall = parseCommandToolCall(line);
      const result = await entry.submit(
        toolCall ? `Execute tool call ${toolCall.toolName}` : line,
        toolCall
          ? { structuredPayload: { toolCalls: [toolCall] } }
          : {},
      );

      console.log(`state=${result.session.state}`);
      console.log(`assistant=${result.assistantOutput?.previewText ?? '(none)'}`);
      console.log(`permissionDecisions=${result.permissionDecisions.length}`);
      if (result.error) {
        console.log(`error=${result.error.category}:${result.error.code}`);
      }
    }
  } finally {
    rl.close();
  }
}

