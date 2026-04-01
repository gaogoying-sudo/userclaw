import type { ExternalCapabilityManifest } from './manifest-types.js';

export interface ExternalSkillManifest extends ExternalCapabilityManifest {
  capabilityType: 'skill';
  skillId: string;
  fileName: string;
}

export const EXTERNAL_SKILL_MANIFESTS: ExternalSkillManifest[] = [
  {
    id: 'external-skill-defect-triage',
    name: 'External Defect Triage Workflow',
    capabilityType: 'skill',
    skillId: 'external-defect-triage',
    fileName: 'external-defect-triage.md',
    adapted: true,
    source: 'community-skillbook',
    adaptedFrom: 'open-source defect triage playbooks',
    version: '1.0.0',
    riskLevel: 'low',
    adapterId: 'external.skills.external_defect_triage',
    description: 'A reusable triage sequence adapted into userclaw skill frontmatter format.',
  },
  {
    id: 'external-skill-release-check',
    name: 'External Release Change Scan',
    capabilityType: 'skill',
    skillId: 'external-release-change-scan',
    fileName: 'external-release-change-scan.md',
    adapted: true,
    source: 'community-skillbook',
    adaptedFrom: 'open-source release validation checklists',
    version: '1.0.0',
    riskLevel: 'medium',
    adapterId: 'external.skills.external_release_change_scan',
    description: 'A read-only release readiness scan adapted for userclaw skill-layer loading.',
  },
];
