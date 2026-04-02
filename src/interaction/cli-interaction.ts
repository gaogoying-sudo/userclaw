import { existsSync } from 'node:fs';
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
import { QueryRuntime, type QueryRunResult } from '../runtime/query-runtime.js';
import { SubmitEntry } from '../submit/submit-entry.js';
import { SessionStore } from '../session/session-store.js';
import { resolveDataRoot } from '../shared/data-paths.js';
import { withLocalTimestamp, formatLocalTimestamp } from '../shared/local-time.js';
import { Doctor } from '../observability/doctor.js';
import { loadModelConfig } from '../models/model-config.js';

interface CliToolCallPayload {
  toolName: string;
  input: unknown;
}

interface CliLastError {
  timestamp: string;
  category: string;
  code: string;
  summary: string;
  retryCount: number;
  suggestion: string;
}

interface CliRuntimeState {
  currentState: 'idle' | 'processing';
  lastResult?: QueryRunResult;
  lastError?: CliLastError;
}

function println(message: string): void {
  console.log(withLocalTimestamp(message));
}

function formatStateLabel(state: string | undefined): string {
  switch (state) {
    case 'idle':
      return '空闲';
    case 'dispatching':
      return '分发中';
    case 'running':
      return '运行中';
    case 'waiting_permission':
      return '等待权限确认';
    case 'interrupted':
      return '已中断';
    case 'failed':
      return '失败';
    case 'completed':
      return '已完成';
    default:
      return '未知';
  }
}

function formatModelPath(result?: QueryRunResult): string {
  if (!result?.modelTrace) {
    return '未知';
  }

  if (result.modelTrace.usedMockFallback) {
    return 'fallback（mock）';
  }

  return 'real（真实模型）';
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

function shouldUseEnglish(text: string): boolean {
  return /(英文|英语|english|in english|use english|translate to english)/i.test(text);
}

function buildExecutionText(raw: string): string {
  if (shouldUseEnglish(raw)) {
    return raw;
  }

  return `${raw}\n\n请默认使用简体中文回答，除非我明确要求英文。`;
}

function extractSuggestion(message: string, code: string): string {
  const match = message.match(/建议：(.+)/);
  if (match?.[1]) {
    return match[1].trim();
  }

  switch (code) {
    case 'MODEL_TIMEOUT':
      return '建议稍后重试，或提高 USERCLAW_MODEL_TIMEOUT_MS。';
    case 'MODEL_CONNECT_ERROR':
      return '建议检查模型服务地址和当前网络连通性。';
    case 'MODEL_HTTP_401':
      return '建议检查 USERCLAW_MODEL_API_KEY 是否有效。';
    case 'MODEL_HTTP_403':
      return '建议检查当前账号或密钥权限范围。';
    case 'MODEL_HTTP_429':
      return '建议降低请求频率后重试。';
    case 'MODEL_HTTP_5XX':
      return '建议稍后重试，可能是服务端瞬时故障。';
    case 'MODEL_RESPONSE_PARSE_ERROR':
      return '建议检查模型服务返回格式是否符合 OpenAI-compatible 规范。';
    default:
      return '建议先执行 /doctor 查看系统状态。';
  }
}

function summarizeError(result: QueryRunResult): CliLastError {
  const endedAt = result.session.endedAt
    ? formatLocalTimestamp(new Date(result.session.endedAt))
    : formatLocalTimestamp();
  const retryCount = result.modelTrace?.retryCount ?? 0;
  const code = result.error?.code ?? 'UNKNOWN_ERROR';
  const category = result.error?.category ?? 'runtime_error';
  const message = result.error?.message ?? '未知错误';
  const summary = message.split(/\r?\n/)[0] ?? message;

  return {
    timestamp: endedAt,
    category,
    code,
    summary,
    retryCount,
    suggestion: extractSuggestion(message, code),
  };
}

function printHelp(): void {
  println('可用命令：');
  println('  /help                查看帮助');
  println('  /write <路径> <内容> 触发 file_write（带权限确认）');
  println('  /doctor              运行系统健康检查');
  println('  /status              查看当前运行状态');
  println('  /last-error          查看最近一次错误信息');
  println('  exit / quit          退出交互');
}

function printDoctorReport(options: {
  toolRegistry: ToolRegistry;
  permissionEngine: PermissionEngine;
  knowledgeStore: KnowledgeStore;
  skillStore: SkillStore;
  ruleStore: RuleStore;
  sessionStore: SessionStore;
}): void {
  const doctor = new Doctor(options);
  const report = doctor.run();
  const modelConfig = loadModelConfig();

  println('系统诊断结果：');
  println(`  总体健康：${report.overallStatus === 'healthy' ? '健康' : report.overallStatus === 'degraded' ? '降级' : '异常'}`);
  println(`  模型模式：${modelConfig.enabled ? '真实模型' : 'fallback（mock）'}`);
  println(`  Provider / Model：${modelConfig.config ? `${modelConfig.config.provider} / ${modelConfig.config.modelName}` : 'mock-fallback-v1'}`);
  println(`  Data Root：${options.sessionStore.getDataRoot()}`);
  println(`  Sessions 目录：${existsSync(options.sessionStore.getSessionDir()) ? '正常' : '缺失'} (${options.sessionStore.getSessionDir()})`);
  println(`  History 目录：${existsSync(options.sessionStore.getHistoryDir()) ? '正常' : '缺失'} (${options.sessionStore.getHistoryDir()})`);
  println(`  Artifacts 目录：${existsSync(options.sessionStore.getArtifactDir()) ? '正常' : '缺失'} (${options.sessionStore.getArtifactDir()})`);
  println(`  Knowledge 数量：${options.knowledgeStore.count()}`);
  println(`  Skill 数量：${options.skillStore.count()}`);
  println(`  Rule 数量：${options.ruleStore.count()}`);
  println(`  Tool 数量：${options.toolRegistry.count()}`);
  println('  Permission 模式：ask / allow / deny（规则 + 交互确认）');

  for (const check of report.checks) {
    const status = check.status === 'ok' ? '正常' : check.status === 'warn' ? '警告' : '错误';
    println(`  - [${status}] ${check.name}: ${localizeDoctorDetail(check.name, check.detail)}`);
  }
}

function localizeDoctorDetail(name: string, detail: string): string {
  switch (name) {
    case 'tool_registry':
      return detail.replace('tool(s) registered', '个工具已注册');
    case 'data_root_write':
      return detail
        .replace('Writable data root: ', '数据目录可写：')
        .replace('Data root not writable', '数据目录不可写');
    case 'session_history_dirs':
      return detail
        .replace('sessions/history/artifacts dirs present', 'sessions/history/artifacts 目录正常')
        .replace('Missing runtime dirs:', '缺失运行时目录：');
    case 'knowledge_store':
      return detail
        .replace('No knowledge items loaded', '尚未加载知识项')
        .replace('item(s)', '条');
    case 'skill_store':
      return detail
        .replace('No skills loaded', '尚未加载技能')
        .replace('skill(s)', '个');
    case 'rule_store':
      return detail
        .replace('No rules loaded', '尚未加载规则')
        .replace('rule(s)', '条');
    case 'permission_engine':
      return detail
        .replace('explicit rule(s); default policy active', '条显式规则；默认策略生效');
    case 'model_config':
      return detail
        .replace('Real model enabled', '真实模型已启用')
        .replace('Missing USERCLAW_MODEL_API_KEY; model runtime will use mock fallback.', '缺少 USERCLAW_MODEL_API_KEY，当前会走 mock fallback。');
    default:
      return detail;
  }
}

function printStatus(runtimeState: CliRuntimeState): void {
  const last = runtimeState.lastResult;
  const retryCount = last?.modelTrace?.retryCount ?? 0;

  println('运行状态：');
  println(`  当前运行状态：${runtimeState.currentState === 'processing' ? '处理中' : '空闲'}`);
  println(`  最近任务状态：${formatStateLabel(last?.session.state)}`);
  println(`  当前模型路径：${formatModelPath(last)}`);
  println(`  最近权限决策：${last ? `${last.permissionDecisions.length} 条` : '暂无'}`);
  println(`  最近是否 fallback：${last?.modelTrace?.usedMockFallback ? '是' : '否'}`);
  println(`  最近是否自动重试：${retryCount > 0 ? `是（${retryCount} 次）` : '否'}`);
}

function printLastError(runtimeState: CliRuntimeState): void {
  if (!runtimeState.lastError) {
    println('最近没有错误记录。');
    return;
  }

  const err = runtimeState.lastError;
  println('最近一次错误：');
  println(`  时间：${err.timestamp}`);
  println(`  类型：${err.code}（${err.category}）`);
  println(`  摘要：${err.summary}`);
  println(`  自动重试：${err.retryCount > 0 ? `已重试 ${err.retryCount} 次` : '未重试'}`);
  println(`  建议：${err.suggestion}`);
}

function printRunResult(result: QueryRunResult): void {
  println(`当前状态：${formatStateLabel(result.session.state)}`);
  println(`模型路径：${formatModelPath(result)}`);
  println(`权限决策：${result.permissionDecisions.length} 条`);
  println(`工具结果：${result.toolResults.length} 条`);

  if (result.assistantOutput?.previewText) {
    println('助手回复：');
    println(result.assistantOutput.previewText);
  } else {
    println('助手回复：暂无');
  }

  if (result.error) {
    println(`错误类型：${result.error.code}（${result.error.category}）`);
    println('错误详情：');
    for (const line of result.error.message.split(/\r?\n/)) {
      println(line);
    }
  }
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

  const runtimeState: CliRuntimeState = {
    currentState: 'idle',
  };

  const rl = createInterface({ input, output });

  println('userclaw 本地助手已启动。');
  println('输入任务即可执行；默认中文输出（除非你明确要求英文）。');
  printHelp();

  try {
    while (true) {
      const line = (await rl.question('userclaw> ')).trim();
      if (!line) {
        continue;
      }

      println(`收到输入：${line}`);

      if (line === 'exit' || line === 'quit') {
        println('已退出交互。');
        break;
      }

      if (line === '/help') {
        printHelp();
        continue;
      }

      if (line === '/doctor') {
        printDoctorReport({
          toolRegistry,
          permissionEngine,
          knowledgeStore,
          skillStore,
          ruleStore,
          sessionStore,
        });
        continue;
      }

      if (line === '/status') {
        printStatus(runtimeState);
        continue;
      }

      if (line === '/last-error') {
        printLastError(runtimeState);
        continue;
      }

      const toolCall = parseCommandToolCall(line);
      if (line.startsWith('/') && !toolCall) {
        println(`未知命令：${line}。输入 /help 查看可用命令。`);
        continue;
      }
      runtimeState.currentState = 'processing';

      try {
        const result = await entry.submit(
          toolCall ? `执行工具调用 ${toolCall.toolName}` : buildExecutionText(line),
          toolCall
            ? { structuredPayload: { toolCalls: [toolCall] } }
            : {},
        );

        runtimeState.lastResult = result;
        if (result.error) {
          runtimeState.lastError = summarizeError(result);
        }

        printRunResult(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        runtimeState.lastError = {
          timestamp: formatLocalTimestamp(),
          category: 'runtime_error',
          code: 'CLI_SUBMIT_ERROR',
          summary: message,
          retryCount: 0,
          suggestion: '请检查输入格式，或执行 /doctor 查看系统状态。',
        };
        println(`执行失败：${message}`);
      } finally {
        runtimeState.currentState = 'idle';
      }
    }
  } finally {
    rl.close();
  }
}
