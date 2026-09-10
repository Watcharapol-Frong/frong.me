# frong.me Portfolio

This repository contains the current Astro portfolio, the protected AI Worker, the first Phase 1 pieces of the Cloudflare-native CMS, and the isolated architecture proof that preceded them.

## Project status

- Phase 0 is complete. The production AI Worker requires `X-Auth-Secret`, fails closed, restricts browser CORS to `https://frong.me`, and rejects unauthenticated requests with HTTP 401.
- Gate G0.5 passed after owner-confirmed staging Worker/workerd, D1 binding/query, and Cloudflare Access guard verification. Exact remote workflow/deployment identifiers remain an evidence follow-up.
- Phase 1 milestone 1A is partly delivered: data contracts, three versioned D1 migrations, the typed D1 data-access layer with release/live-pointer compare-and-set, a staging seed, and the CMS test suite (`npm run test:cms`) are in place. P1-04 (dispatch, authenticated callbacks, provider reconciliation) is the current task.
- Supporting build and admin code exists but is not yet wired to a route: the snapshot exporter, the Markdown asset resolver, image metadata extraction, and the three transport-agnostic admin React components under `src/components/cms/`. Their owning tasks (P1-06, P1-08, P1-10) remain open because their acceptance criteria are not met.
- The public site still uses the legacy Sanity-backed application; no CMS production cutover has occurred. The root static build still requires the legacy Sanity variables.

Use the [implementation plan](docs/plan.md) for the authoritative task status and handoff.

## Repository areas

| Path | Purpose |
|---|---|
| `src/pages/`, `src/layouts/`, `src/components/`, `public/`, `astro.config.mjs` | Current legacy Astro portfolio and Sanity-backed articles |
| `src/lib/cms/` | CMS data contracts, runtime validation, image metadata, and Markdown asset resolution |
| `src/server/cms/` | Typed D1 wrapper, HTTP-mapped domain errors, and post/taxonomy/asset/release repositories |
| `src/components/cms/` | Admin UI components (article editor, post list, release dashboard); no I/O, all state arrives as props |
| `db/migrations/`, `db/seeds/` | Versioned D1 schema migrations and the deterministic idempotent staging seed |
| `scripts/build/`, `scripts/db/` | Build-time release-snapshot exporter and the staging database verification tool |
| `tests/cms/` | Node test-runner suite for contracts, DAL, asset resolution, seed, and verification |
| `wrangler.jsonc` | Root Worker/D1 configuration used for migrations and staging verification |
| `sanity/`, `sanity.config.ts`, `scripts/migrate-to-sanity.mjs` | Legacy Sanity Studio and migration script; the unsafe browser-direct AI view is disabled |
| `ai-worker/` | Production AI provider Worker with server-to-server authentication and tests |
| `spikes/cloudflare-architecture/` | Isolated Astro/Cloudflare/D1/Access/dispatch architecture proof |
| `.github/workflows/` | Sanity backup and CMS staging-release workflows |
| `docs/` | Specification, implementation plan, environment map, architecture evidence, and handoffs |

## Documentation

- [Documentation index](docs/README.md)
- [CMS implementation plan and current tasks](docs/plan.md)
- [CMS migration specification](docs/cms-migration-plan.md)
- [Phase 0 baseline](docs/cms/baseline.md)
- [Phase 0 environment map](docs/cms/environment-map.md)
- [Phase 0.5 architecture spike](docs/cms/architecture-spike.md)
- [Historical Astro migration notes](README-MIGRATION.md)

## Root application

The root application requires Node.js 22.12 or newer. Its static build currently needs the legacy public Sanity variables, and `npx tsc --noEmit` still stops on the legacy `baseUrl` option in `tsconfig.json`.

```sh
npm ci
npm run dev -- --background
npm run build
npm run preview
```

Manage the background development server with:

```sh
npm run astro -- dev status
npm run astro -- dev logs
npm run astro -- dev stop
```

## CMS database and tests

The CMS suite runs on the Node test runner through `tsx` and needs no Cloudflare credentials:

```sh
npm run test:cms
```

Apply the versioned migrations and the staging seed with Wrangler. `wrangler.jsonc` binds `DB` to the staging database `portfolio-db-staging` and reads migrations from `db/migrations/`:

```sh
npx wrangler d1 migrations list DB --local
npx wrangler d1 migrations apply DB --local
npx wrangler d1 execute DB --local --file db/seeds/staging.sql
```

Replace `--local` with `--remote` only against the intended staging database. Verify relational integrity and partial-index enforcement, and export the live release snapshot for a static build:

```sh
node scripts/db/verify-staging.mjs --wrangler --local
node scripts/build/export-live-snapshot.mjs --mock
```

`verify-staging.mjs` accepts `--wrangler` (add `--local` to stay on the local database; without it Wrangler targets the remote one), `--http` for the Cloudflare D1 HTTP API, or `--sqlite <path>` for a file. The exporter reads Cloudflare D1 over HTTP when `CF_ACCOUNT_ID`, `CF_D1_DATABASE_ID`, and `CF_D1_READ_TOKEN` are present, falls back to local D1 state, and otherwise writes a validated mock snapshot to `.cache/cms-live-snapshot.json`. Copy `.env.example` for the variable names; never commit values.

## AI Worker

```sh
cd ai-worker
npm ci
npm test
XDG_CONFIG_HOME=/tmp/frong-wrangler-config \
  npx wrangler deploy --dry-run --outdir /tmp/frong-ai-worker-dry-run
```

Production deployment requires the Cloudflare secrets and access documented in the [environment map](docs/cms/environment-map.md). Never expose `AI_WORKER_SECRET` to browser code.

## Cloudflare architecture spike

```sh
cd spikes/cloudflare-architecture
npm ci
npm test
XDG_CONFIG_HOME=/tmp/frong-wrangler npm run check
XDG_CONFIG_HOME=/tmp/frong-wrangler npm run build
XDG_CONFIG_HOME=/tmp/frong-wrangler npm run test:determinism
XDG_CONFIG_HOME=/tmp/frong-wrangler npm run deploy:dry
```

The spike is intentionally separate from the root application. See the [architecture record](docs/cms/architecture-spike.md) before running its staging workflow.
