import {
  AI_LIMITS,
  AI_PROVIDERS,
  AI_TASKS,
  DEFAULT_AI_MODELS,
  type AiGenerateRequest,
  type AiPromptContext,
  type AiProvider,
  type AiTask,
  type AiWorkerEnvironment,
} from './types/ai.ts';
import { CmsBadRequestError, CmsError } from './errors.ts';

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

const TASK_PROMPTS: Record<AiTask, string> = {
  'title-suggestions':
    'You are an editor helping title a blog article. Based on the article below, suggest 5 alternative titles. Return ONLY a numbered list, one title per line, no extra commentary.',
  'auto-excerpt':
    'Write a single, compelling excerpt/meta description for this article, maximum 160 characters. Return ONLY the excerpt text, nothing else.',
  'generate-outline':
    'Propose an outline of 4-7 H2 section headings for this article. Return ONLY a numbered list of headings, no extra commentary.',
  'seo-optimizer':
    "Review this article's title and excerpt for SEO. Give 3-5 short, concrete, actionable suggestions to improve them. Return ONLY a numbered list.",
};

export function buildPromptContext({ title, description, bodyText }: AiPromptContext): string {
  const truncatedBody = (bodyText || '').slice(0, AI_LIMITS.MAX_CONTEXT_BODY_LENGTH);
  return `Title: ${title || '(untitled)'}\nExcerpt: ${description || '(none)'}\nBody:\n${truncatedBody}`;
}

export function buildTaskPrompt(task: AiTask, context: AiPromptContext): string {
  return `${TASK_PROMPTS[task]}\n\n${buildPromptContext(context)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
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

  return { task, provider, model, title, description, bodyText };
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
  env: AiWorkerEnvironment,
  model: string,
  prompt: string,
  fetcher: typeof fetch,
): Promise<string> {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new AiProviderConfigError('Provider configuration missing');
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
  env: AiWorkerEnvironment,
  model: string,
  prompt: string,
  fetcher: typeof fetch,
): Promise<string> {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new AiProviderConfigError('Provider configuration missing');
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

export async function generateAiResult(
  request: AiGenerateRequest,
  env: AiWorkerEnvironment,
): Promise<string> {
  const model = request.model || DEFAULT_AI_MODELS[request.provider];
  const prompt = buildTaskPrompt(request.task, {
    title: request.title,
    description: request.description,
    bodyText: request.bodyText,
  });
  const fetcher = env.fetcher ?? fetch;
  switch (request.provider) {
    case 'cloudflare':
      return runCloudflare(env, model, prompt);
    case 'gemini':
      return runGemini(env, model, prompt, fetcher);
    case 'openrouter':
      return runOpenRouter(env, model, prompt, fetcher);
  }
}