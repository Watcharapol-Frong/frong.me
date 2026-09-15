/**
 * AI Assistant Type Definitions for frong.me CMS
 *
 * Defines contracts, request/response schemas, task types,
 * and provider configurations for `/earth/api/ai/generate`.
 */

export const AI_TASKS = [
  'title-suggestions',
  'auto-excerpt',
  'auto-slug',
  'auto-tags',
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

/**
 * What a model can be used for. `text` covers ordinary chat/completion
 * models (everything the editor's AI tasks need today); `text-image` marks
 * a multimodal model that also generates or reads images, for the future
 * image-generation feature — see `docs/plan.md`'s BYOK entries. Detected
 * from real provider metadata where available (OpenRouter's `architecture.
 * modality`); Gemini and Cloudflare's curated list are marked `text` since
 * this app only ever calls their `generateContent`/text endpoints.
 */
export const AI_MODEL_CAPABILITIES = ['text', 'text-image'] as const;
export type AiModelCapability = (typeof AI_MODEL_CAPABILITIES)[number];

export function capabilityLabel(capability: AiModelCapability): string {
  return capability === 'text-image' ? 'Text + Image' : 'Text';
}

/**
 * The underlying model family/vendor, parsed from the model id. Both
 * Cloudflare (`@cf/<vendor>/<model>`) and OpenRouter (`<vendor>/<model>`,
 * sometimes `~<vendor>/<model>` on some free-tier listings) namespace their
 * ids this way; Gemini only ever has one vendor, so this is mostly useful
 * for filtering the two multi-vendor providers' long model lists.
 */
export function deriveVendor(provider: AiProvider, id: string): string {
  if (provider === 'gemini') return 'google';
  if (provider === 'cloudflare') {
    const parts = id.split('/');
    return parts.length >= 2 ? parts[1] : provider;
  }
  // openrouter
  const stripped = id.replace(/^~/, '');
  const [vendor] = stripped.split('/');
  return vendor || provider;
}

const KNOWN_VENDOR_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  meta: 'Meta',
  'meta-llama': 'Meta',
  deepseek: 'DeepSeek',
  'deepseek-ai': 'DeepSeek',
  qwen: 'Qwen',
  mistralai: 'Mistral',
  mistral: 'Mistral',
  microsoft: 'Microsoft',
  'inference-net': 'Inference.net',
  'x-ai': 'xAI',
  cohere: 'Cohere',
  nvidia: 'NVIDIA',
};

/** Title-cases an unrecognized vendor slug rather than showing it raw. */
export function vendorLabel(vendor: string): string {
  return KNOWN_VENDOR_LABELS[vendor.toLowerCase()]
    ?? vendor.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const SHORT_LABEL_MAX_LENGTH = 24;

/**
 * Strips a redundant "Vendor: " / "Vendor - " prefix (OpenRouter's listing
 * convention — redundant once the picker already groups/filters by vendor)
 * and truncates what's left, so long provider labels stay scannable in the
 * cramped Settings model list and the editor's model-picker popup alike.
 */
export function deriveShortLabel(vendor: string, label: string): string {
  const vendorName = vendorLabel(vendor);
  const prefixPattern = new RegExp(`^${vendorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:\\-]\\s*`, 'i');
  const stripped = label.replace(prefixPattern, '').trim();
  const text = stripped || label;
  return text.length > SHORT_LABEL_MAX_LENGTH
    ? `${text.slice(0, SHORT_LABEL_MAX_LENGTH - 1).trimEnd()}…`
    : text;
}

/**
 * The model picker's options per provider. `generateAiResult` accepts any
 * string matching `AI_LIMITS.MODEL_PATTERN` regardless of this list — it's
 * a curated shortlist for the UI, not a server-side allowlist.
 */
export interface AiModelOption {
  id: string;
  /** Full name, for the picker menu list. */
  label: string;
  /** Compact name, for the current-selection line under the provider (e.g. "3.5 Flash"). */
  short: string;
  vendor: string;
  capability: AiModelCapability;
}

export const AI_PROVIDER_MODELS: Record<AiProvider, AiModelOption[]> = {
  /**
   * Cloudflare Workers AI has no per-account key and no live discovery
   * endpoint reachable without a separate, more sensitive Cloudflare API
   * Token + Account ID (a different credential than the Worker's own AI
   * binding this app already runs on) — so this stays a curated static list
   * of known free-tier text-generation models rather than a live fetch.
   */
  cloudflare: [
    { id: '@cf/meta/llama-3.1-8b-instruct-fp8', label: 'Llama 3.1 8B (fast)', short: 'Llama 3.1 8B', vendor: 'meta', capability: 'text' },
    { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', label: 'Llama 3.3 70B', short: 'Llama 3.3 70B', vendor: 'meta', capability: 'text' },
    { id: '@cf/mistralai/mistral-small-3.1-24b-instruct', label: 'Mistral Small 3.1', short: 'Mistral Small 3.1', vendor: 'mistralai', capability: 'text' },
    { id: '@cf/meta/llama-3.2-3b-instruct', label: 'Llama 3.2 3B', short: 'Llama 3.2 3B', vendor: 'meta', capability: 'text' },
    { id: '@cf/meta/llama-3.2-1b-instruct', label: 'Llama 3.2 1B (fastest)', short: 'Llama 3.2 1B', vendor: 'meta', capability: 'text' },
    { id: '@cf/meta/llama-3.1-70b-instruct', label: 'Llama 3.1 70B', short: 'Llama 3.1 70B', vendor: 'meta', capability: 'text' },
    { id: '@cf/google/gemma-3-12b-it', label: 'Gemma 3 12B', short: 'Gemma 3 12B', vendor: 'google', capability: 'text' },
    { id: '@cf/qwen/qwen1.5-14b-chat-awq', label: 'Qwen 1.5 14B Chat', short: 'Qwen 1.5 14B', vendor: 'qwen', capability: 'text' },
    { id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', label: 'DeepSeek R1 Distill Qwen 32B', short: 'DeepSeek R1 32B', vendor: 'deepseek-ai', capability: 'text' },
    { id: '@cf/microsoft/phi-2', label: 'Phi-2', short: 'Phi-2', vendor: 'microsoft', capability: 'text' },
  ],
  gemini: [
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite (fast)', short: '3.5 Flash Lite', vendor: 'google', capability: 'text' },
    { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', short: '3.5 Flash', vendor: 'google', capability: 'text' },
    { id: 'gemini-3.5-pro', label: 'Gemini 3.5 Pro', short: '3.5 Pro', vendor: 'google', capability: 'text' },
  ],
  openrouter: [
    { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini (fast)', short: 'GPT-4o Mini', vendor: 'openai', capability: 'text' },
    { id: 'openai/gpt-4o', label: 'GPT-4o', short: 'GPT-4o', vendor: 'openai', capability: 'text' },
    { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', short: 'Claude 3.5 Sonnet', vendor: 'anthropic', capability: 'text' },
  ],
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

export const AI_PROVIDER_CONFIG_LIMITS = {
  MIN_MODELS: 1,
  MAX_MODELS: 5,
  MAX_API_KEY_LENGTH: 400,
} as const;

/** One model an author has chosen to make available in the editor's picker. */
export interface AiConfiguredModel {
  id: string;
  label: string;
  short: string;
  vendor: string;
  capability: AiModelCapability;
}

/**
 * A provider's BYOK setup, as returned to the client — `hasApiKey` instead of
 * the actual key, which is write-only from the client's side (see
 * `docs/cms/ai-integration-spec.md` for why: the settings GET endpoint must
 * never echo back what was saved).
 */
export interface AiProviderConfig {
  provider: AiProvider;
  hasApiKey: boolean;
  models: AiConfiguredModel[];
}

/** PUT body for saving a provider's config. `apiKey: undefined` leaves the stored key unchanged; `null` clears it. */
export interface UpdateAiProviderConfigInput {
  apiKey?: string | null;
  // The repository derives display metadata when callers send only id/label.
  models: Array<Pick<AiConfiguredModel, 'id' | 'label'> & Partial<Pick<AiConfiguredModel, 'short' | 'vendor' | 'capability'>>>;
}

/** One entry from a provider's live model-list API, before the author narrows it down to their chosen 1-5. */
export interface AiDiscoveredModel {
  id: string;
  label: string;
  short: string;
  vendor: string;
  capability: AiModelCapability;
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
