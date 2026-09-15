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
and `AI`. Public host: `https://frong.me`. Recorded staging host:
`https://frong-me-staging.frongbook.workers.dev`.

Staging Access login, production Access policy, media routing and restore
readiness need live verification. A configuration file or old session log is not
evidence of current remote health.

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

Use untracked local shell configuration / `.dev.vars` as appropriate.
`.env.example` lists names, not credentials; scripts do not all auto-load `.env`.
Workers AI uses `AI`; Earth can also store provider keys in D1.

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

## Deployment runbook — approval required

GitHub Actions verifies code only. Publishing content and pushing code do not deploy.

1. Confirm target, approved commit, green CI, operator access and recovery plan.
   Never deploy with the development Access bypass enabled.
2. Review migrations. If approved, apply to staging first:
   `npx wrangler d1 migrations apply DB --env staging --remote`.
   After staging verification and production approval, use
   `--env production --remote`. Never edit applied migrations or seed remotely.
3. Staging: `npm run deploy:staging` performs preflight, build and deploy.
   Production: `CLOUDFLARE_ENV=production npm run build`, then
   `npx wrangler deploy --env production`. Never reuse a staging build.
4. Verify public pages, authenticated Earth, an approved test article, image
   delivery and authorized AI. Account for response caching.
5. Record deployed commit, environment and observations in the handoff.
   Rollback means redeploying a known-good matching build; it does not undo data
   migrations, which require their own recovery plan.

Deploying does not apply migrations automatically. D1/R2 backup and restore
verification remains a separate operational requirement.
