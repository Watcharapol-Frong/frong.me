# Article SEO: editor review and discovery

Updated: 2026-09-23. Scope: Earth Editor review and article sitemaps. Public
page design and homepage content are owned separately by the site maintainer.

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
