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

const RETRY_DELAY_MS = 350;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function normalizeErrorMessage(value: string, maxLength = 260): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 3)}...`;
}

function mapHttpFailure(
  statusCode: number,
  modelName: string,
  bodyText: string,
  retryCount: number,
): ModelCallFailure {
  const bodyHint = bodyText ? `: ${normalizeErrorMessage(bodyText)}` : '';

  if (statusCode === 401) {
    return failure({
      code: 'MODEL_HTTP_401',
      modelName,
      statusCode,
      retryable: false,
      retryCount,
      message: `模型请求失败：401 鉴权失败${bodyHint}`,
      nextAction: '请检查 USERCLAW_MODEL_API_KEY 是否有效。',
    });
  }

  if (statusCode === 403) {
    return failure({
      code: 'MODEL_HTTP_403',
      modelName,
      statusCode,
      retryable: false,
      retryCount,
      message: `模型请求失败：403 无权限访问${bodyHint}`,
      nextAction: '请检查模型服务权限、组织策略或密钥权限范围。',
    });
  }

  if (statusCode === 429) {
    return failure({
      code: 'MODEL_HTTP_429',
      modelName,
      statusCode,
      retryable: true,
      retryCount,
      message: `模型请求失败：429 请求过于频繁${bodyHint}`,
      nextAction: '请稍后重试，或降低请求频率。',
    });
  }

  if (statusCode >= 500 && statusCode <= 599) {
    return failure({
      code: 'MODEL_HTTP_5XX',
      modelName,
      statusCode,
      retryable: true,
      retryCount,
      message: `模型请求失败：${statusCode} 服务端错误${bodyHint}`,
      nextAction: '服务端可能临时异常，请稍后重试。',
    });
  }

  return failure({
    code: 'MODEL_NETWORK_ERROR',
    modelName,
    statusCode,
    retryable: false,
    retryCount,
    message: `模型请求失败：HTTP ${statusCode}${bodyHint}`,
    nextAction: '请检查模型服务地址、鉴权参数与网络连通性。',
  });
}

function extractNodeErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const direct = (error as { code?: unknown }).code;
  if (typeof direct === 'string') {
    return direct;
  }

  const cause = (error as { cause?: { code?: unknown } }).cause;
  if (cause && typeof cause.code === 'string') {
    return cause.code;
  }

  return undefined;
}

function mapNetworkFailure(error: unknown, modelName: string, retryCount: number): ModelCallFailure {
  const message = error instanceof Error ? error.message : String(error);
  const errorCode = extractNodeErrorCode(error);

  if (error instanceof Error && error.name === 'AbortError') {
    return failure({
      code: 'MODEL_TIMEOUT',
      modelName,
      retryable: true,
      retryCount,
      message: '模型请求失败：请求超时',
      nextAction: '请稍后重试，或提高 USERCLAW_MODEL_TIMEOUT_MS。',
    });
  }

  if (errorCode && ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT'].includes(errorCode)) {
    return failure({
      code: 'MODEL_CONNECT_ERROR',
      modelName,
      retryable: true,
      retryCount,
      message: `模型请求失败：网络连接异常 (${errorCode})`,
      nextAction: '请检查模型服务可达性、base URL 和本机网络。',
    });
  }

  return failure({
    code: 'MODEL_NETWORK_ERROR',
    modelName,
    retryable: true,
    retryCount,
    message: `模型请求失败：网络异常 (${normalizeErrorMessage(message)})`,
    nextAction: '请检查当前网络或模型服务状态。',
  });
}

async function callModelOnce(
  input: ModelCallInput,
  configState: ModelConfigState,
  retryCount: number,
): Promise<ModelCallResult> {
  if (!configState.enabled || !configState.config) {
    const missing = configState.missingEnv ?? [];
    const code = missing.includes('USERCLAW_MODEL_API_KEY')
      ? 'MODEL_API_KEY_MISSING'
      : 'MODEL_CONFIG_MISSING';

    return failure({
      code,
      message: configState.reason ?? '模型配置不完整',
      retryable: false,
      retryCount,
      nextAction: '请先补全模型配置后再重试。',
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
      return mapHttpFailure(response.status, config.modelName, bodyText, retryCount);
    }

    const jsonBody: unknown = await response.json().catch(() => null);
    const parsed = parseResponseBody(jsonBody);
    const content = parsed?.choices?.[0]?.message?.content;

    if (typeof content !== 'string' || content.trim().length === 0) {
      return failure({
        code: 'MODEL_RESPONSE_PARSE_ERROR',
        modelName: config.modelName,
        retryable: false,
        retryCount,
        message: '模型响应解析失败：缺少 choices[0].message.content',
        nextAction: '请检查模型返回格式是否兼容 OpenAI Chat Completions。',
      });
    }

    return {
      ok: true,
      provider: 'openai_compatible',
      modelName: config.modelName,
      text: content.trim(),
      usage: mapUsage(parsed?.usage),
      retryCount,
    };
  } catch (error) {
    return mapNetworkFailure(error, config.modelName, retryCount);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export async function callModel(
  input: ModelCallInput,
  configState: ModelConfigState = loadModelConfig(),
): Promise<ModelCallResult> {
  const firstAttempt = await callModelOnce(input, configState, 0);
  if (firstAttempt.ok || !firstAttempt.retryable) {
    return firstAttempt;
  }

  await delay(RETRY_DELAY_MS);
  const secondAttempt = await callModelOnce(input, configState, 1);
  if (secondAttempt.ok) {
    return secondAttempt;
  }

  return failure({
    ...secondAttempt,
    retryable: secondAttempt.retryable,
    retryCount: 1,
    message: secondAttempt.message,
  });
}
