# Current handoff

Updated: 2026-10-04. Scope: local development and main-only production operations.

## Current system

One Astro/Cloudflare application owns the public reader, Earth editor and
embedded AI. Published content is read directly from D1; media is stored in R2.
Publishing an article updates content without triggering a code deployment.
See [architecture](architecture.md), [contributing](../CONTRIBUTING.md) and
[operations](cms/environment-map.md).

## Environments and branches

- Production: `frong-me`, `portfolio-db-prod`, `portfolio-media-prod`.
- Local: isolated Wrangler D1/R2 state, placeholder remote IDs, force-local builds.
- `main` is the only maintained branch. Use temporary PR branches and delete
  them after merging. One CMS CI workflow verifies PRs; verified main pushes
  deploy production automatically. Production is restricted to `main`, with
  no required-reviewer pause.
- The owner confirmed removal of the former test Worker, D1, R2, Access
  application and both obsolete GitHub Environments. The old branch and six
  merged work branches were independently checked and removed.

## Maintained helpers and fixtures

- `scripts/db/verify-database.mjs`: relational integrity; local `DB` by default.
- `scripts/db/verify-r2.mjs`: media smoke check; mock mode for routine verification.
- `scripts/build/verify-access.mjs`: Access checks; explicit live host and credentials.
- `scripts/build/verify-bindings.mjs`: production preflight and local/production isolation.
- `db/seeds/local.sql`: deterministic local-only sample data; never seed production.

Operational names, mocks and fixtures now describe their purpose. Local fixtures
are synthetic and do not identify remote production articles/assets. Renamed
helpers preserve authentication, media and database checks. Applied migrations
and real production content are unchanged. Historical designs and deployment
logs remain in Git history instead of the current instructions.

## Latest completed release

### Pending table controls refinement (2026-10-04)

The table size dialog now shares Image's centered card width, padding and
white blurred backdrop; it remains a native modal with Escape/focus handling.
The table toolbar stays visible while scrolling the writing surface. Clicking
an existing cell reveals explicit + Row/+ Column buttons and live dimensions;
these insert after the selected row/column without replacing existing content.
The interaction regression creates six rows, adds a seventh and a column,
checks existing text, then saves/reopens and exercises deletion.
Local CMS tests, TypeScript and diff checks pass. Local Cloudflare prerender
remains restricted by uv_interface_addresses; require full GitHub CI.
Actual browser/mobile visual acceptance is pending. No database changes.

### Completed simple editor tables (2026-10-04)

[PR #29](https://github.com/Watcharapol-Frong/frong.me/pull/29) merged as
`da4099a7b92c3bee6a650f658951532c80db6854`.
[Production run](https://github.com/Watcharapol-Frong/frong.me/actions/runs/37172388421)
passed verification, build, deployment and read-only public smoke checks.
The Table button and /table create editable simple tables; validated Markdown
payloads preserve cells, inline marks and paragraph/line breaks. Public tables
scroll internally on narrow screens. No migrations or article rewrites.

### Completed article rendering repair (2026-10-04)

[PR #28](https://github.com/Watcharapol-Frong/frong.me/pull/28) merged as
`4aa0b175ea1024ba2c7f907b06b7dbeff1b83b75`.
[Production run](https://github.com/Watcharapol-Frong/frong.me/actions/runs/37170156771)
passed tests, TypeScript, build, deployment and read-only public smoke checks.
Public article DOM showed correct multiline quotes with no stray backslashes.
The owner confirmed on an actual mobile device that layout is good and the
backslashes are gone. Existing article rows did not require resaving.

[PR #26](https://github.com/Watcharapol-Frong/frong.me/pull/26) merged as `cd2b851`.
[Production run](https://github.com/Watcharapol-Frong/frong.me/actions/runs/36949723886)
passed CMS tests, TypeScript, build, binding verification, deployment and the
read-only public search/anonymous Earth smoke check. Local migrations and
integrity verification also passed. The naming/documentation follow-up must
pass complete GitHub verification before merge.

## Remaining checks

1. Authenticated production author acceptance: create/save/reopen a draft,
   image insertion, preview, publish, public rendering and unpublish visibility.
2. Authorized provider/AI acceptance. Provider keys stored in D1 lack
   application-level encryption; handle database exports as sensitive data.
3. A tested D1/R2 backup and restore drill. Sanity exports are historical data,
   not current production backups.
4. Verify legacy Sanity and standalone AI service consumers before separately
   approved remote retirement; see [retirement](legacy-retirement.md).
5. Cloudflare verified-crawler event review and Search Console indexing
   inspection. User-agent smoke checks do not prove crawler source-IP access.

## Required verification

```sh
npm run test:cms
npx tsc --noEmit
CLOUDFLARE_VITE_FORCE_LOCAL=true npm run build
git diff --check
```

For database changes, apply migrations locally and run
`node scripts/db/verify-database.mjs --wrangler --local`.
The constrained runtime can block tsx IPC and Cloudflare prerendering; use the
direct Node test runner if necessary and require the full GitHub checks.
