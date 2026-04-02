import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { EXTERNAL_SKILL_MANIFESTS } from '../manifests/external-skill-manifests.js';

export interface ExternalSkillSample {
  fileName: string;
  markdown: string;
}

export const EXTERNAL_SKILL_SAMPLES: ExternalSkillSample[] = [
  {
    fileName: 'external-defect-triage.md',
    markdown: [
      '---',
      'id: external-defect-triage',
      'name: external-defect-triage',
      'description: Triage defects with evidence-first checks and minimal changes.',
      'origin: external',
      'source: community-skillbook',
      'adapted-from: open-source defect triage playbooks',
      'allowed-tools:',
      '  - external_repo_search',
      '  - file_read',
      '  - local_search',
      'when-to-use: Use when a bug report or regression needs fast root-cause isolation.',
      '---',
      '',
      '1. Capture the failing behavior and expected behavior in one sentence.',
      '2. Use read-only search tools to locate the smallest suspicious code region.',
      '3. Confirm one root cause hypothesis with concrete file evidence before editing.',
      '4. Propose the minimal safe change and list quick verification checks.',
      '',
    ].join('\n'),
  },
  {
    fileName: 'external-release-change-scan.md',
    markdown: [
      '---',
      'id: external-release-change-scan',
      'name: external-release-change-scan',
      'description: Scan repository change surface before release or merge.',
      'origin: external',
      'source: community-skillbook',
      'adapted-from: open-source release validation checklists',
      'allowed-tools:',
      '  - external_git_status',
      '  - directory_list',
      '  - file_read',
      'when-to-use: Use before release, merge, or handoff to summarize change risk.',
      '---',
      '',
      '1. Collect repository status and classify changed files by risk area.',
      '2. Inspect key changed files for behavioral or contract-impacting differences.',
      '3. Summarize missing verification and rollback hints in a short checklist.',
      '',
    ].join('\n'),
  },
];

export function ensureExternalSkillSamples(skillDirectory: string): string[] {
  mkdirSync(skillDirectory, { recursive: true });
  const writtenFiles: string[] = [];

  for (const sample of EXTERNAL_SKILL_SAMPLES) {
    const filePath = path.join(skillDirectory, sample.fileName);
    if (!existsSync(filePath)) {
      writeFileSync(filePath, sample.markdown, 'utf8');
    }
    writtenFiles.push(filePath);
  }

  return writtenFiles;
}

export function externalSkillManifestIds(): string[] {
  return EXTERNAL_SKILL_MANIFESTS.map((manifest) => manifest.skillId);
}
