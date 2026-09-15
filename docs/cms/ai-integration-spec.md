# Embedded AI contract

The author UI calls same-origin `/earth/api/ai/generate` inside the main app.
Earth Access middleware protects generation and provider settings/discovery.
There is no standalone Worker dependency or browser shared-secret proxy.

| Concern | Source of truth |
| --- | --- |
| Providers, tasks, limits and shared types | `src/types/ai.ts` |
| Parsing, prompts and provider execution | `src/server/cms/ai.ts` |
| HTTP method, body-size guard and response headers | `src/pages/earth/api/ai/generate.ts` |
| Saved provider keys and models | `src/server/cms/repositories/ai-provider-configs.ts` |
| Author interaction | `src/components/earth/AiPanel.astro`, editor and settings UI |
| Regression coverage | `tests/cms/ai-*.test.ts` |

Requests validate task/provider/model and return text or structured suggestions.
Research is angle ideation, not a promise of web retrieval. Review is assistance,
not verified fact-checking. Authors choose what to apply; AI does not publish.

Cloudflare uses the main Worker's `AI` binding. Gemini/OpenRouter use server-side
calls with saved keys or environment fallbacks. Model IDs and limits belong in
code, not a duplicated list here. Discovery can fail independently of local tests.

## Security and operations

- Access validates signature, issuer, audience and time claims; membership is
  governed by the external Cloudflare Access policy.
- Settings reads expose whether a key exists, never its value.
- Saved keys occupy D1's `ai_provider_configs.api_key` column without
  application-level encryption. Restrict database/backup access.
- Never log or paste secrets, prompts or upstream responses into PRs.
- Tests stub providers; they do not verify live keys, availability or billing.
- Exercise remote AI only with an approved account.

Old remote Worker retirement is tracked in [the retirement record](../legacy-retirement.md).
