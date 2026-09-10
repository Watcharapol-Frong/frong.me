# Phase 0 Baseline Inventory

Captured: 2026-09-10 UTC

Task: P0-01

Scope: repository, local build, public entry points, and legacy disposition. No prototype or Phase 1 code was created.

This is the P0-01 point-in-time inventory. Phase 0 later deployed the AI Worker protection, and Phase 0.5 added an isolated architecture spike. Use [`../plan.md`](../plan.md) for current status and [`architecture-spike.md`](architecture-spike.md) for the newer evidence.

## Repository state

| Item | Observed value |
|---|---|
| Repository | `Watcharapol-Frong/portfolio`, renamed to `Watcharapol-Frong/frong.me` after this capture |
| Branch | `main` |
| HEAD | `b572ae1` (`origin/main` at inspection time) |
| Runtime | Node 24.20.0; project requires Node >=22.12.0 |
| Package manager | npm 11.19.0 |
| Root dependencies | Installed; 652 top-level directories were present under `node_modules` |
| Worker toolchain | Installed from its lockfile during Phase 0; Wrangler updated within the declared `^4.0.0` range from locked 4.128.0 to 4.130.0 |

The worktree was already dirty before Phase 0. Existing documentation and root `package-lock.json` changes belong to the prior documentation work and were preserved. Phase 0 changes are listed in the handoff log.

## Build and deployment setup

The root application is an Astro static build. `astro.config.mjs` does not set `output`, so Astro uses static output. It includes React, sitemap, Tailwind, and Sanity integrations. Sanity Studio is mounted at `/admin`. The homepage and article route query Sanity during the build.

`npm run build` reached static route generation and then failed because `PUBLIC_SANITY_PROJECT_ID` was unset:

```text
Configuration must contain `projectId`
```

This is an expected legacy-environment dependency and does not need repair before replacing Sanity. No local reference screenshots were created because a complete build/preview was unavailable. The old public site was also unavailable during the remote check.

`npx tsc --noEmit` also fails before checking application files because the installed TypeScript 7.0.2 has removed the legacy `baseUrl` option still present in `tsconfig.json`. That configuration belongs to the old build setup; it was recorded without changing the root toolchain during Phase 0.

At baseline capture, no main-site Cloudflare adapter, main-site Wrangler configuration, D1 migrations, `/earth`, RSS, or English article route existed. Phase 0.5 later added an isolated proof under `spikes/cloudflare-architecture/`, and Phase 1 added the CMS schema, contracts, data-access layer, tooling, and admin components to the root application without changing any public route.

At baseline capture, the only deployment configuration was `ai-worker/wrangler.jsonc`, and the Sanity backup workflow was the only GitHub Actions workflow. Phase 0.5 later added the isolated `cms-staging-deploy.yml` workflow, and Phase 1 added a root `wrangler.jsonc` binding `DB` to the staging D1 database plus versioned migrations under `db/migrations/`.

The two legacy blockers recorded above were re-checked during the Phase 1 documentation sync and both still reproduce: the root build stops at `Configuration must contain projectId`, and `npx tsc --noEmit` reports only `TS5102: Option 'baseUrl' has been removed`. They remain retired-configuration issues rather than Phase 1 work.

## Public entry-point observations

Read-only/non-billable checks on 2026-09-10 UTC returned:

| URL | Result | Interpretation |
|---|---|---|
| `https://frong.me/` | HTTP 520 | Public site could not be used for screenshots or route verification during this session; root cause was not investigated because this phase does not include site repair |
| `https://ai-assistant-worker.frongbook.workers.dev/generate` | Unauthenticated invalid JSON-object request returned HTTP 400, `Unknown task`, and `Access-Control-Allow-Origin: *` | Baseline result before the Phase 0 deployment; the follow-up production probe returned HTTP 401 after protection was deployed |
| `/admin` | Configured locally, remote result unverified | Public site returned 520 |

The Worker probe sent `{}`. In the legacy source, this fails during task validation before any provider call, so it does not intentionally consume AI credits.

## Credentials and access discovered

No secret values were printed or recorded.

- Cloudflare account/API variables and `AI_WORKER_SECRET` were absent from the process environment.
- `GITHUB_TOKEN` was present but `gh auth status` reported it invalid.
- `GITHUB_DISPATCH_TOKEN` and `GITHUB_REPO` were absent.
- Public Sanity variables were absent, causing the root build failure above.
- The repository remote is configured for GitHub, but usable GitHub API authorization was not available.

At baseline capture, this environment could verify the patch locally but could not configure or deploy it. The owner subsequently deployed the protection and the unauthenticated production probe returned HTTP 401. The deployment version identifier remains unavailable in this workspace.

## Legacy disposition

These are target dispositions, not instructions to delete files during Phase 0.

| Area | Disposition | Reason / next use |
|---|---|---|
| `src/styles/global.css` | Reuse and refine | Existing design tokens are useful; fonts and content styles change in Phase 1 |
| `src/layouts/Layout.astro` | Reuse structure, replace assumptions | Preserve useful metadata/theme behavior; add per-page language/article metadata and revise fonts in Phase 1 |
| `Navbar.tsx`, `FloatingNav.tsx`, `AboutIsland.tsx`, `ScrollRevealText.tsx`, `ShareButton.tsx`, `AnnouncementBanner.tsx` | Reuse after review | Independent of Sanity or adaptable to the new content model; visual changes are allowed |
| `HomeIsland.tsx` | Replace data contract; optionally reuse presentation | Current inputs and behavior serve the Sanity-era homepage rather than release snapshots |
| `TableOfContents.astro` | Refactor/reuse presentation | New Markdown renderer must generate shared, collision-safe heading IDs |
| `src/pages/index.astro`, `src/pages/articles/[slug].astro` | Replace data/rendering paths | They query Sanity and render Portable Text |
| `src/components/portabletext/*` | Retire at Phase 1 replacement | Specific to Sanity Portable Text |
| `src/lib/sanityImage.ts` | Retire at Phase 1 replacement | Sanity-specific image URLs are replaced by the new media pipeline |
| `src/lib/slugify.ts` | Replace for the new renderer | Current implementation strips Thai heading text and assumes Portable Text |
| `sanity.config.ts`, `sanity/schemaTypes/*` | Retire after cutover | New CMS does not use Sanity schemas/Studio |
| `sanity/components/CharCount.tsx`, `UnsplashImageInput.tsx` | Retire or reuse ideas only | Bound to the old editor; new editor requirements decide equivalent behavior |
| `sanity/components/AIAssistantView.tsx` | Direct-call view disabled in `sanity.config.ts`; retire it and reuse suitable UX ideas later | Direct browser-to-Worker calls cannot hold the shared secret; Phase 4 builds an authenticated replacement |
| `scripts/migrate-to-sanity.mjs` | Retire after cutover | Migration targets the outgoing CMS |
| `.github/workflows/sanity-backup.yml` and existing Sanity archives | Keep through cutover, then retire workflow | Preserve rollback/history until the new backup and restore drill passes |
| `ai-worker/src/index.js` | Reuse with Phase 0 protection; revisit adapters in Phase 4 | Provider logic remains useful after securing the boundary |
| Favicons and `src/assets/og-fallback.svg` | Reuse | Independent static assets |

## Dependency disposition

| Dependencies | Disposition |
|---|---|
| Astro, React, Tailwind, sitemap | Retain. Phase 0.5 pinned and verified a compatible isolated Astro/Cloudflare set; root migration remains future work |
| Radix Popover, lucide-react, class utilities | Retain if used by the redesigned UI |
| `@sanity/astro`, `@sanity/image-url`, `sanity`, `astro-portabletext` | Remove when their Phase 1 replacements land and cutover conditions are met |
| Wrangler | Retain for the AI Worker; lockfile currently resolves 4.130.0 |

`npm audit --omit=dev` reports zero production vulnerabilities for the Worker package. The complete development dependency audit reports three high findings in Wrangler → Miniflare → Sharp 0.35.2. Wrangler 4.130.0 currently pins that version, so the finding remains documented rather than applying an unproven transitive override.

## Verification commands and results

```sh
git status --short
git branch --show-current
git log -1 --oneline
node --version
npm --version
npm run build
npx tsc --noEmit # Currently fails on the legacy TypeScript 7/baseUrl mismatch

cd ai-worker
npm ci
npm test
XDG_CONFIG_HOME=/tmp/frong-wrangler-config npx wrangler deploy --dry-run \
  --outdir /tmp/frong-ai-worker-dry-run
XDG_CONFIG_HOME=/tmp/frong-wrangler-config npx wrangler types \
  /tmp/frong-ai-worker-env.d.ts
npm audit --omit=dev
```

Observed Worker results: all eight authentication tests passed; syntax checks passed; the final dry-run bundle was 8.35 KiB (2.85 KiB gzip); generated bindings included `AI` and required string `AI_WORKER_SECRET`.

## Outstanding baseline evidence

- Reference screenshots when either a valid legacy Sanity environment or the public site is available.
- Cloudflare deployment version and account ownership from authenticated tooling; deployment and HTTP 401 behavior are owner-confirmed.
- Cause and resolution of the public site's HTTP 520 response.
- Actual Access, D1, R2, and CI resource identifiers; the required map is in [environment-map.md](environment-map.md).
