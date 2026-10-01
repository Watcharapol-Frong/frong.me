# Article SEO: editor review and discovery

Updated: 2026-10-01. Scope: editor review, article discovery, metadata and safe
public search access. Public design and homepage content are owned separately.

## Goal and limits

Help authors publish useful articles with accurate previews and help crawlers
discover every public article. These changes improve discoverability and the
writing workflow; they cannot promise indexing, organic traffic, or a first-page
Google position. Google Search Console data is required to measure actual
search queries and indexing after deployment.

## Implemented

1. **Review in Earth Editor.** Review & SEO now shows direct checks for title,
   summary, headings on longer drafts, empty image descriptions, and an optional
   relevant internal article link. The checks are derived from the current
   editor fields and remain available if the AI provider fails. The AI returns
   draft-specific suggestions for reader questions, examples, clarity,
   proofreading, and claims that need citations. The old model-generated SEO
   score, length thresholds, and speculative keyword suggestions are removed.
   Authors decide which suggestions to use; the AI neither verifies search
   demand nor publishes content.
2. **Published article sitemap.** `/articles-sitemap.xml` queries D1 at request
   time, includes one canonical article URL per active slug, excludes drafts and
   archived posts, and sets `lastmod` from the version served by the Thai-first
   article route. It is cached at the edge for at most 15 minutes. `robots.txt`
   advertises this endpoint alongside Astro's static `sitemap-index.xml`.
   The static index does not enumerate D1 articles because they are served at
   request time.

3. **Search boundaries.** Host-aware robots permits public content on `frong.me`
   and excludes Earth for every named search bot. Other hosts disallow crawling,
   advertise no sitemaps and return an empty article sitemap. SSR headers and
   host-scoped static headers mark staging and Worker aliases as noindex.
   Access remains the private-data boundary. Training policy is unchanged.
4. **Article metadata.** Canonicals normalize trailing slashes to match sitemap
   entries. Articles show the author/profile and machine-readable published
   date. Open Graph includes publication/modification times and author URL;
   existing title, excerpt, language and JSON-LD remain automatic.
5. **One submission point.** The static sitemap index now includes the D1
   article sitemap. The direct article sitemap remains advertised as well.

## Live baseline and operational limits

On 2026-10-01, direct HTTP checks returned 200 for production home, robots,
static sitemap index, article sitemap and `/articles/line-stock-checker`.
Browser, Googlebot, OAI-SearchBot, ChatGPT-User and Claude-SearchBot user-agent
strings received the expected article heading. Anonymous Earth redirected to
Cloudflare Access. Staging still emitted `index, follow` without an X-Robots-Tag
before this change. These checks establish reachability from this test origin,
not from verified crawler IP ranges. The search tool's direct-open attempts
failed despite successful HTTP reads; that alone does not establish a WAF block.

No Cloudflare security account or Search Console session is available in this
workspace. After deployment, inspect Cloudflare Security events and the effective
robots response, including managed additions. Verify crawler identities using
Cloudflare verified-bot facilities or providers' published IP ranges, then
adjust only the specific blocking/challenge rule for public GET/HEAD requests.
Never disable WAF, DDoS protection, rate limits or Access globally. A spoofable
user-agent is insufficient evidence for a security exception. Keep Earth
excluded from every exception. Existing indexed staging URLs may need Search
Console removal: disallow can prevent crawlers from seeing noindex headers.

Search and training access are separate preferences. This change preserves
training policy; an owner can later opt out of GPTBot or ClaudeBot separately
from search. Google's AI Search uses normal crawl/index eligibility. No special
schema or `llms.txt` is required for that eligibility or guarantees discovery.

Primary references: [Google AI search](https://developers.google.com/search/docs/appearance/ai-features),
[OpenAI crawlers and IP ranges](https://developers.openai.com/api/docs/bots),
[Anthropic crawler roles](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler),
[Cloudflare static headers](https://developers.cloudflare.com/workers/static-assets/headers/),
and [managed robots](https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/).

After an authorized deployment, run:

```sh
node scripts/build/verify-search.mjs
node scripts/build/verify-search.mjs --origin https://frong-me-staging.frongbook.workers.dev
```

These read-only checks cover production robots, combined sitemap index,
article HTML/metadata under three search user-agent strings, staging discovery
and SSR/static noindex, plus anonymous Earth denial. They do not follow Access
redirects, write content, invoke AI, verify source IPs or establish indexing.
Production verification passed after deployment of `9b01aca` on 2026-10-01.
Staging browser/curl checks passed for robots exclusions, empty article sitemap,
and SSR/static noindex. The Node script timed out on staging and default urllib
requests received 403, so its full staging run is not claimed as passing.
Production's Node check passed, including three article search user-agents and
anonymous Earth denial. Actual verified crawler access and indexing still need
Cloudflare event review and Search Console inspection. See the deployment links
and Worker version in [the handoff](plan.md).

## Release and measurement

1. Run the CMS suite, TypeScript check, production build, and `git diff --check`
   before merging. No database migration is needed. Locally, 225 CMS tests and
   TypeScript pass. The production build bundles server and client code but
   Cloudflare prerendering stops when this runtime cannot enumerate network
   interfaces (`uv_interface_addresses`); require a green CI build before merge.
2. After an authorized deployment, request `/robots.txt`,
   `/articles-sitemap.xml`, and a sample article on the public domain. Confirm
   the sitemap contains only active posts and each URL returns indexable HTML
   with the expected canonical, title, summary, and structured data.
3. Add both sitemap URLs in Google Search Console for the verified domain and
   inspect Pages indexing and URL Inspection for a representative Thai and
   English article. Google decides whether and when to crawl or index them.
4. As articles accumulate, use Search Console Performance to learn which
   queries earn impressions and clicks; improve answers and internal links
   based on reader intent and observed results. Use GA4, if enabled and
   consented to, for visits and engagement rather than rankings.

The maintainer will handle public website content and page presentation in a
separate change.
