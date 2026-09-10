# frong.me — Website Development Specification (Version 6)

> Requirements and development plan · Updated 2026-09-10
> Repository: `Watcharapol-Frong/portfolio` · Site: https://frong.me
> **Developer: the site owner, assisted by AI · Available time: 5–10 hours/week**

> **Implementation status:** Gates G0 and G0.5 are complete, and Phase 1 CMS core implementation is in progress. Track current status and handoffs in [`plan.md`](plan.md), with technical evidence in [`cms/architecture-spike.md`](cms/architecture-spike.md). This specification remains the requirements source and does not by itself prove deployment.

**Version 6 changes — complete the article system before starting the project system**

- Combine article authoring and image uploads because first-generation article charts are image files.
- Phase 1 now ends with an entire real analytical article and chart publishing workflow, not text-only publishing.
- General images and charts share an upload pipeline, while charts containing text and fine lines retain detail without lossy compression.
- Export charts at twice their display width: for example, 1600px for an 800px display.
- Initially use one white-background chart file in both light and dark modes. Do not remove its background, invert colors, or require a second dark version.
- Move project-link management and the central registry to Phase 2. Projects remain independently developed and deployed as decided in version 5.
- This is a specification for future implementation. It does not record changes to code, databases, or production deployments.

> Stack, font measurements, and unrelated implementation claims were inherited from version 4 without another repository or external-documentation check when version 6 was written. “Verified” in those passages records an earlier check, not current implementation evidence. See [the implementation plan](plan.md) for the later repository review, corrections, decisions, and task status. The owner has confirmed that the old code can change substantially; new requirements take priority over preserving legacy implementation details.

**Corrections retained from the version 4 review:**

| # | Correction | Previous issue |
|---|---|---|
| 1 | **Deploy to Cloudflare Workers, not Pages**; add a Phase 0.5 prototype | Incorrect platform claim |
| 2 | **Add `post_revisions` to separate drafts from published content**, plus deploy status | Design bug |
| 3 | **A failed build preserves the last deployment**; never skip broken items and publish an incomplete site | Incorrect failure behavior |
| 4 | **Allow static article charts** and prioritize real analysis | Conflicting requirements |
| 5 | **Move backups earlier, deliver newsletter as a complete cycle, and protect the AI Worker immediately** | Incorrect sequencing |
| 6 | **Correct the claim about `lang` and Google**; label numerical estimates as measurement targets | Incorrect factual claims |

### Evidence labels

| Label | Meaning |
|---|---|
| ✅ **Verified** | Checked against official documentation or execution, with a source; historical checks remain subject to the note above |
| 🎯 **Measurement target** | Estimate to measure against real files/systems and revise |
| ❓ **Needs verification** | Unknown; investigate before deciding |

## Contents

1. [Shared understanding](#1-shared-understanding)
2. [Goals and content strategy](#2-goals-and-content-strategy)
3. [Scope](#3-scope)
4. [Time constraints](#4-time-constraints)
5. [Existing implementation](#5-existing-implementation)
6. [Target architecture](#6-target-architecture)
7. [Technical constraints](#7-technical-constraints)
8. [Security](#8-security)
9. [Database schema](#9-database-schema)
10. [Route map](#10-route-map)
11. [Fonts](#11-fonts)
12. [Images](#12-images)
13. [Charts and data visualization](#13-charts-and-data-visualization)
14. [SEO](#14-seo)
15. [Performance](#15-performance)
16. [Development phases](#16-development-phases)
17. [Open decisions](#17-open-decisions)
18. [Risks](#18-risks)
19. [Article slugs and heading IDs](#19-article-slugs-and-heading-ids)
20. [Project-link administration](#20-project-link-administration)
21. [Central registry and storage](#21-central-registry-and-storage)
22. [Transition and overall acceptance](#22-transition-and-overall-acceptance)

## 1. Shared understanding

Confirm these assumptions and correct misunderstandings before implementation.

| # | Topic | Decision |
|---|---|---|
| 1 | Primary goal | Build a personal brand and an audience |
| 2 | Identity | A data analyst who tells stories through interactive visualization, and a developer/writer who understands technology and AI |
| 3 | Content types | CMS creates **Markdown articles only**; projects are independently developed websites/apps represented by link cards |
| 4 | Content storage | Articles and project registry in D1; project code in separate repositories; data files tracked through the registry in section 21 |
| 5 | Languages | Mixed-language content, one language per item: Thai `/articles/x`, English `/en/articles/x`; no mandatory translation pair |
| 6 | Homepage | Chronological combined article/project feed |
| 7 | Publishing cadence | One article/week and 1–2 projects/month |
| 8 | Content pillars | Thai economic/social analysis; data tools/techniques; learning and career transition |
| 9 | Following | Email newsletter and RSS |
| 10 | Admin authentication | Cloudflare Access |
| 11 | AI Assistant | BYOK; add providers/API keys/models in settings |
| 12 | Fonts | **Google Sans for both Thai and English**; Thai subset availability was checked previously |
| 13 | Charts | Static images with explanations/tables in articles; interactive work in separate projects |
| 14 | Developer | Owner plus AI assistance; 5–10 hours/week |
| 15 | Priority | **Complete articles with images/charts before starting project management** |

## 2. Goals and content strategy

Be recognized as **someone who analyzes Thai economic and social data and explains it clearly through interactive visuals**. The website and its work are the portfolio; a separate resume is unnecessary.

| Priority | Pillar | Role | Suitable format |
|---|---|---|---|
| 1 | Thai economic/social analysis | Distinctive strength: economics background, local context, and visualization skills | Interactive projects and supporting articles |
| 2 | Data tools/techniques | Attract traffic | How-to articles |
| 3 | Learning/career transition | Build a connection with readers | Personal experience articles |

### Metrics

1. Newsletter subscribers: primary measure of an audience the owner can reach directly.
2. Published items per month: consistency.
3. Organic search visitors.
4. Most-read pages: evidence of which pillars work.

The original specification reports Cloudflare Web Analytics as already installed; verify actual deployment configuration during the baseline review.

## 3. Scope

### Included

Cloudflare article CMS with image/static-chart uploads; project cards and registry; mixed Thai/English content; newsletter/RSS; BYOK AI Assistant; public design based on the existing site. As subsequently clarified by the owner, structure and UI may change to meet the new goals.

### Excluded by decision

| Excluded | Reason |
|---|---|
| CMS project editor, MDX, or project page builder | Owner develops/deploys each project independently |
| Project interactive code/runtime databases in the main site | Avoid shared lifecycles and cross-system privileges |
| Migration of old Sanity articles | Disposable demo content |
| Separate `/work` project index | Homepage already serves this role |
| CV/resume page | About and the work itself serve this role |
| Separate dataset publishing page | Article sources link to the data |
| Three pillar hubs at `/category/...` | Deliberately omitted, accepting the lost topic-cluster opportunity |
| Comments | See rationale below |
| Multiple users | Single-owner system |

**No comments system.** The planning rationale is that empty threads can look unhelpful, SEO benefit is not assumed, spam/moderation and legal overhead increase, and newsletter better serves the goal.

Instead, end articles with “Found an error or have more information? Email me.” This supports the credibility of analytical work. Reconsider comments after subscribers reach the hundreds or substantive email discussions become frequent.

## 4. Time constraints

| Item | Estimate |
|---|---|
| Available time | 5–10 hours/week; use 7 as a midpoint |
| Writing at the desired cadence | About 10 hours/week |
| Complete CMS | 🎯 About 110–162 hours, excluding independent projects and writing |

There is insufficient time to do both development and writing at full pace. Alternate between them.

### Planning principles

The greatest risk is spending five months building a system without publishing anything.

1. Reach usable writing/publishing quickly, then start writing immediately.
2. Alternate writing weeks and development weeks.
3. Each completed phase must be usable, not partially delivered.
4. Define boundaries and stable IDs clearly. Add versioned migrations as features arrive rather than creating every table up front.

## 5. Existing implementation

**Recorded stack:** Astro 7.2.2, React 19, Tailwind CSS 4, Node ≥22.12.0.
**Output:** static. **CMS:** Sanity Portable Text, Studio at `/admin`.

```text
src/
├── components/
│   ├── portabletext/          # Sanity-dependent; replace as needed
│   │   ├── ArticleBody.astro  PortableTextHeading.astro  PortableTextImage.astro
│   ├── AboutIsland.tsx  AnnouncementBanner.tsx  FloatingNav.tsx
│   ├── HomeIsland.tsx   Navbar.tsx  ScrollRevealText.tsx
│   ├── ShareButton.tsx  TableOfContents.astro
│   └── ui/popover.tsx
├── layouts/Layout.astro      # Requests three font families; see section 11
├── lib/
│   ├── sanityImage.ts        # Sanity-dependent
│   ├── slugify.ts            # extractHeadings() reads Portable Text
│   └── utils.ts
├── pages/  index.astro  about.astro  articles/[slug].astro  404.astro
└── styles/global.css         # Color and font tokens
```

### Existing pieces available for reuse

`ai-worker/` defines `ai-assistant-worker`, reported as deployed in the original specification. Actual deployment is to be confirmed. Its recorded providers/defaults are:

| Provider | Default model | Invocation |
|---|---|---|
| `cloudflare` | `@cf/meta/llama-3.1-8b-instruct-fp8` | AI binding; originally described as free, current quota/pricing unverified |
| `gemini` | `gemini-3.5-flash-lite` | REST with `GEMINI_API_KEY` |
| `openrouter` | `openai/gpt-4o-mini` | REST with `OPENROUTER_API_KEY` |

Tasks: `title-suggestions`, `auto-excerpt`, `generate-outline`, and `seo-optimizer`.

`sanity/components/AIAssistantView.tsx` contains the existing Worker UI. Preserve useful logic before removing Sanity, or replace it where appropriate. Provider/model availability must be rechecked at implementation.

## 6. Target architecture

| System | Responsibility |
|---|---|
| Main site on Workers | Static combined feed, articles, About, and RSS |
| Admin behind Access | Article editor, project links, resource registry, publishing status |
| CMS D1 | Article drafts/revisions, project cards/revisions, registry, build status |
| R2 | Article files and data snapshots, separated into public/private storage with stable IDs |
| GitHub/project deployment systems | Independently store/deploy project code; CMS publish does not trigger them |
| AI Worker | Called only by the admin server |

Article/card publishing: save draft → snapshot approved content → build main site → confirm success → show new release.

Project development: separate repository → test → separate deployment → put its URL in a CMS card.

Readers follow the card directly to the project URL. The main site loads no project code and embeds no iframe.

### 6.1 Platform: Workers

✅ The earlier adapter check established Workers as the deployment target, with Workers Static Assets serving static files. The adapter documentation states that Pages support was removed. [Astro Cloudflare adapter](https://docs.astro.build/en/guides/integrations-guide/cloudflare/)

### 6.2 Runtime bindings

✅ The previous check found `Astro.locals.runtime` removed:

```js
// Removed API:
const db = Astro.locals.runtime.env.DB;

// Replacement shown in the specification:
import { env } from "cloudflare:workers";
const db = env.DB;

// ExecutionContext, previously Astro.locals.runtime.ctx:
const ctx = Astro.locals.cfContext;
```

These are alternative examples, not one executable module. Prove the selected versions in Phase 0.5.

### 6.3 Output mode

✅ `output: 'hybrid'` was removed. Keep `output: 'static'`, add `@astrojs/cloudflare`, and opt dynamic pages/endpoints in explicitly. [On-demand rendering](https://docs.astro.build/en/guides/on-demand-rendering/)

```js
// Dynamic routes under src/pages/earth/** and src/pages/api/**:
export const prerender = false;
```

Existing public pages can remain statically rendered.

### 6.4 Build triggers need a proven design

The earlier Pages Deploy Hook approach cannot simply be assumed to work on Workers.

| Option | Confidence in the original plan |
|---|---|
| GitHub Actions + `repository_dispatch`: `/earth/api/publish` posts to GitHub, workflow builds and runs `wrangler deploy` | Standard mechanism; actual repository permissions/configuration still need proof |
| External Workers Builds trigger | ❓ Unknown; verify whether an equivalent mechanism is available |

Prove external deployment triggering in Phase 0.5 before building the CMS. Without a working trigger path, static rebuild-on-publish cannot meet the workflow. A failure of one configuration is not proof that every static approach is impossible; follow the diagnostic steps in [the implementation plan](plan.md).

### 6.5 Articles versus project links

| | Articles | Project links |
|---|---|---|
| Creation | Markdown editor | Registry form |
| CMS stores | Body, cover, metadata, revisions | Title, summary, cover, URL, private registry |
| Rendering | Main-site article page | Independently developed/deployed project |
| Reader URL | `/articles/[slug]` or `/en/articles/[slug]` | Specified HTTPS URL, e.g. `https://cost-of-living.frong.me` |
| Tables | `posts`, `post_revisions` | `projects`, `project_revisions` |
| Charts | Static images; structured chart blocks may come later | Any suitable technology, including interactive/scrollytelling |
| CMS publish | Publishes the article | Publishes only the card, not the application |

Merge both public snapshots into feed items in code. Sort by `listed_at/published_at DESC`, with ID as the tie-breaker. They need not share one database table. Featured work uses `featured` and `sort_order ASC`; sort_order must not reorder the chronological feed. Do not add a `/work` index or new `/work/[slug]` content pages.

## 7. Technical constraints

### 7.1 Build-time D1 access

The original proposal assumed a build container without D1 bindings while `getStaticPaths()` needs content during the build. This is a configuration assumption to test, not a universal current adapter restriction; see F09 in [the implementation plan](plan.md).

| Context | Proposed access |
|---|---|
| Build time | HTTP API and API token: `POST https://api.cloudflare.com/client/v4/accounts/{id}/d1/database/{db}/query` |
| Runtime: `/earth/*`, `/api/*` | `import { env } from "cloudflare:workers"`, then `env.DB` |

The source proposes `src/lib/db.ts` as a shared interface. Keep build-only access and runtime secrets appropriately separated in the actual design.

### 7.2 Independent main-site and project builds

- Remove any proposed MDX-from-D1 prebuild step; do not generate `src/content/projects/*.mdx`.
- Main builds read only approved article/card snapshots and referenced article files. Never fetch or compile destination project code.
- A broken project URL must not fail the main build; link health checks are separate.
- A failed main build preserves the old deployment and reports an error. Never omit the broken article and deploy the rest.
- Failed project workflows preserve their latest working deployment according to their hosting system.

**Published snapshots:** freeze every reader-visible field, including slug, language, cover, tags, URL, and card ordering. Each build uses one release manifest containing every item's revision ID. Never query mutable drafts during a build.

Deploy the main site one release at a time. Update the live pointer only after confirmed deployment. If a callback is missing, check provider status before showing “Live.” Card withdrawal also creates a release rather than deleting data before a build.

**Acceptance:** edit draft card A, then publish article B: public A is unchanged. Project deployment failure leaves the main site readable. Main build failure leaves existing article URLs available.

### 7.3 Markdown rendered by `marked`

`marked` returns an HTML string containing ordinary `<img>` tags; these do not automatically enter Astro's component-based image optimization pipeline. The original plan therefore supplies its own conversion, sizing, and attributes for this rendering path; see section 12. This is a constraint of the chosen pipeline, not a requirement to preserve the old renderer.

## 8. Security

### 8.1 Unauthenticated AI Worker

The old `ai-worker/src/index.js` sets `Access-Control-Allow-Origin: "*"` and has no caller authentication. Anyone who can reach an equivalent live endpoint could consume provider credits.

Proposed fix: browser → `/earth/api/ai/*` behind Access → server calls Worker with `X-Auth-Secret` → Worker rejects missing/invalid secrets. Restrict CORS to `https://frong.me`; CORS is not the authentication mechanism. Verify actual production status separately.

### 8.2 BYOK API-key storage

1. Encrypt before storage using Web Crypto AES-GCM. Keep the master `ENCRYPTION_KEY` in secrets; D1 stores ciphertext only.
2. Never return the key to the browser. Settings are write-only and display a mask such as `AIza••••4f2c`.
3. Decrypt only on the server when making a provider request.

### 8.3 Public `/api/subscribe`

Use Turnstile, per-IP rate limits, double opt-in, and an unsubscribe link in every email. The source proposes consent timestamps/IP records under its PDPA/GDPR requirements; verify the appropriate consent/retention policy in Phase 3 as specified in the implementation plan rather than treating this as a legal conclusion.

### 8.4 General requirements

- Validate upload MIME and size on the server; never trust the client.
- Sanitize preview and published Markdown HTML using an allowlist. No MDX, scripts, or code imports from the editor.
- Accept correctly parsed HTTPS project URLs only. Reject credentials and schemes such as javascript/data/file. No generic redirect endpoint.
- Repo/hosting/storage/backup registry details are private. Exclude them from public JSON, HTML, RSS, search indexes, and build artifacts using an explicit public serializer allowlist.
- Never store project API keys in CMS notes. Use each host's secret manager.
- Automatic link checks are outside the MVP. If added, prevent SSRF, including private IPs, DNS rebinding, and every redirect hop.
- Custom AI provider `base_url` must use HTTPS and must not target internal addresses.

## 9. Database schema

> This is a target example, not a verified migration for an existing database. Phase 1 adds articles/images/releases; Phase 2 adds project registry tables. Later features use versioned migrations. See the implementation plan's relationship, deletion, release, and media corrections before turning this SQL into migrations.

### Earlier schema bug, identified in version 4

With one `body` per article and autosave every 30 seconds:

```text
1. Article A is published.
2. Editing A overwrites posts.body on each autosave.
3. Before finishing A, the owner publishes B.
4. Deployment triggers a D1-reading build.
5. A's unfinished draft is accidentally published.
```

Separate the working copy from the public revision. `posts.body` is the working draft. Builds read only frozen `post_revisions` selected by the release manifest. This also permits rollback. `published_revision_id` identifies the live revision, not a draft waiting to build.

```sql
-- Articles only
CREATE TABLE posts (
  id                   TEXT PRIMARY KEY,
  lang                 TEXT NOT NULL DEFAULT 'th',       -- th | en
  translation_group_id TEXT,                 -- NULL = standalone item (normal case)
  slug                 TEXT NOT NULL,
  -- Working draft: autosave writes here; builds never read it
  title                TEXT NOT NULL,
  body                 TEXT NOT NULL,        -- Markdown only; no code imports
  excerpt              TEXT,
  cover_image          TEXT,
  cover_position       TEXT,                 -- JSON {"x":50,"y":50,"zoom":1.0}
  tags                 TEXT,                 -- JSON array
  font                 TEXT DEFAULT 'sans',
  -- Live version: new builds use revision IDs from the release manifest
  published_revision_id TEXT,                -- NULL = never published
  status               TEXT NOT NULL DEFAULT 'draft',    -- draft | published
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL,
  published_at         INTEGER
);
CREATE UNIQUE INDEX idx_posts_slug_lang ON posts(slug, lang);
CREATE INDEX idx_posts_feed  ON posts(status, published_at DESC);
CREATE INDEX idx_posts_group ON posts(translation_group_id);

-- Frozen revisions: builds read this table for article content
CREATE TABLE post_revisions (
  id             TEXT PRIMARY KEY,
  post_id        TEXT NOT NULL,
  slug           TEXT NOT NULL,
  lang           TEXT NOT NULL,
  translation_group_id TEXT,
  published_at   INTEGER NOT NULL,
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  excerpt        TEXT,
  cover_image    TEXT,
  cover_position TEXT,
  tags           TEXT,
  font           TEXT,
  created_at     INTEGER NOT NULL,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);
CREATE INDEX idx_revisions_post ON post_revisions(post_id, created_at DESC);

-- Deployment status: saved in D1 does not mean live
CREATE TABLE deployments (
  id            TEXT PRIMARY KEY,
  status        TEXT NOT NULL,   -- queued | building | live | failed
  trigger_kind  TEXT NOT NULL,   -- article | project | withdraw | rollback
  trigger_id    TEXT,            -- Article or card ID; does not deploy the project application
  manifest_json TEXT NOT NULL,   -- immutable {articles:[{id,revision_id}],projects:[{id,revision_id}]}
  error_message TEXT,            -- Error message on failure
  started_at    INTEGER NOT NULL,
  finished_at   INTEGER
);
CREATE INDEX idx_deployments_time ON deployments(started_at DESC);

-- Project registry: no body or MDX
CREATE TABLE projects (
  id TEXT PRIMARY KEY,                  -- Permanent ID; unchanged when name/URL changes
  slug TEXT UNIQUE NOT NULL,             -- Internal reference name; does not create a public route
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  target_url TEXT NOT NULL,              -- HTTPS, validated by the API
  cover_image TEXT,
  cover_alt TEXT,
  lang TEXT NOT NULL DEFAULT 'th',
  tags TEXT,                            -- JSON array
  featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  lifecycle TEXT NOT NULL DEFAULT 'active'
    CHECK(lifecycle IN ('active','maintenance','archived')),
  published_revision_id TEXT,           -- Live version; NULL = not displayed
  listed_at INTEGER NOT NULL,            -- Card listing date; unchanged by copy edits
  last_checked_at INTEGER,
  link_health TEXT NOT NULL DEFAULT 'unchecked',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE project_revisions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  public_json TEXT NOT NULL,             -- allowlist: id,title,description,target_url,
                                        -- cover_image,cover_alt,lang,tags,featured,
                                        -- sort_order,lifecycle,listed_at,visible
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_project_revisions ON project_revisions(project_id, created_at DESC);

-- Private data: no field is automatically exported publicly
CREATE TABLE project_resources (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  kind TEXT NOT NULL,                    -- repo | hosting | data | backup | runbook
  label TEXT NOT NULL,
  locator TEXT NOT NULL,                 -- Dashboard URL or bucket/key; never include secrets
  data_class TEXT NOT NULL DEFAULT 'private'
    CHECK(data_class IN ('public','private')),
  version_ref TEXT,                      -- commit SHA / dataset version / backup set
  checksum TEXT,
  source_url TEXT,
  license_note TEXT,
  owner TEXT NOT NULL,
  last_verified_at INTEGER,
  restore_tested_at INTEGER,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_project_resources ON project_resources(project_id, kind);

CREATE TABLE project_articles (
  project_id TEXT NOT NULL REFERENCES projects(id),
  post_id TEXT NOT NULL REFERENCES posts(id),
  PRIMARY KEY(project_id, post_id)
);

-- The deployment release manifest is the source for each build
CREATE TABLE site_state (
  id INTEGER PRIMARY KEY CHECK(id=1),
  live_deployment_id TEXT REFERENCES deployments(id)
);

-- Images
CREATE TABLE images (
  id         TEXT PRIMARY KEY,
  post_id    TEXT,
  project_id TEXT,                    -- Card cover, not application runtime files
  r2_key     TEXT NOT NULL,          -- images/2026/09/01H....webp
  url        TEXT NOT NULL,          -- Full URL used in Markdown
  width      INTEGER NOT NULL,       -- Required to prevent layout shift
  height     INTEGER NOT NULL,       -- ★
  size       INTEGER,
  format     TEXT DEFAULT 'webp',
  alt        TEXT,                   -- ★ accessibility + SEO
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_images_url ON images(url);

-- Versioned article/shared datasets
CREATE TABLE datasets (
  id          TEXT PRIMARY KEY,
  post_id     TEXT,
  project_id  TEXT,                   -- NULL when unrelated to a project
  version     TEXT NOT NULL,
  checksum    TEXT NOT NULL,
  data_class  TEXT NOT NULL DEFAULT 'private',
  license_note TEXT,
  r2_key      TEXT NOT NULL,          -- datasets/2026/09/thai-export.json
  url         TEXT,                  -- Only for data approved for publication
  label       TEXT,
  source_url  TEXT,                   -- Data source; always attribute it
  row_count   INTEGER,
  created_at  INTEGER NOT NULL
);

-- Newsletter subscribers
CREATE TABLE subscribers (
  id                TEXT PRIMARY KEY,
  email             TEXT UNIQUE NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',  -- pending|confirmed|unsubscribed
  lang              TEXT NOT NULL DEFAULT 'th',
  confirm_token     TEXT,
  unsubscribe_token TEXT NOT NULL,
  consent_ip        TEXT,             -- Proposed consent evidence under the source PDPA requirements
  created_at        INTEGER NOT NULL,
  confirmed_at      INTEGER
);
CREATE INDEX idx_subscribers_status ON subscribers(status);

-- ═══════════════════ BYOK: AI Providers ═══════════════════
CREATE TABLE ai_providers (
  id                TEXT PRIMARY KEY,   -- gemini, openrouter, groq, my-ollama
  label             TEXT NOT NULL,
  kind              TEXT NOT NULL,      -- openai-compatible|gemini|anthropic|cloudflare
  base_url          TEXT,
  api_key_encrypted TEXT,               -- AES-GCM ciphertext
  enabled           INTEGER NOT NULL DEFAULT 1,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

CREATE TABLE ai_models (
  id          TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  model_id    TEXT NOT NULL,
  label       TEXT,
  is_default  INTEGER NOT NULL DEFAULT 0,
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (provider_id) REFERENCES ai_providers(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_models_unique ON ai_models(provider_id, model_id);
```

## 10. Route map

| Route | Rendering | Access | Purpose | Phase |
|---|---|---|---|---|
| `/` | static | public | Combined feed | 1 |
| `/articles/[slug]` | static | public | Thai article | 1 |
| `/en/articles/[slug]` | static | public | English article | 1 |
| Each project's HTTPS URL | Separate deployment | Project-defined | Card links directly; not a CMS route | Outside CMS implementation |
| `/about`, `/404` | static | public | Existing pages | Existing |
| `/rss.xml` | static | public | RSS feed | 1 |
| `POST /api/subscribe` | endpoint | public | Newsletter signup with Turnstile | 3 |
| `GET /api/confirm`, `/api/unsubscribe` | endpoint | public | Double opt-in / unsubscribe | 3 |
| `/earth` | `prerender=false` | protected | Portal | 1 |
| `/earth/editor` | `prerender=false` | protected | Article-only editor | 1 |
| `/earth/projects` | `prerender=false` | protected | Project links and registry | 2 |
| `/earth/projects/new`, `/earth/projects/[id]` | `prerender=false` | protected | Card and private resources form | 2 |
| `GET/POST /earth/api/projects`, `GET/PATCH /earth/api/projects/[id]` | endpoint | protected | Read/create/update registry drafts | 2 |
| `POST /earth/api/projects/[id]/publish`, `/withdraw` | endpoint | protected | Publish/withdraw a card through a release | 2 |
| `GET/POST /earth/api/projects/[id]/resources`, `PATCH /earth/api/project-resources/[id]` | endpoint | protected | Private resource registry | 2 |
| `GET /earth/api/projects/export` | endpoint | protected | Registry/revision JSON export | 2 |
| `/earth/settings` | `prerender=false` | protected | Settings | 4 |
| `POST /earth/api/draft`, `/publish`, `/update` | endpoint | protected | Save/publish | 1 |
| `DELETE /earth/api/post/[id]` | endpoint | protected | Original deletion proposal; review archive/withdrawal in plan F14 | 1 |
| `POST /earth/api/upload-image` | endpoint | protected | Upload image to R2 | 1 |
| `GET /earth/api/deploy-status` | endpoint | protected | Latest deployment status | 1 |
| `POST /earth/api/upload-dataset` | endpoint | protected | Later option; MVP records locator/version first | Later |
| `POST /earth/api/send-newsletter` | endpoint | protected | Send newsletter | 3 |
| `GET/POST/DELETE /earth/api/providers` | endpoint | protected | Manage AI providers | 4 |
| `POST /earth/api/ai/[task]` | endpoint | protected | Proxy to ai-assistant-worker | 4 |

Short endpoint suffixes in grouped rows inherit the preceding route prefix.

## 11. Fonts

### 11.1 Historical Google Sans check, 2026-09-09

| Check | Recorded result |
|---|---|
| Available through Google Fonts | ✅ HTTP 200 with woff2 files |
| Thai subset | ✅ Included among 25 subsets; 75 `@font-face` rules at three weights |
| Latin subset size | About 36 KB per weight |
| Thai subset size | About 17 KB per weight |

The earlier conclusion was that Google Sans could serve both Thai and English without a separate Thai family. The reference site midgardisnotaplace used IBM Plex Sans Thai because it chose a different main font. These observations and measurements require confirmation against actual usage before implementation.

### 11.2 Existing font requests

The original review located three simultaneous families in `src/layouts/Layout.astro:70`:

```text
Cormorant Garamond (6 weights) + Inter (4) + Google Sans (4)
Recorded total: 158 @font-face rules and 64.5 KB CSS, excluding font files
```

Recorded tokens in `src/styles/global.css:12-14`:

```css
--font-serif:       "Cormorant Garamond", Georgia, serif;
--font-sans:        "Inter", system-ui, sans-serif; /* Overlapping sans role */
--font-google-sans: "Google Sans", system-ui, sans-serif;
```

Inter and Google Sans overlap as sans-serif choices. Historical line numbers and transfer measurements are reference information, not a current guarantee.

### 11.3 Proposed changes

| Action | Effect |
|---|---|
| Remove Inter; point `--font-sans` to Google Sans | Remove one family |
| Reduce weights to 400/500/700 | Reduce the requested weights/subset files in the measured configuration |
| Decide Cormorant Garamond usage | If serif remains useful, keep 400 and 400 italic; otherwise remove |
| `&display=swap` | Already present in the reviewed code |
| gstatic preconnect | Already present, recorded at `Layout.astro:67-68` |

Estimated Thai article font transfer after the change:

```text
Google Sans Thai:  ~17 KB × 3 weights = ~51 KB
Google Sans Latin: ~36 KB × 3 weights = ~108 KB (numbers, English terms, names)
Estimated total: ~159 KB, replacing three requested families
```

With `unicode-range`, browsers request subsets needed by the page; an English-only page does not need Thai glyphs. Measure actual downloads rather than assuming these historical totals.

### 11.4 Self-hosting option: undecided

Place Latin/Thai woff2 subsets on R2 or in `public/`.

Benefits: avoid a DNS/TLS connection to `fonts.gstatic.com`, control cache headers, and reduce dependence on an external font service. Cost: maintain updates yourself.

❓ Check Google Sans licensing before self-hosting. Availability through the Google Fonts API does not, by itself, establish the terms for downloading and redistributing font files.

## 12. Images

### 12.1 Constraints behind the proposal

The `marked` HTML-string path in section 7.3 requires its own image conversion, sizing, and attributes. The original design assumes Sharp is unavailable in the Workers runtime and considers WASM or an external image service for server-side conversion. Prove the chosen runtime/tooling rather than importing the legacy assumptions unchanged.

### 12.2 Prepare files in the browser before upload

Use one pipeline for images and charts, with different handling to protect chart clarity:

| Source | Initial handling |
|---|---|
| JPEG/photo | Resize widths above 1600px and encode photo-appropriate WebP |
| PNG/chart/text-heavy image | Preserve PNG or use proven lossless WebP only; no lossy compression |
| Smaller than target | Do not upscale; upscaling does not restore detail |

```text
User drops an image into the editor
1. Read the file and inspect its actual type.
2. Resize under the rules above, preserving aspect ratio.
3. Show a preview, byte size, and dimensions.
4. User enters alt text.
5. POST /earth/api/upload-image.
6. Worker validates MIME, signature, dimensions, and size, then stores in R2.
7. Save url, width, height, format, and alt in images.
8. Insert ![alt](url) into Markdown.
```

🎯 Photo target: reduce a large JPEG to roughly 150–300 KB while retaining acceptable quality. Measure real files in Phase 1.

🎯 Chart target: export twice the displayed width, such as 1600px for an 800px maximum layout. CSS displays it at 800px. This aims to retain fine lines/text on dense displays; mobile readability still requires inspection.

The MVP has no background removal or photo-editing tools. Prepare charts externally and upload them directly.

### 12.3 R2 organization

| Area | Example object key | Visibility |
|---|---|---|
| Article files | `articles/{post_id}/images/{asset_id}.webp` | Public only after publication approval |
| Card covers | `projects/{project_id}/covers/{asset_id}.webp` | Public |
| Approved shared data | `projects/{project_id}/datasets/{dataset_id}/{version}/data.csv` | Public snapshot |
| Raw data/backups | Matching IDs in a separate private bucket | Private, no public domain |

Use permanent IDs rather than names/months to group a project's resources. New file content receives a new ID/version; never overwrite objects referenced by old revisions. Prefixes do not enforce permissions: never put secrets in public buckets and rely on unguessable keys. Preserve existing URLs during transition; see sections 21–22.

### 12.4 Build-time attributes to prevent layout shift

The original postprocessing proposal after `marked`:

```text
1. Query images and build Map<url, {width, height, alt}>.
2. Locate <img src="..."> in the rendered HTML.
3. Add width, height, loading, and decoding.
```

**Review refinement:** the map must use the selected release's frozen metadata rather than all current mutable image rows. See F11/P1-13 in [the implementation plan](plan.md).

| Attribute | Proposed value | Purpose |
|---|---|---|
| `width`, `height` | Stored dimensions | Reserve layout space before loading; reduce CLS |
| `loading` | `lazy`, except cover | Defer in-body images |
| `decoding` | `async` | Avoid blocking rendering |
| `alt` | Stored contextual description | Accessibility and image meaning |

The cover/LCP image is handled differently:

```html
<img loading="eager" fetchpriority="high" decoding="sync" ...>
```

Do not lazy-load the cover. Validate decoding and priority choices against the real page.

### 12.5 Require alt text

Warn when an inserted image lacks alt text. It supports screen-reader users, image interpretation by search engines, and readers when the image fails to load.

### 12.6 Defer `srcset`

Initially use one image up to 1600px wide: PNG/lossless WebP for charts, resized WebP for photos. If mobile measurements justify more variants, add 640/1280/1920px uploads and `srcset` later.

❓ Cloudflare Image Resizing/Cloudflare Images may supply URL-based resizing without manually storing each variant. Verify current plans/pricing before adoption.

## 13. Charts and data visualization

Visualization is central to the site's identity and differentiates it from a general blog.

### 13.1 Responsibilities

| Work | CMS | Independent project |
|---|---|---|
| Static chart | Image with explanation, sources, and table | Any suitable tool |
| Interactive chart/map | Link to the project; no embedded code | Develop in its repository |
| Scrollytelling | Not in the editor | Develop and measure separately |
| Visual/source standards | Follow section 13.6 | Same guidance without a mandatory shared runtime |

### 13.2 First-generation article charts

Charts use the same upload/insertion system as ordinary illustrations; no separate chart uploader.

Export externally as PNG or lossless WebP at twice display width. The initial chart file contains an **opaque white background** and is used in both themes:

- No background removal; transparency is not the default.
- Do not automatically invert or recolor pixels.
- Keep the white chart in dark mode; a subtle border may separate it from the page.
- Consider a dark variant or different presentation later if real article testing shows a problem.

Every chart includes alt text, a written summary, necessary values/tables, and sources per section 13.4. The image must not be the only way to understand the key information.

No raw SVG or arbitrary HTML uploads in the MVP. Use validated raster images rather than enabling Markdown component imports or adding an MDX compiler. If repeated chart patterns justify it later, add schema-defined chart blocks with approved renderers.

### 13.3 Independent technology choices

Each project chooses its framework and data-loading strategy. It need not use Astro, React, or the main site's client directives. Static charts should appear without interaction. Interactive projects need loading/error states and explanatory text or an alternative table. Main-site pages load no project runtime data or dependencies.

### 13.4 Chart data

Always record source, publication permissions, retrieval date, and version. Small project-specific data can live in its repository; large/shared datasets use versioned R2 storage; confidential data stays private. Cards do not fetch datasets. Record locations/versions in the central registry.

### 13.5 No complete chart library in CMS scope

BarChart, LineChart, StatTile, DataTable, Thai maps, and ScatterPlot are optional project components, not CMS completion criteria. Extract a version-pinned shared package only after real reuse exists. Do not create it speculatively or automatically upgrade every project.

### 13.6 Shared chart design standards

| Color rule | Detail |
|---|---|
| Fixed categorical sequence; no cycling | Combine a ninth series into “Other” or split charts rather than inventing another color |
| Bind color to identity, not rank | Filtering must not change remaining series colors |
| Sequential quantities | One hue from light to dark; no rainbow |
| Diverging values | Two hues with neutral gray in the middle |
| Status colors: good/warning/critical | Reserve them for status, not arbitrary series; pair with icons/text |
| Text | Use primary/secondary/muted text colors rather than series colors |
| Validate with a script | Check color-vision distinguishability, not visual guesswork. The source refers to a dataviz-guideline validator; locate/verify that asset before relying on it |

Layout rules:

- No dual y-axes. Separate units into two charts or index them to a common base.
- Thin lines and subdued axes/grid; data should remain dominant.
- Show a legend for two or more series. For up to four, also directly label lines/bars instead of relying on color.
- Label meaningful data points rather than every point.
- Use one white-background file in both themes initially, without automatic color inversion; review after real article testing.
- Provide a table alternative for accessibility.

Base the palette on `src/styles/global.css` tokens to retain visual consistency with the site.

### 13.7 Library selection

Choose per project based on familiarity, format, accessibility, and development time. The CMS does not lock a chart library. Earlier library recommendations and bundle-size tables were removed because they are unnecessary for link cards and require current-version verification.

## 14. SEO

### 14.1 Phase 1 essentials

- `<title>` and `<meta name="description">` from title/excerpt.
- Canonical URL on every page.
- Open Graph and Twitter Card metadata; some exists in `Layout.astro`. Use an absolute OG image URL, ideally 1200×630.
- JSON-LD `Article`: headline, datePublished, dateModified, author, image.
- Main sitemap includes real main-site pages only, not external projects or nonexistent `/work/[slug]` routes.
- Each project owns its title/description/canonical/OG/sitemap. Cards use ordinary `<a href>` links that work without JavaScript.
- Article URL slugs use lowercase English words separated by hyphens.

### 14.2 Mixed-language content

| Situation | Behavior |
|---|---|
| Every page | Set `<html lang="th">` or `"en"` to match content for screen readers |
| Every page | Self-referencing canonical |
| Standalone article: normal case | No `hreflang` needed |
| Translation pair: optional | Both reciprocal hreflang links; `x-default` points to Thai |

Never point hreflang to nonexistent pages. The original plan calls for checking that translations are published; the implementation plan further requires both to exist in the selected live release.

#### Correction retained from the earlier review

Version 3 incorrectly described `<html lang>` as Google's main language signal, stronger than the URL. Google's cited guidance says language is determined from visible content rather than code-level `lang` or URL information. [Google Search Central](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)

| Topic | Correct planning interpretation |
|---|---|
| `<html lang>` | Set it for accessibility and pronunciation; do not treat it as Google's language detector |
| `/en/` prefix | Useful for clear structure and hreflang references; not itself Google's language-detection signal |
| `hreflang` | Describes alternate-language relationships, a different function from identifying a page's language |

Keep the same practical routing/metadata behavior, with realistic expectations about the role of visible content. Optional translations also avoid creating rushed low-quality duplicate versions.

### 14.3 Image charts and project links

Chart labels are pixels, not HTML text. Include prose summaries and numeric tables. Homepage cards expose readable titles/descriptions while detailed project content lives at the destination. Initial RSS contains articles only. Projects appear in the homepage feed and may be introduced in manually sent newsletters.

### 14.4 Accepted trade-off

Omitting the three pillar hub pages gives up a dedicated topical navigation structure. The original rationale anticipated slower topical-authority growth; this is a planning assumption, not a measured SEO outcome. Compensate with related-article internal links and an About page that clearly describes the three areas of expertise.

## 15. Performance

Static delivery with a CDN is the foundation. The original plan identifies three likely pressure points:

| Priority | Area | Measure |
|---|---|---|
| 1 | Fonts | Google Sans, remove Inter, three weights, `display=swap`, preconnect; section 11 |
| 2 | Images | Browser preparation, width/height, lazy loading except cover; section 12 |
| 3 | Chart JavaScript | Static article images; cards do not load project code; section 13 |

| Metric | Target | Potential issue |
|---|---|---|
| LCP | <2.5 seconds | Cover loading; use high priority and avoid lazy loading |
| CLS | <0.1 | Missing image dimensions or font-swap layout movement |
| INP | <200 milliseconds | Heavy interactive chart hydration |

Verify analytics separately for main-site and project deployments. Compare measurements with device/workload differences in mind; do not attribute all differences to charts. These values are targets, not existing measured results.

## 16. Development phases

### Overview

🎯 All hours are estimates, not measured work. Revise them after each phase.

| Phase | Name | Hours | Approximate weeks | Outcome |
|---|---|---:|---:|---|
| 0 | Security and infrastructure | 4–6 | 1 | Protected AI Worker |
| 0.5 | Architecture prototype | 6–10 | 1–1.5 | Evidence that the architecture works |
| 1 | Complete articles: editor, images, charts, publish | 48–70 | 7–10 | Publish a real illustrated analysis end to end |
| 2 | Project links and registry | 12–18 | 2–3 | Publish cards and locate resources |
| 3 | Complete newsletter | 14–20 | 2–3 | Signup, confirm, send, unsubscribe |
| 4 | AI Assistant and BYOK | 18–26 | 2.5–4 | AI assistance in the editor |
| 5 | Search and pagination | 8–12 | 1–1.5 | Support a larger content library |
| Total | CMS | 110–162 | 16–24 at 7 hours/week | Excludes independent projects and writing |

Article authoring and uploads are one phase because image charts are essential to frong.me's analyses. An editor that cannot upload/insert charts does not satisfy this content workflow. Use internal milestones to track Phase 1, but do not start project management until the complete article acceptance criteria pass.

### Phase 0 — Security and infrastructure

#### 0A. Protect the AI Worker before other work

The original source reported the unauthenticated Worker as live. Confirm the actual deployment, and do not postpone protection until Phase 4.

1. Validate `X-Auth-Secret` in `ai-worker/src/index.js`; reject mismatches.
2. Restrict CORS from `*` to `https://frong.me`.
3. Configure `wrangler secret put AI_WORKER_SECRET`, then deploy the protected implementation with `wrangler deploy` when carrying out this task.
4. Browser requests go through an authenticated server proxy, which attaches the secret. Never embed it in `AIAssistantView.tsx` or return it to the browser. Disable that UI temporarily if the proxy does not exist.

**Acceptance:** a request to the deployed Worker without the secret is rejected. Record deployment evidence rather than assuming a source patch is live.

#### 0B. Infrastructure inventory and provisioning

| # | Original proposed dashboard task | Output |
|---|---|---|
| 1 | D1 database `portfolio-db` | `database_id` |
| 2 | R2 `portfolio-images` and public domain | Public URL; also design separate private media storage |
| 3 | Zero Trust → Access → Applications → Self-hosted, `frong.me` path `/earth*`, allow owner email only | Login-protected admin; verify exact path coverage |
| 4 | GitHub token for `repository_dispatch`, replacing the Deploy Hook | Build-trigger credential |
| 5 | API token originally proposed with `D1:Edit` | Build access; refine to necessary privileges |
| 6 | Turnstile site key/secret | Phase 3 requirement; defer provisioning until needed |

```text
# Environment variable inventory, not secret values
CF_ACCOUNT_ID · CF_D1_DATABASE_ID · CF_API_TOKEN
GITHUB_DISPATCH_TOKEN · GITHUB_REPO       # Build trigger; replaces DEPLOY_HOOK_URL
AI_WORKER_URL · AI_WORKER_SECRET          # Phase 0A
ENCRYPTION_KEY                            # Phase 4
TURNSTILE_SECRET_KEY · PUBLIC_TURNSTILE_SITE_KEY · RESEND_API_KEY   # Phase 3
```

### Phase 0.5 — Architecture prototype

The move from Pages to Workers changes deployment assumptions. Discover failures before spending roughly 40 hours building the editor. Use a small separate prototype or experimental branch; appearance and a CMS are unnecessary.

Prove all five:

- [ ] A static page (`prerender = true`) builds and deploys on Workers.
- [ ] A dynamic page (`prerender = false`) reads D1 via `import { env } from "cloudflare:workers"`.
- [ ] Cloudflare Access actually protects the intended `/earth*` paths on Workers.
- [ ] A build script reads D1 through the HTTP API, representing `getStaticPaths()` access.
- [ ] An external `repository_dispatch` triggers an automatic build/deployment.

The trigger is essential to the proposed publishing workflow. If no suitable trigger can be made to work, revisit delivery architecture, including SSR. First distinguish a broken configuration from an architectural limitation.

Record actual build duration instead of the earlier 🎯 30–60-second assumption, and save working commands/configuration. Keep ongoing evidence and status in [the implementation plan](plan.md).

### Phase 1 — Complete articles, images, charts, and publishing

**Goal:** the owner can write analysis, upload charts, preview, and publish without code changes.

#### Milestone 1A — Article core

1. Add `@astrojs/cloudflare` while retaining static public output.
2. Create Phase 1 `posts`, `post_revisions`, `images`, `deployments`, and `site_state` migrations based on section 9 and the review refinements.
3. Provide build HTTP/runtime binding database access with suitable separation.
4. Replace Portable Text with `MarkdownBody.astro`, retaining appropriate typography while allowing the owner-approved redesign.
5. Rewrite Markdown heading extraction according to section 19.3.
6. Make homepage/articles read public revisions from the release manifest.
7. Remove Sanity when appropriate to the new implementation; retain useful AI logic for Phase 4 or replace it.
8. Build an article-only portal/editor: title, slug, body, excerpt, tags, language, cover.
9. Draft-only autosave with localStorage recovery, server saves, and reopening recovery.
10. Publish creates an immutable revision/manifest, deploys, and shows `queued / building / live / failed` with reconciliation as needed.
11. Add RSS, canonical, OG, Article JSON-LD, sitemap, and Thai/English routes.

#### Milestone 1B — Editor image uploads

1. Drag, paste, and select files for covers and inline images.
2. Prepare photos as WebP; preserve charts/text images as PNG or lossless WebP under section 12.2.
3. Validate uploads server-side at `POST /earth/api/upload-image`; store in R2 and record image metadata.
4. Require alt before insertion/publication.
5. Insert Markdown automatically and add width/height/loading/decoding at build time.
6. Give covers high fetch priority and avoid lazy loading.
7. Support cover position and zoom.

#### Milestone 1C — Fonts and a real chart-based analysis

1. Remove Inter, make Google Sans the main sans, and reduce weights to 400/500/700 after verification.
2. Decide Cormorant Garamond usage under section 11.
3. Create charts externally at twice display width.
4. Use one opaque white-background chart in both themes, without background removal or inversion.
5. Include alt, a written summary, a table/values, and sources.
6. Publish at least one real analysis and inspect mobile/desktop output.

#### Milestone 1D — Backup and restoration

1. Back up D1 revisions/releases and actual referenced R2 bytes.
2. Store backups outside production on each publish or at least weekly.
3. Restore D1 and real images once in an isolated test environment.

**Excluded:** AI panel/BYOK, project builder, newsletter signup, search/pagination, comments, MDX, raw SVG, and interactive article charts.

**Phase 1 acceptance:**

- [ ] Unauthenticated access to `/earth` is rejected at the edge.
- [ ] Drafts survive closing/reopening the browser.
- [ ] Cover and inline uploads require no manually typed image URLs.
- [ ] White-background PNG charts retain sharp text and lines without lossy encoding.
- [ ] 1600px exports display at up to 800px and remain readable on mobile.
- [ ] Every image has width/height; measure CLS <0.1.
- [ ] Forged MIME and oversized uploads are rejected server-side.
- [ ] Covers are not lazy-loaded; measure LCP against section 15's target.
- [ ] Publishing actually updates the site, with truthful status for both success and failure.
- [ ] Editing draft A and publishing B never exposes A's draft.
- [ ] A failed build leaves the prior deployment available.
- [ ] RSS, language, canonical, OG, JSON-LD, and sitemap meet requirements.
- [ ] At least one real analysis includes charts, alt, prose/tables, and sources.
- [ ] Review the real article in both themes on mobile/desktop and record whether white-background charts remain suitable.
- [ ] Restore the database and image bytes from backup successfully in isolation.

**Phase 2 starts only after these criteria pass and a real illustrated analysis has been published.**

### Phase 2 — Project links and central registry: 12–18 hours

1. Add `projects`, `project_revisions`, `project_resources`, `project_articles`, and project media references.
2. Build `/earth/projects` forms/list per section 20, without an editor, MDX, or code upload.
3. Add public revision cards to the chronological and featured homepage feeds.
4. Publish/withdraw through the article release mechanism without invoking project workflows.
5. Register one example project's repo, hosting, data locations, backup, and recovery runbook.
6. Export the registry and extend backup/restore to cover card media and referenced data.
7. Test URLs, public/private boundaries, draft isolation, and deployment independence.

**Acceptance:** sections 20–22 and one real card linking to an independently deployed project.

**Excluded:** developing the project itself, a full dataset uploader, automatic link health checks, and shared component packages.

### Phase 3 — Complete newsletter cycle

Deliver all four parts together; do not launch signup without unsubscribe. The source identifies consent withdrawal as a privacy requirement; check the applicable implementation requirements in this phase.

1. Signup at article end via `POST /api/subscribe`, Turnstile, and rate limits.
2. Double opt-in through `GET /api/confirm`.
3. `GET /api/unsubscribe` with a link in every email.
4. Manual send from the portal via `POST /earth/api/send-newsletter` and Resend or an equivalent service. Never automatically send on publish; sent email cannot be recalled.
5. Template: headline, introduction, and read-more link rather than full content, bringing readers back to the site.
6. The original proposal stores `consent_ip` and consent time; finalize necessary records/retention through P3-01.

**Acceptance before launch:**

- [ ] Signup sends a confirmation email; following the link changes status to `confirmed`.
- [ ] Unconfirmed users remain `pending` and receive no newsletter.
- [ ] A test newsletter actually reaches the intended inbox.
- [ ] Unsubscribe changes status to `unsubscribed`; the next send excludes that address.
- [ ] Entering another person's email never confirms them without their action.

### Phase 4 — AI Assistant and BYOK

1. `/earth/settings` tabs: Profile (Access identity from `Cf-Access-Jwt-Assertion` or `/cdn-cgi/access/get-identity`) and AI Models (providers).
2. Add provider label/kind/base URL/API key → “Load models” validates the key and fetches the catalog → select models → save.
3. Encrypt keys as in section 8.2.
4. Refactor or replace Worker logic with an adapter registry:

```js
const ADAPTERS = {
  "openai-compatible": runOpenAICompatible, // OpenRouter, Groq, Together,
                                             // DeepSeek, Mistral, Ollama, etc.
  "gemini": runGemini,
  "anthropic": runAnthropic,
  "cloudflare": runCloudflare,
};
```

5. Authentication from section 8.1 belongs to Phase 0A and must already be verified, not deferred here.
6. Add an AI panel to the new editor.
7. Add `translate` for optional translation pairs.
8. Add `suggest-slug` to suggest English URL slugs from Thai titles.

| Provider kind | Proposed model-list endpoint |
|---|---|
| `openai-compatible` | `GET {base_url}/models` with Bearer authorization |
| `gemini` | `GET https://generativelanguage.googleapis.com/v1beta/models?key=...` |
| `openrouter` | `GET https://openrouter.ai/api/v1/models`, originally described as not requiring a key |
| `cloudflare` | Cloudflare REST API or a maintained list |

Verify each provider's current API documentation when implementing.

**Acceptance:** add a supported OpenAI-compatible provider through UI without code changes; direct unauthenticated Worker calls fail; D1 keys are ciphertext; settings never return keys to the browser.

### Phase 5 — Search and pagination

Start when content exceeds roughly 30 items:

1. Paginate the feed.
2. Build a search index at build time, such as Pagefind or client-side JSON/fuzzy search; no search server required by this proposal.
3. Add an archive page.

### Future options

Scrollytelling belongs to independent projects. Other deferred possibilities: comments, `srcset`, slash commands, emoji picker, YouTube embeds, and Zen mode. Export/backup already belongs to Phase 1, not this backlog.

## 17. Open decisions

| # | Topic | Default / follow-up |
|---|---|---|
| 0 | Workers build trigger | GitHub Actions + `repository_dispatch`; verify any Workers Builds equivalent in Phase 0.5 |
| 1 | Project URLs | Direct HTTPS destinations; a frong.me subdomain is convenient but optional |
| 2 | Thai slugs | URL/heading policy decided in section 19; historical implementation claim requires the correction noted there |
| 3 | Cormorant Garamond | Keep 400/400 italic if serif remains useful |
| 4 | Self-host fonts | Defer; check Google Sans license first |
| 5 | Email service | Resend as a starting option; check current pricing |
| 6 | Newsletter content | Introduction and link |
| 7 | Mobile editor | Desktop-only initially |
| 8 | Project chart library | Per-project decision, not a CMS dependency |
| 9 | Thai provincial TopoJSON | Unselected; verify data license |
| 10 | Cloudflare Image Resizing | Not initially used; verify plan/pricing if needed |
| 11 | Translation criteria | Translate items with demonstrated readership |
| 12 | Content license | Undecided; consider content reuse/copying concerns |
| 13 | Dark-mode charts | One white-background file initially; revisit after real article testing |

## 18. Risks

These are the source plan's qualitative ratings, not measured incident probabilities.

| Risk | Priority | Response |
|---|---|---|
| External Worker deployment trigger does not work | Highest | Prove Phase 0.5; diagnose configuration and reconsider architecture/SSR if no workable trigger remains |
| Building indefinitely without publishing | Highest | End Phase 1 with a real illustrated analysis |
| Draft content leaks publicly | High | Frozen revisions and manifest-selected builds |
| Previously published pages disappear | High | Failed builds preserve the complete old deployment |
| Scattered data/no known authoritative source | High | Central registry, permanent IDs, one authoritative source per resource, recovery runbooks |
| Backups contain only registry metadata | High | D1, file bytes, code archives, and restore drills |
| Private card metadata leaks | High | Public allowlist; never serialize project_resources publicly |
| Project URLs change or fail | Medium | Manual pre-publication check, maintenance/withdrawal, retain registry |
| API keys leak from D1 | High | AES-GCM and no browser key responses |
| AI requests consume credits without authorization | High | Protect/disable the actual endpoint in Phase 0A; verify deployment |
| Collecting emails without unsubscribe | Medium | Complete Phase 3 cycle before opening signup |
| Article presentation regresses with Markdown | Medium | Before/after visual review; finish Phase 1 before moving on |
| Project charts make projects slow | Medium | Project owners measure/tune independently; main site loads cards only |
| Font loading is slow | Medium | Google Sans, three weights, remove Inter after verification |
| Images worsen CLS | Medium | Stored width/height on every image |
| Weekly writing cadence is unsustainable | Medium | Consistency over frequency: an article every two weeks beats a weekly burst followed by two months of silence |
| Signup bot spam | Medium | Turnstile, rate limits, double opt-in |
| Mandatory bilingual workload | Addressed by scope | Mixed-language articles; no required translation backlog |
| Frequent builds hit limits | Low in source estimate | One or two per week was assumed; verify actual quotas and behavior |
| Cloudflare Access outage | Low in source estimate | Public static pages are intended to remain available independently of admin access |

## 19. Article slugs and heading IDs

The source labeled this section “fixed on 2026-09-09.” The later repository review found that the current legacy files do not contain those fixes. The description below preserves the defect analysis and intended behavior; implement it in the new renderer without first repairing code that will be retired.

### 19.1 Observed defects

`src/lib/slugify.ts` removes characters outside `a-z0-9`, leaving empty or unhelpful IDs for Thai headings. The examples below intentionally use Thai test content; their explanatory text is English:

```text
"เศรษฐกิจไทยกำลังจะไปทางไหน" → ""       # Empty ID
"ค่าครองชีพ กับ ค่าแรงขั้นต่ำ"  → "-"      # Hyphen only
"ส่งออกไทยปี 2569"           → "-2569"
```

A second defect affects formatted headings regardless of language. Bold/link/italic text may have nested nodes:

```js
children: [ { _type: "@span", markType: "strong",
              children: [ { _type: "@text", text: "Objective" } ] } ]
```

Reading only immediate `child.text` finds no text on `@span`, producing an empty ID. The historical report describes bold headings in `stock-inventory-line-bot` with empty IDs while the TOC links to `#objective`, so even English TOC navigation fails.

| Consumer | Input | Shape |
|---|---|---|
| `extractHeadings()` → TOC | Raw Sanity Portable Text | Flat text nodes |
| `PortableTextHeading.astro` → heading ID | astro-portabletext transformed nodes | Nested `@span` → `@text` |

### 19.2 Previously described fix

1. Preserve Thai characters: `/[^a-z0-9\u0E00-\u0E7F\s-]/g`; heading IDs can contain Unicode.
2. Trim leading/trailing hyphens: `"-2569"` becomes `"2569"`.
3. Use a deterministic text hash when otherwise empty, such as `section-iccyxh`, so both consumers can calculate the same fallback.
4. Share a recursive `nodeText()` helper to extract nested formatted text.

The earlier report claimed matching IDs/TOC links in three articles after that change. This is historical evidence, not the status of the present repository.

### 19.3 Rules for the Phase 1 Markdown renderer

Markdown headings such as `## **Objective**` and `## [Link](url)` still contain nested formatting.

1. Extract complete plain heading text, not just immediate nodes.
2. Generate heading IDs and TOC targets from the same function/traversal.
3. Rendering the whole article in `MarkdownBody.astro` permits numeric suffixes for repeated headings, unlike the old isolated rendering approach.

**Acceptance:**

- [ ] Thai headings navigate correctly from the TOC.
- [ ] Bold/link headings have IDs matching their TOC targets.
- [ ] Two identical headings receive different IDs.

### 19.4 Article URL slugs remain manual initially

URL slugs are separate from heading IDs because readers see them when sharing.

- Enter an English slug manually, e.g. `frong.me/articles/thai-export-2026`, instead of a long percent-encoded Thai URL.
- The source estimates roughly ten seconds per article and considers this acceptable.
- Phase 4 adds `suggest-slug`, suggesting English slugs from Thai titles for the owner to select.

| Rejected option | Reason |
|---|---|
| Automatic Thai-to-Roman transliteration | Thai word segmentation needs nontrivial NLP; library quality/results were uncertain |
| Thai article URL slugs | Indexable, but percent-encoded copied links are lengthy and less convenient to share |

## 20. Project-link administration

### 20.1 User experience

Admin navigation: Articles, Project links, Settings (Phase 4). `/earth/projects` has an “Add project link” button, search by name/ID/tags, and status filters. Rows show name, URL, card state, project lifecycle, last link-check date, and edit/open actions.

Avoid “Create project” or “Deploy project” labels because this interface performs neither action.

| Group | Fields | Rules |
|---|---|---|
| Public card | Title, short description, URL, language | Required before publish; description is plain text |
| Public card | Cover/alt, tags | Cover optional with placeholder fallback; supplied cover requires alt |
| Display | listed_at, featured, sort_order | Chronological feed uses date; sort_order applies only to featured work |
| Lifecycle | active / maintenance / archived | Separate from card visibility; old projects stay registered |
| Relationships | Related articles | Select articles; publicly show only those in the live release |
| Private registry | Repo, hosting dashboard, storage, backup, runbook | Multiple project_resources entries; never public |
| Maintenance | Owner, link/resource verification dates, last restore test | Defaults to site owner; these timestamps are independent of card-copy edits |

### 20.2 Card lifecycle

1. Develop/deploy the actual project outside the CMS until usable.
2. Add a registry entry with permanent project_id, card fields, and private resources.
3. Save draft only; preview the card after authentication.
4. Open the URL manually and record the check. This opens a link, not a server fetch.
5. “Publish card” validates and freezes a public revision, then requests a main-site release.
6. Successful build/deploy displays the card; failure shows an error and preserves old content.
7. The card directly links to target_url with `<a href>`, using the same tab by default.

Private resource edits do not rebuild the site. Changing public title/URL/image/order requires another card publication.

Display editorial states separately from deployment states: unpublished / draft changes / published, alongside queued / building / live / failed.

“Withdraw card” requires confirmation and creates a `visible=false` revision and new release. Hide only after success while retaining registry/revisions/files. The MVP has no project hard-delete UI. Archiving/withdrawal does not delete repositories, hosting, databases, or R2. Roll back by creating a new release from an older revision, never modifying the revision itself.

### 20.3 Data and link validation

- Validate URLs server-side under section 8. Trim surrounding whitespace and warn about duplicates without rewriting meaningful query/path values.
- Public cards cannot contain secrets, expiring signed URLs, or login-only preview URLs.
- Before publication, confirm anonymous destination access and registry repo/hosting/runbook plus data/backup entries or reasons for non-use.
- MVP health results are manual. “Unchecked” does not mean broken. A future automatic checker must not interpret every 403 as downtime; bot protection may cause it.
- An outage does not automatically remove a card. The owner may fix the URL, mark maintenance, or withdraw it.
- Each project should link back to frong.me and a supporting article when available.

## 21. Central registry and storage

### 21.1 One admin area for finding resources

Independent development can remain organized, but a registry does not back up or synchronize data by itself. Designate one authoritative source per resource and label copies/versions explicitly. Projects need not depend on CMS D1 at runtime.

| Resource | Default authoritative location | Registry records |
|---|---|---|
| Articles/revisions | CMS D1 | Stored directly in CMS |
| Cards/public revisions | CMS D1 | projects/project_revisions |
| Project code/run commands | Separate owner-controlled repository | Repo URL, commit/tag, owner |
| Deployment | Each project's hosting | Public URL, dashboard locator, deploy/rollback instructions |
| Small, project-specific, non-secret data | Project repo if size/license permit | Path, version/commit, source, license |
| Large/shared data | R2 prefix with project_id/dataset_id/version | Bucket/key, version, checksum, publication permissions |
| Mutable runtime data | Project-specific database | Provider/resource ID and export/restore instructions; not a full CMS copy |
| Private/restricted raw data | Private bucket/database | Private locator, no public URL |
| Secrets/tokens | Hosting/CI secret manager | Variable names and configuration locations only, never values |
| Backups | Private storage separate from production | Backup set/date/checksum/runbook and latest restore result |

Default to one repo and deployment per project. Reuse provider accounts where convenient, but not broadly shared privileges. Projects should not have CMS database write access. For shared data, use public snapshots or narrowly authorized APIs instead of distributing central database tokens.

Pin shared library/data versions. A dataset update must not silently change an old analysis.

### 21.2 Illustrative registry entry

| Item | Example |
|---|---|
| project_id / slug | `prj_001` / `thai-cost-of-living` |
| Public URL | `https://cost-of-living.frong.me` |
| Code | Owner's `thai-cost-of-living` repo, with deployed commit |
| Published data | Public bucket: `projects/prj_001/datasets/cost-of-living/v1/data.csv` |
| Raw data | Private bucket: `projects/prj_001/raw/2026-09/source.csv` |
| Runbook | Repository `README.md` with run/deploy/export/restore instructions |
| Backup | Set containing code archive and dataset bytes, not URLs alone |

If no private data/database is used, record “Not used” with a reason; do not provision empty resources. Renaming a project does not move its files because keys use project_id. A resource shared by multiple projects uses the same locator/version rather than independently edited copies.

### 21.3 Initial backup and recovery policy

- From Phase 1, back up D1 revisions/release manifests/metadata plus referenced media bytes. Extend to project_resources in Phase 2.
- Back up at least weekly and before migrations/resource deletion. More frequently changing runtime data needs its own schedule in the project runbook.
- Default CMS data-loss target: no more than seven days with weekly backups; increase frequency if unacceptable. One-day recovery is a target to measure in a drill, not an advance guarantee.
- Start with four weekly and three monthly sets; adjust for volume/budget. Keep at least one copy outside the production account or on encrypted offline media.
- Remote Git is an authoritative code source but not a complete backup plan. Archive code with commit and dependency lockfile; document LFS/non-Git file backup if applicable.
- Backup manifests identify actual files, checksums, dataset versions, and the matching commit. Database/file copies must form a consistent set.
- General registry exports exclude secrets. Recovery instructions explain secure secret recreation.
- Restore in isolation initially, after major schema changes, and at least every three months thereafter.
- Drills must open articles with complete images, follow correct card URLs, and rebuild an example project from recorded commit/dataset versions. Never send real newsletters during drills.
- Do not delete files referenced by old revisions or other projects. No automatic file deletion in the MVP.

The registry enables discovery/maintenance; backups enable recovery. Both are required to address scattered resources.

## 22. Transition and overall acceptance

### 22.1 Transition without losing existing data

1. Inspect actual repositories/schemas first. This document does not prove that MDX tables/projects exist.
2. If earlier versions were never implemented, build version 6 directly; do not create an MDX system just to remove it.
3. If `posts.type='project'` exists, export content/revisions/media/datasets and back up the database first. Move applicable code/MDX to project repositories and test their deployments.
4. Map old ID → new project_id → new URL. Complete the registry and publish cards only when destinations are ready.
5. If `/work/[slug]` was actually public, add tested redirects for verified old URLs. No generic user-supplied redirect destination. Do not create a legacy route that never existed.
6. Preserve old image/dataset URLs during transition. Move later only after updating consumers and planning rollback.
7. Compare article/revision/card counts and test the result before retiring old schemas. Actual data deletion is a separate confirmed task.

### 22.2 Delivery checklist

- [ ] Phase 1 publishes a real analysis with charts without manually entering image URLs or editing code.
- [ ] White-background PNG/lossless WebP charts are sharp in both themes and readable on mobile.
- [ ] Editor is article-only: no project type, MDX imports, or code-upload field.
- [ ] Add links, edit drafts, preview, publish, withdraw, and roll back card revisions.
- [ ] Cards open the specified URL with JavaScript disabled and create no main-site project content page.
- [ ] Editing draft card A's URL and publishing article B leaves public A's URL unchanged.
- [ ] Builds during autosave use one complete immutable revision/manifest set, including slugs, languages, images, tags, and URLs.
- [ ] Withdrawal followed by build failure leaves the old card visible and reports an error; successful deployment withdraws it.
- [ ] Card publication does not build the project; project deployment does not rebuild the main site unless card data changes.
- [ ] Destination downtime does not fail the main build; status edits/withdrawal remain possible.
- [ ] HTML, public JSON, RSS, search indexes, and build artifacts contain no private repos, hosting dashboards, storage/backup locators, or internal notes.
- [ ] Dangerous URLs are rejected and unauthenticated callers cannot access registry APIs.
- [ ] Chronological/featured ordering is correct; RSS contains articles only; sitemap has no nonexistent project pages.
- [ ] A registry entry identifies code, data, versions, and recovery instructions completely.
- [ ] Export/restore preserves card revisions, relationships, and actual file bytes, tested without modifying production.
- [ ] Archiving/withdrawal does not delete repos, deployments, databases, or data files.

## Appendix A — Questions before each phase

1. Is the previous phase complete and actually usable?
2. How many items have been published since Phase 1? **If zero, pause system development and return to writing.**
3. Does this work make publishing better/faster, or is it only an interesting feature to build?

## Appendix B — Topics for expert review

1. Does static build + D1 snapshot + release manifest fit expected content volume and available time?
2. Is there a simpler, secure way to trigger and track Cloudflare Workers deployments?
3. Do revision/release schemas fully prevent draft leakage and support rollback?
4. Is preserving PNG/lossless WebP for charts and WebP for photos appropriate?
5. Should white charts in dark mode receive an initial UX change or wait for real-world feedback?
6. Are twice-display-width exports and a 1600px limit appropriate for an 800px layout?
7. Does backup/restore sufficiently cover D1, R2, revisions, and release manifests?
8. Does separating projects while keeping cards and a central registry leave any long-term data or maintenance risks?
