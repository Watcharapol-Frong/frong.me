/**
 * AI Assistant Type Definitions for frong.me CMS
 *
 * Defines contracts, request/response schemas, task types,
 * and provider configurations for `/earth/api/ai/generate`.
 */

export const AI_TASKS = [
  'title-suggestions',
  'auto-excerpt',
  'generate-outline',
  'seo-optimizer',
] as const;

export type AiTask = (typeof AI_TASKS)[number];

export const AI_PROVIDERS = ['cloudflare', 'gemini', 'openrouter'] as const;

export type AiProvider = (typeof AI_PROVIDERS)[number];

export const DEFAULT_AI_MODELS: Record<AiProvider, string> = {
  cloudflare: '@cf/meta/llama-3.1-8b-instruct-fp8',
  gemini: 'gemini-3.5-flash-lite',
  openrouter: 'openai/gpt-4o-mini',
};

export const AI_LIMITS = {
  MAX_REQUEST_BYTES: 16 * 1024, // 16 KB
  MAX_MODEL_LENGTH: 200,
  MAX_TITLE_LENGTH: 500,
  MAX_DESCRIPTION_LENGTH: 2000,
  MAX_BODY_TEXT_LENGTH: 12000,
  MAX_CONTEXT_BODY_LENGTH: 6000,
  MODEL_PATTERN: /^[A-Za-z0-9@._:/-]+$/,
} as const;

/**
 * Input fields extracted from an article for building prompt context.
 */
export interface AiPromptContext {
  title?: string;
  description?: string;
  bodyText?: string;
}

/**
 * Request payload for POST /earth/api/ai/generate
 */
export interface AiGenerateRequest {
  task: AiTask;
  provider: AiProvider;
  model?: string;
  title?: string;
  description?: string;
  bodyText?: string;
}

/**
 * Successful response payload for POST /earth/api/ai/generate
 */
export interface AiGenerateSuccessResponse {
  result: string;
}

/**
 * Error response payload for POST /earth/api/ai/generate
 */
export interface AiGenerateErrorResponse {
  error: string;
}

/**
 * Union response type for POST /earth/api/ai/generate
 */
export type AiGenerateResponse =
  | AiGenerateSuccessResponse
  | AiGenerateErrorResponse;

/**
 * UI / Editor metadata for an AI task.
 */
export interface AiTaskDefinition {
  id: AiTask;
  label: string;
  icon: string;
  description: string;
  appliesToField?: 'title' | 'description' | null;
}

/**
 * UI / Editor metadata for an AI provider.
 */
export interface AiProviderDefinition {
  id: AiProvider;
  label: string;
  defaultModel: string;
  availableModels: readonly string[];
  requiresApiKey: boolean;
}

/**
 * Cloudflare Workers runtime environment bindings required by AI features.
 */
export interface AiWorkerEnvironment {
  /** Cloudflare Workers AI binding */
  AI?: {
    run: (
      model: string,
      inputs: { messages: Array<{ role: 'user' | 'system' | 'assistant'; content: string }> },
    ) => Promise<{ response?: string }>;
  };
  /** Google Gemini API Key */
  GEMINI_API_KEY?: string;
  /** OpenRouter API Key */
  OPENROUTER_API_KEY?: string;
  /** Legacy shared secret for standalone AI Worker (optional) */
  AI_WORKER_SECRET?: string;
}

