import type { ToolSpec } from '../shared/contracts.js';
import { registerExternalTools } from '../external/index.js';
import { directoryListTool } from './directory-list.tool.js';
import { fileReadTool } from './file-read.tool.js';
import { fileWriteTool } from './file-write.tool.js';
import { localSearchTool } from './local-search.tool.js';

const CORE_TOOLS: ToolSpec[] = [
  fileReadTool,
  fileWriteTool,
  directoryListTool,
  localSearchTool,
];

export function registerCoreTools(registry: { register(spec: ToolSpec): void }): void {
  for (const tool of CORE_TOOLS) {
    registry.register(tool);
  }
  registerExternalTools(registry);
}
