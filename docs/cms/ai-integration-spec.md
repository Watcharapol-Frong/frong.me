# AI Assistant Integration Specification (CMS Worker)

Updated: 2026-09-12 · Status: Specification & Interface Ready · Scope: CMS Worker Embedded AI Assistant

---

## 1. Overview & Architecture

This specification defines the migration and unification of the AI Assistant service from the legacy standalone Worker (`ai-assistant-worker`) directly into the main CMS Worker under the `/earth/api/ai/generate` endpoint.

### 1.1 Architectural Shift

| Dimension | Legacy Standalone Worker (`ai-assistant-worker`) | Embedded CMS Worker (`/earth/api/ai/generate`) |
|---|---|---|
| **Location** | Separate Worker (`ai-assistant-worker.frongbook.workers.dev`) | Built-in route in frong.me Worker (`src/pages/earth/api/ai/generate.ts`) |
| **Authentication** | Shared secret in `X-Auth-Secret` header | Cloudflare Access RS256 JWT assertion validated by Earth middleware |
| **CORS Surface** | Restricted to `https://frong.me` | Same-origin requests inside the CMS admin shell |
| **Secrets Management** | Individual Worker secrets in `ai-worker` | Unified Worker secrets/bindings in main CMS configuration |
| **Client Exposure** | Direct browser call required passing credentials or proxy | Pure same-origin calls authenticated by session cookie / Access JWT |

### 1.2 Security & Isolation Principles

1. **Defense-in-Depth Authentication**: All requests to `/earth/api/*` must pass through the `createEarthMiddleware` guard, validating Cloudflare Access RS256 JWT signature, audience (`CF_ACCESS_AUD`), issuer team domain, token expiry, and owner email whitelist.
2. **Zero Client-Side Credentials**: API keys (`GEMINI_API_KEY`, `OPENROUTER_API_KEY`) and bindings (`env.AI`) remain strictly server-side in the Worker runtime environment.
3. **Fail-Closed Strategy**: If credentials or bindings are unconfigured, requests fail immediately with descriptive status codes without exposing upstream error details or partial prompts.
4. **Strict Request Boundaries**: Payload sizes are capped at 16 KiB, and individual text fields enforce explicit character limits to protect against resource exhaustion and prompt bloating.
5. **Private Response Caching**: Responses mandate `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.

---

## 2. Supported Providers & Model Configurations

The service supports three AI providers with specified default models and runtime communication mechanisms:

| Provider Key | Provider Name | Default Model | Runtime Integration | Required Worker Binding / Secret |
|---|---|---|---|---|
| `cloudflare` | Cloudflare Workers AI | `@cf/meta/llama-3.1-8b-instruct-fp8` | Native Cloudflare Binding (`env.AI.run`) | `AI` (Workers AI Binding) |
| `gemini` | Google Gemini | `gemini-3.5-flash-lite` | REST API (`v1beta/models/{model}:generateContent`) | `GEMINI_API_KEY` (Secret) |
| `openrouter` | OpenRouter | `openai/gpt-4o-mini` | REST API (`/api/v1/chat/completions`) | `OPENROUTER_API_KEY` (Secret) |

### 2.1 Provider Execution Details

#### 1. Cloudflare Workers AI (`cloudflare`)
- **Default Model**: `@cf/meta/llama-3.1-8b-instruct-fp8`
- **Optional/Alternative Models**: `@cf/meta/llama-3.2-3b-instruct`
- **Binding Contract**:
  ```typescript
  const result = await env.AI.run(model || DEFAULT_AI_MODELS.cloudflare, {
    messages: [{ role: 'user', content: prompt }],
  });
  return result.response;
  ```

#### 2. Google Gemini (`gemini`)
- **Default Model**: `gemini-3.5-flash-lite`
- **Optional/Alternative Models**: `gemini-3.6-flash`, `gemini-3.1-pro-preview`
- **API Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_API_KEY}`
- **Payload Contract**:
  ```json
  {
    "contents": [
      {
        "parts": [{ "text": "<prompt>" }]
      }
    ]
  }
  ```
- **Response Extraction**: `candidates[0].content.parts[0].text`

#### 3. OpenRouter (`openrouter`)
- **Default Model**: `openai/gpt-4o-mini`
- **API Endpoint**: `https://openrouter.ai/api/v1/chat/completions`
- **Authentication**: `Authorization: Bearer {OPENROUTER_API_KEY}`
- **Payload Contract**:
  ```json
  {
    "model": "<model_id>",
    "messages": [
      { "role": "user", "content": "<prompt>" }
    ]
  }
  ```
- **Response Extraction**: `choices[0].message.content`

### 2.2 Model Identifier Validation

Custom model strings must comply with:
- Length: 1 to 200 characters.
- Character pattern: `/^[A-Za-z0-9@._:/-]+$/`

---

## 3. Tasks, Prompt Templates & Context Building

### 3.1 Context Builder

Before rendering the prompt, input fields are assembled into a standardized context block. To optimize latency, token usage, and prevent buffer overflow, the article body is truncated to 6,000 characters:

```typescript
function buildPromptContext({ title, description, bodyText }: AiPromptContext): string {
  const truncatedBody = (bodyText || '').slice(0, 6000);
  return `Title: ${title || '(untitled)'}\nExcerpt: ${description || '(none)'}\nBody:\n${truncatedBody}`;
}
```

### 3.2 Task Specifications & Prompt Templates

| Task Key | Display Label | Target Field | Purpose |
|---|---|---|---|
| `title-suggestions` | Title Suggestions | `title` | Suggest 5 alternative titles for editorial review |
| `auto-excerpt` | Auto Excerpt | `excerpt` / `description` | Generate a concise meta description (max 160 characters) |
| `generate-outline` | Generate Outline | Editor Draft | Propose 4–7 H2 section headings for article structuring |
| `seo-optimizer` | SEO Optimizer | Advisory | Provide 3–5 actionable suggestions to improve SEO |

---

#### Task 1: `title-suggestions`

- **Purpose**: Generates 5 compelling alternative titles for the article based on its content and excerpt.
- **Template**:
  ```text
  You are an editor helping title a blog article. Based on the article below, suggest 5 alternative titles. Return ONLY a numbered list, one title per line, no extra commentary.

  ${context}
  ```
- **Expected Output Format**:
  ```text
  1. Title Option One
  2. Title Option Two
  3. Title Option Three
  4. Title Option Four
  5. Title Option Five
  ```
- **Editor Application Logic**:
  The client parses the selected line, strips the numbering (`^\d+[.)]\s*`) and surrounding quotes, and patches the article title field.

---

#### Task 2: `auto-excerpt`

- **Purpose**: Produces an engaging summary / meta description under 160 characters.
- **Template**:
  ```text
  Write a single, compelling excerpt/meta description for this article, maximum 160 characters. Return ONLY the excerpt text, nothing else.

  ${context}
  ```
- **Expected Output Format**:
  ```text
  A concise, 1-2 sentence description summarizing key takeaways within 160 characters.
  ```
- **Editor Application Logic**:
  The client trims whitespace and updates the article `excerpt` field.

---

#### Task 3: `generate-outline`

- **Purpose**: Generates a high-level structure of section headings (H2) for planning or expanding content.
- **Template**:
  ```text
  Propose an outline of 4-7 H2 section headings for this article. Return ONLY a numbered list of headings, no extra commentary.

  ${context}
  ```
- **Expected Output Format**:
  ```text
  1. Introduction & Background
  2. Core Analytical Findings
  3. Impact Assessment
  4. Strategic Recommendations
  5. Conclusion
  ```
- **Editor Application Logic**:
  Displayed in the editor assistant drawer as reference material or copied directly into the Markdown canvas.

---

#### Task 4: `seo-optimizer`

- **Purpose**: Evaluates current title and excerpt against best SEO practices and outputs concrete improvement points.
- **Template**:
  ```text
  Review this article's title and excerpt for SEO. Give 3-5 short, concrete, actionable suggestions to improve them. Return ONLY a numbered list.

  ${context}
  ```
- **Expected Output Format**:
  ```text
  1. Include primary keyword near the beginning of the title.
  2. Specify the target demographic or geographic context in the excerpt.
  3. Add an active verb to improve click-through rate in search results.
  ```
- **Editor Application Logic**:
  Presented as an actionable checklist for the author to review.

---

## 4. Endpoint Contract: `POST /earth/api/ai/generate`

### 4.1 Request Details

- **Path**: `/earth/api/ai/generate`
- **Method**: `POST`
- **Protected By**: Cloudflare Access Middleware (`isEarthRoute`)
- **Headers**:
  - `Content-Type`: `application/json` (Required)
  - `Cf-Access-Jwt-Assertion`: Cloudflare Access JWT (Required in production staging/prod)

### 4.2 Request Constraints & Size Bounds

| Parameter / Field | Type | Required | Max Length / Limit | Validation Rule |
|---|---|---|---|---|
| `task` | String | Yes | — | Must be one of `['title-suggestions', 'auto-excerpt', 'generate-outline', 'seo-optimizer']` |
| `provider` | String | Yes | — | Must be one of `['cloudflare', 'gemini', 'openrouter']` |
| `model` | String | No | 200 chars | Matches `/^[A-Za-z0-9@._:/-]+$/`; defaults to provider default model if omitted |
| `title` | String | No | 500 chars | String |
| `description` | String | No | 2,000 chars | String |
| `bodyText` | String | No | 12,000 chars | String |
| **Payload Body** | Raw Bytes | Yes | 16 KiB (16,384 bytes) | Checked via `Content-Length` header and raw body byte length |

### 4.3 Request Schema (JSON Example)

```json
{
  "task": "title-suggestions",
  "provider": "cloudflare",
  "model": "@cf/meta/llama-3.1-8b-instruct-fp8",
  "title": "Understanding Macroeconomic Trends in Thailand",
  "description": "An analysis of household debt and monetary policy in 2026.",
  "bodyText": "Detailed article body content..."
}
```

### 4.4 Success Response (HTTP 200 OK)

- **Headers**:
  - `Content-Type`: `application/json; charset=utf-8`
  - `Cache-Control`: `no-store`
  - `X-Content-Type-Options`: `nosniff`
- **Body**:
  ```json
  {
    "result": "1. Macroeconomic Shifts in Thailand\n2. Thai Household Debt: 2026 Outlook\n..."
  }
  ```

### 4.5 Error Responses

| Status Code | Error Message / Reason | Cause |
|---|---|---|
| `400 Bad Request` | `{"error": "Request body must be a JSON object"}` | Malformed JSON or non-object root |
| `400 Bad Request` | `{"error": "Unknown task"}` | `task` not in allowed task list |
| `400 Bad Request` | `{"error": "Unknown provider"}` | `provider` not in allowed provider list |
| `400 Bad Request` | `{"error": "Invalid model"}` | `model` exceeds 200 chars or invalid characters |
| `400 Bad Request` | `{"error": "Invalid title"}` / `Invalid description` / `Invalid bodyText` | Field length exceeds limit |
| `401 Unauthorized` | `{"error": "Unauthorized"}` | Missing Cloudflare Access JWT |
| `403 Forbidden` | `{"error": "Forbidden"}` | Invalid Access JWT or email not permitted |
| `413 Payload Too Large` | `{"error": "Request body too large"}` | Request payload exceeds 16 KiB |
| `415 Unsupported Media Type` | `{"error": "Content-Type must be application/json"}` | Header is not `application/json` |
| `500 Internal Server Error` | `{"error": "Provider configuration missing"}` | Missing API key or binding on Worker |
| `502 Bad Gateway` | `{"error": "AI request failed"}` | Upstream model provider returned error or timeout |

---

## 5. Type System Reference

All TypeScript definitions for this specification are maintained in [`src/types/ai.ts`](../../src/types/ai.ts) and re-exported at [`src/server/cms/types/ai.ts`](../../src/server/cms/types/ai.ts).

### Key Interfaces

```typescript
export type AiTask =
  | 'title-suggestions'
  | 'auto-excerpt'
  | 'generate-outline'
  | 'seo-optimizer';

export type AiProvider = 'cloudflare' | 'gemini' | 'openrouter';

export interface AiGenerateRequest {
  task: AiTask;
  provider: AiProvider;
  model?: string;
  title?: string;
  description?: string;
  bodyText?: string;
}

export interface AiGenerateSuccessResponse {
  result: string;
}

export interface AiGenerateErrorResponse {
  error: string;
}

export type AiGenerateResponse =
  | AiGenerateSuccessResponse
  | AiGenerateErrorResponse;
```

---

## 6. Implementation Notes & Guidelines

1. **Isolation from Public Pages**: Public routes (`/articles/*`, `/`, `/rss.xml`) never invoke or import AI generation logic. AI generation is exclusive to the Earth admin UI.
2. **Human-in-the-Loop Verification**: Generated text is never committed directly to D1 without an explicit user action (e.g. clicking "Apply" or editing in the article form).
3. **Graceful Fallbacks**: In case of transient provider failures (HTTP 502), the editor UI should surface a non-blocking toast or banner, preserving existing draft content.

