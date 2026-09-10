const ALLOWED_ORIGIN = "https://frong.me";
const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_MODEL_LENGTH = 200;
const ALLOWED_TASKS = new Set([
  "title-suggestions",
  "auto-excerpt",
  "generate-outline",
  "seo-optimizer",
]);
const ALLOWED_PROVIDERS = new Set(["cloudflare", "gemini", "openrouter"]);
const MODEL_PATTERN = /^[A-Za-z0-9@._:/-]+$/;

const DEFAULT_MODELS = {
  cloudflare: "@cf/meta/llama-3.1-8b-instruct-fp8",
  gemini: "gemini-3.5-flash-lite",
  openrouter: "openai/gpt-4o-mini",
};

function buildPrompt(task, { title, description, bodyText }) {
  const context = `Title: ${title || "(untitled)"}\nExcerpt: ${description || "(none)"}\nBody:\n${(bodyText || "").slice(0, 6000)}`;

  switch (task) {
    case "title-suggestions":
      return `You are an editor helping title a blog article. Based on the article below, suggest 5 alternative titles. Return ONLY a numbered list, one title per line, no extra commentary.\n\n${context}`;
    case "auto-excerpt":
      return `Write a single, compelling excerpt/meta description for this article, maximum 160 characters. Return ONLY the excerpt text, nothing else.\n\n${context}`;
    case "generate-outline":
      return `Propose an outline of 4-7 H2 section headings for this article. Return ONLY a numbered list of headings, no extra commentary.\n\n${context}`;
    case "seo-optimizer":
      return `Review this article's title and excerpt for SEO. Give 3-5 short, concrete, actionable suggestions to improve them. Return ONLY a numbered list.\n\n${context}`;
    default:
      throw new Error(`Unknown task: ${task}`);
  }
}

function corsHeaders(request) {
  if (request.headers.get("Origin") !== ALLOWED_ORIGIN) return {};

  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function isConfiguredSecret(secret) {
  return typeof secret === "string" && secret.length > 0;
}

async function secretsMatch(actual, expected) {
  if (typeof actual !== "string" || !isConfiguredSecret(expected)) return false;

  const encoder = new TextEncoder();
  const [actualDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(actual)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(actualDigest);
  const right = new Uint8Array(expectedDigest);
  let difference = 0;

  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }

  return difference === 0;
}

function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return "Request body must be a JSON object";
  }

  const { task, provider, model, title, description, bodyText } = input;
  if (!ALLOWED_TASKS.has(task)) return "Unknown task";
  if (!ALLOWED_PROVIDERS.has(provider)) return "Unknown provider";
  if (model !== undefined && (
    typeof model !== "string" ||
    model.length === 0 ||
    model.length > MAX_MODEL_LENGTH ||
    !MODEL_PATTERN.test(model)
  )) {
    return "Invalid model";
  }

  const fields = [
    ["title", title, 500],
    ["description", description, 2_000],
    ["bodyText", bodyText, 12_000],
  ];
  for (const [name, value, maximum] of fields) {
    if (value !== undefined && (typeof value !== "string" || value.length > maximum)) {
      return `Invalid ${name}`;
    }
  }

  return null;
}

async function runCloudflare(env, model, prompt) {
  const result = await env.AI.run(model || DEFAULT_MODELS.cloudflare, {
    messages: [{ role: "user", content: prompt }],
  });
  return result.response;
}

async function runGemini(env, model, prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model || DEFAULT_MODELS.gemini}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Gemini request failed");
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function runOpenRouter(env, model, prompt) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODELS.openrouter,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "OpenRouter request failed");
  return data.choices?.[0]?.message?.content ?? "";
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      if (request.headers.get("Origin") !== ALLOWED_ORIGIN) {
        return new Response(null, { status: 403, headers: { "Cache-Control": "no-store" } });
      }
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/generate" || request.method !== "POST") {
      return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    const origin = request.headers.get("Origin");
    if (origin !== null && origin !== ALLOWED_ORIGIN) {
      return jsonResponse(request, { error: "Origin not allowed" }, 403);
    }

    if (!isConfiguredSecret(env.AI_WORKER_SECRET)) {
      return jsonResponse(request, { error: "Service unavailable" }, 503);
    }

    const authenticated = await secretsMatch(
      request.headers.get("X-Auth-Secret"),
      env.AI_WORKER_SECRET,
    );
    if (!authenticated) {
      return jsonResponse(request, { error: "Unauthorized" }, 401);
    }

    const contentType = request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
    if (contentType !== "application/json") {
      return jsonResponse(request, { error: "Content-Type must be application/json" }, 415);
    }

    const declaredLength = Number(request.headers.get("Content-Length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
      return jsonResponse(request, { error: "Request body too large" }, 413);
    }

    try {
      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
        return jsonResponse(request, { error: "Request body too large" }, 413);
      }

      const input = JSON.parse(rawBody);
      const validationError = validateInput(input);
      if (validationError) return jsonResponse(request, { error: validationError }, 400);

      const { task, provider, model, title, description, bodyText } = input;
      const prompt = buildPrompt(task, { title, description, bodyText });

      let result;
      if (provider === "cloudflare") {
        result = await runCloudflare(env, model, prompt);
      } else if (provider === "gemini") {
        result = await runGemini(env, model, prompt);
      } else if (provider === "openrouter") {
        result = await runOpenRouter(env, model, prompt);
      } else {
        throw new Error(`Unknown provider: ${provider}`);
      }

      return jsonResponse(request, { result });
    } catch (err) {
      const message = err instanceof SyntaxError ? "Invalid JSON" : "AI request failed";
      console.error("AI request failed", err instanceof Error ? err.name : "Unknown error");
      return jsonResponse(request, { error: message }, err instanceof SyntaxError ? 400 : 502);
    }
  },
};
