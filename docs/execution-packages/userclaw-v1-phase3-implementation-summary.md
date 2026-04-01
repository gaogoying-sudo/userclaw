# userclaw V1 Phase 3 Implementation Summary

## 本轮完成内容（首次真实可用闭环）

1. 接入最小真实模型调用（OpenAI-compatible）
2. QueryRuntime 主路径从 `mockModelCall` 切换为真实模型调用模块
3. 新增 K/S/R 上下文构造模块，按可解释策略选择并注入模型上下文
4. 保留并明确 mock fallback（仅在模型配置缺失时触发）
5. 升级 `npm run demo`，可直接看到：
   - 当前是否真实模型/是否 fallback
   - 使用的 provider / model
   - 使用的 knowledge / skill / rule IDs
   - 模型返回文本与执行指标

## 当前支持的模型接入方式

- Provider: `openai_compatible`
- Config source: 环境变量
  - `USERCLAW_MODEL_PROVIDER`（默认 `openai_compatible`）
  - `USERCLAW_MODEL_BASE_URL`（默认 `https://api.openai.com/v1`）
  - `USERCLAW_MODEL_NAME`（默认 `gpt-4o-mini`）
  - `USERCLAW_MODEL_API_KEY`（必需）
  - `USERCLAW_MODEL_TIMEOUT_MS`（可选）

## K/S/R 上下文组装策略（当前最小版）

- Knowledge: 相关性前 3 条，若无相关命中则回退最近条目
- Skills: 相关性前 2 条，若无相关命中则回退最近条目
- Rules: 相关规则 + 高优先级规则，总计最多 4 条
- 输出内容中会显式记录使用的 K/S/R IDs 以及策略说明

## 已知仍为 placeholder 的部分

1. 仅支持单 provider（未做多 provider 路由）
2. 模型输出当前走“直接结果”路径，尚未启用结构化 tool-use 迭代
3. token/cost 统计仍为最小占位
4. 无 streaming 输出与复杂会话恢复

## 下一轮建议（Phase 4 候选）

1. 在现有主链上引入一轮结构化 tool-use（模型建议 -> runtime 执行 -> 汇总返回）
2. 增加更稳健的上下文裁剪与冲突消解（尤其是 rules 优先级冲突）
3. 增加模型调用可观测性（请求 ID、重试原因、基础 token 统计）
