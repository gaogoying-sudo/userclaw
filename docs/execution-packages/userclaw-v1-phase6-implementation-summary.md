# userclaw V1 Phase 6 Implementation Summary

## 本轮完成内容

1. 建立了最小 external capability 结构：
- `src/external/adapters/`
- `src/external/tools/`
- `src/external/skills/`
- `src/external/manifests/`

2. 接入了 2 个 external tool 样板（均通过 ToolSpec 纳管）：
- `external_repo_search`（外部仓库搜索适配器）
- `external_git_status`（外部只读状态查询适配器，带权限确认）

3. 接入了 2 个 external skill 样板（markdown + frontmatter）：
- `userclaw-data/skills/external-defect-triage.md`
- `userclaw-data/skills/external-release-change-scan.md`

4. 升级 skill loader：
- 支持 `allowed-tools` / `adapted-from` / `when-to-use` / `origin`
- 将 external 元数据写入 skill layer（`source` / `adaptedFrom` / `whenToUse` / `isExternal`）

5. demo / smoke 验证 external 路径：
- demo 可见 external manifest、external skill 加载结果、external tool 运行结果
- smoke 覆盖 external skill 加载、external tool 注册、permission/runtime/tool-contract 主链验证

## External Capability 清单

### External Tools

1. `external_repo_search`
- 来源：`community-cli-patterns`
- 适配来源：`git-grep workflow templates`
- 风险级别：`low`
- 说明：只读仓库搜索，已进入 Tool Registry 与 Tool Contract。

2. `external_git_status`
- 来源：`community-cli-patterns`
- 适配来源：`git status inspection workflows`
- 风险级别：`medium`
- 说明：只读外部命令查询，通过 `checkPermission -> ask` 触发权限确认。

### External Skills

1. `external-defect-triage`
- 来源：`community-skillbook`
- 适配来源：`open-source defect triage playbooks`

2. `external-release-change-scan`
- 来源：`community-skillbook`
- 适配来源：`open-source release validation checklists`

## Adapter / Manifest 设计

- 每个 external capability 都有 manifest，包含：
  - `source`
  - `capabilityType`
  - `adapted`
  - `version`
  - `riskLevel`
- tool 通过 adapter 生成标准 `ToolSpec`，统一注册到 Tool Registry。
- skill 通过 frontmatter 文件进入 SkillStore / context builder，不走 prompt 旁路。

## 验证结果

- `npm run typecheck` 通过
- `npm run demo` 通过
- `npm run smoke` 通过

smoke 关键输出覆盖：
- `externalSkillInContext=true`
- `externalSkillsLoaded=2`
- `externalToolRegistered=true`
- `projectScopeReuse=true`
- `denyConfirmed=true`

## 仍是 placeholder 的部分

1. external capability 仍是“手动注册样板”，未做自动发现平台。
2. 未做插件市场、MCP 批量接入、能力排名系统。
3. 未做多 agent capability orchestration。

## V1 到 Phase 6 的边界

- 已完成第一批 external tool / skill 的标准化接入样板。
- 已证明 external capability 不绕过 submit/runtime/permission/tool contract 主链。
- 尚未进入大规模生态化阶段（符合本轮边界）。
