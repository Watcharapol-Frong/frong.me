# frong.me Portfolio and CMS

An Astro/Cloudflare site with a protected article editor at `/earth`.
The homepage and article routes read published posts directly from D1.
Publishing content does not trigger a GitHub build or a release snapshot.

## Current repository

| Path | Purpose |
|---|---|
| `src/pages/`, `src/components/`, `src/layouts/` | Public pages and the Earth editor |
| `src/lib/cms/`, `src/server/cms/` | Article contracts, validation, Markdown, media, authentication and D1 access |
| `db/` | Versioned schema migrations and staging fixtures |
| `tests/cms/` | CMS regression tests |
| `scripts/build/`, `scripts/db/` | Local deployment and verification tools |
| `sanity/`, `sanity.config.ts` | Legacy Studio; still conditionally enabled by Sanity configuration |
| `ai-worker/` | Legacy standalone AI Worker; retained pending a separate retirement decision |
| `backups/` | Existing Sanity archives; retained, not a substitute for D1/R2 backups |
| `docs/` | Current handoff, requirements and historical evidence |

The in-app AI assistant and provider settings remain enabled. This cleanup does
not remove AI, Sanity Studio, existing backups, database tables or cloud services.

## Development and checks

Requires Node.js 22.12 or newer.

```sh
npm ci
npm run dev -- --background
npm run test:cms
npx tsc --noEmit
CLOUDFLARE_VITE_FORCE_LOCAL=true npm run build
```

The last command builds without connecting remote bindings to a Cloudflare
account. It does not remove the AI/D1/R2 bindings from the deployable configuration.
Normal local development can still use Workers AI with authorized credentials.
The editor's TipTap menu dependencies are intentional: `@tiptap/react/menus`
imports the bubble-menu and floating-menu extensions indirectly.

Manage the background dev server with `npm run astro -- dev status`,
`npm run astro -- dev logs`, and `npm run astro -- dev stop`.

## Local database verification

```sh
npx wrangler d1 migrations apply DB --local
node scripts/db/verify-staging.mjs --wrangler --local
```

Do not run remote migrations or seeds as part of routine cleanup.
Never commit credentials or copy production data into test fixtures.

## Deployment

GitHub Actions verifies tests, types and the build; it does **not** deploy.
Deployment remains a separately authorized local operation. See
[the environment map](docs/cms/environment-map.md) before deploying, especially
the staging/production build-environment distinction.

## Documentation and history

Start with [the current handoff](docs/plan.md) and
[the documentation index](docs/README.md). Earlier entries describe superseded
release/snapshot plans; they are not evidence that those routes still exist.

The unused architecture prototype, old PortableText renderer and earlier
Vite-to-Astro migration notes were removed during cleanup. Their complete
pre-cleanup versions remain in
[Git history](https://github.com/Watcharapol-Frong/frong.me/tree/4e8ac930f527eb3032ea2f6ecc291e7469b2ada4).
