# Contributing

## Before changing code

Read [the architecture](docs/architecture.md), [the current handoff](docs/plan.md)
and [AGENTS.md](AGENTS.md). Use a focused branch and pull request. Explain the
change, reason, test evidence and deployment/data impact in English. Do not
translate user articles or redesign the public interface as incidental cleanup.

Keep route handlers thin. Put database operations in
`src/server/cms/repositories/`, shared browser-safe behavior in `src/lib/cms/`,
and author UI in `src/components/earth/`. Import shared AI types directly from
`src/types/ai.ts`; do not add forwarding files or speculative abstractions.

## Local setup

```sh
npm ci
npx wrangler d1 migrations apply DB --local
node scripts/db/verify-staging.mjs --wrangler --local
npm run dev -- --background
```

Development uses local D1/R2 state. AI may connect to the configured Cloudflare
binding and incur provider usage; do not exercise it without approval. For
intentionally isolated work, set `CLOUDFLARE_VITE_FORCE_LOCAL=true`.

To work on Earth without a real Access login, set
`ENABLE_ACCESS_DEV_BYPASS=true` in an untracked local `.dev.vars` file. The guard
also requires development mode. Never enable the bypass in shared environments.
Do not seed production. A database with migrations but no fixtures can be empty.

Manage the server with `npm run astro -- dev status`, `npm run astro -- dev logs`
and `npm run astro -- dev stop`.

## Required checks

```sh
npm run test:cms
npx tsc --noEmit
CLOUDFLARE_VITE_FORCE_LOCAL=true npm run build
git diff --check
```

Also run local migration verification when touching database behavior. Never edit
an applied migration: add a new one and review data-loss/rollback implications.
Historical release tables are not an active publishing dependency, but their
migrations and integrity checks remain necessary to reproduce existing databases.

Some constrained runtimes cannot open local sockets or run workerd. Report that
limitation; do not weaken tests or claim a successful build. GitHub CI must pass
the full suite, TypeScript and build on the proposed commit before merging.

## Human acceptance before deployment

In an authorized test environment: sign in, create/save/reopen a draft, insert an
image, preview, publish, check the public article, unpublish, then check visibility
after cache expiry. Exercise AI only with an approved account. Check navigation
and Thai/English text. Automated tests do not establish that remote DNS, Access
policies, backups or a browser workflow are configured.

## Operational safety

- A merge does not deploy; follow the [environment guide](docs/cms/environment-map.md).
- Do not deploy, run remote migrations/seeds, delete services or rotate secrets
  as part of routine refactoring.
- Never copy production data or keys into tests, logs, issues or pull requests.
- Keep `archive/` out of runtime imports and build inputs. Historical exports
  are not current D1/R2 backups or evidence that a restore works.
- Update the handoff and affected documentation when behavior or ownership changes.
