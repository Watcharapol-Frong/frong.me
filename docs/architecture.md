# Architecture

## Current system

There is one maintained application and one content-management path: Earth.
Astro serves pages and HTTP handlers; React/TipTap powers interactive editing.
Cloudflare runs the application and binds D1, R2 and Workers AI.

| Module | Interface / entry point | Responsibility |
| --- | --- | --- |
| Public reader | `/`, `/about`, `/articles/[slug]` | Presentation and published-post queries |
| Author workspace | `/earth`, `/earth/editor` | Portal, editor, local draft recovery, media and AI panels |
| Content management | `/earth/api/posts/*`, asset/settings endpoints | Validation and repositories behind thin handlers |
| AI assistance | `/earth/api/ai/generate`, provider settings/discovery | Provider calls and configuration |
| Access | Middleware on `/earth` and descendants | Signed Access assertion verification |
| Storage | `CmsDatabase`, media upload interface | D1 adapter/repositories and content-addressed R2 assets |

## The two workflows

**Content:** the author signs in, edits in Earth, saves through authenticated
handlers and chooses Publish. Publishing updates the post in D1. Public routes
query active posts and render Markdown; images resolve to the media origin.
There is no release manifest, snapshot exporter or GitHub dispatch. Public
responses are cached, so visibility is not guaranteed to change instantly.
Publishing is in-place, not an immutable published-copy workflow.

**Software:** a contributor changes code, opens a pull request and passes CI.
An authorized maintainer separately builds/deploys the chosen environment.
Code deployment and article publication are different operations.

## Placement rules

- Shared contracts and browser-safe transforms: `src/lib/cms/` and `src/types/`.
- Authentication, provider calls and database reads/writes: `src/server/cms/`.
- HTTP translation only: `src/pages/earth/api/`.
- Author interactions: `src/components/earth/`; public presentation elsewhere
  in `src/components/` and `src/layouts/`.
- Operational verification: `scripts/`; regression tests: `tests/cms/`.

Use small interfaces that hide real implementation work. Do not create a second
CMS, separate AI deployment, forwarding type module or repository package merely
to make folders symmetrical. Existing seams isolate UI, storage and providers;
change one when it improves locality or testability.

## Security and data facts

Access middleware verifies signature, issuer, audience and token time claims.
Who may sign in is governed by the Cloudflare Access policy; the application
does not implement an additional email allowlist. Do not infer one from old docs.

AI provider keys are not returned to browser readers, but saved keys currently
live in D1's `ai_provider_configs.api_key` column without application-level
encryption. Treat database access and backups as sensitive. AI suggestions
require an author action before they become content; they do not publish.

The media origin is currently `https://images.frong.me` in code. Verify routing
and environment separation before relying on image uploads in staging/production.
A passing mock storage test is not proof of live delivery.

## Historical material is not architecture

`archive/sanity/` holds data exports only. Old release tables remain in migration
history and are not called by the publishing path. See the explicit
[retirement record](legacy-retirement.md), including pending remote actions.
