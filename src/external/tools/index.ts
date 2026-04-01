import type { ToolSpec } from '../../shared/contracts.js';
import type { ExternalToolAdapter } from '../adapters/tool-adapter.js';
import { externalRepoSearchAdapter } from './external-repo-search.adapter.js';
import { externalGitStatusAdapter } from './external-git-status.adapter.js';

export const EXTERNAL_TOOL_ADAPTERS: ExternalToolAdapter[] = [
  externalRepoSearchAdapter,
  externalGitStatusAdapter,
];

export function createExternalToolSpecs(): ToolSpec[] {
  return EXTERNAL_TOOL_ADAPTERS.map((adapter) => adapter.createToolSpec());
}
