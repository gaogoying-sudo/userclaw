# userclaw V1 External Capability Adaptation Standard

## Purpose

Define the minimum adaptation contract for bringing **external tools** and **external skills** into userclaw without bypassing the existing runtime chain.

External capability onboarding must continue to pass through:

1. `submit` entry
2. `QueryRuntime`
3. `PermissionEngine`
4. `Tool Contract` / `Skill layer`

## Capability Manifest Requirements

Each external capability must have a manifest entry containing at least:

- `id`
- `name`
- `capabilityType` (`tool` or `skill`)
- `adapted` (boolean)
- `source`
- `adaptedFrom`
- `version`
- `riskLevel` (`low` / `medium` / `high`)
- `adapterId`
- `description`

## External Tool Adaptation Requirements

External tools must be adapted into a normal `ToolSpec`:

- explicit `inputSchema`
- explicit `validateInput`
- explicit runtime flags:
  - `isReadOnly`
  - `isDestructive`
  - `isConcurrencySafe`
  - `requiresPermission`
- return `ToolResult`
- execution must go through runtime tool execution path (no direct side-channel calls from UI/demo)

If an external tool has meaningful operational risk, it should return `ask` from `checkPermission`.

## External Skill Adaptation Requirements

External skills must be represented as `markdown + frontmatter` and loaded through the skill loader.

Minimum frontmatter fields:

- `name`
- `description`
- `source`
- `adapted-from`
- `allowed-tools`
- `when-to-use`

Recommended metadata:

- `id`
- `origin: external`

External skills must enter runtime context through the same skill-selection logic as internal skills.

## Traceability Requirements

For external capability runs, at minimum the following must remain visible in runtime artifacts/logs:

- registered tool names
- permission decisions (for permissioned tools)
- used skill ids in model trace/context trace
- tool execution results

## Explicit Non-Goals

This standard does not require:

- marketplace/discovery platform
- plugin package manager
- MCP fleet integration
- UI productization

It only defines the minimum contract so external capabilities can be onboarded safely and repeatably.
