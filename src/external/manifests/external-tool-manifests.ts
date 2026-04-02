import type { ExternalCapabilityManifest } from './manifest-types.js';

export interface ExternalToolManifest extends ExternalCapabilityManifest {
  capabilityType: 'tool';
  toolName: string;
}

export const EXTERNAL_TOOL_MANIFESTS: ExternalToolManifest[] = [
  {
    id: 'external-tool-repo-search',
    name: 'External Repo Search',
    capabilityType: 'tool',
    toolName: 'external_repo_search',
    adapted: true,
    source: 'community-cli-patterns',
    adaptedFrom: 'git-grep workflow templates',
    version: '1.0.0',
    riskLevel: 'low',
    adapterId: 'external.tools.external_repo_search',
    description: 'Read-only repository search adapted from community command-line search workflows.',
  },
  {
    id: 'external-tool-git-status',
    name: 'External Git Status',
    capabilityType: 'tool',
    toolName: 'external_git_status',
    adapted: true,
    source: 'community-cli-patterns',
    adaptedFrom: 'git status inspection workflows',
    version: '1.0.0',
    riskLevel: 'medium',
    adapterId: 'external.tools.external_git_status',
    description: 'Read-only repository status inspection adapted through a permission-gated external command adapter.',
  },
];
