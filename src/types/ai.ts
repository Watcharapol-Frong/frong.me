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
  'research',
  'inline_draft',
  'review',
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
  MAX_TOPIC_LENGTH: 500,
  MAX_SELECTED_TEXT_LENGTH: 4000,
  MAX_TAGS: 20,
  MAX_TAG_LENGTH: 100,
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
  /** `research`: the topic to ideate on, when there is no draft yet. */
  topic?: string;
  /** `inline_draft`: the text currently selected in the editor, if any. */
  selectedText?: string;
  /** `review`: the post's current tags, for the SEO/keyword check. */
  tags?: string[];
}

/** One angle suggestion from the `research` task. */
export interface AiResearchIdea {
  angle: string;
  audience: string;
  hook: string;
}

/** Structured report from the `review` task. */
export interface AiReviewReport {
  grammar: string[];
  missingReferences: string[];
  seo: {
    score: number;
    titleLengthOk: boolean;
    excerptLengthOk: boolean;
    hasHeadings: boolean;
    keywordSuggestions: string[];
  };
}

/**
 * Successful response payload for POST /earth/api/ai/generate. Text tasks
 * (including `inline_draft`) return a string; `research` and `review` return
 * their structured shape directly so the editor can render them without an
 * extra JSON.parse of untrusted provider output.
 */
export interface AiGenerateSuccessResponse {
  result: string | AiResearchIdea[] | AiReviewReport;
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

