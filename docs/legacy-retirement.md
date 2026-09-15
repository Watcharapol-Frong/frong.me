# Legacy retirement record

Audit baseline: `d0b6daeb1fafc22f03a18e11d8d5014d53c4f576` (2026-09-15).
Scope: simplify the maintained repository and provide an English handoff.
Repository retirement and remote destruction are different operations.

| Item | Repository action | Remaining operational work |
| --- | --- | --- |
| Sanity Studio/migration script | Remove source, config, integration, types and dependencies | Verify final export before retiring remote dataset/project and keys |
| Standalone AI Worker | Remove independent source, manifest and deployment config | Inspect outside consumers/traffic; retire remote Worker only with approval |
| Weekly Sanity export | Remove scheduled workflow | Confirm final export and retention before remote data deletion |
| Three historical exports | Move unchanged to `archive/sanity/` | Owner selects durable retention and verifies recovery |
| Release callback probes | Remove obsolete mutating probes and callback-only tests | No active caller or callback secret required |
| Historical release tables | Preserve migrations, rows and integrity checks | Inventory rows and review a forward migration before any drop |
| Superseded plans/spikes/session docs | Remove from current docs; retain in Git | Historical evidence only |
| Embedded Earth AI | Keep routes, settings, provider calls and tests | Verify real provider access separately |

Application/script searches found no active caller of the standalone AI endpoint.
Public routes read D1, not Sanity. Repository evidence cannot establish whether
outside clients still use remote services.

## Preserved data

No deployment, remote deletion, credential revocation or database drop is part
of this cleanup. `archive/` contains data, not another supported system.
Do not import it, extract it into fixtures, or include it in deployment assets.
[Checksums](../archive/sanity/README.md) verify relocation integrity, not backup
completeness or restoration. Sanity exports are not current D1/R2 backups.

## Remote closeout checklist

An authorized operator must:

1. Confirm the current application is deployed and its author workflow works.
2. Inspect Sanity data and standalone Worker consumers/traffic without changing
   them. Check external clients and jobs.
3. Verify a final recoverable export and agree retention/access policy.
4. Obtain approval naming exact remote services and credentials to retire.
   Disable/delete only those targets; record recovery limits.
5. Establish tested D1/R2 backup and restore procedures.
6. For release-table retirement, inventory real rows/relationships and review a
   new migration; test locally/staging before separately approved production work.

Do not mark remote retirement complete just because source was removed.

## Historical sources

Removed source and original export paths remain at the
[audit baseline](https://github.com/Watcharapol-Frong/frong.me/tree/d0b6daeb1fafc22f03a18e11d8d5014d53c4f576).
The [old requirements](https://github.com/Watcharapol-Frong/frong.me/blob/d0b6daeb1fafc22f03a18e11d8d5014d53c4f576/docs/cms-migration-plan.md)
and [session diary](https://github.com/Watcharapol-Frong/frong.me/blob/d0b6daeb1fafc22f03a18e11d8d5014d53c4f576/docs/plan.md)
contain superseded designs and unverified operational claims, not current setup
instructions. Do not copy them back wholesale.
