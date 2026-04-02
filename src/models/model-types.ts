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
  retryCount: number;
}

export type ModelCallErrorCode =
  | 'MODEL_CONFIG_MISSING'
  | 'MODEL_API_KEY_MISSING'
  | 'MODEL_TIMEOUT'
  | 'MODEL_CONNECT_ERROR'
  | 'MODEL_HTTP_401'
  | 'MODEL_HTTP_403'
  | 'MODEL_HTTP_429'
  | 'MODEL_HTTP_5XX'
  | 'MODEL_NETWORK_ERROR'
  | 'MODEL_RESPONSE_PARSE_ERROR';

export interface ModelCallFailure {
  ok: false;
  provider: ModelProvider;
  modelName?: string;
  code: ModelCallErrorCode;
  message: string;
  retryable: boolean;
  retryCount: number;
  nextAction: string;
  statusCode?: number;
}

export type ModelCallResult = ModelCallSuccess | ModelCallFailure;
