import { loadModelConfig } from './model-config.js';
import type {
  ModelCallFailure,
  ModelCallInput,
  ModelCallResult,
  ModelConfigState,
  ModelUsage,
} from './model-types.js';

interface OpenAICompatibleResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

function failure(
  overrides: Omit<ModelCallFailure, 'ok' | 'provider'> & { provider?: ModelCallFailure['provider'] },
): ModelCallFailure {
  return {
    ok: false,
    provider: overrides.provider ?? 'openai_compatible',
    ...overrides,
  };
}

function mapUsage(usage: OpenAICompatibleResponse['usage']): ModelUsage | undefined {
  if (!usage) {
    return undefined;
  }
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
}

function parseResponseBody(body: unknown): OpenAICompatibleResponse | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  return body as OpenAICompatibleResponse;
}

export async function callModel(
  input: ModelCallInput,
  configState: ModelConfigState = loadModelConfig(),
): Promise<ModelCallResult> {
  if (!configState.enabled || !configState.config) {
    const missing = configState.missingEnv ?? [];
    const code = missing.includes('USERCLAW_MODEL_API_KEY')
      ? 'MODEL_API_KEY_MISSING'
      : 'MODEL_CONFIG_MISSING';

    return failure({
      code,
      message: configState.reason ?? 'Model configuration is incomplete',
      retryable: false,
    });
  }

  const config = configState.config;
  const endpoint = `${config.baseUrl}/chat/completions`;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.modelName,
        messages: [
          { role: 'system', content: input.systemPrompt },
          { role: 'user', content: input.userPrompt },
        ],
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxTokens,
      }),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      const shortBody = bodyText.slice(0, 300);
      return failure({
        code: 'MODEL_HTTP_ERROR',
        modelName: config.modelName,
        statusCode: response.status,
        retryable: response.status >= 500 || response.status === 429,
        message: `Model HTTP ${response.status}${shortBody ? `: ${shortBody}` : ''}`,
      });
    }

    const jsonBody: unknown = await response.json().catch(() => null);
    const parsed = parseResponseBody(jsonBody);
    const content = parsed?.choices?.[0]?.message?.content;

    if (typeof content !== 'string' || content.trim().length === 0) {
      return failure({
        code: 'MODEL_RESPONSE_INVALID',
        modelName: config.modelName,
        retryable: false,
        message: 'Model response missing choices[0].message.content',
      });
    }

    return {
      ok: true,
      provider: 'openai_compatible',
      modelName: config.modelName,
      text: content.trim(),
      usage: mapUsage(parsed?.usage),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure({
      code: 'MODEL_NETWORK_ERROR',
      modelName: config.modelName,
      retryable: true,
      message: `Model request failed: ${message}`,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
}
