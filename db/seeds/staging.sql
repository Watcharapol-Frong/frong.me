-- Deterministic and idempotent staging seed data for frong.me CMS.
-- Timestamps use epoch milliseconds.
-- Foreign keys are enforced and all statements use INSERT OR IGNORE / conflict guards
-- so this script can be executed repeatedly without errors or violating immutability triggers.

PRAGMA foreign_keys = ON;

-- 1. Categories (bilingual)
INSERT OR IGNORE INTO categories (id, lang, slug, name, created_at, updated_at) VALUES
  ('cat_engineering_th', 'th', 'engineering', 'วิศวกรรมซอฟต์แวร์', 1789030800000, 1789030800000),
  ('cat_engineering_en', 'en', 'engineering', 'Software Engineering', 1789030800000, 1789030800000),
  ('cat_architecture_th', 'th', 'architecture', 'สถาปัตยกรรมระบบ', 1789030800000, 1789030800000),
  ('cat_architecture_en', 'en', 'architecture', 'System Architecture', 1789030800000, 1789030800000);

-- 2. Tags (bilingual)
INSERT OR IGNORE INTO tags (id, lang, slug, name, created_at, updated_at) VALUES
  ('tag_cloudflare_th', 'th', 'cloudflare', 'คลาวด์แฟลร์', 1789030800000, 1789030800000),
  ('tag_cloudflare_en', 'en', 'cloudflare', 'Cloudflare', 1789030800000, 1789030800000),
  ('tag_sqlite_th', 'th', 'sqlite', 'สคิวไลต์', 1789030800000, 1789030800000),
  ('tag_sqlite_en', 'en', 'sqlite', 'SQLite', 1789030800000, 1789030800000),
  ('tag_architecture_th', 'th', 'architecture', 'สถาปัตยกรรมระบบ', 1789030800000, 1789030800000),
  ('tag_architecture_en', 'en', 'architecture', 'Architecture', 1789030800000, 1789030800000);

-- 3. Assets (public promoted cover image and benchmark chart)
INSERT OR IGNORE INTO assets (
  id, media_kind, lifecycle, private_r2_key, public_r2_key, original_name,
  mime_type, width, height, byte_size, sha256, created_at, promoted_at
) VALUES
  (
    'asset_cover_00001',
    'photo',
    'public',
    'private/assets/2026/09/cover-architecture.webp',
    'public/assets/2026/09/cover-architecture.webp',
    'cover-architecture.webp',
    'image/webp',
    1600,
    900,
    184320,
    '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae',
    1789030800000,
    1789030800000
  ),
  (
    'asset_chart_00002',
    'chart',
    'public',
    'private/assets/2026/09/benchmark-latency.png',
    'public/assets/2026/09/benchmark-latency.png',
    'benchmark-latency.png',
    'image/png',
    1200,
    675,
    94208,
    'fcde2b2edba56bf408601fb721fe9b5c338d10ee429ea04fae5511b68fbf8fb9',
    1789030800000,
    1789030800000
  );

-- 4. Posts (bilingual translation pair linked via translation_group_id)
INSERT OR IGNORE INTO posts (
  id, lang, translation_group_id, slug, title, excerpt,
  body_markdown, draft_version, lifecycle, created_at, updated_at, archived_at
) VALUES
  (
    'post_th_00000001',
    'th',
    'grp_architecture_2026',
    'cloudflare-cms-architecture',
    'สถาปัตยกรรม CMS บน Cloudflare สำหรับเว็บพอร์ตโฟลิโอ',
    'การออกแบบระบบบริหารจัดการเนื้อหาแบบไฮบริดบน Cloudflare D1 และ R2 เพื่อความเร็วและการเผยแพร่ที่เชื่อถือได้',
    '# สถาปัตยกรรม CMS บน Cloudflare

บทความนี้สำรวจการออกแบบระบบบริหารจัดการเนื้อหา (CMS) แบบไร้เซิร์ฟเวอร์โดยใช้สถาปัตยกรรมไฮบริด:
- **Astro SSG** สร้างเว็บแบบ Static ที่รวดเร็วจาก Immutable Release Snapshot
- **Cloudflare D1** จัดเก็บโครงสร้างข้อมูลเชิงสัมพันธ์และการควบคุมรุ่นแบบ Transactional
- **Cloudflare R2** จัดเก็บไฟล์สื่อและรูปภาพสำหรับทั้งร่างส่วนตัวและเวอร์ชันสาธารณะ

## การออกแบบฐานข้อมูล

การแยกความรับผิดชอบระหว่าง Post Draft และ Post Revision ช่วยให้สามารถแก้ไขเนื้อหาได้อย่างอิสระโดยไม่กระทบต่อเวอร์ชันที่เผยแพร่อยู่บน Production',
    1,
    'active',
    1789030800000,
    1789030800000,
    NULL
  ),
  (
    'post_en_00000001',
    'en',
    'grp_architecture_2026',
    'cloudflare-cms-architecture',
    'Cloudflare CMS Architecture for Portfolio Websites',
    'Designing a hybrid content management system on Cloudflare D1 and R2 for high-performance portfolio sites.',
    '# Cloudflare CMS Architecture

This article explores designing a serverless content management system (CMS) using a hybrid architecture:
- **Astro SSG** compiles fast static pages from immutable release snapshots
- **Cloudflare D1** manages relational data models and transactional revision controls
- **Cloudflare R2** stores media assets for both private drafts and public releases

## Database Design

Decoupling mutable post drafts from immutable post revisions ensures editorial workflows never compromise production reliability.',
    1,
    'active',
    1789030800000,
    1789030800000,
    NULL
  );

-- 5. Post Categories
INSERT OR IGNORE INTO post_categories (post_id, category_id, position) VALUES
  ('post_th_00000001', 'cat_engineering_th', 0),
  ('post_th_00000001', 'cat_architecture_th', 1),
  ('post_en_00000001', 'cat_engineering_en', 0),
  ('post_en_00000001', 'cat_architecture_en', 1);

-- 6. Post Tags
INSERT OR IGNORE INTO post_tags (post_id, tag_id, position) VALUES
  ('post_th_00000001', 'tag_cloudflare_th', 0),
  ('post_th_00000001', 'tag_architecture_th', 1),
  ('post_th_00000001', 'tag_sqlite_th', 2),
  ('post_en_00000001', 'tag_cloudflare_en', 0),
  ('post_en_00000001', 'tag_architecture_en', 1),
  ('post_en_00000001', 'tag_sqlite_en', 2);

-- 7. Post Sources
INSERT OR IGNORE INTO post_sources (id, post_id, label, url, publisher, accessed_at, position) VALUES
  (
    'src_th_00000001',
    'post_th_00000001',
    'Cloudflare D1 Documentation',
    'https://developers.cloudflare.com/d1/',
    'Cloudflare',
    1789030800000,
    0
  ),
  (
    'src_en_00000001',
    'post_en_00000001',
    'Cloudflare D1 Documentation',
    'https://developers.cloudflare.com/d1/',
    'Cloudflare',
    1789030800000,
    0
  );

-- 8. Post Asset Usages (one cover per post, plus body charts)
INSERT OR IGNORE INTO post_asset_usages (
  id, post_id, asset_id, role, alt_text, caption, crop_json, position
) VALUES
  (
    'usg_th_cover_0001',
    'post_th_00000001',
    'asset_cover_00001',
    'cover',
    'แผนภาพสถาปัตยกรรม CMS บน Cloudflare',
    'ระบบสถาปัตยกรรมแบบไฮบริดบน Edge',
    '{"x":50,"y":50,"zoom":1}',
    0
  ),
  (
    'usg_th_body_0001',
    'post_th_00000001',
    'asset_chart_00002',
    'body',
    'กราฟเปรียบเทียบ Latency ของการคิวรี D1',
    'ผลการทดสอบประสิทธิภาพที่ Edge',
    NULL,
    1
  ),
  (
    'usg_en_cover_0001',
    'post_en_00000001',
    'asset_cover_00001',
    'cover',
    'Cloudflare CMS Architecture Diagram',
    'Hybrid CMS Architecture on the Edge',
    '{"x":50,"y":50,"zoom":1}',
    0
  ),
  (
    'usg_en_body_0001',
    'post_en_00000001',
    'asset_chart_00002',
    'body',
    'D1 Query Latency Benchmark Chart',
    'Performance benchmark results at the edge',
    NULL,
    1
  );

-- 9. Post Revisions (immutable frozen snapshots)
INSERT OR IGNORE INTO post_revisions (
  id, post_id, source_draft_version, lang, translation_group_id, slug,
  title, excerpt, body_markdown, categories_json, tags_json, sources_json,
  published_at, created_at
) VALUES
  (
    'rev_th_00000001',
    'post_th_00000001',
    1,
    'th',
    'grp_architecture_2026',
    'cloudflare-cms-architecture',
    'สถาปัตยกรรม CMS บน Cloudflare สำหรับเว็บพอร์ตโฟลิโอ',
    'การออกแบบระบบบริหารจัดการเนื้อหาแบบไฮบริดบน Cloudflare D1 และ R2 เพื่อความเร็วและการเผยแพร่ที่เชื่อถือได้',
    '# สถาปัตยกรรม CMS บน Cloudflare

บทความนี้สำรวจการออกแบบระบบบริหารจัดการเนื้อหา (CMS) แบบไร้เซิร์ฟเวอร์โดยใช้สถาปัตยกรรมไฮบริด:
- **Astro SSG** สร้างเว็บแบบ Static ที่รวดเร็วจาก Immutable Release Snapshot
- **Cloudflare D1** จัดเก็บโครงสร้างข้อมูลเชิงสัมพันธ์และการควบคุมรุ่นแบบ Transactional
- **Cloudflare R2** จัดเก็บไฟล์สื่อและรูปภาพสำหรับทั้งร่างส่วนตัวและเวอร์ชันสาธารณะ

## การออกแบบฐานข้อมูล

การแยกความรับผิดชอบระหว่าง Post Draft และ Post Revision ช่วยให้สามารถแก้ไขเนื้อหาได้อย่างอิสระโดยไม่กระทบต่อเวอร์ชันที่เผยแพร่อยู่บน Production',
    '[{"id":"cat_engineering_th","slug":"engineering","name":"วิศวกรรมซอฟต์แวร์"},{"id":"cat_architecture_th","slug":"architecture","name":"สถาปัตยกรรมระบบ"}]',
    '[{"id":"tag_cloudflare_th","slug":"cloudflare","name":"คลาวด์แฟลร์"},{"id":"tag_architecture_th","slug":"architecture","name":"สถาปัตยกรรมระบบ"},{"id":"tag_sqlite_th","slug":"sqlite","name":"สคิวไลต์"}]',
    '[{"label":"Cloudflare D1 Documentation","url":"https://developers.cloudflare.com/d1/","publisher":"Cloudflare","accessedAt":"2026-09-10T09:00:00.000Z"}]',
    1789030800000,
    1789030800000
  ),
  (
    'rev_en_00000001',
    'post_en_00000001',
    1,
    'en',
    'grp_architecture_2026',
    'cloudflare-cms-architecture',
    'Cloudflare CMS Architecture for Portfolio Websites',
    'Designing a hybrid content management system on Cloudflare D1 and R2 for high-performance portfolio sites.',
    '# Cloudflare CMS Architecture

This article explores designing a serverless content management system (CMS) using a hybrid architecture:
- **Astro SSG** compiles fast static pages from immutable release snapshots
- **Cloudflare D1** manages relational data models and transactional revision controls
- **Cloudflare R2** stores media assets for both private drafts and public releases

## Database Design

Decoupling mutable post drafts from immutable post revisions ensures editorial workflows never compromise production reliability.',
    '[{"id":"cat_engineering_en","slug":"engineering","name":"Software Engineering"},{"id":"cat_architecture_en","slug":"architecture","name":"System Architecture"}]',
    '[{"id":"tag_cloudflare_en","slug":"cloudflare","name":"Cloudflare"},{"id":"tag_architecture_en","slug":"architecture","name":"Architecture"},{"id":"tag_sqlite_en","slug":"sqlite","name":"SQLite"}]',
    '[{"label":"Cloudflare D1 Documentation","url":"https://developers.cloudflare.com/d1/","publisher":"Cloudflare","accessedAt":"2026-09-10T09:00:00.000Z"}]',
    1789030800000,
    1789030800000
  );

-- 10. Post Revision Assets
INSERT OR IGNORE INTO post_revision_assets (
  revision_id, usage_id, asset_id, role, public_r2_key, mime_type,
  width, height, byte_size, sha256, alt_text, caption, crop_json, position
) VALUES
  (
    'rev_th_00000001',
    'usg_th_cover_0001',
    'asset_cover_00001',
    'cover',
    'public/assets/2026/09/cover-architecture.webp',
    'image/webp',
    1600,
    900,
    184320,
    '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae',
    'แผนภาพสถาปัตยกรรม CMS บน Cloudflare',
    'ระบบสถาปัตยกรรมแบบไฮบริดบน Edge',
    '{"x":50,"y":50,"zoom":1}',
    0
  ),
  (
    'rev_th_00000001',
    'usg_th_body_0001',
    'asset_chart_00002',
    'body',
    'public/assets/2026/09/benchmark-latency.png',
    'image/png',
    1200,
    675,
    94208,
    'fcde2b2edba56bf408601fb721fe9b5c338d10ee429ea04fae5511b68fbf8fb9',
    'กราฟเปรียบเทียบ Latency ของการคิวรี D1',
    'ผลการทดสอบประสิทธิภาพที่ Edge',
    NULL,
    1
  ),
  (
    'rev_en_00000001',
    'usg_en_cover_0001',
    'asset_cover_00001',
    'cover',
    'public/assets/2026/09/cover-architecture.webp',
    'image/webp',
    1600,
    900,
    184320,
    '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae',
    'Cloudflare CMS Architecture Diagram',
    'Hybrid CMS Architecture on the Edge',
    '{"x":50,"y":50,"zoom":1}',
    0
  ),
  (
    'rev_en_00000001',
    'usg_en_body_0001',
    'asset_chart_00002',
    'body',
    'public/assets/2026/09/benchmark-latency.png',
    'image/png',
    1200,
    675,
    94208,
    'fcde2b2edba56bf408601fb721fe9b5c338d10ee429ea04fae5511b68fbf8fb9',
    'D1 Query Latency Benchmark Chart',
    'Performance benchmark results at the edge',
    NULL,
    1
  );

-- 11. Releases (confirmed live release)
INSERT OR IGNORE INTO releases (
  id, schema_version, status, trigger_kind, trigger_post_id, base_release_id,
  idempotency_key, manifest_json, manifest_sha256, code_commit,
  error_code, error_message, created_at, updated_at, finished_at
) VALUES (
  'rel_20260910_live001',
  1,
  'live',
  'publish',
  'post_th_00000001',
  NULL,
  'idem_publish_20260910_0001',
  '{"schemaVersion":1,"releaseId":"rel_20260910_live001","generatedAt":"2026-09-10T09:00:00.000Z","articles":[{"postId":"post_th_00000001","revisionId":"rev_th_00000001","lang":"th","slug":"cloudflare-cms-architecture","visible":true},{"postId":"post_en_00000001","revisionId":"rev_en_00000001","lang":"en","slug":"cloudflare-cms-architecture","visible":true}]}',
  '45e88d76a2e48baaebbf3cdd06a55b826b9e12afb457b7927e79a50198d3f3b4',
  'b572ae1b742b6a8a1837a7b8e19c08c4a9eb99d2',
  NULL,
  NULL,
  1789030800000,
  1789030800000,
  1789030800000
);

-- 12. Release Items (visible routes for both languages)
INSERT OR IGNORE INTO release_items (
  release_id, post_id, revision_id, lang, slug, visible
) VALUES
  ('rel_20260910_live001', 'post_th_00000001', 'rev_th_00000001', 'th', 'cloudflare-cms-architecture', 1),
  ('rel_20260910_live001', 'post_en_00000001', 'rev_en_00000001', 'en', 'cloudflare-cms-architecture', 1);

-- 13. Release Attempts
INSERT OR IGNORE INTO release_attempts (
  id, release_id, attempt_number, workflow_run_id, provider_deployment_id,
  status, error_message, started_at, finished_at
) VALUES (
  'att_rel_live001_01',
  'rel_20260910_live001',
  1,
  'run_staging_123456',
  'cf_dep_staging_789012',
  'confirmed',
  NULL,
  1789030800000,
  1789030800000
);

-- 14. Site State (point live release to the seeded live release)
-- Only updates if not already pointing to rel_20260910_live001 to prevent unnecessary trigger firings.
UPDATE site_state
SET live_release_id = 'rel_20260910_live001',
    updated_at = 1789030800000
WHERE id = 1
  AND (live_release_id IS NULL OR live_release_id != 'rel_20260910_live001');