import type {
  KnowledgeItem,
  RuleItem,
  RuntimeContext,
  SkillItem,
  SubmitRequest,
} from '../shared/contracts.js';

export interface ModelContextBuildInput {
  request: SubmitRequest;
  runtimeContext: RuntimeContext;
  knowledgeItems: KnowledgeItem[];
  skillItems: SkillItem[];
  ruleItems: RuleItem[];
}

export interface ModelContextBuildResult {
  systemPrompt: string;
  userPrompt: string;
  contextStrategy: string;
  usedKnowledge: KnowledgeItem[];
  usedSkills: SkillItem[];
  usedRules: RuleItem[];
}

function compact(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 3)}...`
    : normalized;
}

function extractKeywords(goal: string): string[] {
  const lowerGoal = goal.toLowerCase();
  const englishTokens = lowerGoal.match(/[a-z0-9_]{2,}/g) ?? [];
  const chineseParts = goal
    .split(/[，。！？；、\s]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);

  const all = [lowerGoal, ...englishTokens, ...chineseParts.map((part) => part.toLowerCase())];
  return Array.from(new Set(all)).slice(0, 20);
}

function scoreText(text: string, keywords: string[]): number {
  const lowerText = text.toLowerCase();
  let score = 0;
  for (const keyword of keywords) {
    if (!keyword) {
      continue;
    }
    if (lowerText.includes(keyword)) {
      score += keyword.length > 6 ? 3 : 2;
    }
  }
  return score;
}

function selectRelevantKnowledge(
  items: KnowledgeItem[],
  keywords: string[],
  limit = 3,
): KnowledgeItem[] {
  const scored = items
    .map((item, index) => ({
      item,
      index,
      score: scoreText(`${item.title} ${item.content} ${(item.tags ?? []).join(' ')}`, keywords),
    }))
    .sort((a, b) => b.score - a.score || b.index - a.index);

  const relevant = scored.filter((entry) => entry.score > 0).slice(0, limit).map((entry) => entry.item);
  if (relevant.length > 0) {
    return relevant;
  }

  return items.slice(-limit);
}

function selectRelevantSkills(
  items: SkillItem[],
  keywords: string[],
  limit = 2,
): SkillItem[] {
  const scored = items
    .map((item, index) => ({
      item,
      index,
      score: scoreText(`${item.name} ${item.description} ${item.steps.join(' ')}`, keywords),
    }))
    .sort((a, b) => b.score - a.score || b.index - a.index);

  const relevant = scored.filter((entry) => entry.score > 0).slice(0, limit).map((entry) => entry.item);
  if (relevant.length > 0) {
    return relevant;
  }

  return items.slice(-limit);
}

function selectRelevantRules(items: RuleItem[], keywords: string[], limit = 4): RuleItem[] {
  const sortedByPriority = [...items].sort((a, b) => b.priority - a.priority);
  const relevant = sortedByPriority.filter(
    (rule) => scoreText(`${rule.name} ${rule.ruleText}`, keywords) > 0,
  );

  const selected: RuleItem[] = [];
  for (const rule of [...relevant, ...sortedByPriority]) {
    if (selected.some((item) => item.id === rule.id)) {
      continue;
    }
    selected.push(rule);
    if (selected.length >= limit) {
      break;
    }
  }

  return selected;
}

function buildKnowledgeSection(items: KnowledgeItem[]): string {
  if (items.length === 0) {
    return '- (none)';
  }
  return items
    .map((item) => `- [${item.id}] ${compact(item.title, 80)}: ${compact(item.content, 180)}`)
    .join('\n');
}

function buildSkillSection(items: SkillItem[]): string {
  if (items.length === 0) {
    return '- (none)';
  }
  return items.map((item) => {
    const steps = item.steps.slice(0, 4).map((step, index) => `${index + 1}. ${compact(step, 80)}`).join(' ');
    const toolHint = item.allowedTools && item.allowedTools.length > 0
      ? ` Allowed tools: ${item.allowedTools.join(', ')}.`
      : '';
    return `- [${item.id}] ${compact(item.name, 80)} | ${compact(item.description, 140)} | Steps: ${steps}.${toolHint}`;
  }).join('\n');
}

function buildRuleSection(items: RuleItem[]): string {
  if (items.length === 0) {
    return '- (none)';
  }
  return items
    .map((rule) => `- [${rule.id}] P${rule.priority} (${rule.scope ?? 'project'}): ${compact(rule.ruleText, 160)}`)
    .join('\n');
}

export function buildRuntimeModelContext(input: ModelContextBuildInput): ModelContextBuildResult {
  const goal = input.request.inputText ?? input.runtimeContext.taskContext.goal;
  const keywords = extractKeywords(goal);

  const usedKnowledge = selectRelevantKnowledge(input.knowledgeItems, keywords, 3);
  const usedSkills = selectRelevantSkills(input.skillItems, keywords, 2);
  const usedRules = selectRelevantRules(input.ruleItems, keywords, 4);

  const contextStrategy =
    'knowledge: top relevant <=3 (fallback recent); skills: top relevant <=2 (fallback recent); rules: relevant + highest priority <=4';

  const systemPrompt = [
    `You are ${input.runtimeContext.systemContext.identity}.`,
    'Follow system principles and high-priority rules strictly.',
    'Provide concise, actionable output grounded in provided context.',
    'If context is insufficient, say what is missing instead of guessing.',
    '',
    'System principles:',
    ...input.runtimeContext.systemContext.principles.map((principle) => `- ${principle}`),
  ].join('\n');

  const userPrompt = [
    `Task Goal:\n${goal}`,
    '',
    `Context strategy:\n${contextStrategy}`,
    '',
    `Relevant Knowledge:\n${buildKnowledgeSection(usedKnowledge)}`,
    '',
    `Relevant Skills:\n${buildSkillSection(usedSkills)}`,
    '',
    `High-Priority Rules:\n${buildRuleSection(usedRules)}`,
    '',
    'Output format:',
    '1) Brief analysis (1-3 lines)',
    '2) Action plan (numbered list)',
    '3) Final answer',
  ].join('\n');

  return {
    systemPrompt,
    userPrompt,
    contextStrategy,
    usedKnowledge,
    usedSkills,
    usedRules,
  };
}

