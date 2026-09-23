# Current handoff

Updated: 2026-09-23. Scope: maintainer handoff, including the pending article
SEO review and sitemap change.

## Architecture

One Astro/Cloudflare app owns the public reader, Earth editor and embedded AI.
Active posts are read from D1; media lives in R2. Publishing updates content
directly, without GitHub builds or deployment. Start with
[architecture](architecture.md) and [contribution instructions](../CONTRIBUTING.md).

## Change set

- Remove Sanity Studio/integration/dependencies and the old migration script.
- Remove standalone AI Worker source/config and weekly Sanity export workflow.
- Keep embedded AI, provider settings and tests.
- Move three historical exports unchanged into `archive/sanity/`.
- Remove release callback probes; keep read-only Access verification.
- Import shared AI types directly and declare development tools explicitly.
- Replace contradictory historical onboarding with current English docs.
- Preserve applied migrations, release-table rows and integrity checks.
- Keep deployment, remote data changes, service retirement and credential
  changes as separately approved operational actions.

## Verification

Implementation commit `bf0950c30e01550b730bd4f43211b4c24a7f2418` passed
[GitHub CMS CI](https://github.com/Watcharapol-Frong/frong.me/actions/runs/35031544646):
215 tests, mandatory TypeScript and the full Astro/Cloudflare build.
The latest checks and merge state are tracked in
[PR #4](https://github.com/Watcharapol-Frong/frong.me/pull/4).

Local verification: 215/215 tests pass with `node --import tsx --test
tests/cms/*.test.ts`; `npx tsc --noEmit` and `git diff --check` pass.
The tsx CLI cannot create its IPC socket here (EPERM). The full local build
bundles server/client code but workerd prerendering cannot enumerate network
interfaces in this runtime. GitHub CI successfully ran the ordinary npm test
command and completed prerendering; do not weaken either local check.
Read-only Access and in-memory R2 smoke verifications also pass locally.

The lockfile shrank from 1,457 to 594 package entries (including its root entry),
with no version changes for retained package paths. All three archive checksums
match the baseline. The suite removes two callback-only tests and adds seven
retirement/read-only verification checks, for a net increase from 210 to 215.

## Next gates

1. Complete the authenticated browser checklist in production: sign in,
   create/save/reopen a draft, insert an image, preview, publish, verify the public
   article, unpublish, and check visibility after cache expiry.
2. Verify media origin/environment separation and exercise AI only with an
   approved account. Stored provider keys lack application-level encryption.
3. Verify and document D1/R2 backup and restore.
4. Complete [remote retirement](legacy-retirement.md). Removing source does not
   retire the remote Sanity project or AI Worker. The stale staging
   `RELEASE_CALLBACK_SECRET` also remains pending explicit removal approval.
5. Continue requiring a green full suite, TypeScript check and production build
   for every future release.

Historical requirements/session logs are linked from the retirement record, not
mixed into this current handoff.

## Repository maintenance

- 2026-09-23: Prepared the scoped [article SEO plan](seo-plan.md). Earth Editor
  Review & SEO now shows checks derived from the current draft and AI editorial
  suggestions without a fabricated score or ranking forecast. A request-time
  D1 article sitemap includes only active slugs and is advertised in robots.txt.
  After deployment, verify sitemap and article URLs publicly, then inspect
  indexing and query performance in Google Search Console. Public site page
  changes are a separate maintainer task. All 225 CMS tests, TypeScript, and
  `git diff --check` pass locally. The build bundles server and client code,
  then stops in Cloudflare prerendering because this environment cannot
  enumerate network interfaces; require a green CI build before merging.

- 2026-09-22: Removed the redundant root declarations for
  `@tiptap/extension-bubble-menu` and `@tiptap/extension-floating-menu`.
  `@tiptap/react` continues to provide both optional packages used by its menu
  entry point.
- Reduced the project-local Matt Pocock skill set from 38 skills to
  `code-review`, `codebase-design`, and `diagnosing-bugs`.
- After cleanup, all 215 CMS tests, TypeScript, the local production build, and
  `git diff --check` passed.
- 2026-09-22: Centralized canonical/social/structured metadata behind the
  `PageSeo` interface, added consent-gated optional GA4, and reduced homepage
  D1 reads from up to 121 queries to a fixed three-query read model. The
  responsive article grid now uses one DOM tree with intrinsic image sizing.
  GA4 remains inactive until an authorized build receives
  `PUBLIC_GA_MEASUREMENT_ID`; deployment and GA4 property creation were not
  performed.
- 2026-09-22: Deepened analytics consent behind one browser module, added
  12-month versioned choices, Thai/English copy, balanced actions, keyboard
  focus handling, cookie revocation and a bilingual `/privacy/` page. All 221
  CMS tests, TypeScript, the local production build and `git diff --check`
  passed for this change; production deployment is recorded below.
- 2026-09-23: Removed the visually competing floating analytics-settings button.
  Readers now reopen consent from **Privacy & Analytics** inside the persistent
  Contact popover, with `/privacy/` as the fallback when GA4 is disabled. The
  mobile consent panel still reserves navigation height and device safe area.
  A layout-contract regression raises the suite to 222 tests; production
  deployment is recorded below.

## Deployment record

- 2026-09-22: Deployed commit `039d7ba` to Cloudflare staging as Worker
  `frong-me-staging`.
- Deployment version: `b0bea1db-81dd-480f-9e13-79833f29b69c`.
- Preflight, the full production build and Wrangler upload completed successfully;
  the remote staging database reported no pending migrations.
- Post-deploy smoke check: `/` returned 200, `/about` returned its expected route
  redirect, and an anonymous `/earth` request was rejected with 401.
- An authenticated browser acceptance pass, media delivery and approved AI usage
  remain human checks before promoting this build to production.
- 2026-09-22: Deployed the same commit `039d7ba` to Cloudflare production as
  Worker `frong-me`, version `9a030873-8213-4779-8d28-847f0e77184b`.
- Before production deployment, 215/215 CMS tests and TypeScript passed, the
  production-targeted build and Wrangler dry-run completed successfully, and the
  remote production database reported no pending migrations.
- Production smoke check: `https://frong.me/` and `/about/` returned 200,
  `/earth` redirected anonymous traffic to Cloudflare Access, and the production
  workers.dev endpoint returned 200.
- Authenticated draft/media/publish/AI acceptance still requires a maintainer
  browser session; the automated deployment did not mutate production content.
- 2026-09-22: Deployed commit `b0f1e37` to Cloudflare production as Worker
  `frong-me`, version `098810b2-2bfc-4f1d-877d-c21fee56ff37`.
- Before upload, 218/218 CMS tests and TypeScript passed, production D1 had no
  pending migrations, the production-targeted build completed with local
  prerender bindings, and Wrangler's production dry-run resolved
  `portfolio-db-prod`, `portfolio-media-prod`, Workers AI and static assets.
- Post-deploy smoke checks returned 200 for `/`, `/about/` and the production
  workers.dev endpoint; anonymous `/earth` redirected to Cloudflare Access.
  Rendered production HTML contains the configured GA4 measurement ID,
  canonical metadata and JSON-LD. Analytics still requires reader consent.
- This deployment did not apply migrations or mutate production content.
- 2026-09-22: Deployed consent/privacy commit `f86933e` to Cloudflare production
  as Worker `frong-me`, version `32f8b288-61b8-44fe-b8c9-9a80c24683d8`.
- Before upload, 221/221 CMS tests, TypeScript, the production-targeted build
  and Wrangler production dry-run passed. Production D1 reported no pending
  migrations; the dry-run resolved `portfolio-db-prod`, `portfolio-media-prod`,
  Workers AI and static assets.
- Post-deploy smoke checks returned 200 for `/`, `/about/`, `/privacy/` and the
  production workers.dev endpoint. Anonymous `/earth` redirected to Cloudflare
  Access. Rendered production HTML contains `G-EL7HS25NP4`, the updated consent
  interface and the canonical privacy page. No migration or production content
  mutation was performed.
- 2026-09-23: Deployed analytics-settings commit `547c92e` to Cloudflare
  production as Worker `frong-me`, version
  `0bb28039-adc2-43c6-a2d7-afc84404aabb`.
- Before upload, 222/222 CMS tests, TypeScript, the production-targeted build
  and Wrangler production dry-run passed. Production D1 reported no pending
  migrations; bindings resolved to the production D1/R2 resources, Workers AI
  and static assets.
- Post-deploy smoke checks returned 200 for `/`, `/about/`, `/privacy/` and the
  production workers.dev endpoint; anonymous `/earth` redirected to Cloudflare
  Access. The deployed client bundle contains **Privacy & Analytics**, while
  rendered HTML no longer contains the removed floating settings button. No
  migration or production content mutation was performed.
