import type { PostRow, PublicArticle } from '../../../src/lib/cms/contracts.ts';

/**
 * Mock English database post row adhering to the PostRow contract.
 * Uses snake_case fields and epoch-millisecond timestamps.
 */
export const mockPostRowEn: PostRow = {
  id: 'post_en_00000001',
  lang: 'en',
  translation_group_id: 'grp_architecture_2026',
  slug: 'cloudflare-cms-architecture',
  title: 'Cloudflare CMS Architecture for Portfolio Websites',
  excerpt: 'Designing a hybrid content management system on Cloudflare D1 and R2 for high-performance portfolio sites.',
  body_markdown: `# Cloudflare CMS Architecture

This article explores designing a serverless content management system (CMS) using a hybrid architecture:
- **Astro SSG** compiles fast static pages from immutable release snapshots
- **Cloudflare D1** manages relational data models and transactional revision controls
- **Cloudflare R2** stores media assets for both private drafts and public releases

## Database Design

Decoupling mutable post drafts from immutable post revisions ensures editorial workflows never compromise production reliability.`,
  draft_version: 1,
  lifecycle: 'active',
  created_at: 1789030800000,
  updated_at: 1789030800000,
  archived_at: null,
};

/**
 * Mock English public article DTO adhering to the PublicArticle contract.
 * Uses camelCase fields, canonical ISO-8601 UTC timestamps, and resolved taxonomies/assets.
 */
export const mockPublicArticleEn: PublicArticle = {
  id: 'post_en_00000001',
  revisionId: 'rev_en_00000001',
  lang: 'en',
  translationGroupId: 'grp_architecture_2026',
  slug: 'cloudflare-cms-architecture',
  title: 'Cloudflare CMS Architecture for Portfolio Websites',
  excerpt: 'Designing a hybrid content management system on Cloudflare D1 and R2 for high-performance portfolio sites.',
  bodyMarkdown: `# Cloudflare CMS Architecture

This article explores designing a serverless content management system (CMS) using a hybrid architecture:
- **Astro SSG** compiles fast static pages from immutable release snapshots
- **Cloudflare D1** manages relational data models and transactional revision controls
- **Cloudflare R2** stores media assets for both private drafts and public releases

## Database Design

Decoupling mutable post drafts from immutable post revisions ensures editorial workflows never compromise production reliability.`,
  categories: [
    {
      id: 'cat_engineering_en',
      slug: 'engineering',
      name: 'Software Engineering',
    },
    {
      id: 'cat_architecture_en',
      slug: 'architecture',
      name: 'System Architecture',
    },
  ],
  tags: [
    {
      id: 'tag_cloudflare_en',
      slug: 'cloudflare',
      name: 'Cloudflare',
    },
    {
      id: 'tag_architecture_en',
      slug: 'architecture',
      name: 'Architecture',
    },
    {
      id: 'tag_sqlite_en',
      slug: 'sqlite',
      name: 'SQLite',
    },
  ],
  sources: [
    {
      label: 'Cloudflare D1 Documentation',
      url: 'https://developers.cloudflare.com/d1/',
      publisher: 'Cloudflare',
      accessedAt: '2026-09-10T09:00:00.000Z',
    },
  ],
  assets: [
    {
      usageId: 'usg_en_cover_0001',
      assetId: 'asset_cover_00001',
      role: 'cover',
      url: 'https://images.frong.me/staging/cover-architecture.webp',
      mimeType: 'image/webp',
      width: 1600,
      height: 900,
      byteSize: 184320,
      sha256: '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae',
      alt: 'Cloudflare CMS Architecture Diagram',
      caption: 'Hybrid CMS Architecture on the Edge',
      crop: {
        x: 50,
        y: 50,
        zoom: 1,
      },
      position: 0,
    },
    {
      usageId: 'usg_en_body_0001',
      assetId: 'asset_chart_00002',
      role: 'body',
      url: 'https://images.frong.me/staging/benchmark-latency.png',
      mimeType: 'image/png',
      width: 1200,
      height: 675,
      byteSize: 94208,
      sha256: 'fcde2b2edba56bf408601fb721fe9b5c338d10ee429ea04fae5511b68fbf8fb9',
      alt: 'D1 Query Latency Benchmark Chart',
      caption: 'Performance benchmark results at the edge',
      position: 1,
    },
  ],
  publishedAt: '2026-09-10T09:00:00.000Z',
};

export const postRowEn = mockPostRowEn;
export const publicArticleEn = mockPublicArticleEn;

export default {
  mockPostRowEn,
  mockPublicArticleEn,
  postRowEn,
  publicArticleEn,
};

