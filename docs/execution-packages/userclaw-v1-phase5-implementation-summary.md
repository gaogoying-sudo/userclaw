# userclaw V1 Phase 5 Implementation Summary

## 本轮覆盖内容

1. 新增最小交互确认层（终端确认 prompt + 可脚本化决策）  
2. 将 permission callback 接入真实确认流程（ask -> allow/deny + scope）  
3. 让 demo 覆盖 `ask -> allow(session) -> session reuse -> deny`  
4. 让 smoke 覆盖 `ask -> allow(project) -> project reuse + deny`  
5. 新增最小 CLI 入口脚本，避免系统仅依赖 demo 驱动

## 最小交互入口

- `npm run interact` 启动轻量 CLI。  
- 在 CLI 中可直接输入任务，或用 `/write <path> <content>` 触发 `file_write` 权限确认。  
- ask 发生时终端会显示工具、原因、目标路径、选项，并读取用户输入：
  - `Allow once`
  - `Allow for session`
  - `Allow for project`
  - `Deny`

## scope 生效行为

- `once`：仅当前一次决策生效。  
- `session`：写入 session 规则，当前 session 后续同类操作自动命中 `rule:session`。  
- `project`：写入项目规则文件，重建 PermissionEngine 后仍可命中 `rule:project`。  
- `deny`：会阻断执行并回流 `permission_denied` 错误分类。  

## 可追踪性

- Permission decision 继续进入 runtime 结果对象（`permissionDecisions`）。  
- Session/history 落盘的 `runtime_result.details` 中加入完整 permission decision 列表，含 source/scope/reason。  

## 仍是 placeholder 的部分

1. 交互层目前仅为 CLI/terminal 形态，无 Web/桌面 UI。  
2. 当前工具调用计划仍是最小注入方式（`structuredPayload.toolCalls`），未做多轮 tool-use。  
3. 没有复杂审批流（仅最小确认动作）。

## 下一轮建议

1. 将交互确认抽象成可替换 adapter（CLI/Web 共享同一确认协议）。  
2. 增加权限决策可视化摘要（按 session 聚合 allow/deny/scope 命中）。  
3. 在不扩 UI 的前提下补更多 tool 场景的确认模板。  

