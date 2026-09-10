# Documentation

Project documentation is maintained in English. Thai text may appear in explicitly labeled language-test examples where the original characters are necessary to demonstrate behavior.

## Current implementation status

- Phase 0 is complete and Gate G0 passed: the production AI Worker is protected and rejects unauthenticated requests.
- Gate G0.5 passed after owner-confirmed staging Worker/workerd, D1 binding/query, and Access guard verification; the architecture record retains local evidence and identifies remote IDs still to record.
- Phase 1 CMS core implementation has started with data contracts and versioned D1 migrations.
- The main-site CMS production cutover has not started.

| Document | Purpose |
|---|---|
| [Implementation plan](plan.md) | Start here for current status, task IDs, dependencies, acceptance gates, decisions, and session handoffs |
| [CMS migration specification](cms-migration-plan.md) | Version 6 product requirements, architecture, example schema, routes, and detailed acceptance criteria |
| [Phase 0 baseline](cms/baseline.md) | Repository/build/public-endpoint inventory and legacy reuse/replace/retire decisions |
| [Environment map](cms/environment-map.md) | Staging/production resources, binding/secret names, ownership boundaries, and verification commands |
| [Phase 0.5 architecture spike](cms/architecture-spike.md) | Astro/Cloudflare runtime, Access auth, D1 snapshot, dispatch, recovery, and staging evidence |
| [Historical Astro migration notes](../README-MIGRATION.md) | Earlier Vite/React-to-Astro migration history; not the current CMS specification |

The owner has confirmed that the existing code is a legacy implementation and may change substantially to meet the new requirements. The implementation plan records that direction and later review refinements. Historical “verified” claims in the specification do not establish current deployment status.

Keep planning and design documents in this directory. Keep the project entry point at [the root README](../README.md) and agent-specific instructions at their root discovery paths: [AGENTS.md](../AGENTS.md) and [CLAUDE.md](../CLAUDE.md).

Update `plan.md` after each work session. The Phase 0 baseline/environment map and Phase 0.5 architecture record exist under `docs/cms/`; later release, backup, and cutover runbooks will be created with their implementation tasks.
