import type { ModelConfigState, ModelProvider } from './model-types.js';

const DEFAULT_PROVIDER: ModelProvider = 'openai_compatible';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL_NAME = 'gpt-4o-mini';
const DEFAULT_TIMEOUT_MS = 30000;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function parseTimeoutMs(value: string | undefined): number {
  if (!value) {
    return DEFAULT_TIMEOUT_MS;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1000 || parsed > 120000) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.floor(parsed);
}

export function loadModelConfig(env: NodeJS.ProcessEnv = process.env): ModelConfigState {
  const providerRaw = env.USERCLAW_MODEL_PROVIDER?.trim();
  const provider = (providerRaw || DEFAULT_PROVIDER) as ModelProvider;

  if (provider !== 'openai_compatible') {
    return {
      enabled: false,
      reason: `Unsupported USERCLAW_MODEL_PROVIDER "${providerRaw}". Only "openai_compatible" is supported in Phase 3.`,
      missingEnv: ['USERCLAW_MODEL_PROVIDER'],
    };
  }

  const baseUrl = trimTrailingSlash(env.USERCLAW_MODEL_BASE_URL?.trim() || DEFAULT_BASE_URL);
  const modelName = env.USERCLAW_MODEL_NAME?.trim() || DEFAULT_MODEL_NAME;
  const apiKey = env.USERCLAW_MODEL_API_KEY?.trim() || '';
  const timeoutMs = parseTimeoutMs(env.USERCLAW_MODEL_TIMEOUT_MS);

  if (!apiKey) {
    return {
      enabled: false,
      reason: 'Missing USERCLAW_MODEL_API_KEY; model runtime will use mock fallback.',
      missingEnv: ['USERCLAW_MODEL_API_KEY'],
    };
  }

  return {
    enabled: true,
    config: {
      provider,
      baseUrl,
      modelName,
      apiKey,
      timeoutMs,
    },
  };
}

