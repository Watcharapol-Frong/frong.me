-- BYOK AI provider configuration: each provider the author has set up gets
-- one row here (their own API key, and 1-5 models they've chosen to make
-- available in the editor). Single-owner site, so one row per provider is
-- enough — no per-user scoping needed.
--
-- `api_key` is nullable: Cloudflare Workers AI runs on the deployed Worker's
-- own account-level AI binding, not a personal key, so that provider's row
-- never sets one.
CREATE TABLE ai_provider_configs (
  provider    TEXT PRIMARY KEY CHECK (provider IN ('gemini', 'cloudflare', 'openrouter')),
  api_key     TEXT,
  models      TEXT NOT NULL CHECK (json_valid(models) AND json_array_length(models) BETWEEN 1 AND 5),
  updated_at  INTEGER NOT NULL CHECK (updated_at >= 0)
);
