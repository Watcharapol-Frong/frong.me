import {
  AI_LIMITS,
  AI_PROVIDERS,
  AI_TASKS,
  DEFAULT_AI_MODELS,
  deriveShortLabel,
  deriveVendor,
  type AiDiscoveredModel,
  type AiGenerateRequest,
  type AiGenerateSuccessResponse,
  type AiPromptContext,
  type AiProvider,
  type AiResearchIdea,
  type AiReviewReport,
  type AiTask,
  type AiWorkerEnvironment,
} from './types/ai.ts';
import { CmsBadRequestError, CmsError } from './errors.ts';
import type { CmsDatabase } from './db.ts';
import { getAiProviderConfigForUse } from './repositories/ai-provider-configs.ts';

import { resolveRuntimeEnv } from './runtime-env.ts';

/**
 * AI Assistant generation core for POST /earth/api/ai/generate.
 *
 * Contract: docs/cms/ai-integration-spec.md. The route handler in
 * src/pages/earth/api/ai/generate.ts stays thin; everything testable lives here.
 * This module is intentionally free of D1 and middleware concerns — the Earth
 * Access middleware already gates every /earth/* request before this code runs.
 */

export class AiProviderConfigError extends CmsError {
  constructor(message = 'Provider configuration missing', options?: { cause?: unknown }) {
    super(message, 'SERVICE_UNAVAILABLE', 500, { ...options, expose: true });
  }
}

export class AiProviderRequestError extends CmsError {
  constructor(message = 'AI request failed', options?: { cause?: unknown }) {
    super(message, 'BAD_GATEWAY', 502, { ...options, expose: true });
  }
}

export interface AiGenerateEnvironment extends AiWorkerEnvironment {
  /** Injectable fetch for tests; defaults to global fetch. */
  fetcher?: typeof fetch;
}

export async function resolveAiEnvironment(locals: unknown): Promise<AiGenerateEnvironment> {
  return resolveRuntimeEnv<AiGenerateEnvironment>(locals);
}

/** Prompt lead-ins for the four original single-string text tasks. */
const TASK_PROMPTS: Partial<Record<AiTask, string>> = {
  'title-suggestions':
    "You are an editor titling a blog article for readers who skim before they click. Based on the article below, suggest 5 alternative titles. Each one must be short (aim for 6-10 words, never more than 12) and give the reader a concrete reason to click — a specific benefit, a sharp angle, a number, or a pointed question — not a vague summary of the whole article. Avoid generic patterns like \"A Guide to X\", \"Everything About X\", or \"X: An Overview\". Return ONLY a numbered list, one title per line, no extra commentary.",
  'auto-excerpt':
    'Write a single, compelling excerpt/meta description for this article, maximum 160 characters. Return ONLY the excerpt text, nothing else.',
  'auto-slug':
    'Suggest a short, URL-friendly slug for this article: lowercase words separated by hyphens, no punctuation, 3-6 words. Return ONLY the slug, nothing else.',
  'auto-tags':
    'Suggest at most 2 short, topical tags for this article (one or two words each). Return ONLY the tags, one per line, no numbering, no hashtags, no extra commentary.',
  'generate-outline':
    "Plan this article's storyline before it's written. Treat the title and excerpt below as the article's core promise to the reader, and propose 4-7 H2 section headings that build a coherent narrative arc from opening hook to conclusion — each heading should name a specific, concrete beat in that story (never a generic label like \"Introduction\", \"Background\", or \"Conclusion\"), and the sequence should read as a deliberate build toward the promise in the title, not an interchangeable checklist. If body text already exists below, keep the outline consistent with what it has already established. Return ONLY a numbered list of headings, no extra commentary.",
  'seo-optimizer':
    "Review this article's title and excerpt for SEO. Give 3-5 short, concrete, actionable suggestions to improve them. Return ONLY a numbered list.",
};

export function buildPromptContext({ title, description, bodyText }: AiPromptContext): string {
  const truncatedBody = (bodyText || '').slice(0, AI_LIMITS.MAX_CONTEXT_BODY_LENGTH);
  return `Title: ${title || '(untitled)'}\nExcerpt: ${description || '(none)'}\nBody:\n${truncatedBody}`;
}

/** Only for the four original text tasks — research/inline_draft/review have their own builders. */
export function buildTaskPrompt(task: AiTask, context: AiPromptContext): string {
  const lead = TASK_PROMPTS[task];
  if (!lead) throw new CmsBadRequestError(`No generic prompt template for task "${task}"`);
  return `${lead}\n\n${buildPromptContext(context)}`;
}

/**
 * `research`: topic & angle ideation for a personal tech/minimalist blog.
 * Works from an explicit topic when there's no draft yet, or from the
 * current title/body when refining an existing one.
 */
export function buildResearchPrompt(request: AiGenerateRequest): string {
  const seed = request.topic?.trim()
    ? `Topic: ${request.topic.trim()}`
    : buildPromptContext(request);
  return [
    'You write for a personal, minimalist tech blog. Given the seed below,',
    'propose exactly 5 distinct angles a writer could take.',
    '',
    'Respond with ONLY a JSON array (no markdown fences, no commentary),',
    'each element shaped exactly as:',
    '{"angle": string, "audience": string, "hook": string}',
    '- angle: the specific take or thesis',
    '- audience: who this angle is most relevant to',
    '- hook: one sentence a reader would see first',
    '',
    seed,
  ].join('\n');
}

/**
 * `inline_draft`: context-aware continuation. When text is selected, expand
 * or rework just that selection; otherwise continue from where the body ends.
 */
export function buildInlineDraftPrompt(request: AiGenerateRequest): string {
  const context = buildPromptContext(request);
  if (request.selectedText?.trim()) {
    return [
      'You are a co-writing assistant embedded in a Markdown editor.',
      'Expand or rework ONLY the selected text below to fit the surrounding',
      "article's tone. Return ONLY the replacement Markdown text for that",
      'selection, nothing else — no preamble, no explanation.',
      '',
      context,
      '',
      `Selected text:\n${request.selectedText.trim()}`,
    ].join('\n');
  }
  return [
    'You are a co-writing assistant embedded in a Markdown editor.',
    "Continue the article below in the author's voice for one to three",
    'more paragraphs. Return ONLY the new Markdown text to append, nothing',
    'else — no preamble, no explanation, no repetition of existing text.',
    '',
    context,
  ].join('\n');
}

/**
 * `review`: proofreading + SEO + reference audit, returned as strict JSON so
 * the editor can render a checklist instead of a wall of prose.
 */
export function buildReviewPrompt(request: AiGenerateRequest): string {
  const tags = request.tags?.length ? request.tags.join(', ') : '(none)';
  return [
    'You are an editor reviewing a blog post before publish. Check spelling',
    '/grammar (Thai and English as appropriate), flag any factual claims that',
    'read like they need a citation, and score the SEO basics.',
    '',
    'Respond with ONLY JSON (no markdown fences, no commentary) shaped',
    'exactly as:',
    '{',
    '  "grammar": string[],',
    '  "missingReferences": string[],',
    '  "seo": {',
    '    "score": number (0-100),',
    '    "titleLengthOk": boolean (title should be under 60 characters),',
    '    "excerptLengthOk": boolean (excerpt should be under 160 characters),',
    '    "hasHeadings": boolean (body should contain at least one heading),',
    '    "keywordSuggestions": string[]',
    '  }',
    '}',
    '',
    `Title (${request.title?.length ?? 0} chars): ${request.title || '(untitled)'}`,
    `Excerpt (${request.description?.length ?? 0} chars): ${request.description || '(none)'}`,
    `Tags: ${tags}`,
    `Body:\n${(request.bodyText || '').slice(0, AI_LIMITS.MAX_CONTEXT_BODY_LENGTH)}`,
  ].join('\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Provider text often wraps JSON in ```json fences despite instructions not to. */
function extractJsonPayload(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(candidate);
  } catch (error) {
    throw new AiProviderRequestError('AI response was not valid JSON', { cause: error });
  }
}

function parseResearchResponse(text: string): AiResearchIdea[] {
  const payload = extractJsonPayload(text);
  if (!Array.isArray(payload)) {
    throw new AiProviderRequestError('AI research response must be a JSON array');
  }
  return payload.map((entry, index) => {
    if (
      !isRecord(entry) ||
      typeof entry.angle !== 'string' ||
      typeof entry.audience !== 'string' ||
      typeof entry.hook !== 'string'
    ) {
      throw new AiProviderRequestError(`AI research response entry ${index} is malformed`);
    }
    return { angle: entry.angle, audience: entry.audience, hook: entry.hook };
  });
}

function parseReviewResponse(text: string): AiReviewReport {
  const payload = extractJsonPayload(text);
  if (!isRecord(payload) || !isRecord(payload.seo)) {
    throw new AiProviderRequestError('AI review response is malformed');
  }
  const grammar = Array.isArray(payload.grammar) ? payload.grammar.filter((v): v is string => typeof v === 'string') : [];
  const missingReferences = Array.isArray(payload.missingReferences)
    ? payload.missingReferences.filter((v): v is string => typeof v === 'string')
    : [];
  const seo = payload.seo;
  const keywordSuggestions = Array.isArray(seo.keywordSuggestions)
    ? seo.keywordSuggestions.filter((v): v is string => typeof v === 'string')
    : [];
  return {
    grammar,
    missingReferences,
    seo: {
      score: typeof seo.score === 'number' ? Math.max(0, Math.min(100, seo.score)) : 0,
      titleLengthOk: seo.titleLengthOk === true,
      excerptLengthOk: seo.excerptLengthOk === true,
      hasHeadings: seo.hasHeadings === true,
      keywordSuggestions,
    },
  };
}

export function parseAiGenerateRequest(raw: unknown): AiGenerateRequest {
  if (!isRecord(raw)) {
    throw new CmsBadRequestError('Request body must be a JSON object');
  }

  const task = raw.task;
  if (typeof task !== 'string' || !(AI_TASKS as readonly string[]).includes(task)) {
    throw new CmsBadRequestError('Unknown task');
  }

  const provider = raw.provider;
  if (typeof provider !== 'string' || !(AI_PROVIDERS as readonly string[]).includes(provider)) {
    throw new CmsBadRequestError('Unknown provider');
  }

  let model: string | undefined;
  if ('model' in raw && raw.model !== undefined) {
    if (
      typeof raw.model !== 'string' ||
      raw.model.length < 1 ||
      raw.model.length > AI_LIMITS.MAX_MODEL_LENGTH ||
      !AI_LIMITS.MODEL_PATTERN.test(raw.model)
    ) {
      throw new CmsBadRequestError('Invalid model');
    }
    model = raw.model;
  }

  let title: string | undefined;
  if ('title' in raw && raw.title !== undefined) {
    if (typeof raw.title !== 'string' || raw.title.length > AI_LIMITS.MAX_TITLE_LENGTH) {
      throw new CmsBadRequestError('Invalid title');
    }
    title = raw.title;
  }

  let description: string | undefined;
  if ('description' in raw && raw.description !== undefined) {
    if (
      typeof raw.description !== 'string' ||
      raw.description.length > AI_LIMITS.MAX_DESCRIPTION_LENGTH
    ) {
      throw new CmsBadRequestError('Invalid description');
    }
    description = raw.description;
  }

  let bodyText: string | undefined;
  if ('bodyText' in raw && raw.bodyText !== undefined) {
    if (typeof raw.bodyText !== 'string' || raw.bodyText.length > AI_LIMITS.MAX_BODY_TEXT_LENGTH) {
      throw new CmsBadRequestError('Invalid bodyText');
    }
    bodyText = raw.bodyText;
  }

  let topic: string | undefined;
  if ('topic' in raw && raw.topic !== undefined) {
    if (typeof raw.topic !== 'string' || raw.topic.length > AI_LIMITS.MAX_TOPIC_LENGTH) {
      throw new CmsBadRequestError('Invalid topic');
    }
    topic = raw.topic;
  }

  let selectedText: string | undefined;
  if ('selectedText' in raw && raw.selectedText !== undefined) {
    if (
      typeof raw.selectedText !== 'string' ||
      raw.selectedText.length > AI_LIMITS.MAX_SELECTED_TEXT_LENGTH
    ) {
      throw new CmsBadRequestError('Invalid selectedText');
    }
    selectedText = raw.selectedText;
  }

  let tags: string[] | undefined;
  if ('tags' in raw && raw.tags !== undefined) {
    if (
      !Array.isArray(raw.tags) ||
      raw.tags.length > AI_LIMITS.MAX_TAGS ||
      raw.tags.some((tag) => typeof tag !== 'string' || tag.length > AI_LIMITS.MAX_TAG_LENGTH)
    ) {
      throw new CmsBadRequestError('Invalid tags');
    }
    tags = raw.tags as string[];
  }

  return {
    task: task as AiTask,
    provider: provider as AiProvider,
    model,
    title,
    description,
    bodyText,
    topic,
    selectedText,
    tags,
  };
}

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

async function runCloudflare(
  env: AiWorkerEnvironment,
  model: string,
  prompt: string,
): Promise<string> {
  if (!env.AI) throw new AiProviderConfigError('Provider configuration missing');
  try {
    const result = await env.AI.run(model, {
      messages: [{ role: 'user', content: prompt }],
    });
    if (typeof result?.response !== 'string') {
      throw new AiProviderRequestError('AI request failed');
    }
    return result.response;
  } catch (error) {
    if (error instanceof CmsError) throw error;
    throw new AiProviderRequestError('AI request failed', { cause: error });
  }
}

async function runGemini(
  apiKey: string,
  model: string,
  prompt: string,
  fetcher: typeof fetch,
): Promise<string> {
  let response: Response;
  try {
    response = await fetcher(
      `${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    );
  } catch (error) {
    throw new AiProviderRequestError('AI request failed', { cause: error });
  }
  if (!response.ok) {
    throw new AiProviderRequestError('AI request failed', {
      cause: `Gemini returned HTTP ${response.status}`,
    });
  }
  const payload: unknown = await response.json().catch(() => null);
  const text = isRecord(payload)
    ? (payload.candidates as unknown[] | undefined)?.[0]
    : undefined;
  const candidate = Array.isArray(text) || isRecord(text) ? text : undefined;
  const content = isRecord(candidate) ? candidate.content : undefined;
  const parts = isRecord(content) && Array.isArray(content.parts) ? content.parts : undefined;
  const firstPart = parts?.[0];
  const resultText = isRecord(firstPart) ? optionalString(firstPart.text) : undefined;
  if (typeof resultText !== 'string') {
    throw new AiProviderRequestError('AI request failed');
  }
  return resultText;
}

async function runOpenRouter(
  apiKey: string,
  model: string,
  prompt: string,
  fetcher: typeof fetch,
): Promise<string> {
  let response: Response;
  try {
    response = await fetcher(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (error) {
    throw new AiProviderRequestError('AI request failed', { cause: error });
  }
  if (!response.ok) {
    throw new AiProviderRequestError('AI request failed', {
      cause: `OpenRouter returned HTTP ${response.status}`,
    });
  }
  const payload: unknown = await response.json().catch(() => null);
  const choices = isRecord(payload) && Array.isArray(payload.choices) ? payload.choices : undefined;
  const firstChoice = choices?.[0];
  const message = isRecord(firstChoice) ? firstChoice.message : undefined;
  const content = isRecord(message) ? optionalString(message.content) : undefined;
  if (typeof content !== 'string') {
    throw new AiProviderRequestError('AI request failed');
  }
  return content;
}

/**
 * BYOK first: an author-configured key in `ai_provider_configs` wins over
 * the Worker's own env secret, which stays as a fallback for continuity
 * (e.g. mid-migration, or a shared/default key the operator still wants
 * available). Cloudflare has no key at all — it runs on the deployed
 * Worker's own account-level AI binding.
 */
async function resolveProviderApiKey(
  db: CmsDatabase | undefined,
  env: AiWorkerEnvironment,
  provider: AiProvider,
): Promise<string | null> {
  if (db) {
    const config = await getAiProviderConfigForUse(db, provider).catch(() => null);
    if (config?.apiKey?.trim()) return config.apiKey.trim();
  }
  if (provider === 'gemini') return env.GEMINI_API_KEY?.trim() || null;
  if (provider === 'openrouter') return env.OPENROUTER_API_KEY?.trim() || null;
  return null;
}

async function runProvider(
  provider: AiProvider,
  env: AiGenerateEnvironment,
  db: CmsDatabase | undefined,
  model: string,
  prompt: string,
): Promise<string> {
  const fetcher = env.fetcher ?? fetch;
  switch (provider) {
    case 'cloudflare':
      return runCloudflare(env, model, prompt);
    case 'gemini': {
      const apiKey = await resolveProviderApiKey(db, env, provider);
      if (!apiKey) throw new AiProviderConfigError('Provider configuration missing');
      return runGemini(apiKey, model, prompt, fetcher);
    }
    case 'openrouter': {
      const apiKey = await resolveProviderApiKey(db, env, provider);
      if (!apiKey) throw new AiProviderConfigError('Provider configuration missing');
      return runOpenRouter(apiKey, model, prompt, fetcher);
    }
  }
}

export async function generateAiResult(
  request: AiGenerateRequest,
  env: AiGenerateEnvironment,
  db?: CmsDatabase,
): Promise<AiGenerateSuccessResponse['result']> {
  const model = request.model || DEFAULT_AI_MODELS[request.provider];

  if (request.task === 'research') {
    const text = await runProvider(request.provider, env, db, model, buildResearchPrompt(request));
    return parseResearchResponse(text);
  }

  if (request.task === 'review') {
    const text = await runProvider(request.provider, env, db, model, buildReviewPrompt(request));
    return parseReviewResponse(text);
  }

  if (request.task === 'inline_draft') {
    return runProvider(request.provider, env, db, model, buildInlineDraftPrompt(request));
  }

  const prompt = buildTaskPrompt(request.task, {
    title: request.title,
    description: request.description,
    bodyText: request.bodyText,
  });
  return runProvider(request.provider, env, db, model, prompt);
}

/**
 * Live model discovery for the BYOK settings page — given an author-supplied
 * key, list what that provider actually offers so they pick from reality
 * instead of typing a model ID by hand. Cloudflare has no discovery step: it
 * runs on the Worker's own AI binding with a fixed catalogue, so its config
 * page skips this entirely.
 *
 * Each result also carries a derived `vendor` (for the Settings popup's
 * vendor filter, since both providers namespace ids as `vendor/model`), a
 * `short` display label, and a best-effort `capability`. OpenRouter's
 * response includes real `architecture.modality` metadata, so its capability
 * tag is authoritative; Gemini's API has no equivalent field, so its models
 * are all tagged `text` here (this app only ever calls `generateContent`).
 */

async function listGeminiModels(apiKey: string, fetcher: typeof fetch): Promise<AiDiscoveredModel[]> {
  let response: Response;
  try {
    response = await fetcher(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}&pageSize=1000`, {
      method: 'GET',
    });
  } catch (error) {
    throw new AiProviderRequestError('Failed to list Gemini models', { cause: error });
  }
  if (!response.ok) {
    throw new AiProviderRequestError('Failed to list Gemini models', {
      cause: `Gemini returned HTTP ${response.status}`,
    });
  }
  const payload: unknown = await response.json().catch(() => null);
  const models = isRecord(payload) && Array.isArray(payload.models) ? payload.models : [];
  const result: AiDiscoveredModel[] = [];
  for (const entry of models) {
    if (!isRecord(entry)) continue;
    const methods = Array.isArray(entry.supportedGenerationMethods) ? entry.supportedGenerationMethods : [];
    if (!methods.includes('generateContent')) continue;
    const name = optionalString(entry.name);
    if (!name) continue;
    const id = name.replace(/^models\//, '');
    const label = optionalString(entry.displayName) || id;
    const vendor = deriveVendor('gemini', id);
    result.push({ id, label, vendor, short: deriveShortLabel(vendor, label), capability: 'text' });
  }
  return result;
}

async function listOpenRouterModels(fetcher: typeof fetch): Promise<AiDiscoveredModel[]> {
  let response: Response;
  try {
    response = await fetcher('https://openrouter.ai/api/v1/models', { method: 'GET' });
  } catch (error) {
    throw new AiProviderRequestError('Failed to list OpenRouter models', { cause: error });
  }
  if (!response.ok) {
    throw new AiProviderRequestError('Failed to list OpenRouter models', {
      cause: `OpenRouter returned HTTP ${response.status}`,
    });
  }
  const payload: unknown = await response.json().catch(() => null);
  const data = isRecord(payload) && Array.isArray(payload.data) ? payload.data : [];
  const result: AiDiscoveredModel[] = [];
  for (const entry of data) {
    if (!isRecord(entry)) continue;
    const id = optionalString(entry.id);
    if (!id) continue;
    const label = optionalString(entry.name) || id;
    const vendor = deriveVendor('openrouter', id);
    const architecture = isRecord(entry.architecture) ? entry.architecture : undefined;
    const modality = architecture ? optionalString(architecture.modality) : undefined;
    const capability = modality?.includes('image') ? 'text-image' : 'text';
    result.push({ id, label, vendor, short: deriveShortLabel(vendor, label), capability });
  }
  return result;
}

/**
 * Dispatches live discovery for the given provider. `apiKey` is required for
 * gemini (the ListModels call is keyed) but ignored for openrouter (its
 * model catalogue is public) and unsupported for cloudflare.
 */
export async function discoverProviderModels(
  provider: AiProvider,
  apiKey: string | null,
  fetcher: typeof fetch = fetch,
): Promise<AiDiscoveredModel[]> {
  switch (provider) {
    case 'gemini':
      if (!apiKey?.trim()) throw new CmsBadRequestError('An API key is required to list Gemini models');
      return listGeminiModels(apiKey.trim(), fetcher);
    case 'openrouter':
      return listOpenRouterModels(fetcher);
    case 'cloudflare':
      throw new CmsBadRequestError('Cloudflare Workers AI models are not discovered live');
  }
}

/**
 * Verifies a newly-typed API key actually works before it gets persisted, so
 * a typo or a revoked key is caught immediately with a clear error instead of
 * silently saving something that will only fail later, mid-generation, in
 * the editor. Gemini's own `ListModels` call is inherently keyed, so listing
 * doubles as the test; OpenRouter's model catalogue is public and ignores the
 * key entirely, so it needs its own auth-key-info check instead.
 */
export async function validateProviderApiKey(
  provider: AiProvider,
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  switch (provider) {
    case 'gemini':
      await listGeminiModels(apiKey, fetcher);
      return;
    case 'openrouter': {
      let response: Response;
      try {
        response = await fetcher('https://openrouter.ai/api/v1/auth/key', {
          method: 'GET',
          headers: { authorization: `Bearer ${apiKey}` },
        });
      } catch (error) {
        throw new AiProviderRequestError('Failed to verify this OpenRouter API key', { cause: error });
      }
      if (!response.ok) {
        throw new AiProviderRequestError('OpenRouter rejected this API key', {
          cause: `OpenRouter returned HTTP ${response.status}`,
        });
      }
      return;
    }
    case 'cloudflare':
      return;
  }
}