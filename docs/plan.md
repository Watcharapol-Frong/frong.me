# Current handoff

Updated: 2026-10-02. Scope: maintainer handoff, article lifecycle repair, and the
latest staging and production deployment.

## Simplified deployment — 2026-10-02

Owner approved the main-only flow: short-lived branch → PR verification →
merge to `main` → automatic production deployment. One CMS CI workflow retains
tests, TypeScript, build, production binding checks, Access protection and a
read-only post-deploy search smoke check. Old staging/production workflows are
removed. No migrations, remote content changes or remote service deletion.
The staging Worker and D1 were subsequently deleted by the owner; the staging branch
must be inspected for unique commits before deletion. The owner-approved production Environment reviewer-rule removal is complete;
main-only deployment restriction remains.
Recovery and backup procedures are in the environment guide. Existing Sanity
archives are not current D1/R2 backups; backup/restore acceptance remains open.
Local verification: all 271 existing tests and both new deployment safety
regressions pass through `node --import tsx --test`; TypeScript, YAML parsing
and diff checks pass. The npm test wrapper is blocked by IPC EPERM and full
Cloudflare prerendering is blocked by `uv_interface_addresses`; require the
full GitHub CI run before merge. Deployment evidence follows after execution.

## Staging retirement follow-up — 2026-10-02

The owner reported deleting the staging Worker and D1. Remove their named
Wrangler environment, deleted remote IDs, staging deploy helper and npm deploy
commands. Top-level bindings now identify isolated local resources with a
placeholder D1 ID; production bindings are unchanged. The database integrity
verifier defaults to top-level `DB`, and live Access checks require an explicit
host rather than falling back to the deleted Worker. Retain applied migrations,
local fixtures, and security/data regression tests. Staging R2, Access and GitHub
Environment removal was not reported and is not performed by this change.
All 275 CMS tests, TypeScript and diff checks pass locally. The local production
build still encounters the Cloudflare `uv_interface_addresses` restriction;
full GitHub verification is required before merging this follow-up.
Main-only automatic production deployment succeeded after the owner-approved
reviewer-rule removal (run 36948557973); public/anonymous Earth checks passed.

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

The current application commit `847d480` passed 241 CMS tests, TypeScript and
the full build in [staging CI](https://github.com/Watcharapol-Frong/frong.me/actions/runs/36234178148).
[Staging deployment](https://github.com/Watcharapol-Frong/frong.me/actions/runs/36234178144)
completed after migration `0009_primary_topic.sql` was applied remotely.
The owner confirmed authenticated Earth testing on staging. Public staging
checks returned 200 for `/`, `/privacy/` and `/articles-sitemap.xml`, while
anonymous `/earth` redirected to Access.

[PR #13](https://github.com/Watcharapol-Frong/frong.me/pull/13) merged the
release into `main` as `731795c`. [Main CI](https://github.com/Watcharapol-Frong/frong.me/actions/runs/36232701031)
passed. Migration `0009_primary_topic.sql` was then applied to production D1;
both remote databases report no pending migrations. The owner approved the
[production workflow](https://github.com/Watcharapol-Frong/frong.me/actions/runs/36234275661),
which passed configuration checks, tests, TypeScript, the production build and
deployment. Production Worker version:
`15eb2e34-abcb-4ced-a917-c70d4c34181a`. Public production checks returned
200 for `/`, `/privacy/` and `/articles-sitemap.xml`; anonymous `/earth`
redirected to Access. Authenticated production author, media and AI checks are
still pending. D1 Time Travel bookmarks were checked before the migration, but
a backup/restore exercise has not been completed.

The earlier retirement verification follows for historical context.

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

## Combined media and link deployment — 2026-10-01

The owner authorized submission, merge and production deployment of the combined
repair. Application commit `0abe33d` passed the full [PR #18 CI](https://github.com/Watcharapol-Frong/frong.me/actions/runs/36838500712).
[PR #18](https://github.com/Watcharapol-Frong/frong.me/pull/18) merged to staging
as `3556f13`; [staging deployment](https://github.com/Watcharapol-Frong/frong.me/actions/runs/36838622609)
and staging/release CI completed successfully. [PR #19](https://github.com/Watcharapol-Frong/frong.me/pull/19)
merged to main as `13f82af`. The owner-authorized protected production gate was
approved without changing protection settings; [production deployment](https://github.com/Watcharapol-Frong/frong.me/actions/runs/36838852056)
completed successfully, including CMS tests, TypeScript, production binding
verification, production build and Worker deployment. Deployed application
revision: `13f82af1142ebadda024d1895226d7a09fe327e8`.

Public staging/production homepage and production article browser checks passed.
Authenticated live upload/link acceptance remains pending; automatic tests cover
upload retries, media bytes and environment isolation, Markdown input/save/reopen,
both keyboard platforms and the real React link dialog. No remote migrations,
asset deletions or existing article rewrites were performed. Existing CDN URLs
are unchanged; re-uploading an image now returns its environment's media URL.

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

- 2026-10-01: The owner authorized push and production deployment of the search
  foundations. [PR #22](https://github.com/Watcharapol-Frong/frong.me/pull/22)
  passed full [CI](https://github.com/Watcharapol-Frong/frong.me/actions/runs/36876337481)
  and merged to staging as `cc4595e`. [Staging deploy](https://github.com/Watcharapol-Frong/frong.me/actions/runs/36876526666)
  passed. Live curl checks returned 200/noindex for staging robots, article
  sitemap, SSR home and static About; robots disallows crawling and the article
  sitemap is empty. Browser home/article checks also passed. Node smoke timed
  out on staging and the default urllib user-agent received 403; browser/curl
  checks verified the same requirements instead. These client differences do
  not establish verified crawler access or a specific WAF cause.
  [PR #23](https://github.com/Watcharapol-Frong/frong.me/pull/23) merged to main as
  `9b01acaa4a9833f0e825228751c19f4fcb18aa8e`; [main CI](https://github.com/Watcharapol-Frong/frong.me/actions/runs/36877286094)
  passed. The owner-authorized production review gate was approved without
  changing protection rules. [Production deployment](https://github.com/Watcharapol-Frong/frong.me/actions/runs/36877471021)
  passed CMS tests, TypeScript, production binding checks, build and upload.
  Worker version: `d128b688-5054-4034-b6de-516d45975307`.
  `node scripts/build/verify-search.mjs` passed on production, confirming the
  new robots exclusions, combined sitemap index, one article's SSR/JSON-LD/time
  metadata under three search user-agent strings and anonymous Earth denial.
  No migration, article rewrite, model invocation or training-policy change.
  Cloudflare verified-crawler event review and Search Console indexing inspection
  remain account-side checks; a successful user-agent test does not prove them.

- 2026-10-01: Add safe public search foundations. Retain SSR article content,
  automatic metadata/JSON-LD and active-only sitemap reads. Replace static
  robots with a host-aware route and identical Earth exclusions for named
  search crawlers. Add post-Access SSR noindex headers and Worker-host static
  header rules; noncanonical article sitemaps no longer advertise staging rows.
  Include the D1 sitemap in the static index, normalize article canonicals and
  expose author/publication metadata. No migration, article rewrite, model
  inference or training-policy change. All 271 CMS tests pass through
  `node --import tsx --test tests/cms/*.test.ts`; TypeScript passes. The ordinary
  npm wrapper hits IPC EPERM; server/client build bundles pass before Cloudflare
  prerendering fails at `uv_interface_addresses`. Require green GitHub CI before
  merge. Deployment, Cloudflare verified-crawler/security-event review and
  Search Console inspection remain outstanding. See the updated [SEO plan](seo-plan.md)
  and the read-only `scripts/build/verify-search.mjs` post-deploy check.

- 2026-10-01: The owner explicitly approved production deployment of the Quote repair. PR #21 merged staging into main as `1288b418a10998285ba0fb70ae075c9c47cbfb52`. [Production deployment](https://github.com/Watcharapol-Frong/frong.me/actions/runs/36868443039) succeeded after CMS tests, TypeScript, production binding verification and full build. Live browser verification of `/articles/line-stock-checker` returned `<p>กาแฟ<br>จำนวนคงเหลือ = 12</p>` inside its blockquote, with two visible lines and no stray backslash. No article rewrite, migration or republish was performed.


- 2026-10-01: Repair published quote line breaks. A regression using the actual
  rich-editor extension factory reproduced Thai quote text joined onto one line
  with a visible backslash: TipTap saves hard breaks as a trailing backslash,
  while the shared public/preview renderer previously recognized only two spaces.
  Recognize unescaped backslash breaks inside quotes, preserving soft wraps,
  paragraph breaks, formatting, escaped backslashes and final literal backslashes.
  Existing saved articles need no database migration or content rewrite. Tests
  cover editor save/reopen/public rendering and Markdown edge cases. All 263 CMS
  tests, TypeScript and diff checks pass locally. Server/client bundling succeeds;
  full local build remains blocked by `uv_interface_addresses` in Cloudflare
  prerendering. Full CI is required before merge and deployment.

- 2026-10-01: Add the link repair to the pending media fix. Reproduced typed
  Markdown links remaining raw text with the real ProseMirror input path;
  StarterKit's `markdownLinks` option was disabled. Enable its input/paste rules
  and add Command+K (macOS), Ctrl+K (Windows), and a Link selection-toolbar button.
  A native dialog adds, edits or removes a link without replacing selected text,
  handles cursor insertion, preserves cancellation, and rejects unsafe schemes.
  Open link provides navigation without disrupting editing. Force explicit
  `[label](URL)` serialization: the default `<URL>` form used when the label is
  the URL is not supported by the public renderer. Regression coverage drives
  typing, Markdown save/reopen/public rendering, both platform keymaps, and the
  actual React dialog including unsafe URL rejection, cancellation and Enter.
  All 261 CMS tests, TypeScript and diff checks pass. Local build bundling
  succeeds, but Cloudflare prerendering remains blocked by the runtime's
  `uv_interface_addresses` restriction. The owner approved submitting and deploying the combined
  media/link repair on 2026-10-01; full CI and live browser checks are still
  required before declaring deployment acceptance.

- 2026-10-01: Fix repeat image uploads returning HTTP 409. The real upload route
  reproduced the error against SQLite: R2 uses a deterministic key, but the
  handler inserted a new asset ID into a unique private-key column every time.
  Direct uploads now atomically create/reuse a public asset by that key, preserving
  identity and metadata; retries repair interrupted registration or missing bytes.
  New URLs use the environment's own public `/media/assets/` route, avoiding the
  hardcoded shared CDN origin. Delivery requires a matching public database row;
  unknown/private/unsafe keys are not exposed. No migration, remote data rewrite
  or asset deletion is needed. Existing CDN URLs are unchanged. Regression tests
  cover repeats, concurrent requests, interrupted registration, delivery bytes,
  HEAD, environment isolation and storage failures. All 257 CMS tests pass
  through `node --import tsx --test tests/cms/*.test.ts`; TypeScript and diff
  checks pass. Local migrations and database integrity verification pass. The npm test wrapper cannot
  create its IPC socket here, and local build bundling succeeds but Cloudflare
  prerendering fails at `uv_interface_addresses`. Full GitHub CI and live
  authenticated upload acceptance remain deployment gates for this change.
  Automatic approval review blocked pushing this new payload to GitHub because
  the previous deployment authorization covered the earlier lifecycle change;
  the owner subsequently authorized the combined media/link submission, merge
  and production deployment on 2026-10-01.

- 2026-09-30: Repair article creation and backup identity isolation. Create no
  longer automatically imports the ID/content from the shared browser backup;
  recovery is explicit and copies content only. New editor sessions have unique
  backup keys and URLs; successful saves switch to the database ID URL. Removed
  the unsafe create-conflict fallback that could update an unrelated published
  article. Partial tag/publish failures preserve the already-created row for
  Update retries. Draft saves accept an empty body; publishing and published
  updates require content. Existing-post load failures block saves. Draft and
  Published lists continue using the single database lifecycle, and Unpublish
  moves the same row back to Draft. No migration or remote article changes are
  required. The existing three-draft capacity rule is unchanged. Regression
  coverage exercises the actual editor script, API request sequence, and SQLite
  lifecycle. All 252 CMS tests, TypeScript, the full local build, local D1
  migrations/integrity verification, and `git diff --check` pass. The lifecycle repair was merged to staging as
  `91f332b` and deployed successfully; main merge `5632512` was deployed via
  [production workflow](https://github.com/Watcharapol-Frong/frong.me/actions/runs/36697377227).
  Public homepage/article browser checks passed. Authenticated browser acceptance
  remained pending; the owner subsequently reported the media upload issue above.

- 2026-09-27: Public Markdown rendering now keeps consecutive quote lines inside one blockquote and preserves paragraph breaks and hard line breaks. Previously each `>` line emitted a separate block, fragmenting the quote border and spacing compared with Earth Editor. The regression suite passes 242 tests; TypeScript and build pass. [CMS CI](https://github.com/Watcharapol-Frong/frong.me/actions/runs/36287930894) and [staging deployment](https://github.com/Watcharapol-Frong/frong.me/actions/runs/36287930998) succeeded, and the public staging article returned the grouped blockquote markup.
- 2026-09-27: Updated the homepage title tag to `Frong — Data, Technology & Business` and the default meta description to the requested Thai copy. The homepage title is rendered without the standard site-name suffix. Commit `259011f` passed [CMS CI](https://github.com/Watcharapol-Frong/frong.me/actions/runs/36286249504) and deployed to staging through [run 36286249492](https://github.com/Watcharapol-Frong/frong.me/actions/runs/36286249492); the staging homepage returned the new title and description.
- 2026-09-26: Rewrote `/privacy/` as a Thai-first, bilingual notice grounded in
  the public site's current data flows. It distinguishes consent-based GA4 from
  Cloudflare request processing, Google Fonts, optional YouTube embeds, and
  voluntary email contact; explains retention criteria, reader rights, and
  how to reopen Analytics settings. Privacy requests use `admin@frong.me`.
  Public-facing copy avoids internal CMS names and describes only reader-relevant
  behavior and security measures. Analytics cookie identifiers and browser storage
  implementation terms are omitted from the reader-facing explanation.
  Confirm the GA4 property's retention setting and any provider log settings
  before publishing a specific retention period or introducing new collection.
- 2026-09-26: Added a responsive `More` filter to homepage navigation for
  published article tags outside the fixed primary topics. Selecting a tag
  filters the grid; tags are ordered by article frequency and unavailable tags
  do not appear in the menu. The menu uses a touch-friendly single-column list
  on mobile, a two-column grid on wider screens, and scrolls when the list grows.
  On mobile, `More` stays in the horizontal topic row. Its tag panel is positioned
  separately so it is not clipped by the row's scroll container.
- 2026-09-26: Refined Earth metadata controls to match the editor's minimal
  monochrome text style. Primary Topic uses compact single-select segments;
  tag chips and typing now share one compact input field, with autocomplete for
  existing tags on focus and while typing. Removed redundant tag guidance and
  the Thai-title slug helper copy.
- 2026-09-26: Separated fixed Primary Topics from free-form tags. Earth now
  saves one optional constrained topic (`data`, `technology`, or `business`)
  and offers a keyboard-accessible, creatable two-tag combobox backed by the
  existing canonical tag table. Homepage navigation is fixed to those three
  topics; unclassified legacy articles remain visible under Everything. Added
  migration `0009_primary_topic.sql` and regression coverage for persistence,
  filtering, case-insensitive reuse, suggestions, and legacy nulls. All 241 CMS
  tests, TypeScript, and the local staging-targeted build pass. Local D1 migration
  and integrity verification pass. Migration 0009 was subsequently applied to
  staging and production before their respective code deployments; the
  deployment workflows do not apply migrations.
- 2026-09-26: Fixed Earth Editor divider round-tripping after a block image.
  `tiptap-markdown` used its inline image serializer for TipTap's block image,
  producing `![...](...)---`; reopening that saved Markdown therefore showed a
  literal `---` paragraph instead of a horizontal rule. The editor now closes
  the image block during serialization, with a DOM-backed regression covering
  save/reopen through the real TipTap extension set. All 234 CMS tests,
  TypeScript and `git diff --check` pass. Local D1 reported no pending
  migrations, and the staging integrity verification passed against local data
  (foreign keys, partial indexes and seeded rows). No remote data or deployment
  was changed.
- 2026-09-25: Restored ordered and bulleted list markers in the scrollable
  Earth editor panel. The page-wide padding reset had left markers outside
  the writing column. Zen now matches public article Markdown typography,
  while public and Zen dividers receive a visible border. Editor controls stay
  unchanged. Staging and production still require their normal release checks.
- 2026-09-24: Staging deploy and Access sign-in now work. A first draft save
  exposed invalid manually entered article URL names: Earth now validates the
  slug before submitting and gives an example suitable for Thai-titled posts.
  Verify the full create/save/reopen flow in the staging browser after release.
- 2026-09-24: Prepared separate `staging` and `production` GitHub Actions
  deployments. The staging workflow runs on pushes to the `staging` branch; the
  production workflow is manually dispatched from `main` and references the
  protected `production` GitHub Environment. Both verify bindings, run tests and
  TypeScript, and build for their own Worker. Account setup, runtime Access
  variables, branch creation, and a successful staging/browser check remain
  migration gates; the previous `cms-staging` secrets are not copied or deleted
  by this code change.
- 2026-09-23: Added a manually dispatched staging deployment workflow using
  the existing `cms-staging` GitHub Environment. It is restricted to `main`,
  checks required variables without exposing the token, runs tests and
  TypeScript, then calls the staging preflight/build/deploy helper. A workflow
  run and browser acceptance are still needed; it does not deploy production.
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
