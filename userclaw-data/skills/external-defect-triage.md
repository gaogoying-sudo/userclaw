---
id: external-defect-triage
name: external-defect-triage
description: Triage defects with evidence-first checks and minimal changes.
origin: external
source: community-skillbook
adapted-from: open-source defect triage playbooks
allowed-tools:
  - external_repo_search
  - file_read
  - local_search
when-to-use: Use when a bug report or regression needs fast root-cause isolation.
---

1. Capture the failing behavior and expected behavior in one sentence.
2. Use read-only search tools to locate the smallest suspicious code region.
3. Confirm one root cause hypothesis with concrete file evidence before editing.
4. Propose the minimal safe change and list quick verification checks.
