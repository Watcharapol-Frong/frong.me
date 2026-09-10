# frong.me CMS Implementation Plan

Updated: 2026-09-10 · Status: Phase 0 complete and Gate G0 passed. Phase 0.5 local architecture spikes are complete; Gate G0.5 awaits remote staging evidence.

Requirements: [CMS migration specification, version 6](cms-migration-plan.md). Documentation index: [README](README.md).

This document began as a specification review and now records implementation progress, evidence, tasks, and acceptance gates. The production AI Worker protection is deployed and verified. The CMS architecture remains isolated under `spikes/`; no main-site CMS production cutover has occurred.

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
| Completed | P0-01 through P0-04; Gate G0; all S-01 through S-06 local prototypes, tests, workflow definition, and architecture documentation |
| Current phase | Phase 0.5 remote staging verification; Gate G0.5 remains open |
| Next task | Configure the protected GitHub `cms-staging` environment, send the authenticated sample dispatch from `main`, deploy the isolated staging Worker, and record remote evidence |
| Current risk | Starting Phase 1 before real D1, Access, dispatch, failure, and deployment checks would bypass Gate G0.5 |
| Unverified | Staging D1 HTTP query, real Access JWTs and hostname coverage, repository dispatch permissions/run, staging deployment/provider ID, remote timings, D1/R2 backups, fonts/performance, and the public site's earlier HTTP 520 cause |
| Production impact | The AI Worker protection is live. The CMS spike has not changed the public site or production CMS infrastructure |
| Evidence | [`docs/cms/baseline.md`](cms/baseline.md), [`docs/cms/environment-map.md`](cms/environment-map.md), and [`docs/cms/architecture-spike.md`](cms/architecture-spike.md) |

Backup files and workflow definitions do not prove successful execution or restorability. Record separate test evidence.

## 2. Legacy implementation and target-design gaps

| ID | Finding / gap | Evidence and planning implication |
|---|---|---|
| F01 | Legacy root stack matches the specification at the file level | `package-lock.json`: Astro 7.2.2, React 19.2.8, Tailwind 4.3.3. The root build is still blocked without the legacy Sanity project ID; the isolated Cloudflare spike is independently verified |
| F02 | Public site still depends on Sanity | `astro.config.mjs` mounts Studio at `/admin`; `src/pages/index.astro` and `src/pages/articles/[slug].astro` query Sanity; output is omitted and defaults to static |
| F03 | Target CMS core is not implemented | The isolated spike now proves the Cloudflare adapter, D1 binding, `/earth` auth boundary, snapshot transport, dispatch workflow, and recovery model. Production routes, schema migrations, RSS, and `/en/articles/` remain Phase 1 work |
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

**Current conclusion:** Continue with Markdown articles, static public pages, a dynamic admin area, and independent projects. The local architecture resolves the F09 runtime uncertainty and prototypes the F10 release protocol; remote Gate G0.5 evidence is still required before the full editor. Do not execute the example SQL directly as a production migration.

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

- [ ] **S-01 Adapter/runtime — local proof complete, staging blocked** — Selected and pinned a compatible Astro 7.3.2 / Cloudflare adapter 14.3.1 / Wrangler 4.130.0 set in an isolated spike. Static HTML/OG SVG, on-demand workerd execution, local D1 binding, and deploy dry-run pass. A remote staging deployment remains required.
- [ ] **S-02 Authenticate every entry point — local proof complete, staging blocked** — `/earth` and `/earth/*` middleware validates JWT signature/issuer/audience/expiry, application token type, subject, and owner email; mutations require exact Origin and private responses use `no-store`. Local tests and unauthenticated route checks pass. Real Access configuration and custom-domain/workers.dev/preview checks remain required. [Cloudflare JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [ ] **S-03 Build snapshot — local contract complete, staging blocked** — The restricted D1 HTTP query contract, public snapshot validation, dispatch hash check, fixture, and same-release public-output determinism pass. A real query using the staging D1 Read token remains required.
- [ ] **S-04 Real trigger — workflow/payload complete, remote trigger blocked** — The default-branch workflow, minimal payload validator, concurrency policy, ephemeral staging config, dry-run-before-deploy sequence, and protected deploy switch are implemented. Once this change is on `main`, the remaining acceptance step is a real dispatch/workflow/deployment run; the invalid local GitHub token prevents that test from this workspace. [GitHub repository_dispatch](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#repository_dispatch)
- [x] **S-05 Failure/recovery** — Automated drills cover failed builds/deployments, dispatch and confirmation timeouts, provider-first reconciliation, retries, stale callbacks, and repeated publish requests. The old live pointer is preserved until a correlated provider deployment ID is confirmed.
- [x] **S-06 Record the decision** — Proven configuration, commands, local timings, current quotas, transport rationale, state strategy, and exact remote evidence gaps are recorded in [`docs/cms/architecture-spike.md`](cms/architecture-spike.md).

**Gate G0.5: open.** Local architecture evidence is complete, but S-01 through S-04 still require the staging Cloudflare/D1/Access and real GitHub dispatch evidence listed in [`docs/cms/architecture-spike.md`](cms/architecture-spike.md). Do not begin the CMS core or report this gate passed until those remote checks succeed.

### Phase 1 — Complete articles, images, charts, and publishing

Dependency: G0.5. Original estimate: 48–70 hours, divided into deliverable milestones.

#### 1A: Schema and release protocol

- [ ] **P1-01 Data contract** — Design draft/revision/public DTOs, sources, cover alt/crop, language, slug, timestamps, and media references around target requirements. Retain CTA/other legacy fields only with a use case. Add versioned Phase 1 migrations; defer project/newsletter/AI tables.
- [ ] **P1-02 Atomic save/publish** — Prove transactions or equivalent atomic operations on D1. Version autosaves to prevent multi-tab overwrites. Publish checks the draft version and uses an idempotency key. Revisions/manifests are immutable.
- [ ] **P1-03 Release control** — Proposed MVP: one active release at a time. Draft saves remain available during queued/building/reconciling states; another publish receives an explicit busy result. Enforce the lock in the server/database, not only UI. Start each release from the live manifest and change only the selected item.
- [ ] **P1-04 Deploy and reconcile** — Store release ID, manifest hash, code commit, workflow run ID, and provider deployment ID. Retry ambiguous dispatches using the same ID. Authenticate idempotent callbacks. Compare-and-set the live pointer after provider verification. Keep uncertain outcomes under reconciliation and prevent overlapping work.
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
- [ ] **P1-11 Upload/preview** — One pipeline for drag/drop/paste/file picker. Resize JPEGs without upscaling; preserve charts as PNG by default. Server validates signature/MIME/bytes/dimensions/pixel count and rejects SVG. Set limits from fixtures and real platform constraints.
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
5. Verify the change appropriately: critical logic tests, renderer fixture/security checks, UI browser/screenshots, release staging failure drills.
6. Record commands, real results, and evidence paths without secrets. Local checks do not satisfy remote gates.
7. Update checkboxes, time, decisions, blockers, and an immediately actionable next step. Specify a task rather than merely “continue Phase 1.”

### Handoff log

| Date | Task | Status | Changes / evidence | Actual time | Next |
|---|---|---|---|---|---|
| 2026-09-10 | P0-01 | done with recorded external blockers | Added `docs/cms/baseline.md`; root static build reaches route generation but fails without the legacy Sanity project ID; `frong.me` returned HTTP 520; classified legacy code/dependencies for reuse, replacement, or retirement | Not timed | Owner review |
| 2026-09-10 | P0-02 | done | Added fail-closed `X-Auth-Secret`, exact-origin CORS, no-store responses, input/provider/task/model/body limits, a required Wrangler secret, tests, and local secret example; disabled the old browser-direct AI view; owner deployed the protected Worker | Not timed | P0-04 verification |
| 2026-09-10 | P0-03 | done | Added `docs/cms/environment-map.md`; separated environments, bindings, secret locations, token purposes, and verification commands without recording values | Not timed | Owner review |
| 2026-09-10 | P0-04 / Gate G0 | done / passed | Automated provider-stub tests pass; local rejection/CORS checks pass; owner confirmed deployment and live unauthenticated `POST /generate` returned 401 with `no-store`, JSON Unauthorized, and no wildcard CORS | Not timed | S-01 |
| 2026-09-10 | S-01–S-06 / Gate G0.5 | local proof done / remote staging blocked | Added isolated Astro/Cloudflare/D1/Access architecture spike, staging workflow, D1 HTTP snapshot transport, JWT/Origin middleware, deterministic public build, failure-state drills, and `docs/cms/architecture-spike.md`; no production cutover | Not timed | Put workflow on default branch, configure `cms-staging`, and execute the real dispatch/staging checklist |
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
Date: 2026-09-10 UTC
Task ID / status: P0-02 and P0-04 done; Gate G0 passed; S-01 through S-04 local proof complete / remote staging blocked; S-05 and S-06 done; Gate G0.5 open
Delivered outcome: Confirmed the deployed AI Worker rejects unauthenticated production requests with HTTP 401. Built an isolated Astro static-output/Cloudflare Workers spike with on-demand routes and local D1; prototyped fail-closed Cloudflare Access JWT and Origin enforcement for every /earth path; implemented and tested restricted build-time D1 HTTP snapshot transport; defined the repository_dispatch staging workflow and strict non-secret payload; proved deterministic public output and failure/recovery state behavior; recorded decisions, commands, timings, limits, and remote completion steps.
Changed files / commit if available: Root documentation; Phase 0 AI Worker source/config/tests and disabled legacy direct-call view; `.github/workflows/cms-staging-deploy.yml`; `spikes/cloudflare-architecture/` package/lock/config, routes, middleware, scripts, fixtures, schema, and tests; all current `docs/` planning/evidence files. The consolidated change is intended for `main`; see Git history for the resulting commit.
Verification commands and results / evidence location: Production `curl` to `https://ai-assistant-worker.frongbook.workers.dev/generate` returned 401, `Cache-Control: no-store`, and `{"error":"Unauthorized"}`. In the spike, `npm test` passed all four test files; `astro check` returned zero diagnostics; local D1 initialization executed two statements; workerd build prerendered `/` and the OG SVG; local curl returned 200 for static and D1 runtime routes and 401/no-store for `/earth` and `/earth/unmatched`; two builds produced public-output SHA-256 `ee27741cfaa2466da0754aef4a7a04b6e8d37e2520dc9cf2c5de7b40b002b021`; staging-config build and Wrangler dry-run passed at 630.73 KiB / 157.91 KiB gzip; `npm audit --omit=dev` reported zero after the Sharp override. Evidence: `docs/cms/architecture-spike.md`.
Not yet tested: A real staging D1 HTTP query; Cloudflare Access on the custom, workers.dev, and preview hostnames; valid/invalid real Access JWTs; an authenticated repository_dispatch; a GitHub Actions run; a staging Worker deployment; remote queue/build/deploy times and provider IDs. The production AI Worker deployment version and authenticated billable provider request were not recorded.
Decision and rationale: Keep Astro `output: 'static'` and opt `/earth/*` into on-demand workerd rendering. Generate the immutable public snapshot through the restricted D1 HTTP API before Astro builds. Use build-time OG assets. Require both Cloudflare Access and Worker-side JWT/owner validation. Reconcile ambiguous provider outcomes before retrying or changing the live pointer.
Blocker / required input / who can resolve it: The owner/account administrator must configure the protected GitHub `cms-staging` environment and provide isolated staging Worker, D1, Access, D1 Read, deploy, and dispatch credentials. The current shell has no Cloudflare/D1 credentials and `gh auth status` reports its `GITHUB_TOKEN` invalid.
Actual time: Not tracked.
Next action (Task ID + first step): S-01/S-04 remote completion — configure the `cms-staging` environment from `docs/cms/architecture-spike.md`, send the sample repository dispatch from `main`, and record the staging workflow/deployment evidence. Do not start Phase 1 until Gate G0.5 passes.
```

### Evidence to create during implementation

Paths below are relative to the repository root:

- `docs/cms/baseline.md`: environment/route inventory, build results, and reference screenshots.
- `docs/cms/architecture-spike.md`: S-01–S-06 configuration/versions/workflow runs and failure drills.
- `docs/cms/release-protocol.md`: state machine, atomicity, retries, callbacks, and rollback.
- `docs/cms/backup-restore.md`: backup manifest, retention, restoration steps, and measured time.
- `docs/cms/cutover.md`: URL map, old/new deployments, smoke checks, and rollback conditions.

Evidence files are created as their tasks run; the baseline, environment map, and architecture spike now exist. Requirements live in the source specification; implementation progress and verified outcomes belong in this plan.
