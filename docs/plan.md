# Current handoff

Updated: 2026-09-15. Scope: legacy retirement and English maintainer onboarding.

## Architecture

One Astro/Cloudflare app owns the public reader, Earth editor and embedded AI.
Active posts are read from D1; media lives in R2. Publishing updates content
directly, without GitHub builds or deployment. Start with
[architecture](architecture.md) and [contribution instructions](../CONTRIBUTING.md).

## Change set

- Remove Sanity Studio/integration/dependencies and the old migration script.
- Remove standalone AI Worker source/config and weekly Sanity export workflow.
- Keep embedded AI, provider settings and tests.
- Move three historical exports unchanged into `archive/sanity/`.
- Remove release callback probes; keep read-only Access verification.
- Import shared AI types directly and declare development tools explicitly.
- Replace contradictory historical onboarding with current English docs.
- Preserve applied migrations, release-table rows and integrity checks.
- No deployment, remote data change, service deletion or credential revocation.

## Verification

Implementation commit `bf0950c30e01550b730bd4f43211b4c24a7f2418` passed
[GitHub CMS CI](https://github.com/Watcharapol-Frong/frong.me/actions/runs/35031544646):
215 tests, mandatory TypeScript and the full Astro/Cloudflare build.
The latest checks and merge state are tracked in
[PR #4](https://github.com/Watcharapol-Frong/frong.me/pull/4).

Local verification: 215/215 tests pass with `node --import tsx --test
tests/cms/*.test.ts`; `npx tsc --noEmit` and `git diff --check` pass.
The tsx CLI cannot create its IPC socket here (EPERM). The full local build
bundles server/client code but workerd prerendering cannot enumerate network
interfaces in this runtime. GitHub CI successfully ran the ordinary npm test
command and completed prerendering; do not weaken either local check.
Read-only Access and in-memory R2 smoke verifications also pass locally.

The lockfile shrank from 1,457 to 594 package entries (including its root entry),
with no version changes for retained package paths. All three archive checksums
match the baseline. The suite removes two callback-only tests and adds seven
retirement/read-only verification checks, for a net increase from 210 to 215.

## Next gates

1. Require green full-suite, TypeScript and build checks for every future change.
2. Get deployment approval and follow the human acceptance checklist.
3. Verify Access/login, media origin/environment separation and AI in the approved
   environment. Stored provider keys lack application-level encryption.
4. Verify D1/R2 backup and restore.
5. Complete [remote retirement](legacy-retirement.md). Removing source does not
   retire the remote Sanity project or AI Worker.

Historical requirements/session logs are linked from the retirement record, not
mixed into this current handoff.
