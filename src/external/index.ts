import type { SkillItem, ToolSpec } from '../shared/contracts.js';
import { EXTERNAL_TOOL_MANIFESTS } from './manifests/external-tool-manifests.js';
import { EXTERNAL_SKILL_MANIFESTS } from './manifests/external-skill-manifests.js';
import { createExternalToolSpecs } from './tools/index.js';
import { externalSkillManifestIds } from './skills/external-skill-samples.js';

export function registerExternalTools(registry: { register(spec: ToolSpec): void }): string[] {
  const specs = createExternalToolSpecs();
  const names: string[] = [];
  for (const spec of specs) {
    registry.register(spec);
    names.push(spec.name);
  }
  return names;
}

export function listExternalToolManifests() {
  return EXTERNAL_TOOL_MANIFESTS.map((manifest) => ({ ...manifest }));
}

export function listExternalSkillManifests() {
  return EXTERNAL_SKILL_MANIFESTS.map((manifest) => ({ ...manifest }));
}

export function listLoadedExternalSkills(skills: SkillItem[]): SkillItem[] {
  const externalSkillIds = new Set(externalSkillManifestIds());
  return skills.filter((skill) => {
    if (externalSkillIds.has(skill.id)) {
      return true;
    }

    if (skill.isExternal) {
      return true;
    }

    const source = skill.source?.toLowerCase();
    return Boolean(source && source !== 'internal');
  });
}
