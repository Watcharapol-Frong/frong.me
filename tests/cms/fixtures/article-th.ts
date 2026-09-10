import type { PostRow, PublicArticle } from '../../../src/lib/cms/contracts.ts';

/**
 * Mock Thai database post row adhering to the PostRow contract.
 * Uses snake_case fields and epoch-millisecond timestamps.
 */
export const mockPostRowTh: PostRow = {
  id: 'post_th_00000001',
  lang: 'th',
  translation_group_id: 'grp_architecture_2026',
  slug: 'cloudflare-cms-architecture',
  title: 'สถาปัตยกรรม CMS บน Cloudflare สำหรับเว็บพอร์ตโฟลิโอ',
  excerpt: 'การออกแบบระบบบริหารจัดการเนื้อหาแบบไฮบริดบน Cloudflare D1 และ R2 เพื่อความเร็วและการเผยแพร่ที่เชื่อถือได้',
  body_markdown: `# สถาปัตยกรรม CMS บน Cloudflare

บทความนี้สำรวจการออกแบบระบบบริหารจัดการเนื้อหา (CMS) แบบไร้เซิร์ฟเวอร์โดยใช้สถาปัตยกรรมไฮบริด:
- **Astro SSG** สร้างเว็บแบบ Static ที่รวดเร็วจาก Immutable Release Snapshot
- **Cloudflare D1** จัดเก็บโครงสร้างข้อมูลเชิงสัมพันธ์และการควบคุมรุ่นแบบ Transactional
- **Cloudflare R2** จัดเก็บไฟล์สื่อและรูปภาพสำหรับทั้งร่างส่วนตัวและเวอร์ชันสาธารณะ

## การออกแบบฐานข้อมูล

การแยกความรับผิดชอบระหว่าง Post Draft และ Post Revision ช่วยให้สามารถแก้ไขเนื้อหาได้อย่างอิสระโดยไม่กระทบต่อเวอร์ชันที่เผยแพร่อยู่บน Production`,
  draft_version: 1,
  lifecycle: 'active',
  created_at: 1789030800000,
  updated_at: 1789030800000,
  archived_at: null,
};

/**
 * Mock Thai public article DTO adhering to the PublicArticle contract.
 * Uses camelCase fields, canonical ISO-8601 UTC timestamps, and resolved taxonomies/assets.
 */
export const mockPublicArticleTh: PublicArticle = {
  id: 'post_th_00000001',
  revisionId: 'rev_th_00000001',
  lang: 'th',
  translationGroupId: 'grp_architecture_2026',
  slug: 'cloudflare-cms-architecture',
  title: 'สถาปัตยกรรม CMS บน Cloudflare สำหรับเว็บพอร์ตโฟลิโอ',
  excerpt: 'การออกแบบระบบบริหารจัดการเนื้อหาแบบไฮบริดบน Cloudflare D1 และ R2 เพื่อความเร็วและการเผยแพร่ที่เชื่อถือได้',
  bodyMarkdown: `# สถาปัตยกรรม CMS บน Cloudflare

บทความนี้สำรวจการออกแบบระบบบริหารจัดการเนื้อหา (CMS) แบบไร้เซิร์ฟเวอร์โดยใช้สถาปัตยกรรมไฮบริด:
- **Astro SSG** สร้างเว็บแบบ Static ที่รวดเร็วจาก Immutable Release Snapshot
- **Cloudflare D1** จัดเก็บโครงสร้างข้อมูลเชิงสัมพันธ์และการควบคุมรุ่นแบบ Transactional
- **Cloudflare R2** จัดเก็บไฟล์สื่อและรูปภาพสำหรับทั้งร่างส่วนตัวและเวอร์ชันสาธารณะ

## การออกแบบฐานข้อมูล

การแยกความรับผิดชอบระหว่าง Post Draft และ Post Revision ช่วยให้สามารถแก้ไขเนื้อหาได้อย่างอิสระโดยไม่กระทบต่อเวอร์ชันที่เผยแพร่อยู่บน Production`,
  categories: [
    {
      id: 'cat_engineering_th',
      slug: 'engineering',
      name: 'วิศวกรรมซอฟต์แวร์',
    },
    {
      id: 'cat_architecture_th',
      slug: 'architecture',
      name: 'สถาปัตยกรรมระบบ',
    },
  ],
  tags: [
    {
      id: 'tag_cloudflare_th',
      slug: 'cloudflare',
      name: 'คลาวด์แฟลร์',
    },
    {
      id: 'tag_architecture_th',
      slug: 'architecture',
      name: 'สถาปัตยกรรมระบบ',
    },
    {
      id: 'tag_sqlite_th',
      slug: 'sqlite',
      name: 'สคิวไลต์',
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
      usageId: 'usg_th_cover_0001',
      assetId: 'asset_cover_00001',
      role: 'cover',
      url: 'https://images.frong.me/staging/cover-architecture.webp',
      mimeType: 'image/webp',
      width: 1600,
      height: 900,
      byteSize: 184320,
      sha256: '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae',
      alt: 'แผนภาพสถาปัตยกรรม CMS บน Cloudflare',
      caption: 'ระบบสถาปัตยกรรมแบบไฮบริดบน Edge',
      crop: {
        x: 50,
        y: 50,
        zoom: 1,
      },
      position: 0,
    },
    {
      usageId: 'usg_th_body_0001',
      assetId: 'asset_chart_00002',
      role: 'body',
      url: 'https://images.frong.me/staging/benchmark-latency.png',
      mimeType: 'image/png',
      width: 1200,
      height: 675,
      byteSize: 94208,
      sha256: 'fcde2b2edba56bf408601fb721fe9b5c338d10ee429ea04fae5511b68fbf8fb9',
      alt: 'กราฟเปรียบเทียบ Latency ของการคิวรี D1',
      caption: 'ผลการทดสอบประสิทธิภาพที่ Edge',
      position: 1,
    },
  ],
  publishedAt: '2026-09-10T09:00:00.000Z',
};

export const postRowTh = mockPostRowTh;
export const publicArticleTh = mockPublicArticleTh;

export default {
  mockPostRowTh,
  mockPublicArticleTh,
  postRowTh,
  publicArticleTh,
};

