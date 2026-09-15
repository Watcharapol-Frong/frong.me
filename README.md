# frong.me

A personal website with an authenticated article workspace at `/earth`.
One Astro application runs the public website, editor and AI features on
Cloudflare. Published articles are read directly from D1; images live in R2.
Publishing an article does not build or deploy the website.

## Start here

1. Read [the architecture](docs/architecture.md) for the module map and flows.
2. Follow [the contributor guide](CONTRIBUTING.md) to develop and verify changes.
3. Read [the current handoff](docs/plan.md) before choosing work.
4. Use [the environment guide](docs/cms/environment-map.md) for deployment.

Engineering documentation, new comments and change descriptions should be in
English. User-facing content may remain Thai or English.

## Quick verification

Requires Node.js 22.12 or newer and npm.

```sh
npm ci
npm run test:cms
npx tsc --noEmit
CLOUDFLARE_VITE_FORCE_LOCAL=true npm run build
```

For development, use `npm run dev -- --background`; see the contributor guide
for local D1 setup and the development-only Access bypass.

## Ownership map

| Location | Responsibility |
| --- | --- |
| `src/pages/` | Public pages and thin Earth HTTP handlers |
| `src/components/earth/` | Author workspace and editor |
| `src/components/`, `src/layouts/` | Public presentation |
| `src/lib/cms/` | Shared contracts, validation, Markdown, media and client calls |
| `src/server/cms/` | Authentication, AI, database access and repositories |
| `src/types/` | Shared application types |
| `db/` | Append-only migration history and local staging fixtures |
| `scripts/`, `tests/cms/` | Operational checks and regression tests |
| `docs/` | Current English maintainer documentation |
| `archive/sanity/` | Historical data exports; never runtime input |

## Retired systems

Sanity Studio, the standalone AI Worker source, the scheduled Sanity export
workflow and obsolete release callback probes are removed from the maintained
application. Do not restore them as dependencies of Earth.

[The retirement record](docs/legacy-retirement.md) distinguishes removed code
from remote services and historical data that still require an owner decision.
Git history preserves removed source and superseded planning documents.

GitHub Actions tests changes; it does **not** deploy. Deployment, remote data
migrations, service deletion and credential revocation require explicit approval.
