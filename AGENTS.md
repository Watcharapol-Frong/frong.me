# Contributor instructions

Applies to the whole repository.

## Start here

Read [README.md](README.md), [architecture](docs/architecture.md),
[CONTRIBUTING.md](CONTRIBUTING.md) and [current handoff](docs/plan.md).
Use current code/docs rather than obsolete phase/session records.

## Change discipline

- Write maintained engineering docs, new comments and change descriptions in
  English. Preserve Thai/English user content.
- Keep changes focused and preserve unrelated edits.
- Keep one CMS and embedded AI path. Follow architecture placement rules.
  Do not add forwarding modules or restore retired systems.
- Add regression coverage; never weaken security/tests for runtime restrictions.
- Update `docs/plan.md` and affected docs at the end of implementation.

## Verification

```sh
npm run test:cms
npx tsc --noEmit
CLOUDFLARE_VITE_FORCE_LOCAL=true npm run build
git diff --check
```

For database work, also apply migrations locally and run
`node scripts/db/verify-staging.mjs --wrangler --local`.
Use background development: `npm run dev -- --background`. Manage with
`npm run astro -- dev status`, `npm run astro -- dev logs`,
and `npm run astro -- dev stop`.

## Safety

Once configured, a push or merge into `staging` starts an automatic staging
deployment. Production deploys only from a manual workflow dispatch on `main`
using the protected `production` GitHub Environment. Do not run remote
migrations/seeds, delete services, revoke credentials or destroy data without
explicit approval.
Never edit applied migrations. Default D1 bindings target staging; production
is a separate named environment in `wrangler.jsonc`.

Keep secrets and real data out of tests, logs and docs. `archive/` is historical
data only, never application input. Follow [operations](docs/cms/environment-map.md)
and [the retirement record](docs/legacy-retirement.md) for authorized closeout.
