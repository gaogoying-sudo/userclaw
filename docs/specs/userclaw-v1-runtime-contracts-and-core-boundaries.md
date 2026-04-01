# userclaw V1 运行时关键约束与核心 Contract

## 文档目的
这份文档用于定义 userclaw V1 在运行时层面最关键的统一约束，避免后续工程实现出现“每个模块各写一套逻辑、每个页面各自维护状态、每个工具各有一套协议”的失控情况。

它不追求一次性把所有细节写满，而是先把 V1 最关键的骨关节焊死，让后续 Cursor 的骨架设计和 Codex 的实现补齐都能围绕同一套 Contract 与边界展开。

这份文档主要回答以下问题：

- 一轮任务执行由哪些统一状态承载
- 输入提交应经过什么样的统一入口
- 工具应遵守什么统一 Contract
- 权限治理应如何前置
- 知识层、技能层、规则层的边界如何定义
- 本地模型、远程模型和混合路由如何分责
- 大结果如何返回，避免污染上下文
- 错误如何分类，如何做到可解释

---

## 1. 适用范围

本文件适用于 userclaw V1 的以下部分：

- 提交入口层
- Query Runtime 层
- Tool Runtime 层
- Permission / Safety 层
- Extension & Knowledge Layers 层中的知识层 / 技能层 / 规则层
- Governance / Observability 层中的最小诊断、日志与成本统计

本文件不直接规定页面样式、具体目录名、具体类名和函数名，但后续这些实现都必须服从本文件中的约束。

---

## 2. V1 必须统一的核心对象

userclaw V1 至少需要统一以下对象，不允许在工程中出现多个含义相近、但结构和职责不一致的版本：

- Submit Request
- Query Session
- Query State
- Runtime Context
- Tool Spec
- Tool Call
- Tool Result
- Permission Decision
- Knowledge Item
- Skill Item
- Rule Item
- Model Route Decision
- Execution Error

这些对象是 V1 最核心的运行时公共语言。

---

## 3. 提交入口 Contract

## 3.1 Submit Request 的职责
Submit Request 表示“进入 userclaw 执行链路的一次正式提交”。

它不是单纯的一段文本，而是一次统一受理动作。

V1 的任意输入来源，只要会触发执行，都必须被转换成统一 Submit Request，再进入后续运行时。

包括但不限于：

- 用户自然语言任务输入
- 引导式注入流程中的结构化输入
- 系统级命令
- 后续预留的桥接输入或外部触发输入

## 3.2 Submit Request 最小字段建议
V1 建议最少具备以下字段：

```ts
type SubmitRequest = {
  id: string
  source: 'user_input' | 'guided_injection' | 'system_command' | 'external_bridge'
  sessionId: string
  inputText?: string
  structuredPayload?: Record<string, unknown>
  attachments?: Array<{
    type: string
    uri?: string
    name?: string
    meta?: Record<string, unknown>
  }>
  triggerMode: 'interactive' | 'injection' | 'command'
  createdAt: string
}
3.3 提交入口必须完成的动作

在 Submit Request 进入 Query Runtime 之前，统一入口至少要完成：

空输入和非法输入拦截
source 与 triggerMode 判断
历史记录挂接
session 绑定
本轮执行 id 生成
初始 Runtime Context 创建
后续 Query Runtime 调度触发

页面、局部 service、单独工具都不应绕过这一层直接启动执行。

4. Query Runtime Contract
4.1 Query Runtime 的职责

Query Runtime 负责承载“一轮任务从提交到结束”的完整生命周期。

它是 userclaw 的主调度器，而不是 UI 的附属状态。

它至少负责：

接收 Submit Request
建立本轮 Query Session
维护 Query State
组织 Runtime Context
调用模型与工具循环
处理中断、失败和结束
为后续 compact、resume、metrics 留统一入口
4.2 Query State 统一状态机

V1 不允许只靠一个 isLoading 驱动执行逻辑。

必须采用显式状态机。

建议 V1 最小状态如下：

type QueryState =
  | 'idle'
  | 'dispatching'
  | 'running'
  | 'waiting_permission'
  | 'interrupted'
  | 'failed'
  | 'completed'
4.3 各状态含义
idle
当前没有活动执行任务
dispatching
本轮任务已经被提交入口受理，正在创建执行上下文或进入调度
running
已经正式进入模型调用、工具循环或任务执行过程
waiting_permission
本轮执行被权限层挂起，等待用户确认或规则决策
interrupted
本轮执行被主动中断、取消或被上层停止
failed
本轮执行因为明确错误而结束
completed
本轮执行正常结束，并给出可展示结果
4.4 Query Session 最小字段建议
type QuerySession = {
  id: string
  submitRequestId: string
  state: QueryState
  taskType: 'injection' | 'execution' | 'command'
  startedAt?: string
  endedAt?: string
  interruptionReason?: string
  failureReason?: string
}
4.5 状态机约束

V1 必须遵守以下约束：

任何执行都必须先进入 dispatching，不能直接从 idle 跳到 running
waiting_permission 只能由权限层触发
interrupted、failed、completed 都是终态
一个 Query Session 只能存在一个当前主状态
页面状态只能读取 Query State，不应自行定义另一套同级状态机
5. Runtime Context Contract
5.1 Runtime Context 的职责

Runtime Context 表示“一轮执行在当前时刻所依赖的统一上下文”。

它不是单一 prompt 文本，而是一个分层上下文对象。

5.2 Runtime Context 分层

V1 至少区分以下四层：

System Context
Runtime Context
Task Context
Memory / Injection Context
5.3 分层定义
System Context

稳定原则、系统身份、底层行为边界。
更新频率最低。

Runtime Context

当前模型、权限模式、工具池、执行环境、目录状态等运行事实。
随本轮执行动态变化。

Task Context

当前任务目标、当前计划、最近动作、当前待解决问题。
随本轮任务推进变化。

Memory / Injection Context

本轮任务所使用的知识层、技能层、规则层内容，以及与用户注入相关的结构化沉淀结果。
只引入必要部分，不允许全量无脑拼接。

5.4 Runtime Context 最小字段建议
type RuntimeContext = {
  systemContext: {
    identity: string
    principles: string[]
  }
  runtimeContext: {
    modelMode: 'local' | 'remote' | 'hybrid'
    selectedModel?: string
    availableTools: string[]
    permissionMode: 'allow' | 'ask' | 'deny_mixed'
  }
  taskContext: {
    goal: string
    currentPlan?: string[]
    recentActions?: string[]
  }
  injectionContext: {
    knowledgeIds?: string[]
    skillIds?: string[]
    ruleIds?: string[]
  }
}
6. Tool Contract
6.1 基本要求

在 userclaw 中，工具不是裸函数。
任何工具想进入正式工具池，都必须实现统一 Tool Contract。

6.2 Tool Spec 最小字段建议
type ToolSpec = {
  name: string
  description: string
  inputSchema: object
  isReadOnly: boolean
  isDestructive: boolean
  isConcurrencySafe: boolean
  requiresPermission: boolean
  validateInput?: (input: unknown, ctx: RuntimeContext) => Promise<ValidationResult>
  checkPermission?: (input: unknown, ctx: RuntimeContext) => Promise<PermissionDecision>
  execute: (input: unknown, ctx: RuntimeContext) => Promise<ToolResult>
}
6.3 Tool Contract 统一要求

V1 中所有工具都必须满足：

有稳定唯一 name
有用户可理解的 description
有明确 input schema
明确声明是否只读
明确声明是否有破坏性
明确声明是否可并发
能输出统一 Tool Result
高风险工具必须接入权限检查
工具执行前允许做输入校验
6.4 Tool Call 最小字段建议
type ToolCall = {
  id: string
  toolName: string
  input: unknown
  invokedAt: string
}
6.5 Tool Result 最小字段建议
type ToolResult = {
  ok: boolean
  previewText: string
  data?: unknown
  artifactUri?: string
  truncated?: boolean
  errorCode?: string
  errorMessage?: string
}
6.6 大结果返回约束

工具返回结果时，必须遵守以下策略：

优先返回摘要与 preview
超长结果应持久化到 artifact，并返回路径或引用
不允许把大段原始结果直接无限塞入模型上下文
对日志、搜索结果、长文档、diff、目录树等结果，默认走“预览 + 引用”模式
7. 并发与串行调度约束
7.1 V1 并发原则

userclaw V1 只允许受控并发，不允许随意并发。

7.2 基本规则

满足以下条件的工具，才可以进入同一并发批次：

isReadOnly = true
isConcurrencySafe = true

以下能力默认串行：

文件写入
文件编辑
命令执行
网络写操作
高风险外部调用
任何依赖前一步副作用结果的工具
7.3 调度原则

Tool Runtime 至少支持两类调度：

并发安全批次
串行执行队列

V1 不要求做复杂调度系统，但必须从 contract 上支持后续扩展。

8. Permission Contract
8.1 基本原则

权限系统是运行时基础设施，不是页面弹窗逻辑。

8.2 Permission Decision 统一结构建议
type PermissionDecision = {
  decision: 'allow' | 'ask' | 'deny'
  reason?: string
  scope?: 'once' | 'session' | 'project'
}
8.3 V1 受控能力范围

V1 至少应对以下能力做权限治理：

文件读取
文件写入 / 编辑
命令执行
网络访问
外部系统接入
8.4 权限处理顺序

高风险动作必须遵守以下顺序：

输入校验
→ 权限判断
→ 必要时进入 waiting_permission
→ 获得 allow 后才能执行

不允许先执行，再在界面层补救。

8.5 默认策略

V1 默认建议：

不明确时默认 ask
明确危险时可直接 deny
可证明安全且允许范围明确时 allow
后续 scope 可以先只做 once 与 session，project 预留接口
9. 知识层 / 技能层 / 规则层边界 Contract

这是 userclaw V1 最关键的业务边界之一。

9.1 知识层定义

知识层用于沉淀：

工作背景
术语解释
事实性信息
结构化资料
工作对象定义
样例与案例材料

知识层回答的是：

这是什么
有哪些事实
有哪些资料和上下文

知识层不负责直接决定“怎么做”。

9.2 技能层定义

技能层用于沉淀：

工作方法
步骤模板
操作套路
执行流程
常见任务处理方式

技能层回答的是：

这类事情通常怎么做
执行时应遵循什么步骤
面对某类任务应调哪些能力

技能层不负责最终约束和禁止判断。

9.3 规则层定义

规则层用于沉淀：

禁止项
优先级
判断边界
冲突处理原则
风险约束
输出限制

规则层回答的是：

什么不能做
什么必须优先遵守
多种路径冲突时怎么裁决

规则层不直接存放大段知识材料，也不承担完整步骤模板职责。

9.4 最小结构建议
type KnowledgeItem = {
  id: string
  title: string
  content: string
  tags?: string[]
  source?: string
}

type SkillItem = {
  id: string
  name: string
  description: string
  steps: string[]
  allowedTools?: string[]
}

type RuleItem = {
  id: string
  name: string
  ruleText: string
  priority: number
  scope?: 'global' | 'project' | 'task'
}
9.5 边界约束

V1 必须避免：

把知识层、技能层、规则层全部混成一段 prompt
把技能写成纯代码逻辑且不可维护
把规则埋进界面层或工具内部不对外可见
把所有真实工作内容都粗暴归档为“知识”
10. 模型路由边界 Contract
10.1 V1 的模型模式

V1 支持三种逻辑模式：

local
remote
hybrid
10.2 各模式的基本定义
local

本地模型承担主要推理任务。
适合隐私、离线、轻量场景或受控任务。

remote

远程模型承担主要推理任务。
适合复杂推理、强能力依赖场景。

hybrid

系统根据任务类型、配置状态、环境能力进行本地/远程分流。

10.3 Model Route Decision 最小结构建议
type ModelRouteDecision = {
  mode: 'local' | 'remote' | 'hybrid'
  selectedModel?: string
  reason: string
}
10.4 V1 路由边界原则

V1 不要求把模型路由做到极度复杂，但必须：

让模型模式成为 Runtime Context 的正式字段
不允许页面层随意决定模型路由
不允许工具层私自切模型
由 Query Runtime 统一接收和执行路由结果
11. 错误与失败可解释性 Contract
11.1 基本原则

V1 中的错误不能只返回一个笼统的 failed。

系统必须尽量把失败归类为明确阻塞点。

11.2 Execution Error 最小结构建议
type ExecutionError = {
  code: string
  message: string
  category:
    | 'validation_error'
    | 'permission_denied'
    | 'tool_error'
    | 'context_overflow'
    | 'model_error'
    | 'runtime_error'
    | 'external_connection_error'
  retryable?: boolean
}
11.3 最小错误分类

V1 至少区分：

输入校验失败
权限拒绝
工具执行失败
上下文过长
模型调用失败
外部连接失败
运行时状态错误

这既是用户可解释性的基础，也是 Doctor 与日志系统的基础。

12. 诊断与成本统计的最小预留
12.1 V1 最小诊断能力

V1 至少应能检查：

当前模型配置是否存在
当前工具池是否注册完成
权限模式是否可识别
Query State 是否异常
关键依赖是否缺失
12.2 V1 最小成本统计

V1 至少预留以下数据：

每轮 token 使用
每轮总耗时
工具执行耗时
模型调用耗时
当前模型标识

V1 不要求做完整 dashboard，但这些字段要能被记录。

13. V1 明确不在本文件中展开的内容

以下内容在 V1 阶段只需要留口，不在本文件中做重型展开：

多 agent 协作协议
完整插件市场协议
复杂远程执行协议
完整 secret scanning 规则库
高级缓存策略
大规模项目级记忆治理机制
14. 本文件的执行要求

后续在 userclaw 的技术实现中，凡是涉及以下工作，都必须先检查是否符合本文件：

提交入口实现
Query Runtime 设计
Tool Runtime 设计
权限判断逻辑
知识层 / 技能层 / 规则层落地
模型接入与路由
大结果处理
错误分类与日志设计

如果后续为了开发方便出现以下倾向，应视为违反本文件约束：

页面层直接驱动主执行逻辑
工具不走统一 contract
权限逻辑散落在各模块内部
知识、技能、规则重新混成一体
大结果无节制喂回上下文
只用 loading 变量管理任务执行
错误只返回 failed 而没有分类
15. 当前文档边界

本文件负责回答的是：

userclaw V1 最关键的运行时对象与 contract 是什么
哪些边界必须先钉死
哪些约束是后续代码实现必须共同遵守的

本文件不负责回答的是：

目录结构最终怎么命名
具体选 React、Next.js、Electron 还是其他框架
哪个开源项目最值得直接 fork
第一轮工程任务如何拆给 Cursor
第二轮实现任务如何拆给 Codex

这些内容将在后续执行包文档中继续展开。