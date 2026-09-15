# Documentation

Project documentation is maintained in English.

## Current implementation

The homepage and `/articles/[slug]` read published posts directly from D1.
The protected `/earth` editor supports saving, publishing, withdrawing, archiving,
image uploads and the in-app AI assistant. GitHub Actions runs verification only;
deployment remains a separate local operation.

Old release orchestration routes, snapshot exporters and `src/components/cms/`
mentioned in historical entries are no longer in the current tree. Existing
release-related database migrations, verifier code, Sanity Studio, backups and
the standalone AI Worker are retained pending separate retirement decisions.

## Read in this order

| Document | Purpose |
|---|---|
| [Current handoff](plan.md) | Current cleanup status and follow-up work; older logs remain historical |
| [Environment map](cms/environment-map.md) | Resource identifiers, variable names and deployment precautions |
| [CMS requirements](cms-migration-plan.md) | Original requirements; release/snapshot sections need reconciliation with direct publishing |
| [AI integration](cms/ai-integration-spec.md) | In-app AI contract and design |
| [Baseline](cms/baseline.md) | Historical migration inventory |
| [Architecture proof](cms/architecture-spike.md) | Historical evidence and a link to the removed prototype in Git |

Do not treat historical checkboxes, deployment logs or backup archives as proof of
current production health or restorability. Keep user-facing behavior and data
intact unless a separate change authorizes their retirement.
