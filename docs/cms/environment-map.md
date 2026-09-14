# CMS Environment Map

Updated: 2026-09-14 UTC

Tasks: P0-03, Phase 0.5 configuration follow-up, and Phase 1 root configuration

This document records resource and secret names, ownership boundaries, and configuration locations. Never store *credential* values here (API tokens, service token secrets). Cloudflare Access's team domain and Application AUD are recorded below despite that rule — they are not credentials, and are already visible to anyone who makes an unauthenticated request to `/earth` (see the note under "Environment separation").

## Environment separation

| Resource | Staging | Production | Owner / authoritative configuration | Current evidence |
|---|---|---|---|---|
| Main-site Worker | `frong-me-staging`; `https://frong-me-staging.frongbook.workers.dev` (no custom domain) | `frong-me`; **`https://frong.me`** — bound as a real Workers Custom Domain (cert `14405d42-49b3-48a1-9caa-dca124a89f11`) | Cloudflare account and root `wrangler.jsonc` (compatibility date 2026-09-10, `nodejs_compat`) | Both deployed and live as of 2026-09-14 with the current `main`. Confirmed via `workers_list`/`workers/domains` API and live `curl` (both return 200 on `/`) |
| AI Worker | A separate staging environment is recommended before future changes | Worker name `ai-assistant-worker`; URL `https://ai-assistant-worker.frongbook.workers.dev` | `ai-worker/wrangler.jsonc` plus Cloudflare Worker secrets | Production unauthenticated probe returned 401 with `no-store` on 2026-09-10 |
| CMS D1 | `portfolio-db-staging` (uuid `71cba742-a269-475d-84b0-8df1223a368a`), bound as `DB` | `portfolio-db-prod` (uuid `e8442532-a929-40d5-8ff4-c05510fad616`), bound as `DB` | Root `wrangler.jsonc`, `env.staging`/`env.production` blocks, `migrations_dir: db/migrations` | Both are real, isolated databases (confirmed via `d1_databases_list`) and both had every migration applied via `--remote` on 2026-09-14 (staging was missing 0004-0006, production 0005-0006 — 0001-0004 were already there from an earlier, unrecorded session). `wrangler.jsonc`'s `env.production` block held literal placeholder values (`portfolio-db-production`, `portfolio-db-production-id`) until 2026-09-14 — it was never actually filled in despite the database having existed since 2026-09-12 |
| Media R2 (uploads) | `portfolio-media-staging`, bound as `MEDIA_BUCKET` | `portfolio-media-prod`, bound as `MEDIA_BUCKET` | Root `wrangler.jsonc` | Both confirmed to exist via `r2_buckets_list`. Same placeholder-until-2026-09-14 issue as the production D1 row above (`portfolio-media-production` never existed) |
| Public media domain (`images.frong.me`) | n/a | Hardcoded in code (`PUBLIC_ASSET_BASE_URL` in `src/lib/cms/assets/r2.ts` and `src/lib/cms/markdown/asset-resolver.ts`) as `https://images.frong.me` | DNS/R2 custom domain configuration in the Cloudflare dashboard, outside this repo | **Unverified** — never confirmed this hostname actually resolves or is bound to a bucket. Distinct from the `MEDIA_BUCKET` binding above: that's where uploads land; this is how published posts expect to *serve* them publicly |
| Cloudflare Access | No Access application in front of `frong-me-staging.frongbook.workers.dev` — only a real custom domain gets a Zero Trust app in practice, and staging has none | **A real Access application already protects `/earth` on `frong.me`.** Team domain: `proud-shadow-577d.cloudflareaccess.com`. Application AUD: `eb777fbc55eea6cfa6e5dea974869947855dd7cc76f162d3f57d963f99de9089` | Cloudflare Zero Trust dashboard (not this repo) | Discovered 2026-09-14 by observing the real `302` redirect from an unauthenticated `GET https://frong.me/earth` — both values are visible in that redirect's `meta` JWT (`kid` and `aud` claims) to anyone, authenticated or not, which is why they're recorded here despite the "no credentials" rule above. Set as `CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD` Worker secrets on both `frong-me` and `frong-me-staging` via `wrangler secret put` on 2026-09-14. **Not yet verified**: a real human login completing successfully, and whether an Access Service Auth policy exists for the `CF_ACCESS_CLIENT_ID`/`CF_ACCESS_CLIENT_SECRET` pair `verify-access-staging.mjs` expects |
| GitHub repository | `Watcharapol-Frong/frong.me`, default branch `main`; CI only (`cms-ci.yml` runs tests on push/PR) | Same | GitHub repository settings | GitHub is not connected to Cloudflare — no Workers Builds/Pages Git integration and no deploy-capable Actions workflow. Removed `.github/workflows/cms-staging-deploy.yml` on 2026-09-14; it depended on Cloudflare credentials as GitHub Actions secrets that were never actually configured. Deploys are run locally (`npm run deploy:staging`, `wrangler deploy --env production`; see below) |
| Backup destination | Separate private test destination required | Off-production-account or encrypted offline destination required | Backup runbook created in Phase 1 | Not selected |

Do not reuse staging databases, buckets, or deployment secrets in production — they are genuinely separate resources (see above), so this is about not accidentally repointing one at the other's ID, not about the Access audience value (Access applications are usually per-domain, not per-environment, so reuse there wasn't a design choice).

## SSOT: canonical environment variable names

Updated: 2026-09-14 UTC

These are the canonical (SSOT) names for all project environment configuration. `.env.example` mirrors this table. Scripts read SSOT names first; legacy names are temporary fallbacks only and must not be used in new code.

Deploys are local-only: GitHub is not connected to Cloudflare (no Workers Builds/Pages Git integration, no deploy-capable Actions workflow — see the GitHub repository row above). Everything below is supplied as local shell/`.env` environment variables to whoever runs `npm run deploy:staging` (or `wrangler` directly), not as GitHub Actions secrets.

### Secrets (local environment variables / Cloudflare Worker secrets — never commit values)

| SSOT name | Used by | Environment scope | Purpose | Legacy fallback |
|---|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | `scripts/build/deploy-staging.mjs` (local) | Local shell env | Deploy the staging main-site Worker via `wrangler deploy` | `CF_API_TOKEN`, `CF_DEPLOY_TOKEN` |
| `CF_ACCESS_CLIENT_ID` | `scripts/build/verify-access-staging.mjs` (1C-03) | Local shell env; Cloudflare Access Service Token scoped to the staging Access application | Machine identity to reach `/earth/*` so Access mints the JWT assertion | `STAGING_CF_ACCESS_CLIENT_ID` |
| `CF_ACCESS_CLIENT_SECRET` | Same as above | Local shell env | Second half of the Access Service Token pair | `STAGING_CF_ACCESS_CLIENT_SECRET` |
| `RELEASE_CALLBACK_SECRET` | `/earth/api/releases/[id]/confirm` and `/fail` routes (Cloudflare Worker secret only) | Cloudflare Worker secret | Independent defense-in-depth check in the callback routes so a leaked/misscoped Access token alone cannot forge a deployment outcome. **Currently has no caller**: these routes existed for the deploy workflow's post-deploy callback (P1-04a), which was removed 2026-09-14 along with the workflow. Left in place — not part of this cleanup — but note it before relying on it | — |

### Variables (local environment variables / Worker vars — non-secret)

| SSOT name | Used by | Environment scope | Purpose | Legacy fallback |
|---|---|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | `scripts/build/deploy-staging.mjs`, `scripts/build/export-live-snapshot.mjs`, `scripts/db/verify-staging.mjs` | Local shell env | Identify the Cloudflare account | `CF_ACCOUNT_ID` |
| `CF_D1_DATABASE_ID` | Deploy pre-flight (`verify-bindings.mjs`), D1 HTTP verification | Local shell env | Identify the environment's D1 database (`portfolio-db-staging`) | `STAGING_D1_DATABASE_ID` |
| `CF_R2_BUCKET_NAME` | Deploy pre-flight (`verify-bindings.mjs`) | Local shell env | Identify the environment's public media R2 bucket | `STAGING_R2_BUCKET_NAME` |
| `CF_ACCESS_TEAM_DOMAIN` | Main-site Worker (Cloudflare Worker secret/var), `verify-bindings.mjs` (local shell env) | Both, see "Used by" | JWT issuer / JWKS location | — |
| `CF_ACCESS_AUD` | Main-site Worker (Cloudflare Worker secret/var), `verify-bindings.mjs` (local shell env) | Both, see "Used by" | Validate the `aud` claim | — |

### Supporting configuration (unchanged names)

| Name | Scope | Purpose |
|---|---|---|
| `CMS_STAGING_HOST` | Variable | Staging host for verification scripts and workflow callbacks (legacy: `STAGING_HOST`, `CMS_STAGING_URL`) |
| `CMS_SITE_ORIGIN` | Variable | Exact mutation Origin allowlist |
| `CF_ACCESS_ALLOWED_EMAIL` | Secret | Owner email enforced by the Access middleware |
| `ENABLE_ACCESS_DEV_BYPASS` | Local only; must be `false`/unset in CI | Development bypass guard |
| `CF_D1_READ_TOKEN` | GitHub `cms-staging` secret | Read-only D1 HTTP verification (`scripts/db/verify-staging.mjs --http`) |
| `CF_D1_DATABASE_NAME` | Variable | D1 database name for HTTP verification |
| `GITHUB_REPO`, `GITHUB_DISPATCH_TOKEN` | Variable / Cloudflare secret | Future admin server dispatch target |
| `AI_WORKER_URL`, `AI_WORKER_SECRET` | Variable / secret | AI Worker server-to-server proxy |

### Enforcement rules

1. New code must read SSOT names first. Legacy fallbacks exist only for backward compatibility during the transition and will be removed once GitHub Environments are reconfigured.
2. The deploy workflow maps legacy GitHub secrets/vars to SSOT names, so existing environment configuration keeps working without changes.
3. When configuring GitHub Environments, create only the SSOT names above. Do not add new legacy names.
4. Never record secret values in this document, `.env.example`, or committed configuration.

## Bindings and secrets

Historical detail predating the 2026-09-14 removal of the GitHub Actions deploy workflow — the SSOT tables above are current for Cloudflare API/Access/D1/R2/`RELEASE_CALLBACK_SECRET` names. Where this section says "GitHub `cms-staging` environment secret/variable" as the storage location, read that as "local shell env" instead; no such GitHub Environment configuration is required or in use.

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
| `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | `scripts/build/verify-access-staging.mjs` (1C-03) and the staging deploy workflow's release confirm/fail callback (P1-04) | GitHub `cms-staging` environment secret; a Cloudflare Access Service Token scoped to the staging Access application | Reach `/earth/*` as a machine caller so Cloudflare Access mints the request's JWT assertion, without a human login | Names proven by 1C-03's verification script; real Service Token and its Access Service Auth policy are unset. Reusing the same token for confirm/fail callbacks is intentional — it is the deploy workflow's only machine identity |
| `RELEASE_CALLBACK_SECRET` | `/earth/api/releases/[id]/confirm` and `/earth/api/releases/[id]/fail`; the staging deploy workflow | GitHub `cms-staging` environment secret; Cloudflare Worker secret | A second, independent secret the release callback checks in the route itself (defense in depth alongside the Access Service Token, so a leaked/misscoped Access token alone cannot forge a deployment outcome) | Implemented and unit-tested locally (fail-closed 503 when unset, 401 on mismatch, constant-time compare); real secret value unset |
| `ENCRYPTION_KEY` | Future BYOK service | Cloudflare secret | Encrypt provider API keys | Phase 4; do not provision now |
| `TURNSTILE_SECRET_KEY`, `PUBLIC_TURNSTILE_SITE_KEY`, email-provider key | Newsletter | Cloudflare secret/public configuration as appropriate | Newsletter protection/delivery | Phase 3; do not provision now |

Use `.dev.vars` for local Worker secrets and never commit it. `ai-worker/.dev.vars.example` lists names only. The current `.gitignore` excludes `.dev.vars` and `.wrangler/`.

## Required access for CMS staging and future production

Deploys are local-only (`npm run deploy:staging`, `wrangler deploy --env production`) — GitHub is not connected to Cloudflare, so none of this requires a GitHub Environment.

1. Cloudflare credentials (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) available as local shell/`.env` variables to whoever runs the deploy. The token needs, at minimum, Workers Scripts:Edit (deploy) and D1:Edit (migrations); Workers Scripts:Edit alone was not enough to run migrations when this was tried 2026-09-14.
2. ~~Isolated staging Worker, D1, and Access resources~~ — **done**. Staging and production use genuinely separate D1 databases and R2 buckets (see "Environment separation" above); `wrangler.jsonc`'s `env.production` block just hadn't been filled in with their real names/IDs until 2026-09-14.
3. Separate D1 Read and Worker deploy credentials with only the permissions each needs.
4. Named owners and dashboard locators for future production R2/backup storage before those phases use them (Access and D1 are done — see above).
5. A Cloudflare Access Service Auth policy on `/earth` that accepts the `CF_ACCESS_CLIENT_ID`/`CF_ACCESS_CLIENT_SECRET` Service Token used by 1C-03's verification script — **still unconfirmed**. `RELEASE_CALLBACK_SECRET` (Cloudflare Worker secret) is still referenced by `/earth/api/releases/[id]/{confirm,fail}` but currently has no caller now that the deploy workflow is gone — provision it only if that callback path is still wanted.

## CMS database commands

The root `wrangler.jsonc` binds `DB` to the staging database `portfolio-db-staging` (and, under `env.production`, to `portfolio-db-prod`) and reads versioned migrations from `db/migrations/`. Run everything against local D1 first; `--remote` touches the real database — get an explicit, reviewed reason before running it (see the project's CLAUDE.md).

```sh
npm run test:cms
npx wrangler d1 migrations list DB --local
npx wrangler d1 migrations apply DB --local
npx wrangler d1 execute DB --local --file db/seeds/staging.sql
node scripts/db/verify-staging.mjs --wrangler --local
```

`db/seeds/staging.sql` is deterministic and idempotent, so repeated execution neither errors nor violates the immutability triggers. `scripts/db/verify-staging.mjs` checks foreign keys and the partial indexes `idx_one_cover_per_post`, `idx_one_active_release`, and `idx_release_visible_routes`. It also accepts `--http` for the Cloudflare D1 HTTP API using `CF_ACCOUNT_ID`, `CF_D1_DATABASE_ID`, and `CF_D1_READ_TOKEN`, and `--sqlite <path>` for a local file.

### Applying migrations to the real remote databases

Once new migration files land in `db/migrations/`, both remote databases need them applied explicitly — this repo's tooling never does it automatically (no CI/CD deploy hook exists, and `wrangler deploy` does not run migrations itself):

```sh
npx wrangler d1 migrations apply DB --env staging --remote
npx wrangler d1 migrations apply DB --env production --remote
```

Requires a Cloudflare API token with D1:Edit, exported as `CLOUDFLARE_API_TOKEN` (and `CLOUDFLARE_ACCOUNT_ID`). Apply to staging first, verify, then production — both were brought fully up to date on 2026-09-14 this way.

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
