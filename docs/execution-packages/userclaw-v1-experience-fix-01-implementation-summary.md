# userclaw V1 体验修正 01 实现摘要

## 本轮修复了什么

1. CLI 全量用户可见输出加本地时间戳（到秒）
- 格式统一为 `[YYYY-MM-DD HH:mm:ss]`
- 覆盖启动提示、输入处理、助手回复、错误信息、诊断输出、权限确认提示

2. 模型错误分类更细，并支持 1 次自动重试
- 新增错误码：
  - `MODEL_TIMEOUT`
  - `MODEL_CONNECT_ERROR`
  - `MODEL_HTTP_401`
  - `MODEL_HTTP_403`
  - `MODEL_HTTP_429`
  - `MODEL_HTTP_5XX`
  - `MODEL_RESPONSE_PARSE_ERROR`
  - `MODEL_NETWORK_ERROR`（兜底）
- 对可重试错误自动重试 1 次（超时/连接异常/429/5xx/网络错误）
- 不可重试错误不重试（401/403/配置类/响应解析类）
- 用户可见错误中明确展示：失败类别、是否重试、下一步建议

3. CLI 中文化（用户可见层）
- 启动提示、帮助、状态标签、错误说明、权限确认文案改为中文优先
- `state=...`、`assistant=...`、`permissionDecisions=...` 等工程风格输出改为中文标签
- 默认任务补充中文回复偏好（除非用户明确要求英文）

4. 新增 interact 内置诊断命令
- `/doctor`：输出模型模式、provider/model、data root、目录状态、K/S/R/tool 数量、permission 模式、overall health
- `/status`：输出当前运行状态、最近任务状态、模型路径（real/fallback）、最近权限决策、最近 fallback/retry
- `/last-error`：输出最近错误时间、类型、摘要、是否自动重试、下一步建议

## 关键实现位置

- 时间戳工具：`src/shared/local-time.ts`
- CLI 交互与内置命令：`src/interaction/cli-interaction.ts`
- CLI 启动错误输出：`src/interaction/cli-entry.ts`
- 权限确认中文化 + 时间戳：`src/interaction/permission-prompt.ts`、`src/permissions/permission-callback.ts`
- 模型错误分类与重试：`src/models/model-types.ts`、`src/models/model-client.ts`
- runtime 错误映射与重试信息落盘：`src/runtime/query-runtime.ts`、`src/runtime/runtime-trace.ts`
- 默认中文输出约束：`src/runtime/context-builder.ts`
- smoke 增加错误细分类与重试验证：`src/smoke.ts`

## 验证结果

- `npm run typecheck` 通过
- `npm run smoke` 通过
- `npm run demo` 通过
- `npm run interact` 手动验证通过：
  - `/doctor` 可用
  - `/status` 可用
  - `/last-error` 可用
  - 时间戳格式正确到秒

## 仍然存在的限制

1. `/last-error` 当前仅维护本次 interact 进程内的“最近错误”，未做跨重启聚合查询。
2. 自动重试策略固定为 1 次，未引入退避策略与高级熔断。
3. 中文化优先覆盖用户可见层，内部模块命名与结构保持英文。

## 下一步最值得做的优化

1. `/last-error` 增加从 session/history 自动回溯最近错误（跨进程）。
2. `/status` 增加最近一次模型耗时、工具耗时摘要，帮助快速定位慢点。
3. 引入可配置的重试策略（是否重试、延迟、可重试码范围）并保持默认轻量。
