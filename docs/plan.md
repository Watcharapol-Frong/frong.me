# frong.me CMS Implementation Plan

Updated: 2026-09-12 · Status: Gates G0 and G0.5 passed. The release confirm/fail callbacks now require a dedicated secret independent of Cloudflare Access, and the deploy workflow calls them back automatically; provider-first reconciliation for ambiguous/stuck attempts (P1-04b) remains the current release-protocol task. Environment variable SSOT names are now defined in [`docs/cms/environment-map.md`](cms/environment-map.md) and enforced by the deploy workflow and verification scripts with temporary legacy fallbacks.

Requirements: [CMS migration specification, version 6](cms-migration-plan.md). Documentation index: [README](README.md).

This document began as a specification review and now records implementation progress, evidence, tasks, and acceptance gates. The production AI Worker protection is deployed and verified. The Phase 0.5 proof remains isolated under `spikes/`, and Phase 1 code now also lives in the root application under `src/lib/cms/`, `src/server/cms/`, `src/components/cms/`, `src/pages/earth/`, `db/`, `scripts/`, and `tests/cms/`. The Earth admin shell and API routes now exist locally; no main-site CMS production cutover has occurred.

## Additional direction confirmed by the owner

The repository contains an older implementation that has not been updated to the new requirements. Substantial changes are allowed. Design around the new CMS goals and the owner's latest clarifications. Refactor, replace components/services, redesign schemas, and remove unnecessary dependencies as appropriate to the task.

- Differences between old code and the specification define implementation work. They do not require repairing every legacy feature first. For example, implement Thai heading support directly in the new Markdown renderer.
- Inventory the old system to decide what to reuse, replace, or retire. Old APIs, schemas, fields, libraries, and behavior are not compatibility requirements unless they still serve the new goals.
- Use the existing public design as a visual reference. Components, layouts, and workflows can change to suit the new system; exact visual parity is not required. A complete rebrand has not been requested.
- Estimate and accept work against the target system. Do not add compatibility or migration work for retired features or disposable demo content.
- Protect real data, public URLs, and any legacy endpoints still running during transition. Permission to change code does not automatically authorize deleting production data.

## 1. Resume here

| Item | Status |
|---|---|
| Completed | P0-01 through P0-04; Gate G0; S-01 through S-06; Gate G0.5; P1-00 through P1-03; P1-API-01; 1C-01; 1C-02; 1C-03; 1C-06; P1-04a |
| Current phase | Phase 1: Earth API/DAL integration and the release confirm/fail callback loop are complete locally; provider-first reconciliation remains |
| Next task | P1-04b: a reconciliation routine that queries actual GitHub Actions run state for releases/attempts stuck in `reconciling`/non-terminal status, rather than only trusting the workflow's own callback |
| Current risk | Reconciliation must preserve the DAL's idempotency and compare-and-set guarantees, and must not confirm a release live from provider signals weaker than the existing callback contract |
| Real blocker (2026-09-12) | **The deployed staging Worker has no environment secrets or vars.** Run 34667010772's binding table lists exactly three: `DB` (D1), `MEDIA_BUCKET` (R2), `ASSETS`. `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `CF_ACCESS_ALLOWED_EMAIL`, and `RELEASE_CALLBACK_SECRET` are all absent, because `wrangler.jsonc` declares no `vars` and GitHub Environment values reach only the CI job, never the Worker runtime. Consequences: the Access guard's `required()` throws on the missing team domain, so `/earth*` rejects **every** request with 403 — including a genuinely valid Access JWT — and the P1-04a `/confirm` and `/fail` routes would answer 503 (fail-closed, as designed) even if a caller got past Access. Both behaviours are safe but non-functional. Fix is owner-side and cannot be done from this workspace (it requires the secret values): `npx wrangler secret put <NAME> --env staging` for each, noting that `--env staging` is required or the secret lands on the `frong-me` Worker instead of `frong-me-staging` |
| Unverified | Remote staging mutations, dispatch runs, the real confirm/fail callback round-trip against a deployed Worker, and provider reconciliation remain unverified (blocked on the R2 bucket above). D1/R2 backups, fonts/performance, and the public site's earlier HTTP 520 cause also remain unverified |
| Production impact | The AI Worker protection is live. The CMS work has not changed the public site or production CMS infrastructure |
| Routine checks | `npm run test:cms` (138 tests, all passing at this update); `npx wrangler d1 migrations apply DB --local`; `node scripts/db/verify-staging.mjs --wrangler --local` |
| Known local blockers | `npx tsc --noEmit` still stops on the legacy `baseUrl` option in `tsconfig.json`. The root Astro/Cloudflare build now succeeds without legacy Sanity credentials |
| Evidence | [`docs/cms/baseline.md`](cms/baseline.md), [`docs/cms/environment-map.md`](cms/environment-map.md), and [`docs/cms/architecture-spike.md`](cms/architecture-spike.md) |

### SSOT environment variable enforcement (2026-09-12)

Canonical environment variable names are now defined as a Single Source of Truth in [`docs/cms/environment-map.md`](cms/environment-map.md) ("SSOT" section) and mirrored in `.env.example`:

- **Secrets:** `CLOUDFLARE_API_TOKEN`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, `RELEASE_CALLBACK_SECRET`
- **Variables:** `CLOUDFLARE_ACCOUNT_ID`, `CF_D1_DATABASE_ID`, `CF_R2_BUCKET_NAME`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`

Changes made to enforce the SSOT:

| File | Change |
|---|---|
| `.env.example` | Rewritten around the SSOT names with Secrets/Variables sections, legacy-name deprecation notes, and GitHub Environments mapping |
| `.github/workflows/cms-staging-deploy.yml` | Env block now maps SSOT names first (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CF_D1_DATABASE_ID`, `CF_R2_BUCKET_NAME`) with temporary legacy fallbacks (`CF_API_TOKEN`, `CF_DEPLOY_TOKEN`, `CF_ACCOUNT_ID`, `STAGING_D1_DATABASE_ID`, `STAGING_R2_BUCKET_NAME`); legacy aliases are still exported so existing consumers keep working |
| `scripts/build/verify-bindings.mjs` | Reads `CF_D1_DATABASE_ID` and `CF_R2_BUCKET_NAME` first, falling back to `STAGING_D1_DATABASE_ID`/`STAGING_R2_BUCKET_NAME`; error messages and log lines updated to SSOT names |
| `scripts/build/verify-access-staging.mjs` | Reads `CMS_STAGING_HOST` first (legacy `STAGING_HOST`/`CMS_STAGING_URL` fallbacks retained); CLI help updated |

Backward compatibility: existing GitHub `cms-staging` environment configuration keeps working because the workflow maps legacy names into the SSOT variables. When reconfiguring GitHub Environments, create only the SSOT names; legacy fallbacks will be removed in a later cleanup task.

Backup files and workflow definitions do not prove successful execution or restorability. Record separate test evidence.

### Phase 1 code currently in the repository

Code exists for some tasks whose acceptance criteria are not met. Presence in this table does not check a box.

| Area | Files | Owning task and state |
|---|---|---|
| Contracts and validation | `src/lib/cms/contracts.ts`, `src/lib/cms/validation.ts` | P1-01, accepted |
| Schema | `db/migrations/0001_articles.sql`, `0002_taxonomy_assets.sql`, `0003_releases.sql` | P1-01, accepted; includes the state, compare-and-set, and public-asset integrity triggers |
| Data access layer | `src/server/cms/db.ts`, `errors.ts`, `repositories/{posts,taxonomy,assets,releases}.ts` | P1-02 and P1-03, accepted |
| Root Cloudflare configuration | `astro.config.mjs` with `@astrojs/cloudflare` and workerd prerendering; `wrangler.jsonc` with `DB` bound to `portfolio-db-staging` | Earth SSR/API and P1-01 support |
| Earth API and wire DTOs | `src/pages/earth/api/`, `src/server/cms/{api,dispatch,callback-auth}.ts` | API/DAL integration, asset attachment, GitHub repository dispatch, and the authenticated release confirm/fail callback loop are complete locally (P1-04a); provider-first reconciliation for stuck/ambiguous attempts remains P1-04b |
| Earth Access enforcement | `src/middleware.ts`, `src/server/cms/{access,access-guard}.ts` | 1C-02 complete locally; RS256/issuer/audience/time verification through `jose`, TTL-cached remote JWKS, exact route matching, and two-factor development bypass |
| Staging data and verification | `db/seeds/staging.sql`, `scripts/db/verify-staging.mjs` | Support tooling; deterministic and idempotent, exercised locally only |
| Build snapshot exporter | `scripts/build/export-live-snapshot.mjs` | P1-08 support; not yet consumed by any Astro route |
| E2E build verification | `scripts/build/test-e2e-build.mjs`, `scripts/build/astro.config.mjs`, `scripts/build/e2e-src/` | P1-08 support; exercises snapshot export, Astro build, and bilingual HTML title assertions |
| CI automation | `.github/workflows/cms-ci.yml` | Workflow running `test:cms`, `tsc --noEmit`, and `test-e2e-build.mjs` on PRs to main |
| Staging deployment | `.github/workflows/cms-staging-deploy.yml`, `scripts/build/{verify-bindings,deploy-staging}.mjs` | 1C-01, accepted; targets env.staging, validates D1/R2/AUD bindings, guards dev-bypass, and logs deploy artifacts |
| Staging Access verification | `scripts/build/verify-access-staging.mjs` | 1C-03, accepted; verifies unauthenticated 401/403/302, service-token authenticated 200, public bypass 200, with --dry-run mock stub |
| Markdown media resolution | `src/lib/cms/markdown/asset-resolver.ts`, `src/lib/cms/assets/metadata.ts` | P1-06, P1-11, and P1-13 support; the parser, sanitizer, and upload pipeline do not exist yet |
| R2 upload smoke verification | `scripts/db/verify-r2-staging.mjs`, `tests/cms/verify-r2-staging.test.ts`, `npm run verify:r2:dry` | 1C-04 support; dry-run verification passes locally (118 CMS tests green); real staging-bucket run pending the public R2 bucket |
| Full E2E staging smoke test orchestration | `scripts/build/smoke-test-staging.mjs`, `tests/cms/smoke-test-staging.test.ts`, `npm run test:smoke:dry` | 1C-05 support; drives create draft → optimistic-locking conflict → media attach → release begin/confirm → public reader (by the slug captured from the response, never assumed) → mandatory try/finally archive teardown. `--dry-run` passes fully against an in-process mock server. 1C-06 added the real asset-attach route and an explicit release-dispatch route locally; a live run remains gated, undeployed, and still needs the smoke client to pass a registered asset ID and invoke `/dispatch` before `/confirm`. |
| Admin UI | `src/pages/earth/index.astro`, `src/components/cms/{EarthAdminShell,ArticleEditor,PostList,ReleaseDashboard}.tsx`, `src/lib/cms/client/api.ts` | Browser/API wiring exists; autosave and full P1-10 acceptance remain pending |
| Tests | `tests/cms/*.test.ts` plus fixtures and the D1 test adapter | Covers endpoint validation/CRUD/conflicts/releases, browser wire contracts, DAL scenarios, assets, seed idempotency, verification, and snapshots. `tsx` is now an explicit dev dependency |

## 2. Legacy implementation and target-design gaps

| ID | Finding / gap | Evidence and planning implication |
|---|---|---|
| F01 | Root stack matches the Cloudflare target while retaining legacy content | Astro `^7.3.2`, Cloudflare adapter 14.3.1, React 19.2.8, and Tailwind 4.3.3 are configured. The root build and sitemap pass; when legacy Sanity credentials are absent, an empty read-only fallback prevents retired demo content from blocking local/CI builds |
| F02 | Public site still depends on Sanity | `astro.config.mjs` mounts Studio at `/admin`; `src/pages/index.astro` and `src/pages/articles/[slug].astro` still query Sanity even though the root now has the Cloudflare adapter |
| F03 | Target CMS core is partly implemented | The root now has the Phase 1 schema, DAL, Earth shell/browser client, and D1-backed Earth API routes. The Markdown renderer, media upload flow, RSS, public snapshot routes, and protected dispatch/reconciliation remain Phase 1 work |
| F04 | Section 19's historical heading-fix claim does not match current files | `src/lib/slugify.ts` still strips Thai; `PortableTextHeading.astro` reads only immediate `child.text` values. Implement heading criteria in the new renderer without first repairing retired Portable Text code |
| F05 | AI Worker was unauthenticated — resolved in Phase 0 | `ai-worker/src/index.js` now requires the server-only `X-Auth-Secret`, fails closed, limits requests, and restricts CORS. The deployed endpoint returns HTTP 401 without credentials |
| F06 | Metadata exists but language/article support is incomplete | `Layout.astro` includes canonical/OG/Twitter, but fixes `lang="en"` and `og:type="website"`; add per-page values and Article JSON-LD |
| F07 | Three font families are requested | `Layout.astro` loads Inter, Google Sans, and Cormorant Garamond; reported bytes/subsets and self-hosting permissions have not been rechecked |
| F08 | Legacy Sanity backups exist | `.github/workflows/sanity-backup.yml` exports and commits to the repository; two archives exist. This does not prove D1/R2 backup or restoration |
| F09 | Build-time restrictions are overstated | The current adapter supports `prerenderEnvironment`, defaulting to workerd. Test the chosen configuration rather than assuming all builds lack bindings; HTTP snapshots remain an option to prove. [Astro adapter](https://docs.astro.build/en/guides/integrations-guide/cloudflare/#prerenderenvironment) |
| F10 | Revisions are appropriate but do not define a complete publish protocol | Specify atomic writes, idempotency, overlapping releases, duplicate/missing callbacks, workflow retries, and reconciliation with actual deployment state |
| F11 | Media metadata can escape the snapshot boundary | Querying the latest `images` data on every build can publish draft alt/metadata changes. Freeze render metadata and reference immutable object versions |
| F12 | Immediately public uploads conflict with private drafts | Add private upload/preview and explicit promotion of approved assets. Unguessable object keys are not access control |
| F13 | Schema needs relationship and deletion rules | Draft slug uniqueness does not cover live revisions; `ON DELETE CASCADE` may remove rollback revisions. Define withdrawal/archive and route history |
| F14 | Article DELETE route conflicts with revision preservation | Propose withdrawal/archive for the MVP; permanent deletion is separate work after reference and backup checks |
| F15 | Select legacy features that still serve the target | Existing articles have `sources`, `cta`, font, and cover. Design for new requirements: analytical sources remain necessary, while CTA/font selectors may be retired. No one-to-one field migration is required |

**Current conclusion:** Continue with Markdown articles, static public pages, a dynamic admin area, and independent projects. Gate G0.5 is closed from the owner-confirmed staging Worker, workerd/D1 binding, and Access guard verification. Implement Phase 1 through versioned migrations rather than executing the specification's example SQL directly.

## 3. Scope and starting decisions

- First outcome: author a real analysis, upload images/charts, preview, publish, and restore it end to end.
- Thai articles use `/articles/[slug]`; English articles use `/en/articles/[slug]`. Translations are optional; do not generate empty language versions. See [Astro routing](https://docs.astro.build/en/guides/routing/) and [i18n](https://docs.astro.build/en/guides/internationalization/).
- Use the old public design as a reference. Adapt structure and UI to new content, and compare readability and consistency rather than enforcing exact parity.
- Use a white-background PNG chart in both themes initially. Lossless WebP is optional after proving the encoder; high WebP quality does not establish losslessness.
- Phase 2 adds project cards and a private registry. Do not add MDX, iframes, code uploads, or project deployment through the CMS.
- Sanity content is disposable demo content according to the specification. No automatic content migration is planned, but inventory actual public URLs and retain backups before cutover.
- Newsletter, BYOK, and search come later. Do not provision their unused services/secrets in Phase 0.
- Workers is consistent with the current adapter's removal of Pages support. Verify the chosen dependency set in the prototype. [Astro Cloudflare](https://docs.astro.build/en/guides/integrations-guide/cloudflare/#removed-cloudflare-pages-support)

## 4. Tracking conventions

Use `[ ]` for incomplete tasks and `[x]` only after acceptance criteria pass. Record `doing` or `blocked` in the handoff log for work in progress. Code completion alone does not satisfy a task.

Aim to finish each task in one or two sessions of roughly 1–3 hours. Split larger tasks into child IDs such as P1-04a/P1-04b while retaining the parent's dependencies and criteria.

At each handoff, record changed files, checks, actual time, remaining issues, and a specific next task. If account access or secrets are missing, pause only dependent work and continue with fixtures, local tests, or documentation.

## 5. Work sequence and acceptance gates

### Phase 0 — Baseline and unauthenticated AI access

Source: specification sections 5, 8, and 16. Original estimate: 4–6 hours; revisit after infrastructure discovery.

- [x] **P0-01 Baseline inventory** — Read `AGENTS.md`; inspect existing diffs, Node/dependencies, build commands, public URLs, hosting, and the actual AI Worker deployment. Classify components as reuse/replace/retire. Capture available home/article screenshots in both themes and record build results or blockers without secrets. Broken legacy tooling being retired is not a mandatory repair before the new prototype. Evidence: [`docs/cms/baseline.md`](cms/baseline.md). Screenshots were unavailable because the public site returned HTTP 520 and the local build lacked the legacy Sanity project ID.
- [x] **P0-02 Protect the AI Worker** — Fail closed, including when the server secret is missing. Bound requests/tasks/models and payload sizes. Never put the shared secret in the browser; disable the old AI UI temporarily if no authenticated proxy exists. The owner deployed the protected Worker; an unauthenticated production probe returned HTTP 401 with `no-store` and no wildcard CORS on 2026-09-10.
- [x] **P0-03 Environment map** — Separate staging/production, owners, D1, public/private R2, Access audience/team domain, and CI permissions. Record secret names and locations only. Separate build-read, dispatch, and deploy credentials by required privileges. Evidence: [`docs/cms/environment-map.md`](cms/environment-map.md); unknown remote identifiers are explicitly marked.
- [x] **P0-04 Verify protection** — Missing/incorrect secrets are rejected before provider calls. Test valid requests with a provider stub. After rollout, record non-billable endpoint checks and the actual deployment version. Local provider-stub tests pass and the live unauthenticated endpoint returns HTTP 401. The owner confirmed deployment success; the version identifier is not available in this workspace.

**Gate G0: passed 2026-09-10.** Baseline recorded; the owner confirmed deployment and the live unauthenticated request returned HTTP 401 with `Cache-Control: no-store` and no wildcard CORS.

### Phase 0.5 — Architecture proof in staging

Dependency: environment map available. Do not launch the new system in production while G0 is incomplete. Original estimate: 6–10 hours.

- [x] **S-01 Adapter/runtime** — The isolated staging Worker at `https://cms-staging.frong.me` was owner-verified running the selected Astro/Cloudflare stack on workerd with its D1 binding operational.
- [x] **S-02 Authenticate every entry point** — `/earth` and `/earth/*` middleware validates JWT signature/issuer/audience/expiry, application token type, subject, and owner email; mutations require exact Origin and private responses use `no-store`. The staging Access guard and unauthenticated rejection were owner-verified. [Cloudflare JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [x] **S-03 Build snapshot** — The restricted D1 query contract, public snapshot validation, dispatch hash check, fixture, same-release public-output determinism, and staging D1 connectivity were verified.
- [x] **S-04 Real trigger** — The default-branch workflow, minimal payload validator, concurrency policy, ephemeral staging config, dry-run-before-deploy sequence, and protected deploy switch are implemented. Gate closure was owner-confirmed; exact workflow run and provider deployment IDs were not supplied for this repository record. [GitHub repository_dispatch](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#repository_dispatch)
- [x] **S-05 Failure/recovery** — Automated drills cover failed builds/deployments, dispatch and confirmation timeouts, provider-first reconciliation, retries, stale callbacks, and repeated publish requests. The old live pointer is preserved until a correlated provider deployment ID is confirmed.
- [x] **S-06 Record the decision** — Proven configuration, commands, local timings, current quotas, transport rationale, state strategy, and exact remote evidence gaps are recorded in [`docs/cms/architecture-spike.md`](cms/architecture-spike.md).

**Gate G0.5: passed 2026-09-10.** The owner confirmed the staging Worker on workerd, the D1 binding/query path, and the Cloudflare Access rejection boundary. Phase 1 may proceed. Exact remote workflow/deployment identifiers remain an evidence-quality follow-up and are not inferred here.

### Phase 1 — Complete articles, images, charts, and publishing

Dependency: G0.5. Original estimate: 48–70 hours, divided into deliverable milestones.

#### 1A: Schema and release protocol

- [x] **P1-01 Data contract** — Added separate snake_case/epoch-ms database contracts and camelCase/ISO public DTOs, strict runtime validation, sources, cover alt/crop, language, slug, immutable media snapshots, and three versioned Phase 1 migrations. Project/newsletter/AI tables remain deferred.
- [x] **P1-02 Atomic save/publish** — D1 prepared statements and transactional batches implement optimistic draft versions, atomic revision/media snapshots, idempotent release creation, and immutable revision/manifest enforcement. Stale draft writes return a domain error mapped to HTTP 409.
- [x] **P1-03 Release control** — A partial unique index permits one active release, while draft repositories remain independent of release state. Release/attempt state machines and an atomic confirmed-deployment/live-pointer compare-and-set are enforced in both DAL logic and database triggers.
- [x] **P1-04a Authenticate the confirm/fail callback** — `/earth/api/releases/[id]/confirm` and the new `/earth/api/releases/[id]/fail` require a `RELEASE_CALLBACK_SECRET` header, independent of and in addition to the existing Cloudflare Access JWT middleware (defense in depth against a leaked/misscoped Access service token alone forging a deployment outcome); fails closed with HTTP 503 when unconfigured, 401 on a mismatch, using the same SHA-256 constant-time comparison pattern as the AI Worker's `X-Auth-Secret`. Dispatch now carries `attempt_id` to GitHub so the workflow can call back the correct attempt, and `.github/workflows/cms-staging-deploy.yml` calls `/confirm` on a successful non-dry-run deploy or `/fail` on any failure, using the existing `CF_ACCESS_CLIENT_ID`/`CF_ACCESS_CLIENT_SECRET` Access Service Token alongside the new secret. Confirm/fail are both idempotent: a retried callback with the same outcome is a no-op 200, and a conflicting one is rejected.
- [ ] **P1-04b Provider-first reconciliation** — For releases/attempts stuck non-terminal (dispatch network error, missing callback, workflow crash before it can report), query the actual GitHub Actions run state rather than only trusting a callback, and resolve or continue reconciling accordingly. Retry ambiguous dispatches using the same attempt ID once a release is back in a retryable state (`failed` release rows currently require an explicit `queued` transition before a new attempt can start — no code path does this yet).
- [ ] **P1-05 Slug/withdraw/rollback** — Check route collisions across draft/live states. Define redirects for slug/language changes. Archive without deleting revisions. Rollback creates a new release from a previous manifest with the required files and code compatibility.

**Acceptance 1A:** Automated tests cover autosave A + publish B, simultaneous publish requests, retry without duplicate releases, stale callbacks, and slug collisions with live revisions.

Workflow concurrency is an additional safeguard. Verify the chosen queue/cancellation behavior; it cannot replace durable release state. [GitHub concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)

#### 1B: Renderer and public pages

- [ ] **P1-06 Markdown pipeline** — Parser → shared heading IDs/TOC → snapshot media metadata → allowlist sanitization. Preview and public output use the same rules. Separate build-only modules from runtime secrets.
- [ ] **P1-07 Heading regression** — Cover Thai, English, bold, links, duplicates, and otherwise empty IDs. IDs are unique and TOC targets match. Keep heading-ID rules separate from English article URL slugs.
- [ ] **P1-08 Public routes** — Home/articles read release snapshots. Add English routes, article-only RSS, sitemap for real pages, lang/canonical/OG/JSON-LD, and hreflang only for translation pairs present in the same release.
- [ ] **P1-09 Contract/security tests** — Reject or sanitize scripts, event handlers, and dangerous URLs. Exclude drafts, internal metadata, and tokens from HTML/JSON/RSS/client bundles/public artifacts. A broken article fails the entire release build.

**Acceptance 1B:** Thai/English fixtures render correctly, TOC/links work, snapshot builds do not query drafts, and main public content remains readable without JavaScript.

#### 1C: Editor and media

- [ ] **P1-10 Editor** — Title/slug/body/excerpt/tags/lang/cover form, server validation, draft-only autosave, and local recovery keyed by post/version without silent server overwrites. Show saved/unsaved/conflict/error states.
- [ ] **P1-11 Upload/preview** — One pipeline for drag/drop/paste/file picker. Resize JPEGs without upscaling; preserve charts as PNG by default. Server validates signature/MIME/bytes/dimensions/pixel count and rejects SVG. Set limits from fixtures and real platform constraints. R2 upload smoke verification (task 1C-04) is complete: `scripts/db/verify-r2-staging.mjs` verifies the canonical `https://images.frong.me/assets/<sha256>/<filename>` URL contract, payload idempotency, and the put/get/delete lifecycle with mandatory cleanup; `npm run verify:r2:dry` runs it against an in-memory mock bucket and `tests/cms/verify-r2-staging.test.ts` covers the routine. 1C-06 added the version-guarded HTTP attachment step for an asset row already registered in D1. The upload/registration UI pipeline and a real staging-bucket run remain pending.
- [ ] **P1-12 Private media lifecycle** — Upload privately and preview through authentication. Explicit publish approval promotes only referenced release assets to immutable public keys. Document when bytes become public and that previously public files may remain cached after withdrawal. Failed builds do not expose unrelated draft files.
- [ ] **P1-13 Freeze media metadata** — Store contextual alt, dimensions/format/checksum/crop in the revision/snapshot. Editing A's draft alt/image then publishing B must not change live A. Handle R2-success/D1-failure with retries/orphan tracking, not automatic deletion.
- [ ] **P1-14 Reader image UX** — Add width/height, appropriate in-body lazy loading, and non-lazy covers. Crop/zoom preserve originals. Display 1600px charts at up to 800px without color inversion and with readable mobile details.

**Acceptance 1C:** Draft → close/reopen → recovery → cover/chart upload → preview → publish without typing image URLs or editing code. Test private drafts, forged MIME, oversized files, interrupted connections, and unauthenticated requests.

#### 1D: Backup, cutover, and a real article

- [ ] **P1-15 Backup before cutover** — Export a consistent D1 set containing drafts/revisions/releases/metadata plus R2 bytes. Manifest includes checksums/schema version/code commit/lockfile. Store privately with an additional copy outside the production account or encrypted offline.
- [ ] **P1-16 Restore drill** — Restore in separate staging, recreate secrets securely, rebuild the same release, and verify all images. Measure against one-day recovery/seven-day data-loss targets. Schedule weekly and pre-migration backups with four weekly/three monthly sets.
- [ ] **P1-17 Font/visual review** — Verify Thai/English Google Sans and actual downloads before removing Inter. Decide serif usage from the new design and real content. Defer self-hosting until terms are checked. Review both themes using old screenshots as reference.
- [ ] **P1-18 Cutover runbook** — Preserve the old Sanity deployment/backup and URL inventory. Redirect actual routes only. Plan app/content/schema rollback. Replace/remove Sanity integrations/dependencies/Studio during development; switch production and retire old workflows/services after acceptance. Reuse or rewrite AI logic as appropriate and retain existing archives.
- [ ] **P1-19 Publish a real analysis** — At least one article includes a cover, white-background chart, alt, summary/table, and sources. Check mobile/desktop, both themes, RSS/SEO, and deployment status.
- [ ] **P1-20 Measure and hand over** — Record LCP/CLS with test conditions, editor/public interactions, and field-data limitations. Targets are LCP <2.5s, CLS <0.1, INP <200ms; Lighthouse does not establish field INP. Record unresolved issues and remediation before passing the gate.

**Gate G1:** P1-01–P1-20 pass, a real illustrated analysis is live, and failure/rollback/restore are demonstrated before project work begins. When field measurements are insufficient, report available evidence and a collection plan rather than claiming an unmeasured pass.

### Phase 2 — Project cards and central registry

Dependency: G1. Original estimate: 12–18 hours.

- [ ] **P2-01** Add `projects`, `project_revisions`, `project_resources`, `project_articles`, and media-reference migrations; separate public/private DTOs.
- [ ] **P2-02** Registry form, preview, publish/withdraw/rollback through the existing release protocol. Require HTTPS URLs without credentials. No automatic destination fetching in the MVP.
- [ ] **P2-03** Merge feed by time and ID; featured ordering uses separate sort_order. `<a href>` works without JS. No `/work/[slug]` pages or project RSS entries.
- [ ] **P2-04** Register a real project with repo/commit, hosting, data/version/license, backup/runbook, or reasons for non-use. Extend export/restore to actual referenced data bytes.
- [ ] **P2-05** Test draft card A + publish B, withdrawal followed by build failure, destination downtime without main-build failure, and internal-data exclusion from every artifact.

**Gate G2:** A real card opens an independent deployment; registry/restore work; card publishing/withdrawal never deploys or deletes project resources.

### Phase 3 — Newsletter

Dependency: G1; default sequence follows G2. Original estimate: 14–20 hours.

- [ ] **P3-01** Select sender, verify domain/current limits, and design consent/retention/privacy notice against requirements checked at implementation time. Do not assume IP retention is always required or that a checklist proves legal compliance.
- [ ] **P3-02** Signup → expiring single-use confirmation token → confirmed; rate limiting and Turnstile. Unsubscribe and suppression work before opening signup.
- [ ] **P3-03** Manual send with preview/test recipient, campaign ID/idempotency, non-duplicating retries, and bounce/complaint handling. Sending is independent of publishing.
- [ ] **P3-04** Test the full cycle using sandbox/authorized test recipients: pending users excluded, unsubscribed users suppressed, and restoration never sends live email.

**Gate G3:** Signup/confirmation/delivery/unsubscribe pass before launch; tokens/subscriber data stay out of public artifacts and exposed backups.

### Phase 4 — AI Assistant and BYOK

Dependency: G1 and Phase 0 authentication; default sequence follows G3. Original estimate: 18–26 hours.

- [ ] **P4-01** Write-only key settings; AES-GCM with a fresh IV per encryption, key versions, and rotation/recovery. No plaintext in responses/logs/general exports.
- [ ] **P4-02** Server adapters and model discovery follow provider documentation verified at implementation. Add timeouts/limits/error redaction. Prevent custom-URL private-network and redirect bypasses, or restrict an allowlist until protection is proven.
- [ ] **P4-03** Build an AI panel for the new editor, reusing suitable legacy logic only. Add translate/suggest-slug. Owner reviews and saves AI results before publishing. Test mocks before actual provider calls.
- [ ] **P4-04** Verify ciphertext, authentication, rotation, SSRF defenses, and credit/usage limits. Recheck legacy default models.

**Gate G4:** Supported providers can be added through UI, keys never return to the browser, and public requests cannot invoke AI.

### Phase 5 — Search and pagination

Dependency: G1 and roughly 30 or more content items. Original estimate: 8–12 hours.

- [ ] **P5-01** Build search from public releases only. Test Thai/English queries and withdrawn content.
- [ ] **P5-02** Pagination/archive, ordering, canonical/sitemap for actual pages, and navigation without JavaScript.
- [ ] **P5-03** Measure index size/mobile loading and verify exclusion of internal data.

**Gate G5:** Search/pagination work at real content volume without regressing publishing or performance.

## 6. Time and scope control

| Stage | Original hours | Weeks at 7 hours/week |
|---|---:|---:|
| Phases 0 + 0.5 + 1: first real article | 58–86 | About 9–13 |
| Phases 2–5 | 52–76 | About 8–11 |
| Total | 110–162 | About 16–24 |

These are source estimates, not a newly validated commitment. Release recovery, private media, and restoration may add work. Re-estimate after S-06 and each milestone. An illustrative 25% contingency gives about 138–203 hours, or 20–29 weeks at seven hours/week, excluding writing and independent project development.

At the actual availability of 5–10 hours/week, the original total spans roughly 11–33 weeks before contingency. Avoid fixed completion dates initially. After G1, alternate writing and development weeks and assess whether the next phase improves actual publishing.

## 7. Decisions needed at the appropriate stage

| Decision | Proposed starting point | Needed before |
|---|---|---|
| Actual hosting/permissions | Inspect accessible accounts; record locators, not secrets | S-01 |
| Build runtime/transport | HTTP public snapshot; choose Node/workerd through the prototype | S-06 |
| Overlapping publish | One active release in MVP; durable queue only when needed | P1-03 |
| Draft images | Private preview; promotion on approved publish | P1-12 |
| Withdrawal/slug history | Archive and explicit redirects; no MVP hard delete | P1-05 |
| Legacy cover/sources/CTA/font | Design fields for requirements; reuse/replace/retire without mandatory field mapping | P1-01 |
| Backup destination | Private production-separated storage plus off-account/offline copy | P1-15 |
| Serif/fonts | Verify actual use/downloads; defer self-hosting | P1-17 |
| Newsletter provider/privacy | Verify in Phase 3 | P3-01 |

These are review proposals, not claims of implemented behavior. Record reasons for decision changes and update related tasks/criteria in this file.

## 8. Starting and ending each session

1. Read this plan, root `AGENTS.md`, and workspace diffs; preserve unrelated user work.
2. Select the first task with satisfied dependencies and state its ID/deliverable.
3. Read relevant Astro guides required by `AGENTS.md`; use fixtures/local environments before production.
4. Start the dev server with `astro dev --background`; manage it with `astro dev status`, `astro dev logs`, and `astro dev stop`.
5. Verify the change appropriately: run `npm run test:cms` for contract/DAL/tooling changes, add renderer fixture and security checks, use the browser or screenshots for UI, and run release failure drills for publishing work.
6. Record commands, real results, and evidence paths without secrets. Local checks do not satisfy remote gates.
7. Update checkboxes, time, decisions, blockers, and an immediately actionable next step. Specify a task rather than merely “continue Phase 1.”

### Handoff log

| Date | Task | Status | Changes / evidence | Actual time | Next |
|---|---|---|---|---|---|
| 2026-09-12 | CI-04 (Astro v6 binding migration) | done and verified live | The owner captured the `/earth` 500 with `wrangler tail`: `Astro.locals.runtime.env has been removed in Astro v6. Use 'import { env } from "cloudflare:workers"' instead.` The adapter defines `locals.runtime.env` as a getter that throws (`@astrojs/cloudflare/dist/utils/cf-helpers.js`), and `access-guard.ts` read it only after `isEarthRoute()` matched — which is exactly why `/earth*` 500'd while every other SSR route was healthy. Added `src/server/cms/runtime-env.ts` with `resolveRuntimeEnv`, which prefers an injected `locals.env` and otherwise does `await import('cloudflare:workers')`; the import is dynamic so Node tests never resolve the workerd-only module, and the adapter externalises `cloudflare:*` at build time (verified: `dist/server/chunks/runtime-env_*.mjs` keeps the import intact). `databaseFromLocals` became the async `resolveCmsDatabase`, plus `resolveCmsEnvironment` for the three callback routes; nine route files, the middleware guard, and both test files were updated, and `locals.runtime` is now referenced nowhere in `src/`. Verified: `npm run test:cms` 138/138, focused strict TypeScript clean across all 22 changed files, `npm run build` green, deploy run [34667010772](https://github.com/Watcharapol-Frong/frong.me/actions/runs/34667010772) green with `Deploy exit code: 0` and version `dce9f4a5-e176-4fe9-9559-86cdd710c083`. **Live probe now correct:** `/earth` → 401, `/earth/api/posts` → 401, `/earth` with a forged assertion → 403, `/` → 200. Note the tests inject `locals.env` and therefore never exercise the `cloudflare:workers` branch — that path is proven only by the live probe above. The same run's binding table exposed the next blocker (no Worker secrets/vars; see the blocker row). | Not tracked | Owner: set `RELEASE_CALLBACK_SECRET`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` (and `CF_ACCESS_ALLOWED_EMAIL` if enforced) on the Worker with `npx wrangler secret put <NAME> --env staging`, then re-probe: a valid Access JWT should reach `/earth`, and only then can the P1-04a confirm/fail callbacks be exercised live |
| 2026-09-12 | CI-03 (staging Worker deployed; `/earth` 500) | superseded by CI-04 | The owner created/authorised the missing R2 bucket path, so `portfolio-media-staging` was created via the Cloudflare API and `wrangler deploy --env staging` then succeeded for real. Getting to a *correctly reported* green run took three more real runs and exposed two further CI bugs, both now fixed: (a) run 34665791591 and 34665968882 reported **failure despite deploying successfully** — wrangler 4.x prints `Current Version ID:`, not `Deployment ID:`, so the extraction grep matched nothing and exited 1; under GitHub's default `bash -e` shell plus the pipefail added in `78b80b0`, that assignment aborted the step before any diagnostic echo could run. Reproduced the exact abort locally under `bash -e` before fixing. The greps now accept the Version ID spellings and are non-fatal (`|| true`), and the deploy's real status is captured with `|| DEPLOY_EXIT_CODE=$?` so a genuine failure still fails the step after the artifact JSON records `mode: "failed"`. (b) `WRANGLER_SEND_METRICS=false` was added in `671f4b4` on a **wrong diagnosis** (telemetry was never the cause); the setting is harmless and kept, but the commit message's claim is corrected here and in `2540a35`. Final run [34666143593](https://github.com/Watcharapol-Frong/frong.me/actions/runs/34666143593) is genuinely green and self-consistent: `Deploy exit code: 0`, `Mode: live`, `Deployment ID: 76b236e9-d46c-40f2-9970-9dc7a409559d` — a real Cloudflare version ID rather than the empty string earlier runs would have sent as `providerDeploymentId`. **Remaining defect:** all `/earth*` routes return 500 on the deployed Worker (see the blocker row above); `/` and other SSR routes are healthy. Note also that `wrangler.jsonc` declares no `vars`, so `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, and `RELEASE_CALLBACK_SECRET` must exist as Worker secrets/vars on `frong-me-staging` specifically (GitHub Environment values reach only the CI job, never the deployed Worker's runtime) — unverified from this workspace. | Not tracked | Capture the `/earth` runtime exception with `wrangler tail --env staging`, fix it, confirm `/earth` returns 401 unauthenticated, verify the three Worker-side vars/secrets exist on `frong-me-staging`, and only then exercise the P1-04a confirm/fail callbacks live |
| 2026-09-12 | CI-02 (first real staging deploy attempt) | superseded by CI-03 | Adopted the owner's SSOT env-var naming (external edit to `verify-bindings.mjs`, `verify-access-staging.mjs`, `docs/cms/environment-map.md`, `.env.example`, tests — reviewed and confirmed coherent). Fixed two real bugs found while wiring the owner's requested `secrets`/`vars` fallback into `.github/workflows/cms-staging-deploy.yml`: (1) a job-level `env:` block cannot reference a sibling key via `env.*` — GitHub rejected the dispatch with `Unrecognized named-value: 'env'`; removed the invalid `STAGING_D1_DATABASE_ID`/`STAGING_R2_BUCKET_NAME` aliases (redundant — `verify-bindings.mjs` already falls back to those legacy names itself); (2) `github.event.client.payload` (dot, invalid) vs the correct `client_payload` on the `CMS_MANIFEST_SHA256`/`IS_DRY_RUN` lines, inconsistent with the correct usage two lines above. After both fixes, triggered `gh workflow run cms-staging-deploy.yml -f dry_run=false` for real (run [34665494641](https://github.com/Watcharapol-Frong/frong.me/actions/runs/34665494641)) and watched it with `gh run watch --exit-status`: the job reported all-green (1m3s) but `wrangler deploy --env staging` actually failed with a real Cloudflare API error — `R2 bucket 'portfolio-media-staging' not found` — because the deploy step piped wrangler through `tee` without checking the pipe's exit status, so the failure was silently swallowed and mode was recorded as `"live"` with empty `url`/`deploymentId`. Independently confirmed via the Cloudflare API (`r2_buckets_list`) that the connected account has exactly one bucket, `dashboard-unilever` — `portfolio-media-staging` does not exist. Fixed the silent-failure bug: the step now captures `PIPESTATUS[0]`, records `mode: "failed"` in the artifact JSON, and `exit`s with wrangler's own code, so `if: success()`/`if: failure()` (including the P1-04a confirm/fail callbacks) see the real outcome on the next run. Did not create the missing R2 bucket — that is a real infrastructure change on the owner's Cloudflare account and was not part of what was asked. | Not tracked | Create (or point `wrangler.jsonc` at an existing) R2 bucket for `portfolio-media-staging`, then re-trigger `cms-staging-deploy.yml` with `dry_run=false` to get a real, correctly-reported deploy outcome; only then can the P1-04a confirm/fail callback loop be exercised live end-to-end |
| 2026-09-12 | P1-04a | done locally | Added `RELEASE_CALLBACK_SECRET`-authenticated `/earth/api/releases/[id]/confirm` (existing route, now auth-gated) and a new `/earth/api/releases/[id]/fail`, both independent of the Cloudflare Access middleware that already covers all of `/earth/*` (owner-chosen defense-in-depth: reused Access Service Token plus this new secret). Added `src/server/cms/callback-auth.ts` (fail-closed 503 when unset, 401 on mismatch, SHA-256 constant-time compare matching the AI Worker's `X-Auth-Secret` pattern), `failReleaseAttempt` in `repositories/releases.ts` (idempotent terminal-failure transition for attempt+release, mirroring `confirmReleaseLive`'s idempotency), `attempt_id` added to the GitHub dispatch `client_payload` so the workflow knows which attempt to call back, and optional `workflowRunId` recording on both confirm and fail. Updated `.github/workflows/cms-staging-deploy.yml` to call `/confirm` after a successful non-dry-run deploy and `/fail` on any job failure, reusing the `CF_ACCESS_CLIENT_ID`/`CF_ACCESS_CLIENT_SECRET` secrets from 1C-03. Documented the required Access Service Auth policy and the new secret in `docs/cms/environment-map.md` (infra configuration, not code — cannot be completed from this workspace). Did not implement P1-04b (provider-first reconciliation for stuck/ambiguous attempts) or a `failed`→`queued` retry transition; both remain open. | Not tracked | P1-04b: build a reconciliation routine that queries real GitHub Actions run state for non-terminal releases/attempts, and add the `failed`→`queued` release transition a retry needs before a new dispatch attempt can start |
| 2026-09-11 | 1C-06 | done locally | Added `POST /earth/api/posts/[id]/assets` over `addPostAssetUsage`, returning the camelCase post detail DTO and current-version details on stale 409s. Added `POST /earth/api/releases/[id]/dispatch`, which creates the requested DAL attempt, sends the constrained `cms-staging-release` GitHub payload using server-only configuration, and advances accepted dispatches to building; `/confirm` now accepts the provider-success callback from that building state before the existing atomic live-pointer confirmation. Added two handler-level HTTP integration tests. Exact baseline `npm run test:cms`: 133/133; final: 135/135. Local D1 migration/verification and the root Astro build pass. No remote dispatch, callback, or deployment was attempted. | Not tracked | P1-04 remainder: authenticate callbacks and implement provider-first reconciliation; then align the gated live smoke client with the registered-asset and explicit-dispatch contracts |
| 2026-09-11 | 1C-05 | authored + dry-run verified; live run remains gated | Added `scripts/build/smoke-test-staging.mjs` orchestrating the full draft → optimistic-locking → media attach → release begin/confirm → public reader → mandatory archive teardown lifecycle against the Earth API, with an in-process mock server implementing the same request/response contracts (including the `{error:{code,message,details}}` conflict shape) for `--dry-run`. Teardown runs via try/finally so it executes even after an earlier step fails, and reports the orphaned post ID if teardown itself fails. Added `tests/cms/smoke-test-staging.test.ts` and `npm run test:smoke:dry`. Per the task's own GATE, live (non-dry-run) execution is refused with the unmet precondition(s) printed until Step 1's real deploy reports success, and until `SMOKE_GATE_1C03_LIVE_PASSED`/`SMOKE_GATE_1C04_R2_PASSED` are explicitly attested after those checks truly pass live — none of that has happened yet, so live mode has not been run. | Not timed | P1-04: protect the release confirmation callback, connect repository dispatch, and add provider reconciliation — this also closes the real gap the smoke test surfaced (no HTTP route yet creates a release deployment attempt, so live Step 4's confirm cannot succeed even once the GATE opens) |
| 2026-09-11 | 1C-03 | done locally | Implemented Zero Trust verification script `scripts/build/verify-access-staging.mjs` verifying Case 1 (unauthenticated admin / API rejected with 401/403/302), Case 2 (authenticated via service token headers `CF-Access-Client-Id` & `CF-Access-Client-Secret` or JWT assertion -> 200 OK), and Case 3 (public route bypass -> 200 OK with article/root fallback). Added in-process mock Cloudflare Access HTTP server for `--dry-run` and comprehensive integration tests in `tests/cms/verify-access-staging.test.ts`. All 103 CMS tests passing; verified clean local dry-run output and missing-credential guard. | Not timed | P1-04: protect release confirmation callback, connect repository dispatch, and add provider reconciliation |
| 2026-09-11 | 1C-02 | done locally | Added runtime Access JWT enforcement for `/earth` and descendants, TTL-cached Cloudflare JWKS verification with `jose`, generic 401/403 responses, exact public-route exclusion, strict DEV-plus-flag bypass, and generated-key integration tests. Made the Earth shell on-demand so runtime middleware cannot be replaced by a build-time static 401. Final combined `npm run test:cms`: 94/94; focused strict TypeScript: pass; local D1 migration/verification: pass; `npx astro build`: pass and `/earth` absent from static client output | Not timed | Deploy through the reviewed staging path and verify authenticated/unauthenticated HTTP behavior before 1C-03 removes any spike files |
| 2026-09-10 | P1-API-01 | done locally | Added strict D1-backed post/release endpoints, explicit camelCase DTOs, atomic editor bundle saves, 409 current-version details, draft-to-revision release creation, atomic live confirmation, browser-compatible overview/detail payloads, Cloudflare adapter configuration, and endpoint tests. `npm run test:cms`: 79/79; focused strict TypeScript: pass; local D1 migrations and verification: pass; `npx astro build`: pass, including sitemap generation | Not timed | P1-04: authenticate confirmation callbacks, dispatch releases, and reconcile provider state before remote exposure |
| 2026-09-10 | CI-01 | done | Created `scripts/build/test-e2e-build.mjs`, `scripts/build/astro.config.mjs`, `scripts/build/e2e-src/`, and `.github/workflows/cms-ci.yml`; verified live snapshot export (mock and SQLite), Astro static compilation, and bilingual article assertions (`/articles/...` and `/en/articles/...`) | Not timed | P1-04 |
| 2026-09-10 | DOCS-06 | done | Replaced the renamed GitHub repository across `.env.example` and the documentation: dispatch target and `GITHUB_REPO` are now `Watcharapol-Frong/frong.me`; recorded that the REST API returns 301 for the old path instead of following the redirect | Not timed | P1-04 |
| 2026-09-10 | DOCS-05 | done | Synchronized the root README, documentation index, plan resume/inventory, environment map, architecture follow-up, historical migration note, specification status line, and agent instructions with the merged Phase 1 code; recorded `npm run test:cms` at 43 passing tests and re-confirmed both legacy local blockers | Not timed | P1-04 |
| 2026-09-10 | P0-01 | done with recorded external blockers | Added `docs/cms/baseline.md`; root static build reaches route generation but fails without the legacy Sanity project ID; `frong.me` returned HTTP 520; classified legacy code/dependencies for reuse, replacement, or retirement | Not timed | Owner review |
| 2026-09-10 | P0-02 | done | Added fail-closed `X-Auth-Secret`, exact-origin CORS, no-store responses, input/provider/task/model/body limits, a required Wrangler secret, tests, and local secret example; disabled the old browser-direct AI view; owner deployed the protected Worker | Not timed | P0-04 verification |
| 2026-09-10 | P0-03 | done | Added `docs/cms/environment-map.md`; separated environments, bindings, secret locations, token purposes, and verification commands without recording values | Not timed | Owner review |
| 2026-09-10 | P0-04 / Gate G0 | done / passed | Automated provider-stub tests pass; local rejection/CORS checks pass; owner confirmed deployment and live unauthenticated `POST /generate` returned 401 with `no-store`, JSON Unauthorized, and no wildcard CORS | Not timed | S-01 |
| 2026-09-10 | P1-00 / Gate G0.5 | done / passed | Owner confirmed `https://cms-staging.frong.me` runs on workerd, the staging D1 binding/query path works, and unauthenticated Access requests are rejected; exact remote workflow/deployment IDs were not supplied | Not timed | P1-01/P1-02 contracts and migrations |
| 2026-09-10 | P1-01 | done | Added CMS row/input/public contracts, strict runtime parsers, and three D1 migrations for drafts/revisions, taxonomy/assets, and release state; local TypeScript and SQLite constraint smoke tests pass | Not timed | P1-02 atomic save/publish and P1-03 release control DAL |
| 2026-09-10 | P1-02/P1-03 | done | Added typed D1/error wrappers; post, taxonomy, source, asset, revision, release, attempt, and immutable build-snapshot repositories; added database state/CAS/public-asset triggers and focused DAL integration tests | Not timed | P1-04 dispatch, callback authentication, and provider reconciliation |
| 2026-09-10 | S-01–S-06 / Gate G0.5 | historical local milestone; superseded by P1-00 gate closure | Added isolated Astro/Cloudflare/D1/Access architecture spike, staging workflow, D1 HTTP snapshot transport, JWT/Origin middleware, deterministic public build, failure-state drills, and `docs/cms/architecture-spike.md`; no production cutover | Not timed | Superseded by the owner-confirmed staging result recorded in P1-00 |
| 2026-09-10 | DOCS-04 | done | Consolidated the root README, historical migration note, documentation index, specification status, plan/resume state, baseline follow-up, environment map, architecture record, and handoff around completed Phase 0 and Phase 0.5 local evidence | Not timed | Configure `cms-staging` and execute S-01 through S-04 remote checks |
| 2026-09-10 | DOCS-03 | done | Translated documentation into English, moved this plan into `docs/`, and updated navigation; implementation remains unstarted | Not timed | P0-01 |
| 2026-09-10 | PLAN-02 | done | Owner confirmed substantial legacy-code changes are allowed; prioritize target requirements and avoid unnecessary legacy repair/compatibility work | Not timed | P0-01 |
| 2026-09-10 | REVIEW-01 | done | Reviewed key files/lockfile/source specification and Astro/Cloudflare JWT/GitHub documentation; created the original plan; no build/deploy/restore | Not timed | P0-01 |

Use this template for subsequent sessions:

```text
Date:
Task ID / status:
Delivered outcome:
Changed files / commit if available:
Verification commands and results / evidence location:
Not yet tested:
Decision and rationale:
Blocker / required input / who can resolve it:
Actual time:
Next action (Task ID + first step):
```

### Latest session handoff

```text
Date: 2026-09-12 UTC
Task ID / status: P1-04a done locally; P1-04b (provider-first reconciliation) next
Delivered outcome: All of /earth/* (including /confirm) was already behind the Cloudflare Access JWT middleware, but nothing distinguished the deploy workflow's machine call from any other authenticated Earth request, and no code path let the workflow report its own failures back at all — a failed `wrangler deploy` after a successful dispatch would leave the release stuck in `building`/`deploying` forever. Per the owner's explicit choice (defense in depth), added a second, independent secret check inside the route handlers themselves: `verifyReleaseCallbackSecret` (src/server/cms/callback-auth.ts) compares an `X-Release-Callback-Secret` header against `RELEASE_CALLBACK_SECRET` using the same SHA-256 constant-time pattern as the AI Worker's `X-Auth-Secret`, fails closed with 503 when unconfigured, and 401 on a mismatch — checked before any body parsing or DB access on both `/earth/api/releases/[id]/confirm` (existing route) and the new `/earth/api/releases/[id]/fail`. Added `failReleaseAttempt` to repositories/releases.ts as the unhappy-path counterpart to `confirmReleaseLive`: transitions whatever non-terminal state the attempt/release are actually in to `failed`, is idempotent against a retried callback (already-`failed` is a no-op 200), and refuses to fail an already-`confirmed` attempt or an already-`live` release. `dispatchRelease` now includes `attempt_id` in the GitHub `client_payload` (previously only `release_id`/`manifest_sha256`), since the workflow needs it to know which attempt to call back. `confirm`/`fail` both accept an optional `workflowRunId` that gets recorded via `COALESCE` alongside the state transition, without requiring it on every call. Updated `.github/workflows/cms-staging-deploy.yml`: moved `IS_DRY_RUN` to job-level env (it needs to be visible to a later step's own `if:` condition, not just the deploy step that computed it), added a `Confirm release live` step that runs only on a successful non-dry-run deploy with both IDs present, and a `Report deploy failure` step that runs on `failure()` — both reuse the existing `CF_ACCESS_CLIENT_ID`/`CF_ACCESS_CLIENT_SECRET` Access Service Token secrets from 1C-03 alongside the new `RELEASE_CALLBACK_SECRET`. Documented the new secret and the still-open Access Service Auth policy requirement in docs/cms/environment-map.md (dashboard/CLI configuration, not code — cannot be done from this workspace).
Changed files / commit if available: `src/server/cms/callback-auth.ts` (new), `src/server/cms/errors.ts`, `src/server/cms/api.ts`, `src/server/cms/dispatch.ts`, `src/server/cms/repositories/releases.ts`, `src/lib/cms/contracts.ts`, `src/lib/cms/validation.ts`, `src/pages/earth/api/releases/[id]/confirm.ts`, `src/pages/earth/api/releases/[id]/fail.ts` (new), `.github/workflows/cms-staging-deploy.yml`, `.env.example`, `docs/cms/environment-map.md`, `tests/cms/api-endpoints.test.ts`, `docs/plan.md`; not committed in this session.
Verification commands and results / evidence location:
1. `npm install` (node_modules was absent at session start): succeeded, 1204 packages.
2. `npm run test:cms`: exactly 137 tests, 137 pass, 0 fail (135 prior + 2 new: the `/fail` endpoint lifecycle test with an idempotent-retry assertion, and the fail-closed-when-unconfigured test covering both `/confirm` and `/fail`). Updated the two existing confirm-related tests to add the required header and assert the pre-existing 401 without it, and to assert a same-outcome retried confirm is idempotent (200, not an error).
3. `npx wrangler d1 migrations apply DB --local`: no new migrations (schema unchanged this session), exit 0.
4. `node scripts/db/verify-staging.mjs --wrangler --local`: foreign keys, three partial indexes, and population checks passed, exit 0.
5. Focused strict TypeScript check (temporary tsconfig excluding only the known retired `baseUrl` option) against every changed file: zero errors. `npx tsc --noEmit` against the real `tsconfig.json` stops only on the pre-existing, documented `baseUrl` error — no new errors.
6. `npm run build`: root Astro/Cloudflare build passed and generated the sitemap, exit 0.
7. Parsed the modified `.github/workflows/cms-staging-deploy.yml` with `js-yaml` to confirm it is syntactically valid and the new steps appear in the expected order; this only proves the YAML parses, not that the live callback round-trip works.
Not yet tested: No real GitHub Actions run, Cloudflare Access Service Token, or deployed staging Worker exists to exercise the actual callback — the workflow changes, secret names, and header wiring are unverified beyond local unit tests and YAML parsing. P1-04b (querying real GitHub Actions run state for stuck/ambiguous attempts) was not attempted this session; a release that reaches `failed` still cannot be retried with a new dispatch attempt because no code path transitions `failed` back to `queued` (`startReleaseAttempt` requires the release to already be in `queued`/`building`/`deploying`/`reconciling`) — confirmed by writing and then removing a test that assumed otherwise.
Decision and rationale: Chose a route-level shared-secret check over relying solely on the Cloudflare Access Service Token because the owner explicitly asked for both (defense in depth) — a Service Token scoped or configured more broadly than intended would otherwise be sufficient on its own to forge a deployment outcome for any release. Reused the exact `CF_ACCESS_CLIENT_ID`/`CF_ACCESS_CLIENT_SECRET` secret names from 1C-03 rather than minting new ones, since the deploy workflow and the verification script are both machine callers needing the same Access identity. Split `/fail` into its own route rather than overloading `/confirm` with an outcome field, matching the existing one-route-per-operation convention (`/dispatch`, `/confirm`) and keeping each route's request contract single-purpose. Deliberately did not implement the `failed`→`queued` retry transition or any GitHub API polling in this session — both are real, separately testable pieces of work better scoped as P1-04b, consistent with the plan's own guidance to split large tasks into child IDs.
Blocker / required input / who can resolve it: Remote proof requires the Access Service Auth policy and both new/reused secrets actually configured on the staging Access application, GitHub environment, and Worker (owner action, documented in environment-map.md); none of that can be done from this workspace. P1-04b needs a decision on how reconciliation should query GitHub (poll `GET /repos/{owner}/{repo}/actions/runs` filtered by the recorded `workflow_run_id`, since dispatch itself returns no run ID) and where it should run (a scheduled script vs. an endpoint the admin UI can trigger on demand).
Actual time: Not tracked.
Next action (Task ID + first step): P1-04b — design and implement the reconciliation query against GitHub Actions run state for attempts stuck non-terminal, and add the `failed`→`queued` release transition a retry needs.
```

### Previous session handoff (1C-06)

```text
Date: 2026-09-11 UTC
Task ID / status: 1C-06 done locally
Delivered outcome: Confirmed that `POST /earth/api/posts/[id]/assets` is the correct attachment path and exposed the existing version-guarded `addPostAssetUsage` DAL operation there. The strict body is `{id, assetId, role, altText, caption?, crop?, position?, expectedDraftVersion}` and the response is the existing camelCase post detail DTO. Exposed repository dispatch separately as `POST /earth/api/releases/[id]/dispatch` with `{attemptId, attemptNumber}`; it calls GitHub's repository-dispatch endpoint with only release ID and manifest SHA-256, persists the DAL attempt, and returns camelCase release/attempt DTOs. The existing `/confirm` body remains `{attemptId, providerDeploymentId}` and now advances a matching building release/attempt to deploying before using the existing atomic `confirmReleaseLive` operation.
Changed files / commit if available: `src/pages/earth/api/posts/[id]/assets.ts`, `src/pages/earth/api/releases/[id]/{dispatch,confirm}.ts`, `src/server/cms/{api,dispatch}.ts`, `src/lib/cms/{contracts,validation}.ts`, `tests/cms/api-endpoints.test.ts`, and `docs/plan.md`; not committed in this session.
Verification commands and results / evidence location:
1. Pre-change `npm run test:cms`: exactly 133 tests, 133 pass, 0 fail.
2. Post-change `npm run test:cms`: exactly 135 tests, 135 pass, 0 fail.
3. `npx wrangler d1 migrations apply DB --local`: no migrations to apply, exit 0.
4. `node scripts/db/verify-staging.mjs --wrangler --local`: foreign keys, three partial indexes, and population checks passed, exit 0.
5. `npm run build`: root Astro/Cloudflare build passed and generated the sitemap, exit 0.
Not yet tested: No real GitHub dispatch, authenticated provider callback, remote D1 mutation, or staging deployment was attempted. The gated 1C-05 live smoke client still uses its earlier mock shortcut and must be aligned with the registered-asset ID and explicit `/dispatch` request contracts before a real run.
Decision and rationale: Kept release creation and dispatch as separate HTTP operations so an idempotent release snapshot exists before an external side effect and dispatch retries can use the same release ID. Added shared request types/parsers because these two routes introduce genuinely new strict JSON contracts; no unrelated validation or contract behavior changed.
Blocker / required input / who can resolve it: Remote proof requires configured `GITHUB_DISPATCH_TOKEN`/`GITHUB_REPO`, reviewed staging deployment, and callback authentication/provider reconciliation from the remaining P1-04 work.
Actual time: Not tracked.
Next action (Task ID + first step): P1-04 remainder — authenticate `/confirm` for the workflow/provider boundary and reconcile ambiguous dispatch/deployment outcomes before updating and running the live smoke test.
```

### Previous session handoff (1C-05)

```text
Date: 2026-09-11 UTC
Task ID / status: 1C-05 authored and --dry-run verified; live run remains gated behind the task's own GATE and behind P1-04/P1-11
Delivered outcome: Implemented `scripts/build/smoke-test-staging.mjs`, the full live-staging E2E smoke test orchestrator: Step 1 creates a draft with bilingual TH/EN content via POST /earth/api/posts and captures id/draftVersion/slug only from the response body (never assumed); Step 2 exercises optimistic locking (stale expectedDraftVersion -> 409, correct -> 200 with a bumped version) via PUT; Step 3 attaches a smoke-test media asset key (reusing the canonical `assets/<sha256>/<filename>` contract from `scripts/db/verify-r2-staging.mjs`) via POST /earth/api/posts/:id/assets; Step 4 fetches the current live release id as the release base, begins a release via POST /earth/api/releases with a canonically-hashed manifest matching the real server's `canonicalReleaseManifest` algorithm exactly, and confirms it live via POST /earth/api/releases/:id/confirm; Step 5 reads the public route using the slug captured in Step 1 and asserts the bilingual content is present; Step 6 archives the post via POST /earth/api/posts/:id/archive inside a try/finally so teardown always runs, even after an earlier step throws, and reports the orphaned post ID clearly if teardown itself fails (exit 1 in that case regardless of prior assertions). `--dry-run` runs the full lifecycle against an in-process mock server implementing the same contracts (including the real `{error:{code,message,details}}` conflict shape), with no network access. Live mode is fail-closed: `checkLiveGates` reads `.wrangler/deploy-result/deployment-result.json` for Step 1's real-deploy evidence and requires explicit `SMOKE_GATE_1C03_LIVE_PASSED=true` / `SMOKE_GATE_1C04_R2_PASSED=true` environment attestations for the other two preconditions (neither check can be verified from this process's own state), refusing to run and printing exactly which precondition is unmet otherwise. Documented (in code comments and in the plan row above) that even after the GATE opens, live Step 3 and the confirm half of Step 4 will still fail against the currently deployed API: no HTTP route yet creates a release deployment attempt (P1-04) or attaches an uploaded asset to a draft (P1-11) — verified this directly by reading `src/pages/earth/api/**`, `src/server/cms/repositories/{posts,assets,releases}.ts`, and `tests/cms/api-endpoints.test.ts` (which drives release confirmation through internal DAL calls with no HTTP equivalent).
Changed files / commit if available: `scripts/build/smoke-test-staging.mjs`, `tests/cms/smoke-test-staging.test.ts`, `package.json`, `docs/plan.md`; not committed in this session.
Verification commands and results / evidence location:
1. `npm run test:smoke:dry`: full lifecycle PASSED (all 6 steps), exit code 0.
2. `npx tsx --test tests/cms/smoke-test-staging.test.ts`: 15/15 passing, including the GATE-refusal path (no network call attempted), the full dry-run lifecycle, teardown-still-runs-after-a-mid-lifecycle failure, and teardown-itself-fails reporting the orphaned post ID.
3. `npm run test:cms`: 133/133 passing (118 prior + 15 new).
4. `npx wrangler d1 migrations apply DB --local` & `node scripts/db/verify-staging.mjs --wrangler --local`: passed.
Not yet tested: Live execution against `https://cms-staging.frong.me` — correctly refused by the GATE, since none of Step 1's real deploy, a live 1C-03 pass, or a live 1C-04 R2 report currently exist in this workspace.
Decision and rationale: Interpreted "bilingual TH/EN draft content" as one `lang: 'th'` post whose Markdown body contains both Thai and English paragraphs, since `CreatePostInput` is single-language per post and no translation-group pairing was in scope for a lifecycle smoke test. Imported `CMS_SCHEMA_VERSION` and reused `canonicalManifestSha256`'s exact key order/sort so a manifest hash computed by this script also validates against the real server once it's reachable. Reused `sha256Hex`/`buildAssetKey`/`smokeFixtureBytes` from the 1C-04 R2 script rather than duplicating the fixture, tying the two smoke tests to the same canonical asset contract. Chose explicit environment-variable attestation over a persisted evidence file for the 1C-03/1C-04 GATE preconditions because neither check currently writes a machine-readable artifact to read.
Blocker / required input / who can resolve it: None for authoring/dry-run. A true live run needs, in order: (a) a real non-dry-run staging deploy reporting `success: true` to `.wrangler/deploy-result/deployment-result.json`, (b) a live (non-`:dry`) `npm run verify:access` pass attested via `SMOKE_GATE_1C03_LIVE_PASSED=true`, (c) an R2 staging-bucket success attested via `SMOKE_GATE_1C04_R2_PASSED=true`, and — beyond the stated GATE — P1-04 dispatch/attempt creation and a P1-11 asset-attach route before Steps 3–4 can pass live.
Actual time: Not tracked.
Next action (Task ID + first step): P1-04 — authenticate the confirmation callback, then connect idempotent repository dispatch and provider-first reconciliation; this is also the change that lets 1C-05's Step 4 confirm succeed against the live API once the GATE opens.
```

### Previous session handoff (1C-03)

```text
Date: 2026-09-11 UTC
Task ID / status: 1C-03 done locally; P1-04 next
Delivered outcome: Created `scripts/build/verify-access-staging.mjs` for live and mock staging Zero Trust verification. Verifies Case 1 (unauthenticated /earth and /earth/api/posts receive 401, 403, or 302 redirect to Cloudflare Access login), Case 2 (authenticated via service tokens CF-Access-Client-Id / CF-Access-Client-Secret or Cf-Access-Jwt-Assertion assertion headers receive 200 OK), and Case 3 (public route bypass without auth headers receives 200 OK, with automatic fallback from specific article to public root / if 404). Built in-process ephemeral mock Cloudflare Access server for --dry-run mode. Added npm scripts `verify:access` and `verify:access:dry`, and wrote full unit/integration test suite `tests/cms/verify-access-staging.test.ts`.
Changed files / commit if available: `scripts/build/verify-access-staging.mjs`, `tests/cms/verify-access-staging.test.ts`, `package.json`, `.env.example`, `docs/plan.md`.
Verification commands and results / evidence location:
1. `npm run test:cms`: 103/103 tests passing (all 94 prior tests + 9 new tests).
2. `npm run verify:access:dry`: all 3 cases PASSED (Case 1: HTTP 302 redirect & HTTP 401; Case 2: HTTP 200 OK for /earth and /earth/api/posts; Case 3: HTTP 200 OK for /articles/cloudflare-cms-architecture).
3. `node scripts/build/verify-access-staging.mjs`: correctly fails with code 1 and logs missing Access credentials when run live without env vars.
4. `npx wrangler d1 migrations apply DB --local` & `node scripts/db/verify-staging.mjs --wrangler --local`: passed.
Not yet tested: Live HTTP invocation against deployed staging host `https://cms-staging.frong.me` using production Service Token secrets.
Decision and rationale: Kept script zero-dependency using Node standard library (`node:http`, `node:url`) and global `fetch` with `redirect: 'manual'` to reliably intercept 302 Cloudflare Access redirects without following them to login HTML. Prohibited hardcoded tokens, strictly reading from `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` (or `CF_ACCESS_JWT_ASSERTION`).
Blocker / required input / who can resolve it: None for local CI/dev. Live run requires configuring CF Access Service Token in staging environment.
Actual time: Not tracked.
Next action (Task ID + first step): P1-04 — protect the release confirmation callback, connect repository dispatch, and add provider reconciliation.
```

### Previous session handoff (1C-01)

```text
Date: 2026-09-11 UTC
Task ID / status: 1C-01 done; 1C-03 next
Delivered outcome: Implemented Cloudflare staging deployment pipeline and pre-flight binding verification. Created `scripts/build/verify-bindings.mjs` with JSONC-safe parsing (jsonc-parser), strict ENABLE_ACCESS_DEV_BYPASS guard, D1 database ID matching, R2 bucket name matching, Access Application AUD validation, and env.production isolation checks. Updated `.github/workflows/cms-staging-deploy.yml` targeting env.staging only with workflow_dispatch dry-run option and deployment result artifact logging (`.wrangler/deploy-result/deployment-result.json`). Added helper `scripts/build/deploy-staging.mjs` and comprehensive unit tests in `tests/cms/verify-bindings.test.ts`.
Changed files / commit if available: `scripts/build/verify-bindings.mjs`, `scripts/build/deploy-staging.mjs`, `.github/workflows/cms-staging-deploy.yml`, `wrangler.jsonc`, `package.json`, `.env.example`, `tests/cms/verify-bindings.test.ts`, `docs/plan.md`.
Verification commands and results / evidence location:
1. `npm run test:cms`: 94/94 tests passing.
2. `node scripts/build/verify-bindings.mjs --dry-run`: all 4 checks passed (D1, R2, AUD, dev-bypass guard).
3. `node scripts/build/deploy-staging.mjs --dry-run`: full pipeline execution passed (pre-flight checks, Astro build, Wrangler staging dry-run deploy, deployment-result.json artifact written).
4. `npx wrangler d1 migrations apply DB --local` & `node scripts/db/verify-staging.mjs --wrangler --local`: passed.
Not yet tested: Remote live staging deploy using real Cloudflare API token in GitHub Actions runner.
Decision and rationale: Used `jsonc-parser` to handle comments and trailing commas in `wrangler.jsonc`. Configured `wrangler.jsonc` with explicit `env.staging` and `env.production` blocks to prevent cross-environment contamination. Ensured all CI secret names come strictly from secrets/env vars without hardcoding.
Blocker / required input / who can resolve it: None. Staging pipeline is ready for remote dispatch or manual trigger in GitHub Actions.
Actual time: Not tracked.
Next action (Task ID + first step): 1C-03 — exercise staged deploy in staging environment.
```

### Previous session handoff (1C-02)

```text
Date: 2026-09-11 UTC
Task ID / status: 1C-02 done locally; live staging verification remains for 1C-03
Delivered outcome: Added fail-closed Cloudflare Access enforcement for `/earth` and `/earth/*`. The Worker verifies RS256 signature, issuer, audience, and registered time claims with `jose`; reuses a remote JWKS cache with a five-minute TTL; returns generic no-store 401/403 responses; excludes public routes; and permits bypass only when both the Vite DEV boolean and the exact `ENABLE_ACCESS_DEV_BYPASS=true` setting are present. The Earth shell is now on-demand so it cannot become a prerendered static 401 or bypass runtime authentication.
Changed files / commit if available: `src/middleware.ts`, `src/server/cms/access.ts`, `src/server/cms/access-guard.ts`, `src/pages/earth/index.astro`, `tests/cms/access-middleware.test.ts`, `.env.example`, `package.json`, `package-lock.json`, and this plan; not committed in this session.
Verification commands and results / evidence location: Generated-RSA-key middleware integration tests pass; focused strict TypeScript passes; final combined `npm run test:cms` passes 94/94; local D1 has no pending migrations; `verify-staging.mjs --wrangler --local` passes; `npx astro build` passes and does not emit `dist/client/earth/index.html`.
Not yet tested: Authenticated and unauthenticated requests against the deployed staging hostname; remote JWKS rotation/fetch behavior in the deployed Worker.
Decision and rationale: The framework-independent guard enables real `jose` verification in Node tests while `src/middleware.ts` remains the production Astro wrapper. The remote JWK set is retained per isolate and configured with `cacheMaxAge`, preventing a JWKS fetch on each request while allowing rotation after the TTL.
Blocker / required input / who can resolve it: No local blocker. Live verification requires the normal reviewed staging deployment and configured Access team domain/audience.
Actual time: Not tracked.
Next action (Task ID + first step): 1C-03 — deploy through staging, exercise missing/forged/expired/valid assertions over HTTP, and only then consider deleting the spike files.
```

### Previous session handoff (P1-API-01)

```text
Date: 2026-09-10 UTC
Task ID / status: P1-API-01 done locally; P1-04 authentication/dispatch/reconciliation still pending
Delivered outcome: Implemented the Earth post and release APIs over D1 with strict request parsing, explicit DTOs, atomic version-guarded editor saves, revision-backed release creation, dashboard state, and atomic live confirmation. Wired the root Cloudflare adapter required by on-demand API routes.
Changed files / commit if available: Commit `1e33b41` (`feat(cms): add Earth API endpoints`) contains `src/pages/earth/api/`, `src/server/cms/api.ts`, CMS contracts/validation/errors/repositories, `tests/cms/api-endpoints.test.ts`, the Cloudflare/Astro dependency changes, and the legacy-Sanity build fallback. This plan remains a workspace handoff because it also contains concurrent CI-session documentation.
Verification commands and results / evidence location: `npm run test:cms` passes 79/79; focused strict TypeScript compilation passes; local D1 reports no pending migrations; `verify-staging.mjs --wrangler --local` passes foreign keys, partial indexes, and population checks; `npx astro build` passes and generates `sitemap-index.xml`.
Not yet tested: Remote staging mutations or authenticated HTTP traffic; release dispatch/provider reconciliation; callback authentication; simultaneous remote requests.
Decision and rationale: `PUT` uses one D1 batch to replace the core draft, taxonomy, and sources and increments `draft_version` once. `PATCH` supports a strict core-draft update. Archive preserves revisions. API payloads never serialize raw D1 rows.
Blocker / required input / who can resolve it: No local blocker. Remote validation requires the normal reviewed rollout and credentials. The confirmation route must remain behind the existing Access/application authentication boundary until P1-04 callback authentication is implemented.
Actual time: Not tracked.
Next action (Task ID + first step): P1-04 — authenticate the confirmation callback, then connect idempotent repository dispatch and provider-first reconciliation.
```

### Previous session handoff (CI-01)

```text
Date: 2026-09-10 UTC
Task ID / status: CI-01 done; Phase 1 milestone 1A still in progress at P1-04
Delivered outcome: Created automated CMS CI workflow and E2E static build verification under scripts/build/ and .github/workflows/. Added scripts/build/test-e2e-build.mjs to export live snapshots (--mock or --sqlite), run Astro static build, and assert bilingual output HTML existence and titles. Added .github/workflows/cms-ci.yml to run test:cms, tsc --noEmit, and test-e2e-build.mjs on PRs to main.
Changed files / commit if available: `scripts/build/test-e2e-build.mjs`, `scripts/build/astro.config.mjs`, `scripts/build/e2e-src/`, `.github/workflows/cms-ci.yml`, `docs/plan.md`.
Verification commands and results / evidence location: `node scripts/build/test-e2e-build.mjs --mock` and `node scripts/build/test-e2e-build.mjs --sqlite /tmp/test-staging.sqlite` both passed with 0 exit code, verifying dist/articles/cloudflare-cms-architecture/index.html and dist/en/articles/cloudflare-cms-architecture/index.html with expected Thai and English titles.
Not yet tested: Remote PR execution on GitHub Actions runners.
Decision and rationale: Kept changes strictly within scripts/build/ and .github/workflows/. Configured dedicated E2E build routing in scripts/build/ so static verification functions immediately in parallel with ongoing Phase 1 CMS development without requiring root Astro/Sanity route refactoring first.
Blocker / required input / who can resolve it: None.
Actual time: Not tracked.
Next action (Task ID + first step): P1-04 — connect repository dispatch, authenticated callbacks, and provider reconciliation to the release DAL.
```

### Previous session handoff

```text
Date: 2026-09-10 UTC
Task ID / status: P1-00 through P1-03 done; Gate G0.5 passed; Phase 1 milestone 1A in progress
Delivered outcome: Added the typed CMS D1 layer and HTTP-mapped errors; optimistic post/taxonomy/source/asset mutations; atomic immutable revision snapshots; idempotent serialized release creation; release/attempt state machines; atomic confirmed-deployment and live-pointer compare-and-set; immutable-only build snapshot reads.
Changed files / commit if available: `src/server/cms/db.ts`, `errors.ts`, four repository modules, focused DAL test/support files, release/public-asset integrity triggers in the existing migrations, and this plan; not committed in this session.
Verification commands and results / evidence location: Focused strict TypeScript compilation passed. All six current CMS runtime test files pass, including three new DAL scenarios for stale draft rollback, promoted-asset revision snapshots, draft isolation, idempotent/single-active releases, and stale live-pointer rollback. Wrangler 4.130.0 applied all three updated migrations to isolated local D1 and reported all five critical integrity/state triggers. The root Astro build remains blocked only by the documented legacy Sanity `projectId` requirement.
Not yet tested: Wrangler migrations and DAL calls against remote staging D1; authenticated dispatch/callback handlers; real provider reconciliation; simultaneous remote requests; full rollback and route-history behavior. Exact remote workflow/deployment identifiers and timings were not supplied for the repository record.
Decision and rationale: Compound draft writes guard every child-table statement with the original version and bump `posts.draft_version` last in the same batch. Release confirmation captures the expected base release in the immutable release row, then database triggers abort the confirmation batch if that pointer is stale or no matching deployment attempt is confirmed.
Blocker / required input / who can resolve it: No blocker for P1-04 local implementation. Remote staging mutation tests require the normal reviewed rollout and credentials.
Actual time: Not tracked.
Next action (Task ID + first step): P1-04 — add protected dispatch/callback services around the release DAL and implement provider-first reconciliation for ambiguous outcomes.
```

### Evidence to create during implementation

Paths below are relative to the repository root:

- `docs/cms/baseline.md`: environment/route inventory, build results, and reference screenshots.
- `docs/cms/architecture-spike.md`: S-01–S-06 configuration/versions/workflow runs and failure drills.
- `docs/cms/release-protocol.md`: state machine, atomicity, retries, callbacks, and rollback.
- `docs/cms/backup-restore.md`: backup manifest, retention, restoration steps, and measured time.
- `docs/cms/cutover.md`: URL map, old/new deployments, smoke checks, and rollback conditions.

Evidence files are created as their tasks run; the baseline, environment map, and architecture spike now exist. Requirements live in the source specification; implementation progress and verified outcomes belong in this plan.
