---
id: external-release-change-scan
name: external-release-change-scan
description: Scan repository change surface before release or merge.
origin: external
source: community-skillbook
adapted-from: open-source release validation checklists
allowed-tools:
  - external_git_status
  - directory_list
  - file_read
when-to-use: Use before release, merge, or handoff to summarize change risk.
---

1. Collect repository status and classify changed files by risk area.
2. Inspect key changed files for behavioral or contract-impacting differences.
3. Summarize missing verification and rollback hints in a short checklist.
