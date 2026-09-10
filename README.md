# frong.me Portfolio

This repository contains the current Astro portfolio, the protected AI Worker, and an isolated architecture proof for the planned Cloudflare-native CMS.

## Project status

- Phase 0 is complete. The production AI Worker requires `X-Auth-Secret`, fails closed, restricts browser CORS to `https://frong.me`, and rejects unauthenticated requests with HTTP 401.
- Phase 0.5 has complete local architecture evidence. The remaining Gate G0.5 work is a real staging D1 query, Cloudflare Access verification, authenticated GitHub dispatch, and staging deployment.
- The existing public site still uses the legacy Sanity-backed application. No CMS production cutover or Phase 1 implementation has occurred.

Use the [implementation plan](docs/plan.md) for the authoritative task status and handoff.

## Repository areas

| Path | Purpose |
|---|---|
| `src/`, `public/`, `astro.config.mjs` | Current legacy Astro portfolio and Sanity-backed articles |
| `sanity/`, `sanity.config.ts` | Legacy Sanity Studio; the unsafe browser-direct AI view is disabled |
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

The root application requires Node.js 22.12 or newer. Its static build currently needs the legacy public Sanity variables.

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
