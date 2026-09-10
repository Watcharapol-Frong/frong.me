# CMS Environment Map

Updated: 2026-09-10 UTC

Tasks: P0-03, Phase 0.5 configuration follow-up, and Phase 1 root configuration

This document records resource and secret names, ownership boundaries, and configuration locations. Never store secret values here.

## Environment separation

| Resource | Staging | Production | Owner / authoritative configuration | Current evidence |
|---|---|---|---|---|
| Main-site Worker | Prototype defined; remote resource still required | `frong.me`; Worker name/dashboard locator unknown | Cloudflare account and root `wrangler.jsonc` (Worker name `frong-me`, compatibility date 2026-09-10, `nodejs_compat`) | Isolated Phase 0.5 workerd build passes; the root config is used for D1 migrations only, and no staging or production cutover has occurred |
| AI Worker | A separate staging environment is recommended before future changes | Worker name `ai-assistant-worker`; URL `https://ai-assistant-worker.frongbook.workers.dev` | `ai-worker/wrangler.jsonc` plus Cloudflare Worker secrets | Production unauthenticated probe returned 401 with `no-store` on 2026-09-10 |
| CMS D1 | `portfolio-db-staging`, bound as `DB` with its database ID recorded in the root `wrangler.jsonc` | `portfolio-db` proposed; actual ID unknown | Root `wrangler.jsonc`, `migrations_dir: db/migrations` | Three migrations, the staging seed, and the verification script pass against local D1; no remote application or verification run is recorded |
| Private media R2 | Separate private bucket required | Name to decide | Main-site Wrangler config/Cloudflare dashboard | Not present |
| Public media R2/domain | Separate public bucket/domain required | `portfolio-images` proposed; actual locator unknown | Main-site Wrangler config/Cloudflare dashboard | Not present |
| Cloudflare Access | Staging application/audience required | `/earth` and `/earth/*`; team domain/AUD unknown | Cloudflare Zero Trust | Worker-side JWT/owner/Origin behavior proven locally; remote Access application unavailable |
| GitHub repository | Same repository with protected `cms-staging` environment | `Watcharapol-Frong/frong.me`, default branch `main` | GitHub repository settings and `.github/workflows/cms-staging-deploy.yml` | Workflow and payload validated locally; real dispatch/token permissions unverified |
| Backup destination | Separate private test destination required | Off-production-account or encrypted offline destination required | Backup runbook created in Phase 1 | Not selected |

Do not reuse staging databases, buckets, Access audience values, or deployment secrets in production. Cloudflare secrets are environment-specific and must be configured separately.

## Bindings and secrets

| Name | Used by | Storage location | Minimum purpose | Current status |
|---|---|---|---|---|
| `AI` | AI Worker | Wrangler AI binding | Cloudflare Workers AI provider | Declared in `ai-worker/wrangler.jsonc` |
| `AI_WORKER_SECRET` | AI Worker and future authenticated admin proxy | Cloudflare Worker secret; local `ai-worker/.dev.vars`; proxy secret store | Authenticate server-to-server calls | Owner confirmed production configuration; value is unavailable and never recorded in this repository |
| `GEMINI_API_KEY` | AI Worker, optional | Cloudflare Worker secret | Gemini provider calls | Optional/unverified |
| `OPENROUTER_API_KEY` | AI Worker, optional | Cloudflare Worker secret | OpenRouter provider calls | Optional/unverified |
| `DB` | Root Wrangler config and the future main-site Worker | Per-environment D1 binding | Runtime CMS access and migration application | Declared in the root `wrangler.jsonc` against `portfolio-db-staging`; exercised locally through Wrangler and the test adapter. A production binding is still undefined |
| Private/public R2 binding names | Future main-site Worker | Per-environment R2 bindings | Draft and published media | Phase 1 names to decide after prototype |
| `CF_ACCOUNT_ID` | Build/CI, `scripts/build/export-live-snapshot.mjs`, `scripts/db/verify-staging.mjs` | GitHub environment secret or protected CI configuration; local `.env` for the scripts | Identify Cloudflare account | Names listed in `.env.example`; no value recorded here |
| `CF_D1_DATABASE_ID`, `CF_D1_DATABASE_NAME` | Build/CI and the same two scripts | GitHub environment secret/variable or protected CI configuration | Identify the environment's D1 database | Names listed in `.env.example`; no value recorded here |
| `CF_D1_READ_TOKEN` | Build/CI and the same two scripts | GitHub `cms-staging` environment secret | Read approved release snapshots and run read-only verification queries | Contract proven with a stub and unit tests; real restricted token not recorded here |
| `CF_DEPLOY_TOKEN` | Deploy workflow | GitHub `cms-staging` environment secret | Deploy the staging main-site Worker | Separate from D1 read access; real token unset |
| `GITHUB_DISPATCH_TOKEN` | Future admin server | Cloudflare secret | Trigger the repository's publish workflow | Unset; use a repository-scoped token with only required dispatch permission |
| `GITHUB_REPO` | Future admin server | Non-secret environment variable | Dispatch target, expected `Watcharapol-Frong/frong.me` | Unset; the old `Watcharapol-Frong/portfolio` value must not be reused |
| `CF_ACCESS_TEAM_DOMAIN` | Main-site Worker | GitHub environment variable / Worker variable | JWT issuer/JWKS location | Name and validation proven; staging value unset |
| `CF_ACCESS_AUD` | Main-site Worker | GitHub environment secret / Worker secret | Validate the `aud` claim | Name and validation proven; staging value unset |
| `CF_ACCESS_ALLOWED_EMAIL` | Main-site Worker | GitHub environment secret / Worker secret | Enforce owner authorization | Name and validation proven; staging value unset |
| `CMS_SITE_ORIGIN` | Main-site Worker | GitHub environment variable / Worker variable | Exact mutation Origin allowlist | Name and validation proven; staging value unset |
| `ENCRYPTION_KEY` | Future BYOK service | Cloudflare secret | Encrypt provider API keys | Phase 4; do not provision now |
| `TURNSTILE_SECRET_KEY`, `PUBLIC_TURNSTILE_SITE_KEY`, email-provider key | Newsletter | Cloudflare secret/public configuration as appropriate | Newsletter protection/delivery | Phase 3; do not provision now |

Use `.dev.vars` for local Worker secrets and never commit it. `ai-worker/.dev.vars.example` lists names only. The current `.gitignore` excludes `.dev.vars` and `.wrangler/`.

## Required access for CMS staging and future production

1. A protected GitHub `cms-staging` environment containing the variables and secrets listed in [`architecture-spike.md`](architecture-spike.md).
2. Valid GitHub authorization to send `repository_dispatch`. The current shell token is invalid; no token value belongs in documentation or committed configuration. Use the current repository name `Watcharapol-Frong/frong.me`: git pushes to the old `portfolio` path still follow GitHub's redirect, but the REST API answers `301 Moved Permanently` and does not follow it for you, so a dispatch sent to the old path fails.
3. Isolated staging Worker, D1, and Access resources with owners and dashboard locators. Do not reuse production resource IDs.
4. Separate D1 Read and Worker deploy credentials with only the permissions their workflow steps require.
5. Named owners and dashboard locators for future production D1, R2, Access, and backup storage before those phases use them.

## CMS database commands

The root `wrangler.jsonc` binds `DB` to the staging database `portfolio-db-staging` and reads versioned migrations from `db/migrations/`. Run everything against local D1 first; `--remote` touches the real staging database.

```sh
npm run test:cms
npx wrangler d1 migrations list DB --local
npx wrangler d1 migrations apply DB --local
npx wrangler d1 execute DB --local --file db/seeds/staging.sql
node scripts/db/verify-staging.mjs --wrangler --local
```

`db/seeds/staging.sql` is deterministic and idempotent, so repeated execution neither errors nor violates the immutability triggers. `scripts/db/verify-staging.mjs` checks foreign keys and the partial indexes `idx_one_cover_per_post`, `idx_one_active_release`, and `idx_release_visible_routes`. It also accepts `--http` for the Cloudflare D1 HTTP API using `CF_ACCOUNT_ID`, `CF_D1_DATABASE_ID`, and `CF_D1_READ_TOKEN`, and `--sqlite <path>` for a local file.

`scripts/build/export-live-snapshot.mjs` writes the validated live release snapshot to `.cache/cms-live-snapshot.json`, or to `CMS_SNAPSHOT_PATH`. It prefers the D1 HTTP API when the read credentials are present, falls back to local D1 state, and accepts `--mock` for a fixture snapshot when no database is connected. `.cache/` and `.wrangler/` are ignored by git.

Copy `.env.example` for variable names only. Never commit `.env`, and never record credential values in this document.

## Local and production verification commands

Install and run the non-billable automated tests:

```sh
cd ai-worker
npm ci
npm test
```

Validate the bundle without deploying:

```sh
cd ai-worker
XDG_CONFIG_HOME=/tmp/frong-wrangler-config \
  npx wrangler deploy --dry-run --outdir /tmp/frong-ai-worker-dry-run
```

For local curl checks, copy the names-only example to the ignored local file, replace the test value, and start the Worker. Workers AI is not invoked by the rejection checks:

```sh
cd ai-worker
cp .dev.vars.example .dev.vars
npx wrangler dev --local --port 8787
```

In another terminal, expect 401, 401, 204, and 403 respectively:

```sh
curl -i -X POST http://127.0.0.1:8787/generate \
  -H 'Content-Type: application/json' \
  --data '{"task":"auto-excerpt","provider":"cloudflare"}'

curl -i -X POST http://127.0.0.1:8787/generate \
  -H 'Content-Type: application/json' \
  -H 'X-Auth-Secret: incorrect' \
  --data '{"task":"auto-excerpt","provider":"cloudflare"}'

curl -i -X OPTIONS http://127.0.0.1:8787/generate \
  -H 'Origin: https://frong.me'

curl -i -X POST http://127.0.0.1:8787/generate \
  -H 'Origin: https://example.com' \
  -H 'Content-Type: application/json' \
  -H 'X-Auth-Secret: any-test-value' \
  --data '{"task":"auto-excerpt","provider":"cloudflare"}'
```

When Cloudflare access is available, configure the production secret interactively, deploy, then verify. Do not put the value on a command line:

```sh
cd ai-worker
npx wrangler secret put AI_WORKER_SECRET
npm run deploy
npx wrangler deployments list
```

After deployment, the following non-billable request must return 401 with no wildcard CORS header:

```sh
curl -i -X POST https://ai-assistant-worker.frongbook.workers.dev/generate \
  -H 'Content-Type: application/json' \
  --data '{"task":"auto-excerpt","provider":"cloudflare"}'
```

An authenticated production request can invoke a billable provider. Use the automated provider stub for routine verification; perform one live success check only when deliberately validating provider integration.

## Phase 0 verification result

Local results:

- Missing or wrong `X-Auth-Secret`: HTTP 401 before provider invocation.
- Missing configured `AI_WORKER_SECRET`: HTTP 503 before provider invocation.
- Disallowed browser Origin: HTTP 403 with no `Access-Control-Allow-Origin`.
- Allowed preflight Origin: HTTP 204 with `Access-Control-Allow-Origin: https://frong.me`; the secret header is not browser-allowed.
- Correct server-to-server secret: HTTP 200 against the automated provider stub.
- Unknown tasks and oversized request bodies: rejected before provider invocation.

Production result after owner deployment: the unauthenticated `POST /generate` probe returned HTTP 401 with `Cache-Control: no-store`, JSON `{"error":"Unauthorized"}`, and no wildcard CORS header on 2026-09-10 UTC. The owner confirmed the protected deployment, so P0-02, P0-04, and Gate G0 are complete. The deployment version identifier was not available in this workspace.
