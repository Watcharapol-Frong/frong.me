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

As of 2026-09-27, staging runs code commit `dd2bbf6` and production runs the matching
application from merge commit `731795c` (Worker version
`15eb2e34-abcb-4ced-a917-c70d4c34181a`). Migration `0009_primary_topic.sql`
was applied to staging and production before code deployment; neither database
had pending migrations at that deployment. The multiline blockquote update passed
[CMS CI](https://github.com/Watcharapol-Frong/frong.me/actions/runs/36287930894)
and [staging deployment](https://github.com/Watcharapol-Frong/frong.me/actions/runs/36287930998);
the public staging article returned the grouped quote markup.
Authenticated production author, media and AI flows and backup/restore remain to
be checked. See the workflow links and exact evidence in the
[current handoff](../plan.md).

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

`main` is the only maintained release branch. Use a short-lived branch and a
pull request for each change; remove the branch after merging. The single
`.github/workflows/cms-ci.yml` workflow verifies pull requests and pushes to
`main`. A successful push or merge to `main` then deploys production automatically.
There is no staging promotion or separate production dispatch. Manual dispatch
on `main` is available for retrying the current release.

Verification runs without deployment credentials. Only the production job uses
the existing `production` GitHub Environment. Keep its branch restriction at
`main`; for the owner's automatic flow, no required reviewer is needed. If an
existing reviewer rule remains, GitHub will still pause the deployment for
approval; repository code cannot remove account-side environment rules.
The verification check name remains `CMS Verification and Build` so existing
required checks can continue to reference it. Deployments are serialized and
never cancel an in-progress production upload.

Configure only the production environment for the maintained workflow:

| GitHub setting | Value |
| --- | --- |
| Secret: `CLOUDFLARE_API_TOKEN` | Token permitted to deploy production Worker |
| Variable: `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| Variable: `CF_D1_DATABASE_ID` | Production database ID from `wrangler.jsonc` |
| Variable: `CF_R2_BUCKET_NAME` | `portfolio-media-prod` |
| Variable: `CF_ACCESS_TEAM_DOMAIN` | Production Access team domain |
| Secret or variable: `CF_ACCESS_AUD` | Production `/earth` Access application AUD |
| Optional variable: `PUBLIC_GA_MEASUREMENT_ID` | Production measurement ID |

Staging's workflow is removed. Its Worker, D1, R2, Access configuration and
named Wrangler environment remain isolated and dormant for optional large
experiments. Do not delete remote resources or a branch containing unmerged
work as incidental cleanup. The old staging branch is no longer part of normal
work; inspect its unique commits before any deletion. The checked-in local
fixtures and tested operational scripts remain available for local development.

For `CF_ACCESS_AUD`, the workflows read an Environment secret first and then an
Environment variable. The secret is suitable if the AUD is already stored there;
there is no need to copy it into a variable. The production deployment job fails before
building if a required value is missing. The
production preflight rejects mismatched production D1/R2 bindings. GitHub Environment variables exist only during the build
and deploy. In **Workers & Pages > each Worker > Settings > Variables and
Secrets**, also configure the runtime values `CF_ACCESS_TEAM_DOMAIN` and
`CF_ACCESS_AUD` for its own Access application. `ENABLE_ACCESS_DEV_BYPASS` must
never be set on a deployed Worker. Keep production Access covering `/earth` and its descendants while public pages remain accessible.

Do not enable Cloudflare Git integration as a second deployment path.

## Routine deployment and recovery

Publishing content does not deploy code. Open a PR to `main`, wait for the
verification check, and merge the approved change. The same workflow checks the
merge commit and automatically builds/deploys production, then checks public
search routes and anonymous Earth denial. No remote migrations or seeds run.
Review migration changes separately; apply approved migrations explicitly,
with a data recovery plan, before deploying code that needs them.
For larger risky changes, use the retained staging helper explicitly; it is
not required for ordinary releases.

For a code rollback, revert the faulty change in a short-lived branch, pass CI,
and merge the revert to `main`; that automatically deploys the reverted code.
Do not reset or force-push `main`. For an urgent outage, an authorized operator
can restore a known-good Worker version in Cloudflare, then revert the change
in GitHub so the next deployment matches it. Worker rollback does not restore
article rows, database schema or deleted images.

## Data recovery

Production D1 and R2 are separate from Git history. Before an approved schema
change, record a production D1 Time Travel recovery point and export the
production database to secure storage outside this repository. For example:
`npx wrangler d1 export DB --env production --remote --output <secure-path>/production.sql`.
Database exports can contain provider keys; never upload them to public GitHub
or ordinary CI artifacts. Keep a separate recoverable copy of production R2
objects before any operation that overwrites/deletes media. Routine code
releases neither migrate D1 nor delete R2 objects.

A D1/R2 backup and restore drill is still unverified. Retained staging resources
and historical Sanity archives are not backups of current production data.
Deleting remote staging services or rotating credentials requires a separate
explicitly scoped operation after dependency and data checks.
