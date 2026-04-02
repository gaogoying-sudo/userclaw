import type { ToolSpec } from '../../shared/contracts.js';
import type { ExternalToolManifest } from '../manifests/external-tool-manifests.js';

export interface ExternalToolAdapter {
  manifest: ExternalToolManifest;
  createToolSpec(): ToolSpec;
}
