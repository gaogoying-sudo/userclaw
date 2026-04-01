
# userclaw V1 Phase 1 Cursor 启动执行包

## 文档目的
这份文档用于把 userclaw V1 的前期架构定义，转换为第一轮可执行的工程启动任务。

本轮目标不是做出完整产品，而是严格围绕既有架构文档，先把 userclaw 的运行时骨架、核心 Contract 落点和最小验证链路搭起来，为后续 Codex 的实现补齐留出稳定基础。

---

## 本次交付完整性与边界

### 本次交付覆盖什么
本次执行包覆盖：
1. userclaw V1 的首轮工程启动范围
2. 第一轮只允许修改的模块与目标
3. 第一轮只解决的 3 个问题
4. 明确禁止项与不改项
5. 明确验收标准
6. Git 工作流要求
7. 建议 commit message

### 本次不覆盖什么
本次执行包不覆盖：
1. 具体功能细节补全
2. 完整 UI 打磨
3. 真实模型深度接入
4. 复杂工具生态
5. 多 agent、远程执行、插件市场等高级能力
6. 第二轮由 Codex 负责的实现补全任务

### 是否可直接转发执行
**可以直接转发给 Cursor 执行。**

### 如果这还不是完整总包，后续还缺什么
这不是完整总包。  
在本执行包完成后，后续至少还需要：

- 第 2 包：`userclaw-v1-phase2-codex-core-implementation-package.md`
- 第 3 包：`userclaw-v1-phase3-codex-first-usable-flow-package.md`

### 当前总包清单
当前可理解为 3 段式执行链：
1. Cursor 首轮骨架启动包
2. Codex 核心实现补齐包
3. Codex 首次可用闭环包

---

## 前置依据
本执行包默认以下文档已作为前置约束：

- `docs/planning/userclaw-v1-project-charter.md`
- `docs/architecture-principles/userclaw-v1-architecture-adoption-principles.md`
- `docs/architecture-principles/userclaw-v1-system-overview-and-layered-architecture.md`
- `docs/specs/userclaw-v1-runtime-contracts-and-core-boundaries.md`

如果实现与这些文档冲突，以这些文档为准，不允许为了省事直接破坏架构边界。

---

## 协作分工
本轮默认分工如下：

- **Cursor cloud code**：负责框架设计、骨架搭建、模块边界落位、目录与主链路收敛
- **Codex**：后续负责具体代码补全、模块实现细化、接口完善、日志与测试补齐

本轮只属于 **Cursor 工作包**，不要把适合 Codex 的大段实现细节一次性提前做满。

---

## Git 工作流要求
先判断本轮是新工作包还是续改现有 PR。

### 判断规则
- 如果当前没有对应的在建分支或 PR，本轮视为**新工作包**
- 新工作包必须从最新 `main` 拉新分支开发
- 禁止直接在 `main` 上开发
- 如果已经存在与本包严格对应的分支/PR，则在原分支继续，不新开分支

### 完成后必须回报
完成后必须明确回报：
1. 当前分支名
2. commit message
3. 是新建 PR 还是更新 PR
4. PR 链接

---

## 本轮只改哪个页面 / 模块

### 本轮只改模块
**本轮只改 userclaw 的运行时骨架层与最小启动入口，不做完整业务功能开发。**

更具体地说，只允许围绕以下范围建设：

1. `提交入口层`
2. `Query Runtime 层`
3. `Tool Runtime 层`
4. `Permission / Safety 层`
5. `Extension & Knowledge Layers` 中的最小知识层 / 技能层 / 规则层占位结构
6. `Governance / Observability` 中的最小 doctor / metrics 占位结构
7. 一个**最小可跑的调试入口**，用于串起“注入 → 执行”假链路

### 本轮唯一主问题
**当前仓库还没有一个严格符合 userclaw 架构定义的运行时骨架，导致后续实现会缺少统一入口、统一状态机、统一 contract 和统一边界。**

---

## 本轮只解决的 3 个问题

### 问题 1：把 userclaw 的分层骨架和核心模块真正落到工程目录中
必须完成：
- 基于现有仓库情况，建立与文档一致的最小目录骨架
- 明确运行时核心模块边界
- 为后续实现预留清晰落点，而不是把逻辑散到页面或 utils 中

建议最小目录结构参考如下，允许按现有项目技术栈做轻微适配，但层级语义不能变：

```text
src/
  interaction/
  submit/
  runtime/
  tools/
  permissions/
  knowledge/
  skills/
  rules/
  observability/
  shared/
````

如果仓库已存在框架目录，应采用“融入式调整”，不要为了追求整齐而大拆现有工程。

---

### 问题 2：把运行时关键 Contract 和主状态机落成工程内统一类型/接口

必须完成：

* 建立统一的 `SubmitRequest`
* 建立统一的 `QuerySession`
* 建立统一的 `QueryState`
* 建立统一的 `RuntimeContext`
* 建立统一的 `ToolSpec / ToolResult`
* 建立统一的 `PermissionDecision`
* 建立统一的 `KnowledgeItem / SkillItem / RuleItem`
* 建立统一的 `ExecutionError`
* 建立最小 `Query Runtime` 状态流转骨架

要求：

* 这些对象必须有统一定义文件，不允许分散在多个页面/模块里各自定义
* 当前阶段允许 placeholder / mock 实现
* 当前阶段重点是**统一 contract 和运行主链的位置**

---

### 问题 3：搭出一个“可跑但极简”的假链路，证明骨架不是空壳

必须完成一个最小验证链路：

**引导式输入一份模拟工作任务内容
→ 生成一组 mock 的 knowledge / skill / rule 结果
→ 进入一次自然语言执行请求
→ 通过 Query Runtime 跑完整个状态流
→ 返回一个 mock 的可展示结果**

要求：

* 这个链路允许暂时不接真实模型
* 允许工具层先只注册 1 到 2 个 mock 工具
* 允许权限层先做最小 allow / ask / deny 占位判断
* 允许 doctor / metrics 先只显示最小状态

但必须保证：

* 这不是散装 demo
* 而是走统一 submit 入口
* 走统一 Query Runtime
* 走统一 Tool Contract
* 走统一 Permission 决策
* 能展示一次完整状态流转

---

## 明确禁止项

本轮明确禁止以下行为：

1. **禁止把逻辑直接堆在页面组件中**
2. **禁止为了图快跳过统一 Submit 入口**
3. **禁止使用单一 `isLoading` 替代 Query State 状态机**
4. **禁止把工具写成一组无 contract 的裸函数**
5. **禁止把知识、技能、规则重新混成一个 prompt 文本对象**
6. **禁止为了做出“能演示”的效果，偷跑大量真实业务实现**
7. **禁止大范围重构整个仓库，只为追求理想目录整洁**
8. **禁止提前实现插件市场、多 agent、复杂远程执行等高级能力**
9. **禁止引入沉重外部依赖，仅为了把第一轮骨架做得更花**
10. **禁止修改与本轮无关的产品页面、视觉样式和业务模块**
11. **禁止直接在 main 分支开发**
12. **禁止完成后只给代码，不说明当前分支、commit、PR 状态**

---

## 明确不改项

本轮不改以下内容：

1. 不做完整产品 UI
2. 不做正式注入流程的复杂交互体验
3. 不做真实知识抽取算法
4. 不做真实技能编排引擎
5. 不做复杂规则引擎
6. 不做本地模型与远程模型的完整接入
7. 不做复杂权限持久化体系
8. 不做真正的日志平台和观测面板
9. 不做插件体系、开放生态、外部平台集成
10. 不做第二轮才应该由 Codex 细化的深实现部分

---

## 实施要求

### 1. 优先复用现有仓库与成熟脚手架

先判断当前仓库已有内容能否承载本轮骨架。
如果能承载，优先在现有基础上组织。
如果明显缺骨架，再做最小增补。
不允许为了“更纯粹”直接推翻现有结构。

### 2. 目录落位要服从架构，而不是服从临时方便

允许技术实现灵活，但模块职责必须清楚。
尤其以下能力必须有正式落点：

* submit
* runtime
* tools
* permissions
* knowledge / skills / rules
* observability

### 3. mock 链路必须服务架构验证，而不是服务视觉演示

本轮 mock 的存在，只是为了证明运行骨架成立。
不是为了做一个“看起来像成品”的演示页。

### 4. 所有 placeholder 都要写清后续替换位置

对于暂时用 mock / stub 实现的地方，应在代码注释或说明文件中明确：

* 当前为何是 placeholder
* 后续会由哪一轮替换
* 预期替换成什么类型的正式实现

---

## 交付物要求

本轮完成后，至少应交付：

1. 一套与 userclaw 架构文档一致的最小目录骨架
2. 一套统一的核心 contract / type 定义
3. 一套最小 Query Runtime 状态流转骨架
4. 一套最小 Tool Runtime 注册与执行骨架
5. 一套最小 Permission Decision 骨架
6. 一套最小知识层 / 技能层 / 规则层结构
7. 一条“注入 → 执行 → 返回结果”的 mock 验证链路
8. 一份简短说明文档，写清：

   * 当前骨架做了什么
   * 哪些地方仍是 placeholder
   * 下一轮 Codex 最适合接手哪些模块

---

## 验收标准

### 必须同时满足以下条件，才算通过

#### 验收 1：目录与模块边界成立

能从工程目录中清楚看到：

* submit
* runtime
* tools
* permissions
* knowledge / skills / rules
* observability

并且职责没有明显串层。

#### 验收 2：关键 contract 已统一

工程里能够找到统一定义的：

* SubmitRequest
* QuerySession
* QueryState
* RuntimeContext
* ToolSpec / ToolResult
* PermissionDecision
* KnowledgeItem / SkillItem / RuleItem
* ExecutionError

且没有多个平行版本。

#### 验收 3：状态机不是假的

至少能真实演示：
`idle -> dispatching -> running -> completed`
如有权限挂起，也允许出现：
`waiting_permission`

不能只有页面 loading 效果。

#### 验收 4：最小链路能跑通

必须能演示一次：

* 输入一份模拟工作任务
* 系统沉淀 mock knowledge / skill / rule
* 用户发起一次自然语言任务
* 系统返回一份 mock 结果

且整个过程经过统一运行时链路。

#### 验收 5：没有明显越界开发

本轮提交中，不应出现大量与本轮目标无关的 UI、美化、复杂功能扩张或高级系统建设。

#### 验收 6：交付说明完整

必须说明：

* 当前骨架覆盖了什么
* 没覆盖什么
* 哪些位置是 placeholder
* 下一轮最适合 Codex 接手什么

---

## 建议 commit message

`feat(userclaw): bootstrap v1 runtime skeleton and minimal execution flow`

---

## 完成后回报格式

完成后请按以下格式回报：

1. 当前分支名
2. 是否新建或更新 PR
3. PR 链接
4. 本轮完成内容摘要
5. 哪些文件 / 模块是本轮新增
6. 哪些位置仍是 placeholder
7. 建议下一轮 Codex 优先接手的 3 个点

---

## 本包结束条件

当且仅当以下条件成立时，本包视为完成：

* userclaw 已具备第一轮运行时骨架
* 最小 contract 已统一
* 最小状态机已存在
* mock 注入与执行链路可验证
* 代码边界和下一轮接手点清晰

做到这里就停，不继续自行扩写下一轮内容。
