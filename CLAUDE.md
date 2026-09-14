## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

The root build currently requires the legacy Sanity variables, and `npx tsc --noEmit` stops on the legacy `baseUrl` option in `tsconfig.json`. Both are known retired-configuration issues; do not treat them as regressions.

## CMS work

Read [`docs/plan.md`](docs/plan.md) before starting: it holds the current task ID, acceptance gates, the inventory of Phase 1 code already in the repository, and the session handoff. Update it at the end of every session.

Run the CMS checks with:

```
npm run test:cms
npx wrangler d1 migrations apply DB --local
node scripts/db/verify-staging.mjs --wrangler --local
```

`wrangler.jsonc` binds `DB` to the staging database `portfolio-db-staging` by default, and has a real (non-placeholder) `env.production` block pointing at `portfolio-db-prod`. Never run migrations, seeds, or mutations with `--remote` without an explicit, reviewed reason. Record command output as evidence in the plan, and never put secret values in documentation or committed configuration.

Deploys are local-only — GitHub is not connected to Cloudflare, there is no CI/CD auto-deploy, and pushing to `main` does not deploy anything. Use `npm run deploy:staging` for staging and `wrangler deploy --env production` for production; both need a Cloudflare API token (Workers Scripts:Edit, D1:Edit) supplied as a local `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`. See [`docs/cms/environment-map.md`](docs/cms/environment-map.md) for the full variable list, the real Cloudflare Access team domain/AUD already in use on production, and the exact remote-migration commands.

## Documentation

Project documentation is written in English and indexed at [`docs/README.md`](docs/README.md).

Full Astro documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
