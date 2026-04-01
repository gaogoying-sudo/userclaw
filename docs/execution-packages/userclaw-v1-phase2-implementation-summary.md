# userclaw V1 Phase 2 实现摘要（Codex）

## 本轮已完成

1. 真实工具最小集落地（统一 Tool Contract）
- `file_read`
- `file_write`
- `directory_list`
- `local_search`

2. Knowledge / Skill / Rule 本地持久化与启动加载
- `knowledge`：JSON 单文件存储
- `skills`：Markdown + frontmatter 存储
- `rules`：JSON 单文件存储（保留 `priority` 与 `scope`）
- 启动即从 `userclaw-data/knowledge|skills|rules` 自动扫描加载
- guided injection 新增内容会写回本地文件

3. Permission Engine 最小可用升级
- 支持 `once / session / project` scope
- 支持 path 前缀规则（如 `docs/`）
- 提供正式回调接口：`requestPermission(decisionContext): Promise<PermissionDecision>`
- 决策日志可见（ask / allow / deny）

4. Demo 从纯 mock 升级为半真实链路
- 注入链路会真实落盘
- 重启模拟后可从本地重载 K/S/R
- 执行链路使用真实工具
- 权限链路展示 ask→allow 与 path-rule deny

## 本轮替换掉的 mock
- `src/tools/mock-tools.ts` 不再作为 demo 主工具集
- K/S/R store 从纯内存改为本地文件持久化加载
- Permission `ask` 不再是 runtime 内部写死自动通过，改为可替换回调接口

## 仍是 placeholder 的位置
- 模型调用仍是 `QueryRuntime.mockModelCall`
- 未接真实多轮 tool-use / streaming
- observability 仍是最小诊断与最小 metrics（无真实 token 成本统计）
- 未做 UI 交互式权限确认，仅保留回调接入口

## 下一轮最适合继续做的 3 点
1. 把 `mockModelCall` 替换为最小真实模型调用（保留现有 runtime 主链）。
2. 把权限回调从 demo 自动策略接到真实交互确认层（CLI/UI 任一）。
3. 引入外部 capability 适配标准（ToolSpec / Skill layer 适配），不绕过 submit/runtime/permission 主链。

