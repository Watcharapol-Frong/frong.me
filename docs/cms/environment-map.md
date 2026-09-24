# Environments and operations

This describes repository configuration, not a live account audit.

## Resource separation

| Environment | Worker | D1 database | R2 bucket |
| --- | --- | --- | --- |
| Local | Development runtime | Local D1 state | Local R2 state |
| Staging | `frong-me-staging` | `portfolio-db-staging` | `portfolio-media-staging` |
| Production | `frong-me` | `portfolio-db-prod` | `portfolio-media-prod` |

`wrangler.jsonc` is the source of truth. Default bindings target staging; select
named environments explicitly for deployment. All declare `DB`, `MEDIA_BUCKET`
and `AI`. Production is served at `https://frong.me`; staging is served at
`https://frong-me-staging.frongbook.workers.dev`.
The two Workers preserve their dashboard runtime variables across Wrangler
deployments via `keep_vars`; these are separate from GitHub build variables.

As of 2026-09-23, production runs commit `547c92e` and staging remains on commit
`039d7ba`. Public route smoke checks passed, production `/earth` redirected
anonymous traffic to the Cloudflare Access login, and the production database
reported no pending migrations. This does not replace authenticated author-flow,
media delivery, AI, or backup/restore acceptance. See the deployment IDs and
exact evidence in the [current handoff](../plan.md).

## Configuration consumers

| Names | Consumer / storage |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | Authorized local Wrangler commands |
| `CF_D1_DATABASE_ID`, `CF_R2_BUCKET_NAME` | Local staging preflight; must match named bindings |
| `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` | Main Worker runtime and local preflight |
| `ENABLE_ACCESS_DEV_BYPASS` | Local development only; false/unset elsewhere |
| `CF_ACCOUNT_ID`, `CF_D1_DATABASE_NAME`, `CF_D1_READ_TOKEN` | Optional read-only D1 HTTP verifier; database ID also required |
| `CMS_STAGING_HOST` | Optional Access verifier target |
| `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | Authorized Access service-token verification |
| `CF_ACCESS_JWT_ASSERTION` | Alternative Access verifier credential |
| `GEMINI_API_KEY`, `OPENROUTER_API_KEY` | Optional Worker fallback keys for embedded AI |
| `PUBLIC_GA_MEASUREMENT_ID` | Optional public GA4 web-stream ID embedded at build time |

Use untracked local shell configuration / `.dev.vars` as appropriate.
`.env.example` lists names, not credentials; scripts do not all auto-load `.env`.
Workers AI uses `AI`; Earth can also store provider keys in D1.
`PUBLIC_GA_MEASUREMENT_ID` is not a secret. It must be supplied to each build;
leaving it unset disables both the Google tag and analytics-consent UI.

Operational scripts retain tested compatibility aliases, including
`CF_ACCOUNT_ID`, `STAGING_D1_DATABASE_ID`, `STAGING_R2_BUCKET_NAME`,
`STAGING_HOST`, `CMS_STAGING_URL` and `CF_API_TOKEN`. Use canonical names for
new setups; these aliases are not a second architecture.

Sanity variables, standalone AI URLs/secrets, GitHub dispatch settings and release
callback secrets are not required. Do not provision them. Access membership is
controlled by Cloudflare policy; the application guard has no additional email
allowlist or configured Origin allowlist.

## Verification without deployment

```sh
npm run test:cms
npx tsc --noEmit
CLOUDFLARE_VITE_FORCE_LOCAL=true npm run build
npm run verify:r2:dry
npm run verify:access:dry
```

Force-local prevents remote bindings during verification without removing
deployment bindings. Dry-run checks are mocks, not live-account verification.

## GitHub deployment configuration

The long-lived branches are `staging` (test Worker) and `main` (production
Worker). Changes merge to `staging` for testing; only accepted code is merged
into `main`. CI verifies pull requests and pushes to both branches. Pushing to
`staging` triggers **Deploy CMS staging**; it checks configuration, tests and
TypeScript, then builds and deploys `frong-me-staging` using the GitHub
Environment `staging`. A manual rerun must also select the `staging` branch.
**Deploy CMS production** runs only when manually dispatched from `main`. It
uses the GitHub Environment `production`, repeats tests and preflight, builds
for production and deploys `frong-me`. Configure a required reviewer on that
environment before activating the workflow; do not allow bypass of its rules.

Create both GitHub Environments under repository Settings > Environments before
merging these workflows. Restrict deployments to the exact matching branch
(`staging` or `main`); require a reviewer for `production`. For each environment,
configure the following values for *that* target only:

| GitHub setting | `staging` | `production` |
| --- | --- | --- |
| Secret: `CLOUDFLARE_API_TOKEN` | Token permitted to deploy test Worker | Token permitted to deploy production Worker |
| Variable: `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID | Cloudflare account ID (same account if shared) |
| Variable: `CF_D1_DATABASE_ID` | `portfolio-db-staging` database ID from `wrangler.jsonc` | `portfolio-db-prod` database ID from `wrangler.jsonc` |
| Variable: `CF_R2_BUCKET_NAME` | `portfolio-media-staging` | `portfolio-media-prod` |
| Variable: `CF_ACCESS_TEAM_DOMAIN` | Staging Access team domain | Production Access team domain |
| Variable: `CF_ACCESS_AUD` | Staging `/earth` Access application AUD | Production `/earth` Access application AUD |
| Optional variable: `PUBLIC_GA_MEASUREMENT_ID` | Staging measurement ID, if analytics is desired | Production measurement ID, if analytics is desired |

Both deployment jobs fail before building if a required value is missing. The
production preflight rejects mismatched production D1/R2 bindings; staging has
the equivalent guard. GitHub Environment variables exist only during the build
and deploy. In **Workers & Pages > each Worker > Settings > Variables and
Secrets**, also configure the runtime values `CF_ACCESS_TEAM_DOMAIN` and
`CF_ACCESS_AUD` for its own Access application. `ENABLE_ACCESS_DEV_BYPASS` must
never be set on a deployed Worker. Verify the `staging` Access application covers
`/earth` and its descendants while public pages remain accessible.

The old `cms-staging` GitHub Environment can be deleted only after the new
`staging` environment has been configured and a deployment from it succeeds.
GitHub does not reveal existing secret values for copying; recreate the deploy
token from your secure copy or rotate it. Do not copy obsolete callback secrets
or Access service tokens into the new deployment environments unless a separate
workflow requires them. Do not trigger Cloudflare's Git integration as a second
deployment path for these Workers.

## Deployment runbook — approval required

Publishing content does not deploy code. Staging deploys on an authorized push
to `staging`; production requires a manual workflow dispatch from `main` plus
its GitHub Environment protection rule. Neither workflow runs remote database
migrations or seeds content.

1. Confirm target, approved commit, green CI, operator access and recovery plan.
   Never deploy with the development Access bypass enabled.
2. Review migrations. If approved, apply to staging first:
   `npx wrangler d1 migrations apply DB --env staging --remote`.
   After staging verification and production approval, use
   `--env production --remote`. Never edit applied migrations or seed remotely.
3. Staging workflow: `npm run deploy:staging` performs preflight, build and
   deploy. Production workflow checks production bindings, runs
   `CLOUDFLARE_ENV=production npm run build`, then
   `npx wrangler deploy --env production`. Never reuse a staging build.
4. Verify public pages, authenticated Earth, an approved test article, image
   delivery and authorized AI. Account for response caching.
5. Record deployed commit, environment and observations in the handoff.
   Rollback means redeploying a known-good matching build; it does not undo data
   migrations, which require their own recovery plan.

Deploying does not apply migrations automatically. D1/R2 backup and restore
verification remains a separate operational requirement.
