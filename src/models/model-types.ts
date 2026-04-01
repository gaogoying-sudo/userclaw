export type ModelProvider = 'openai_compatible';

export interface ModelConfig {
  provider: ModelProvider;
  baseUrl: string;
  modelName: string;
  apiKey: string;
  timeoutMs: number;
}

export interface ModelConfigState {
  enabled: boolean;
  config?: ModelConfig;
  reason?: string;
  missingEnv?: string[];
}

export interface ModelUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ModelCallInput {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ModelCallSuccess {
  ok: true;
  provider: ModelProvider;
  modelName: string;
  text: string;
  usage?: ModelUsage;
}

export type ModelCallErrorCode =
  | 'MODEL_CONFIG_MISSING'
  | 'MODEL_API_KEY_MISSING'
  | 'MODEL_HTTP_ERROR'
  | 'MODEL_NETWORK_ERROR'
  | 'MODEL_RESPONSE_INVALID';

export interface ModelCallFailure {
  ok: false;
  provider: ModelProvider;
  modelName?: string;
  code: ModelCallErrorCode;
  message: string;
  retryable: boolean;
  statusCode?: number;
}

export type ModelCallResult = ModelCallSuccess | ModelCallFailure;

