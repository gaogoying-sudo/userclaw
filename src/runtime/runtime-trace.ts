import type {
  KnowledgeItem,
  RuleItem,
  SkillItem,
  SystemContext,
  TaskContext,
} from '../shared/contracts.js';
import type { ModelProvider } from '../models/model-types.js';

export interface RuntimeContextStageTrace {
  strategy: string;
  totalItems: number;
  selectedIds: string[];
}

export interface RuntimeContextTrace {
  strategy: string;
  system: {
    identity: string;
    principles: string[];
    principleCount: number;
  };
  task: {
    goal: string;
    keywords: string[];
  };
  knowledge: RuntimeContextStageTrace;
  skills: RuntimeContextStageTrace;
  rules: RuntimeContextStageTrace;
}

export interface QueryModelTrace {
  provider: ModelProvider | 'mock';
  model: string;
  usedMockFallback: boolean;
  fallbackReason?: string;
  contextStrategy: string;
  usedKnowledgeIds: string[];
  usedSkillIds: string[];
  usedRuleIds: string[];
  contextTrace: RuntimeContextTrace;
}

export interface AssistantOutput {
  previewText: string;
  fullText?: string;
  artifactUri?: string;
  truncated: boolean;
}

export interface ModelContextStageInput {
  systemContext: SystemContext;
  taskContext: TaskContext;
  keywords: string[];
  usedKnowledge: KnowledgeItem[];
  usedSkills: SkillItem[];
  usedRules: RuleItem[];
  contextStrategy: string;
}

export function buildContextTrace(input: ModelContextStageInput): RuntimeContextTrace {
  return {
    strategy: input.contextStrategy,
    system: {
      identity: input.systemContext.identity,
      principles: input.systemContext.principles,
      principleCount: input.systemContext.principles.length,
    },
    task: {
      goal: input.taskContext.goal,
      keywords: input.keywords,
    },
    knowledge: {
      strategy: 'top relevant <=3 (fallback recent)',
      totalItems: input.usedKnowledge.length,
      selectedIds: input.usedKnowledge.map((item) => item.id),
    },
    skills: {
      strategy: 'top relevant <=2 (fallback recent)',
      totalItems: input.usedSkills.length,
      selectedIds: input.usedSkills.map((item) => item.id),
    },
    rules: {
      strategy: 'relevant + highest priority <=4',
      totalItems: input.usedRules.length,
      selectedIds: input.usedRules.map((item) => item.id),
    },
  };
}

export function createAssistantOutput(
  text: string,
  saveArtifact: (content: string, hint: string) => string,
  options: { maxInlineLength?: number; artifactHint?: string } = {},
): AssistantOutput {
  const maxInlineLength = options.maxInlineLength ?? 1200;
  const normalized = text.trim();

  if (normalized.length <= maxInlineLength) {
    return {
      previewText: normalized,
      fullText: normalized,
      truncated: false,
    };
  }

  const artifactUri = saveArtifact(normalized, options.artifactHint ?? 'assistant-response');
  return {
    previewText: `${normalized.slice(0, maxInlineLength - 3)}...`,
    artifactUri,
    truncated: true,
  };
}
