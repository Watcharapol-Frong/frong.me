import assert from 'node:assert/strict';
import test from 'node:test';

import { ALL as allAi, POST as generateAi } from '../../src/pages/earth/api/ai/generate.ts';
import {
  buildPromptContext,
  buildTaskPrompt,
  generateAiResult,
  parseAiGenerateRequest,
  resolveAiEnvironment,
} from '../../src/server/cms/ai.ts';
import { AI_TASKS } from '../../src/types/ai.ts';

function aiContext(env: Record<string, unknown>, request: Request) {
  return { request, locals: { env } } as never;
}

function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://cms.test/earth/api/ai/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
    body: JSON.stringify(body),
  });
}

async function body(response: Response): Promise<any> {
  return response.json();
}

const VALID_REQUEST = {
  task: 'title-suggestions',
  provider: 'cloudflare',
  title: 'Thai macroeconomics',
  description: 'Household debt analysis',
  bodyText: 'Article body text',
};

test('buildPromptContext truncates body and fills missing fields', () => {
  const context = buildPromptContext({
    title: 'T',
    description: undefined,
    bodyText: 'x'.repeat(7000),
  });
  assert.match(context, /^Title: T\nExcerpt: \(none\)\nBody:\n/);
  const bodyPart = context.split('Body:\n')[1];
  assert.equal(bodyPart.length, 6000);

  const emptyContext = buildPromptContext({});
  assert.equal(emptyContext, 'Title: (untitled)\nExcerpt: (none)\nBody:\n');
});

test('buildTaskPrompt embeds the exact spec template for each task', () => {
  const tasksExpected: Record<(typeof AI_TASKS)[number], RegExp> = {
    'title-suggestions':
      /^You are an editor helping title a blog article\. Based on the article below, suggest 5 alternative titles\. Return ONLY a numbered list, one title per line, no extra commentary\./,
    'auto-excerpt':
      /^Write a single, compelling excerpt\/meta description for this article, maximum 160 characters\. Return ONLY the excerpt text, nothing else\./,
    'generate-outline':
      /^Propose an outline of 4-7 H2 section headings for this article\. Return ONLY a numbered list of headings, no extra commentary\./,
    'seo-optimizer':
      /^Review this article's title and excerpt for SEO\. Give 3-5 short, concrete, actionable suggestions to improve them\. Return ONLY a numbered list\./,
  };

  for (const [task, pattern] of Object.entries(tasksExpected)) {
    const prompt = buildTaskPrompt(task as (typeof AI_TASKS)[number], { title: 'T' });
    assert.match(prompt, pattern, `Failed for task ${task}`);
    assert.match(prompt, /Title: T\nExcerpt: \(none\)/);
  }
});

test('parseAiGenerateRequest rejects non-object, unknown task, provider, model, and oversized fields', () => {
  assert.throws(() => parseAiGenerateRequest(null), /Request body must be a JSON object/);
  assert.throws(() => parseAiGenerateRequest([]), /Request body must be a JSON object/);
  assert.throws(() => parseAiGenerateRequest('string'), /Request body must be a JSON object/);
  assert.throws(() => parseAiGenerateRequest({ ...VALID_REQUEST, task: 'nope' }), /Unknown task/);
  assert.throws(
    parseAiGenerateRequest.bind(null, { ...VALID_REQUEST, provider: 'anthropic' }),
    /Unknown provider/,
  );
  assert.throws(
    () => parseAiGenerateRequest({ ...VALID_REQUEST, model: 'bad model!' }),
    /Invalid model/,
  );
  assert.throws(
    () => parseAiGenerateRequest({ ...VALID_REQUEST, model: '' }),
    /Invalid model/,
  );
  assert.throws(
    () => parseAiGenerateRequest({ ...VALID_REQUEST, model: 123 }),
    /Invalid model/,
  );
  assert.throws(
    () => parseAiGenerateRequest({ ...VALID_REQUEST, model: 'm'.repeat(201) }),
    /Invalid model/,
  );
  assert.throws(
    () => parseAiGenerateRequest({ ...VALID_REQUEST, title: 123 }),
    /Invalid title/,
  );
  assert.throws(
    () => parseAiGenerateRequest({ ...VALID_REQUEST, title: 't'.repeat(501) }),
    /Invalid title/,
  );
  assert.throws(
    () => parseAiGenerateRequest({ ...VALID_REQUEST, description: 123 }),
    /Invalid description/,
  );
  assert.throws(
    () => parseAiGenerateRequest({ ...VALID_REQUEST, description: 'd'.repeat(2001) }),
    /Invalid description/,
  );
  assert.throws(
    () => parseAiGenerateRequest({ ...VALID_REQUEST, bodyText: 123 }),
    /Invalid bodyText/,
  );
  assert.throws(
    () => parseAiGenerateRequest({ ...VALID_REQUEST, bodyText: 'b'.repeat(12001) }),
    /Invalid bodyText/,
  );

  const ok = parseAiGenerateRequest({ ...VALID_REQUEST, model: '@cf/meta/llama-3.1-8b-instruct-fp8' });
  assert.equal(ok.model, '@cf/meta/llama-3.1-8b-instruct-fp8');

  const minimal = parseAiGenerateRequest({ task: 'auto-excerpt', provider: 'gemini' });
  assert.equal(minimal.task, 'auto-excerpt');
  assert.equal(minimal.provider, 'gemini');
  assert.equal(minimal.model, undefined);
  assert.equal(minimal.title, undefined);
});

test('resolveAiEnvironment prefers injected locals.env', async () => {
  const injected = { GEMINI_API_KEY: 'test-key' };
  const env = await resolveAiEnvironment({ env: injected });
  assert.equal(env.GEMINI_API_KEY, 'test-key');
});

test('generate endpoint enforces method, content type, and size limits', async () => {
  const env = {};

  const wrongMethod = await generateAi(
    aiContext(env, new Request('https://cms.test/earth/api/ai/generate', { method: 'GET' })),
  );
  assert.equal(wrongMethod.status, 405);
  assert.equal((await body(wrongMethod)).error, 'Method not allowed');

  const allMethod = await allAi(
    aiContext(env, new Request('https://cms.test/earth/api/ai/generate', { method: 'PUT' })),
  );
  assert.equal(allMethod.status, 405);
  assert.equal((await body(allMethod)).error, 'Method not allowed');

  const wrongType = await generateAi(
    aiContext(
      env,
      new Request('https://cms.test/earth/api/ai/generate', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: 'hello',
      }),
    ),
  );
  assert.equal(wrongType.status, 415);
  assert.equal((await body(wrongType)).error, 'Content-Type must be application/json');

  const tooLarge = await generateAi(
    aiContext(
      env,
      new Request('https://cms.test/earth/api/ai/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': String(17 * 1024) },
        body: JSON.stringify(VALID_REQUEST),
      }),
    ),
  );
  assert.equal(tooLarge.status, 413);
  assert.equal((await body(tooLarge)).error, 'Request body too large');

  const malformed = await generateAi(
    aiContext(
      env,
      new Request('https://cms.test/earth/api/ai/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      }),
    ),
  );
  assert.equal(malformed.status, 400);
  assert.equal((await body(malformed)).error, 'Request body must be a JSON object');

  const nonObjectJson = await generateAi(
    aiContext(
      env,
      new Request('https://cms.test/earth/api/ai/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(['not', 'an', 'object']),
      }),
    ),
  );
  assert.equal(nonObjectJson.status, 400);
  assert.equal((await body(nonObjectJson)).error, 'Request body must be a JSON object');
});

test('generate endpoint validates schema and returns 400 with string error', async () => {
  const badTask = await generateAi(aiContext({}, jsonRequest({ task: 'nope', provider: 'cloudflare' })));
  assert.equal(badTask.status, 400);
  assert.equal((await body(badTask)).error, 'Unknown task');
  assert.equal(badTask.headers.get('cache-control'), 'no-store');
  assert.equal(badTask.headers.get('x-content-type-options'), 'nosniff');

  const badProvider = await generateAi(aiContext({}, jsonRequest({ task: 'auto-excerpt', provider: 'invalid' })));
  assert.equal(badProvider.status, 400);
  assert.equal((await body(badProvider)).error, 'Unknown provider');

  const badModel = await generateAi(aiContext({}, jsonRequest({ ...VALID_REQUEST, model: 'bad model!' })));
  assert.equal(badModel.status, 400);
  assert.equal((await body(badModel)).error, 'Invalid model');

  const badTitle = await generateAi(aiContext({}, jsonRequest({ ...VALID_REQUEST, title: 't'.repeat(501) })));
  assert.equal(badTitle.status, 400);
  assert.equal((await body(badTitle)).error, 'Invalid title');
});

test('generate endpoint fails closed with 500 when provider binding is missing', async () => {
  const response = await generateAi(aiContext({}, jsonRequest(VALID_REQUEST)));
  assert.equal(response.status, 500);
  assert.equal((await body(response)).error, 'Provider configuration missing');
});

test('generate endpoint returns 500 when provider API key is missing', async () => {
  for (const provider of ['gemini', 'openrouter']) {
    const response = await generateAi(
      aiContext({}, jsonRequest({ ...VALID_REQUEST, provider })),
    );
    assert.equal(response.status, 500, provider);
    assert.equal((await body(response)).error, 'Provider configuration missing', provider);
  }
});

test('generate endpoint runs cloudflare provider through the AI binding', async () => {
  const calls: Array<{ model: string; messages: unknown }> = [];
  const env = {
    AI: {
      run: async (model: string, inputs: { messages: unknown }) => {
        calls.push({ model, messages: inputs.messages });
        return { response: '1. Suggested Title' };
      },
    },
  };
  const response = await generateAi(aiContext(env, jsonRequest(VALID_REQUEST)));
  assert.equal(response.status, 200);
  assert.deepEqual(await body(response), { result: '1. Suggested Title' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, '@cf/meta/llama-3.1-8b-instruct-fp8');
  const messages = calls[0].messages as Array<{ role: string; content: string }>;
  assert.equal(messages[0].role, 'user');
  assert.match(messages[0].content, /suggest 5 alternative titles/);
});

test('generate endpoint runs cloudflare provider with custom model', async () => {
  const calls: Array<{ model: string }> = [];
  const env = {
    AI: {
      run: async (model: string) => {
        calls.push({ model });
        return { response: 'Cloudflare custom model response' };
      },
    },
  };
  const response = await generateAi(
    aiContext(env, jsonRequest({ ...VALID_REQUEST, model: '@cf/meta/llama-3.2-3b-instruct' })),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await body(response), { result: 'Cloudflare custom model response' });
  assert.equal(calls[0].model, '@cf/meta/llama-3.2-3b-instruct');
});

test('generate endpoint calls Gemini REST API with default and custom model', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  const env = {
    GEMINI_API_KEY: 'gemini-key',
    fetcher: async (url: string | URL, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'Gemini excerpt' }] } }],
        }),
        { status: 200 },
      );
    },
  };
  const response = await generateAi(
    aiContext(env, jsonRequest({ ...VALID_REQUEST, provider: 'gemini' })),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await body(response), { result: 'Gemini excerpt' });
  assert.match(capturedUrl, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.5-flash-lite:generateContent\?key=gemini-key$/);
  const payload = JSON.parse(String(capturedInit?.body));
  assert.equal(typeof payload.contents[0].parts[0].text, 'string');
  assert.match(payload.contents[0].parts[0].text, /Title: Thai macroeconomics/);

  // Custom model
  const customResponse = await generateAi(
    aiContext(env, jsonRequest({ ...VALID_REQUEST, provider: 'gemini', model: 'gemini-3.6-flash' })),
  );
  assert.equal(customResponse.status, 200);
  assert.match(capturedUrl, /models\/gemini-3\.6-flash:generateContent/);
});

test('generate endpoint calls OpenRouter REST API with default and custom model', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  const env = {
    OPENROUTER_API_KEY: 'or-key',
    fetcher: async (url: string | URL, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'OpenRouter result' } }] }),
        { status: 200 },
      );
    },
  };
  const response = await generateAi(
    aiContext(env, jsonRequest({ ...VALID_REQUEST, provider: 'openrouter' })),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await body(response), { result: 'OpenRouter result' });
  assert.equal(capturedUrl, 'https://openrouter.ai/api/v1/chat/completions');
  const headers = new Headers(capturedInit?.headers);
  assert.equal(headers.get('authorization'), 'Bearer or-key');
  const payload = JSON.parse(String(capturedInit?.body));
  assert.equal(payload.model, 'openai/gpt-4o-mini');
  assert.equal(payload.messages[0].role, 'user');

  // Custom model
  const customResponse = await generateAi(
    aiContext(env, jsonRequest({ ...VALID_REQUEST, provider: 'openrouter', model: 'anthropic/claude-3.5-haiku' })),
  );
  assert.equal(customResponse.status, 200);
  const customPayload = JSON.parse(String(capturedInit?.body));
  assert.equal(customPayload.model, 'anthropic/claude-3.5-haiku');
});

test('generate endpoint maps upstream provider failures to 502', async () => {
  const env = {
    OPENROUTER_API_KEY: 'or-key',
    fetcher: async () => new Response('upstream exploded', { status: 500 }),
  };
  const response = await generateAi(
    aiContext(env, jsonRequest({ ...VALID_REQUEST, provider: 'openrouter' })),
  );
  assert.equal(response.status, 502);
  assert.equal((await body(response)).error, 'AI request failed');

  const geminiFailEnv = {
    GEMINI_API_KEY: 'gemini-key',
    fetcher: async () => new Response('gemini error', { status: 503 }),
  };
  const geminiResponse = await generateAi(
    aiContext(geminiFailEnv, jsonRequest({ ...VALID_REQUEST, provider: 'gemini' })),
  );
  assert.equal(geminiResponse.status, 502);
  assert.equal((await body(geminiResponse)).error, 'AI request failed');
});

test('generateAiResult maps network errors to 502', async () => {
  const env = {
    GEMINI_API_KEY: 'gemini-key',
    fetcher: async () => {
      throw new Error('connection refused');
    },
  };
  await assert.rejects(
    () =>
      generateAiResult(
        parseAiGenerateRequest({ ...VALID_REQUEST, provider: 'gemini' }),
        env as never,
      ),
    /AI request failed/,
  );
});

test('generateAiResult handles empty or malformed provider responses with 502', async () => {
  const geminiEmptyEnv = {
    GEMINI_API_KEY: 'gemini-key',
    fetcher: async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 }),
  };
  await assert.rejects(
    () =>
      generateAiResult(
        parseAiGenerateRequest({ ...VALID_REQUEST, provider: 'gemini' }),
        geminiEmptyEnv as never,
      ),
    /AI request failed/,
  );

  const openRouterEmptyEnv = {
    OPENROUTER_API_KEY: 'or-key',
    fetcher: async () => new Response(JSON.stringify({ choices: [] }), { status: 200 }),
  };
  await assert.rejects(
    () =>
      generateAiResult(
        parseAiGenerateRequest({ ...VALID_REQUEST, provider: 'openrouter' }),
        openRouterEmptyEnv as never,
      ),
    /AI request failed/,
  );

  const cfMalformedEnv = {
    AI: {
      run: async () => ({ response: undefined as unknown as string }),
    },
  };
  await assert.rejects(
    () =>
      generateAiResult(
        parseAiGenerateRequest({ ...VALID_REQUEST, provider: 'cloudflare' }),
        cfMalformedEnv as never,
      ),
    /AI request failed/,
  );
});