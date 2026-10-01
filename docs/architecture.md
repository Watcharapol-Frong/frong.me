# Architecture

## Current system

There is one maintained application and one content-management path: Earth.
Astro serves pages and HTTP handlers; React/TipTap powers interactive editing.
Cloudflare runs the application and binds D1, R2 and Workers AI.

| Module | Interface / entry point | Responsibility |
| --- | --- | --- |
| Public reader | `/`, `/about`, `/articles/[slug]` | Presentation and published-post queries |
| Author workspace | `/earth`, `/earth/editor` | Portal, editor, unsaved-change recovery, media and AI panels |
| Content management | `/earth/api/posts/*`, asset/settings endpoints | Validation and repositories behind thin handlers |
| AI assistance | `/earth/api/ai/generate`, provider settings/discovery | Provider calls and configuration |
| SEO and analytics | `src/lib/seo.ts`, `Layout.astro`, `Analytics.astro` | Canonical/social/structured metadata and consent-gated GA4 |
| Access | Middleware on `/earth` and descendants | Signed Access assertion verification |
| Storage | `CmsDatabase`, media upload interface | D1 adapter/repositories and content-addressed R2 assets |

## The two workflows

**Content:** the author signs in, edits in Earth, saves through authenticated
handlers and chooses Publish. Publishing updates the post in D1. Public routes
query active posts and render Markdown; images resolve to the media origin.
There is no release manifest, snapshot exporter or GitHub dispatch. Public
responses are cached, so visibility is not guaranteed to change instantly.
Publishing is in-place, not an immutable published-copy workflow.

Earth uses one row per article and the database lifecycle as its source of truth:

| Action | Database lifecycle | Portal location |
| --- | --- | --- |
| Create and Save | `draft` | Drafts |
| Publish | `active` | Published |
| Update published article | `active` | Published (updates live content) |
| Unpublish | `draft` | Drafts (same ID and content) |

Create opens a blank editor with a fresh client ID. Each unsaved session has a
`?new=<id>` URL and its own browser backup; after the first successful save the
URL becomes `?id=<id>`, so reload fetches the saved database row. Browser backups
are unsaved changes, not another database Draft. Recovery requires an explicit
Restore action and never imports identity or publication status. Legacy shared
backups remain available for explicit content-only recovery into a fresh draft.
Successful saves clear the recovered backup; edits made while saving are retained.
A create conflict never falls through into an update of the conflicting row.
If a later tag/publish step fails after creation, the editor retains the saved
row and retries through Update rather than issuing another Create.

Incomplete drafts may have an empty body, but still require a title and valid
slug. Publish and updates to a published article require nonblank body content.
The existing three-draft capacity rule remains in force for Create and Unpublish.
Existing-post load failures disable saving until the post is successfully loaded.

The rich editor converts typed/pasted `[label](URL)` Markdown into link marks.
Select text and use Command+K on macOS or Ctrl+K on other desktops (or the Link
selection-toolbar button) to add/edit a link. The native dialog preserves the
selection, supports insertion at the cursor, cancellation and removing a link
without removing its text. Plain clicks keep editing; Open link opens the target
separately. Unsafe schemes are rejected. Link serialization always emits explicit
Markdown links, including URL-as-label links, because the public renderer does
not understand CommonMark `<URL>` autolinks. URL parentheses/quotes are encoded
for the public renderer's supported link syntax.

Quote rendering recognizes both TipTap's trailing-backslash hard breaks and
Markdown's two-space hard breaks. Consecutive quote lines share one blockquote;
blank quote lines separate paragraphs and soft line wraps remain spaces.
The public reader and Zen preview use the same renderer, so existing saved
quotes receive this behavior without rewriting article rows.

Article discovery has two distinct taxonomy levels. `posts.primary_topic` is
nullable for legacy content and restricted to `data`, `technology`, or
`business`; these fixed values drive the homepage navigation. Free-form tags
remain language-scoped rows in `tags` linked through `post_tags`, and continue
to describe articles without becoming homepage navigation items.

**Software:** a contributor changes code, opens a pull request and passes CI.
An authorized maintainer separately builds/deploys the chosen environment.
Code deployment and article publication are different operations.

## Placement rules

- Shared contracts and browser-safe transforms: `src/lib/cms/` and `src/types/`.
- Authentication, provider calls and database reads/writes: `src/server/cms/`.
- HTTP translation only: `src/pages/earth/api/`.
- Author interactions: `src/components/earth/`; public presentation elsewhere
  in `src/components/` and `src/layouts/`.
- Page metadata crosses the `PageSeo` interface in `src/lib/seo.ts`; routes do
  not duplicate head tags or analytics loaders.
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

Direct image uploads register a public asset atomically after R2 storage succeeds.
Repeating the same content-addressed key returns the existing asset identity;
retries can finish an interrupted private registration and restore missing bytes.
Removing an image from Markdown removes its reference, not the stored asset.
The original media kind/name are preserved on reuse.

New uploads return an absolute URL under the current site's `/media/assets/`
route. Delivery reads that Worker's own D1/R2 bindings and serves only registered
public assets with immutable caching. Private, unknown and unsafe keys return
uncached 404 responses. Staging does not depend on production's media domain.
Historical content using `https://images.frong.me` is not rewritten by this change;
its external routing still needs separate verification. A passing storage test
is not proof of live delivery.

## Historical material is not architecture

`archive/sanity/` holds data exports only. Old release tables remain in migration
history and are not called by the publishing path. See the explicit
[retirement record](legacy-retirement.md), including pending remote actions.
