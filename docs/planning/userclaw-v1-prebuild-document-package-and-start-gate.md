userclaw V1 开工前文档包与启动门槛

结论先说：

要开启 userclaw 的第一步操作实践，建议先完成 5 份文档。

不是越多越好，也不是越少越好。
比较合适的是：

4 份核心定义文档 + 1 份首轮执行包 = 5 份文档

这 5 份做完，就可以正式进入第一步工程实践。

一、建议的最小开工文档包
1. 项目定盘纸

文件名称：docs/planning/userclaw-v1-project-charter.md

作用：

定义 userclaw V1 到底是什么，以及第一版只干什么。

至少包含：

一句话定义
第一版唯一主用户
第一版唯一主场景
第一版最小闭环
第一版明确不做什么
成功标准

这份文档的作用是钉死边界。

2. 架构借鉴原则

文件名称：docs/architecture-principles/userclaw-v1-architecture-adoption-principles.md

作用：

明确 userclaw 从成熟 Agent 工程里借哪些原则，并从项目第一天就纳入。

至少包含：

为什么按运行时系统设计，而不是聊天壳子
为什么必须统一输入入口
为什么工具必须有 Tool Contract
为什么权限层是基础设施
为什么上下文治理要前置
为什么要区分技能层 / 插件层 / 外部接入层
为什么要做诊断与观测

这份文档是“借鉴准则”。

3. 系统总览与分层架构

文件名称：docs/architecture-principles/userclaw-v1-system-overview-and-layered-architecture.md

作用：

定义 userclaw 的工程分层、每层职责和边界。

建议至少明确：

交互层
提交入口层
Query Runtime 层
Tool Runtime 层
Permission / Safety 层
Extension 层
Governance / Observability 层

还要写清楚：

每层职责
每层输入输出
哪些是 V1 必做
哪些 V1 只留接口
哪些后续再扩
4. 运行时关键约束与核心 Contract

文件名称：docs/specs/userclaw-v1-runtime-contracts-and-core-boundaries.md

作用：

把 userclaw 最关键的运行对象和边界先焊死。

建议至少包括：

Tool Contract
Query Guard / 生命周期状态
Permission Model
知识层 / 技能层 / 规则层边界
本地模型 / 远程模型 / 混合路由边界
大结果返回策略
错误与失败可解释性要求

这份文档是实现层的统一约束。

5. 首轮执行包

文件名称：docs/execution-packages/userclaw-v1-phase1-cursor-bootstrap-package.md

作用：

把第一轮正式开发任务清晰地交给 Cursor。

建议固定写清：

本轮只改哪个页面/模块
该页面/模块唯一主问题
本轮只解决的 3 个问题
明确禁止项
明确不改项
明确验收标准
建议 commit message

这份文档是点火包。

二、哪些必须先和我讨论清楚

这些不能直接交给工程代理决定：

1. userclaw 的一句话定义

这是总方向。

2. 第一版唯一主场景

这是产品入口和验收基准。

3. “零学习成本”的具体含义

要落到交互方式、默认值、配置方式。

4. 知识层 / 技能层 / 规则层边界

这是你的核心哲学资产。

5. 本地模型与远程模型职责划分

这会影响整个运行时。

6. V1 明确不做什么

这是防发散的关键。

三、哪些适合交给 Cursor，哪些适合交给 Codex
适合交给 Cursor
参考开源项目结构
生成目录树
输出模块拆分图
搭建骨架
对比技术选型
整合现成工程模块
适合交给 Codex
具体模块实现
接口补全
schema 定义
配置解析
状态流转代码
doctor 初版
日志与错误处理
测试样板
四、开工门槛

建议定义为：

前 4 份文档完成到 70% 以上 + 第 5 份首轮执行包达到可直接发给 Cursor

达到这个门槛，就可以正式开工。

五、建议推进顺序
docs/planning/userclaw-v1-project-charter.md
docs/architecture-principles/userclaw-v1-architecture-adoption-principles.md
docs/architecture-principles/userclaw-v1-system-overview-and-layered-architecture.md
docs/specs/userclaw-v1-runtime-contracts-and-core-boundaries.md
docs/execution-packages/userclaw-v1-phase1-cursor-bootstrap-package.md
六、明确结论

要开启 userclaw 的第一步操作实践，建议先产出 5 份文档。

完整最小包如下：

docs/planning/userclaw-v1-project-charter.md
docs/architecture-principles/userclaw-v1-architecture-adoption-principles.md
docs/architecture-principles/userclaw-v1-system-overview-and-layered-architecture.md
docs/specs/userclaw-v1-runtime-contracts-and-core-boundaries.md
docs/execution-packages/userclaw-v1-phase1-cursor-bootstrap-package.md

如果你要继续，下一步最顺就是我直接开始帮你写第一份正式文档：

docs/planning/userclaw-v1-project-charter.md