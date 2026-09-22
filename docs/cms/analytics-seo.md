# Analytics and SEO

## Ownership

`src/lib/seo.ts` is the single interface for page metadata and structured
data. Pages pass one `seo` object to `src/layouts/Layout.astro`; the layout owns
canonical URLs, robots directives, Open Graph, Twitter cards and JSON-LD. Add a
new page type there instead of copying head tags into routes.

`src/components/Analytics.astro` owns Google Analytics 4. It uses Google's
basic consent model: the Google tag is not downloaded and no request is sent to
Google until the reader selects **Allow analytics**. A reader can reopen
Analytics settings and revoke consent. Advertising storage, signals and
personalisation remain disabled.

`src/lib/analytics-consent.ts` is the consent module seam. It validates and
expires the stored choice, owns Google tag loading and revocation, and mounts
the browser interactions rendered by `Analytics.astro`. Choices expire after
12 months; invalid, future, legacy or version-mismatched records prompt again.
The banner follows the current page language, gives accept and decline equal
visual weight, and links to the bilingual `/privacy/` explanation.

GA4 measures traffic; it does not directly improve search ranking. Search
eligibility comes from crawlable content, accurate metadata, structured data,
the sitemap and page performance.

## Configuration

Set `PUBLIC_GA_MEASUREMENT_ID` to the GA4 web stream measurement ID at build
time (format `G-XXXXXXXXXX`). It is a public identifier, not a credential.
Leave it unset to emit no consent UI and make no Google Analytics request. The
small local consent controller may remain in the application bundle but exits
when there is no rendered consent root. Because Vite embeds `PUBLIC_` values
into the build, staging and production builds must receive their intended IDs
separately; changing a Worker runtime variable alone does not update an
existing build.

After configuring the ID:

1. Build and deploy through the authorized environment runbook.
2. Open a public page in a clean browser profile and confirm no request to
   `googletagmanager.com` occurs before consent.
3. Allow analytics and verify the page view in GA4 Realtime and Tag Assistant.
4. Reopen Analytics settings, deny consent, and confirm subsequent page loads
   do not load the Google tag and accessible `_ga` cookies are removed.
5. Validate an article with Google's Rich Results Test and inspect canonical,
   robots and social metadata in the rendered HTML.
6. Check both a Thai article and an English page with keyboard-only navigation,
   including focus return and Escape after reopening the settings.

Primary references: [Google tag setup](https://developers.google.com/analytics/devguides/collection/ga4/tag-options),
[consent mode](https://developers.google.com/tag-platform/security/concepts/consent-mode),
and [structured data](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data).

## Performance and cost

The homepage calls `listPublishedPostCards`, which returns the complete card
read model in three D1 queries regardless of the number of posts. Do not replace
it with per-post asset or taxonomy calls. Public responses retain edge caching,
and GA4 is lazy-loaded only after consent. Homepage cards use one responsive DOM
tree, intrinsic image dimensions and high fetch priority only for the first
image.
