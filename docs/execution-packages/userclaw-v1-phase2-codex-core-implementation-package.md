
## 文档目的
本轮目标不是继续搭骨架，而是把已经通过验证的 Phase 1 运行时骨架推进到“开始具备真实可用性”的阶段。

本轮由 Codex 负责，重点是把 mock 级能力替换成最小真实能力，但仍然严格控制范围，不做完整产品化，不做高级生态，不做大而全扩张。

---

## 本次交付完整性与边界

### 本次交付覆盖什么
本次执行包覆盖：
1. 真实工具能力的最小落地
2. knowledge / skill / rule 的本地持久化与加载
3. permission engine 从 demo 级升级到最小可用级
4. demo 链路从“纯 mock”升级为“半真实可用链路”
5. 为后续引入外部 tools / skills 保留兼容入口

### 本次不覆盖什么
本次不覆盖：
1. 完整 UI 产品化
2. 真实大模型深度接入
3. 多 agent 协作
4. 插件市场 / 开放生态
5. 复杂远程执行
6. 数据库化重存储
7. 复杂规则引擎
8. MCP 大规模接入

### 是否可直接转发执行
**可以直接转发给 Codex 执行。**

### 后续仍缺什么
本包完成后，后续至少还需要：
- `docs/execution-packages/userclaw-v1-phase3-codex-first-usable-flow-package.md`
- `docs/specs/userclaw-v1-external-capability-adaptation-standard.md`

---

## 前置依据
本轮默认以下文档已存在并继续生效：

- `docs/planning/userclaw-v1-project-charter.md`
- `docs/architecture-principles/userclaw-v1-architecture-adoption-principles.md`
- `docs/architecture-principles/userclaw-v1-system-overview-and-layered-architecture.md`
- `docs/specs/userclaw-v1-runtime-contracts-and-core-boundaries.md`
- `docs/execution-packages/userclaw-v1-phase1-cursor-bootstrap-package.md`

并且默认 Phase 1 已完成以下事实：
- 统一 submit 入口已成立
- Query Runtime 与状态机已成立
- Tool Contract 已成立
- guided injection 已经走统一主链
- demo 能跑通注入与执行两条链路

---

## 协作分工
本轮默认分工如下：

- **Codex**：负责具体模块实现、真实能力替换、持久化、细节补齐
- **Cursor**：本轮不作为主力，除非出现架构冲突或需要骨架级重构

这是一个 **Codex 工作包**，不要再按 Cursor 的思路去大幅改骨架。

---

## Git 工作流要求
先判断本轮是新工作包还是续改现有 PR。

### 判断规则
- 本轮默认视为**新工作包**
- 必须先合并上一轮 PR
- 从最新 `main` 新开分支开发
- 禁止直接在 `main` 上开发

### 建议分支名
`feat/v1-core-implementation`

### 完成后必须回报
完成后必须明确回报：
1. 当前分支名
2. commit message
3. 是否新建 PR
4. PR 链接

---

## 本轮只改哪个模块 / 目标

### 本轮只改模块
本轮只允许围绕以下 4 块推进：

1. `src/tools/`
2. `src/knowledge/` `src/skills/` `src/rules/`
3. `src/permissions/`
4. `src/demo.ts` 与必要的最小接线文件

必要时允许少量修改：
- `src/runtime/`
- `src/shared/`
- `src/observability/`

但前提是为了接入真实实现，而不是改骨架定义。

### 本轮唯一主问题
**当前 userclaw 虽然骨架成立，但仍停留在 mock 骨架阶段；缺少最小真实工具能力、最小可落盘知识技能规则能力、以及最小可用的权限治理能力，导致它还不能作为“真实工作内容注入后的可用系统”继续推进。**

---

## 本轮只解决的 3 个问题

### 问题 1：把 mock tools 替换为最小真实工具集
必须完成以下最小真实工具集中的 2 到 4 个：

#### 必做
1. `file_read`
2. `file_write` 或 `file_edit`

#### 二选一或多选
3. `local_search` / `repo_search`
4. `directory_list`
5. 一个最小受控命令执行工具，如 `command_exec`，但必须严格受权限控制

要求：
- 全部遵循统一 `ToolSpec`
- 必须有真实 `inputSchema`
- 必须有真实 `validateInput`
- 必须正确声明 `isReadOnly / isDestructive / isConcurrencySafe / requiresPermission`
- 返回结果必须遵循统一 `ToolResult`
- 大结果必须优先 `previewText + artifact/reference`，不要直接塞满上下文

禁止做法：
- 不要把工具写成散落的 util 函数
- 不要跳过 Tool Contract
- 不要先追求“工具越多越好”

本轮重点是：**真实最小工具集成立，而不是工具数量。**

---

### 问题 2：把 knowledge / skill / rule 从内存 store 升级为本地可落盘加载
必须把这三层从“纯内存”升级到“本地文件可持久化”。

#### 推荐落地方式
优先采用轻量方案，不上数据库：

- `knowledge`：JSON 或 markdown
- `skills`：优先 markdown + frontmatter
- `rules`：JSON 或 markdown frontmatter

#### 建议目录
在仓库根目录新增最小内容目录：

```text
userclaw-data/
  knowledge/
  skills/
  rules/

或者如果你判断更适合，也可以放到：

data/
  knowledge/
  skills/
  rules/

但必须统一，不要混用。

必须完成
启动时自动扫描并加载 knowledge / skill / rule
提供最小 save / load 能力
guided injection 产生的新内容，至少可以写回本地文件
skills 至少支持一种可维护格式，建议 markdown + frontmatter
rules 必须保留 priority / scope
knowledge / skill / rule 的边界不能被破坏
为什么这样做

因为 userclaw 后面一定要兼容引入外部 skills / tools。
如果三层不能本地落盘与加载，后续扩展会非常痛苦。

问题 3：把 permission engine 从 demo 级升级到最小可用级

当前 ask / allow / deny 的骨架已经有了，本轮要补到“最小可用”。

必须完成
支持 once / session / project 三级 scope 结构
至少支持路径级规则
为后续交互确认预留正式回调接口
高风险工具调用前必须走权限判断
permission decision 要能被日志和 demo 看见
最小可接受方案

可以先不做完整 UI 确认，但至少要把接口设计好，例如：

requestPermission(decisionContext): Promise<PermissionDecision>

当前 demo 里可以继续用简化确认策略，但不能再把 ask 写死在内部流程里不留扩展口。

目标

让 permission 成为真正可升级的基础设施，而不是 demo 特判。

对外部 tools / skills 兼容性的明确要求
1. 外部 tool 的兼容前提

任何未来引入的外部 tool，都必须能被适配为统一 ToolSpec。
因此本轮真实工具实现时，不要把工具执行逻辑和运行时强耦合到不可复用。

2. 外部 skill 的兼容前提

任何未来引入的 skill，都必须能进入 skill layer，而不是直接当 prompt 文本散塞。
因此本轮 skill 持久化格式必须选一种后续可扩展的结构，优先 markdown + frontmatter。

3. 外部能力不能绕过主链

未来任何外部 capability，都不能绕过：

submit entry
query runtime
permission layer
tool contract

本轮实现中不能出现“为了图快，单独开旁路”的做法。

4. 不要过早做开放生态

本轮只留兼容口，不做插件市场，不做复杂发现机制，不做大规模外部生态接入。

明确禁止项

本轮明确禁止以下行为：

禁止重写 Phase 1 已经成立的运行时骨架
禁止为了接真实工具而破坏统一 Tool Contract
禁止把 knowledge / skill / rule 再次混成同一种对象
禁止引入数据库、消息队列、复杂后端框架
禁止接入真实大模型完整推理链
禁止扩 UI、重做页面、美化交互
禁止把权限逻辑散落到各工具内部
禁止提前做插件系统、多 agent、远程执行
禁止为了“以后方便”一次性把系统做复杂
禁止继续留一堆 mock，但对外宣称已真实可用
明确不改项

本轮不改以下内容：

不做完整产品界面
不做聊天体验打磨
不做复杂注入表单
不做模型路由优化
不做 compact / cache / token 真统计
不做 MCP 大规模接入
不做生产级日志平台
不做 plugin loader
不做 daemon / remote execution
不做完整命令系统
实施要求
1. 工具优先做少而真

宁可只落 2 到 3 个真的工具，也不要做一堆半真半假的工具。

2. skills 优先选 markdown + frontmatter

因为这最符合你后面从网上吸收和改造优秀 skills 的方向。

3. knowledge / rules 可先用 JSON

这两类先以结构稳定为优先，不必一开始就追求漂亮格式。

4. 所有持久化内容都要可读、可改、可迁移

不要把 userclaw-data 设计成只适合程序写、不适合人维护的格式。

5. demo 要升级，但不要重做

继续使用 npm run demo 作为最小验证入口，只是把它从纯 mock 升级为：

持久化加载
真实工具参与
权限判断更接近真实
建议目录落位
src/
  tools/
    file-read.tool.ts
    file-write.tool.ts
    local-search.tool.ts
    index.ts

  knowledge/
    knowledge-store.ts
    knowledge-loader.ts
    knowledge-writer.ts

  skills/
    skill-store.ts
    skill-loader.ts
    skill-writer.ts

  rules/
    rule-store.ts
    rule-loader.ts
    rule-writer.ts

  permissions/
    permission-engine.ts
    permission-types.ts
    permission-callback.ts

userclaw-data/
  knowledge/
  skills/
  rules/

允许按现有工程稍微调整命名，但职责边界不能丢。

交付物要求

本轮完成后，至少应交付：

一组最小真实工具
一套可落盘的 knowledge / skill / rule 结构
启动时自动加载三层内容的能力
guided injection 写回本地文件的最小能力
支持 once / session / project 结构的最小 permission decision 模型
一个升级后的 npm run demo
一份简短说明文档，写清：
哪些 mock 已被真实实现替换
哪些地方仍是 placeholder
下一轮最适合继续做什么
验收标准
验收 1：至少有 2 个真实工具成立

至少能确认有真实的：

文件读取
文件写入/编辑
并能通过统一 Tool Contract 跑起来。
验收 2：knowledge / skill / rule 不再只是内存态

重启后仍能从本地目录加载到数据。
guided injection 新生成的内容也能写回。

验收 3：skills 已具备可扩展格式

至少 skill 层已经不是硬编码数组，而是来自本地可维护文件。

验收 4：permission 已具备最小升级能力

至少能看到：

ask / allow / deny
scope 结构
path 级规则的最小形态
为交互确认预留接口
验收 5：demo 不再是纯 mock

npm run demo 至少有一部分真实能力参与，而不再全部是假工具和假存储。

验收 6：没有越界开发

本轮提交中，不应出现完整 UI、大量外部生态、复杂平台化扩张。

建议 commit message

feat(userclaw): implement core tools persistence and permission upgrades

完成后回报格式

完成后请按以下格式回报：

当前分支名
是否新建或更新 PR
PR 链接
本轮完成内容摘要
哪些 mock 已被替换
哪些位置仍是 placeholder
下一轮最适合继续做的 3 个点
本包结束条件

当且仅当以下条件成立时，本包视为完成：

userclaw 已具备最小真实工具能力
knowledge / skill / rule 已具备最小持久化与加载能力
permission engine 已从 demo 级提升到最小可用级
demo 已从纯 mock 升级为半真实可用链路
且没有越界做成大而全系统

做到这里就停，进入下一轮。