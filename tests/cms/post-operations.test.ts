import assert from 'node:assert/strict';
import test from 'node:test';

import { createCmsDbFixture } from './fixture.ts';
import {
  archivePost,
  createPost,
  getPostDraft,
  listPostDrafts,
  updatePostBundle,
  updatePostDraft,
} from '../../src/server/cms/repositories/posts.ts';
import {
  parseCreatePostInput,
  parseUpdatePostDraftInput,
  parsePostListQuery,
  CmsValidationError,
} from '../../src/lib/cms/validation.ts';
import {
  CmsConflictError,
  CmsDatabaseError,
  CmsNotFoundError,
} from '../../src/server/cms/errors.ts';
import {
  canonicalReleaseManifest,
  confirmReleaseLive,
  createRelease,
  createRevisionSnapshot,
  getLiveReleaseSnapshot,
  startReleaseAttempt,
  transitionRelease,
  transitionReleaseAttempt,
} from '../../src/server/cms/repositories/releases.ts';
import {
  addPostAssetUsage,
  createAsset,
  promoteAsset,
} from '../../src/server/cms/repositories/assets.ts';
import {
  replacePostSources,
  replacePostTaxonomy,
  upsertCategory,
  upsertTag,
} from '../../src/server/cms/repositories/taxonomy.ts';

const NOW = 1_789_100_000_000;

// -----------------------------------------------------------------------------
// 1. Post CRUD Edge Cases: Title Validation & Special Characters
// -----------------------------------------------------------------------------

test('title validation rejects empty string, overly long strings, and non-string types', () => {
  const baseInput = {
    id: 'post_title_001',
    lang: 'th' as const,
    slug: 'title-validation-test',
    bodyMarkdown: '# Body',
  };

  // Empty string title
  assert.throws(
    () => parseCreatePostInput({ ...baseInput, title: '' }),
    (err: unknown) => err instanceof CmsValidationError && err.field === 'post.title',
  );

  // Overly long title (> 300 characters)
  const title301 = 'a'.repeat(301);
  assert.throws(
    () => parseCreatePostInput({ ...baseInput, title: title301 }),
    (err: unknown) => err instanceof CmsValidationError && err.field === 'post.title',
  );

  // Exactly 300 characters is allowed
  const title300 = 'a'.repeat(300);
  const parsed300 = parseCreatePostInput({ ...baseInput, title: title300 });
  assert.equal(parsed300.title, title300);

  // Non-string title types
  for (const invalidTitle of [123, null, undefined, {}, true, []]) {
    assert.throws(
      () => parseCreatePostInput({ ...baseInput, title: invalidTitle }),
      (err: unknown) => err instanceof CmsValidationError && err.field === 'post.title',
    );
  }

  // updatePostDraftInput behaves identically for title validation
  const updateBase = {
    expectedDraftVersion: 1,
    lang: 'th' as const,
    slug: 'title-validation-test',
    bodyMarkdown: '# Body',
  };
  assert.throws(
    () => parseUpdatePostDraftInput({ ...updateBase, title: '' }),
    (err: unknown) => err instanceof CmsValidationError && err.field === 'post.title',
  );
  assert.throws(
    () => parseUpdatePostDraftInput({ ...updateBase, title: title301 }),
    (err: unknown) => err instanceof CmsValidationError && err.field === 'post.title',
  );
});

test('D1 database rejects whitespace-only title via CHECK constraint', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  // '   ' passes validation string length check, but fails D1 CHECK (length(trim(title)) > 0)
  await assert.rejects(
    createPost(db, {
      id: 'post_ws_000001',
      lang: 'th',
      slug: 'whitespace-title',
      title: '   ',
      bodyMarkdown: '# Whitespace',
    }, NOW),
    (err: unknown) => err instanceof CmsDatabaseError
      && String((err as any).cause?.message).includes('CHECK constraint failed')
      && String((err as any).cause?.message).includes('title'),
  );
});

test('post CRUD preserves Thai script, Unicode emojis, quotes, and special characters losslessly', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  const specialCases = [
    {
      id: 'post_spec_th001',
      lang: 'th' as const,
      slug: 'thai-character-proof',
      title: 'สถาปัตยกรรมคลาวด์แฟลร์ D1 และระบบแคชแบบ Edge ๒๕๖๙',
      excerpt: 'การวิเคราะห์เจาะลึก: สมรรถนะและความเสถียร (ความหน่วง < 10ms)',
      bodyMarkdown: '# หัวข้อหลักภาษาไทย\n\nเนื้อหาทดสอบวรรณยุกต์และสระ: ที่นี่มี ป่าไม้ ไม้ตรี ไม้โท',
    },
    {
      id: 'post_spec_uni01',
      lang: 'en' as const,
      slug: 'emoji-and-unicode-proof',
      title: '🚀 Cloudflare D1 + Astro SSG: 100% Edge Speed! ⚡️ (High-Perf #1)',
      excerpt: 'Testing Unicode glyphs: → ← ↑ ↓ ⭐️ © ® ™ € £ ¥ •',
      bodyMarkdown: '### Unicode section\n\nSupports mathematical notations: ∀x ∈ S, ∃y: x² + y² = z²',
    },
    {
      id: 'post_spec_qts01',
      lang: 'en' as const,
      slug: 'quotes-and-xss-proof',
      title: 'O\'Connor\'s "Comprehensive" Guide & Analysis [v2.0] <Draft>',
      excerpt: 'Safe handling: <script>alert("test")</script> & <b>bold</b>',
      bodyMarkdown: 'Safe markdown with HTML entities and ampersands: &amp; &lt; &gt; "double" \'single\'',
    },
  ];

  for (const item of specialCases) {
    // 1. Create post
    const created = await createPost(db, item, NOW);
    assert.equal(created.id, item.id);
    assert.equal(created.title, item.title);
    assert.equal(created.excerpt, item.excerpt);
    assert.equal(created.body_markdown, item.bodyMarkdown);

    // 2. Read back
    const fetched = await getPostDraft(db, item.id);
    assert.equal(fetched.title, item.title);
    assert.equal(fetched.excerpt, item.excerpt);
    assert.equal(fetched.body_markdown, item.bodyMarkdown);

    // 3. Update with modified special characters
    const updatedTitle = `${item.title} (Updated แก้ไข ๑)`;
    const updated = await updatePostDraft(db, item.id, {
      expectedDraftVersion: 1,
      lang: item.lang,
      slug: item.slug,
      title: updatedTitle,
      excerpt: item.excerpt,
      bodyMarkdown: `${item.bodyMarkdown}\n\nAdditional text: ทดสอบเพิ่มเติม 100%`,
    }, NOW + 100);

    assert.equal(updated.title, updatedTitle);
    assert.equal(updated.draft_version, 2);

    const reFetched = await getPostDraft(db, item.id);
    assert.equal(reFetched.title, updatedTitle);
  }
});

// -----------------------------------------------------------------------------
// 2. Post CRUD Edge Cases: Slug Validation
// -----------------------------------------------------------------------------

test('slug validation accepts valid kebab-case ASCII slugs and exact length boundaries', () => {
  const baseInput = {
    id: 'post_slug_ok001',
    lang: 'en' as const,
    title: 'Valid Slug Post',
    bodyMarkdown: '# Body',
  };

  const validSlugs = [
    'a',
    'single',
    'hello-world',
    'post-123-with-numbers',
    '123-456-789',
    'v2-migration-strategy-cloudflare-d1',
    'a'.repeat(120),
    `${'a-'.repeat(59)}a`, // 119 chars
  ];

  for (const slug of validSlugs) {
    const parsed = parseCreatePostInput({ ...baseInput, slug });
    assert.equal(parsed.slug, slug);
  }
});

test('slug validation rejects invalid formats, uppercase, spaces, special characters, and non-ASCII', () => {
  const baseInput = {
    id: 'post_slug_bad01',
    lang: 'en' as const,
    title: 'Bad Slug Post',
    bodyMarkdown: '# Body',
  };

  const invalidSlugs = [
    '',                                 // empty
    'UPPERCASE',                        // uppercase letters
    'Mixed-Case-Slug',                  // mixed case
    'has spaces',                       // spaces inside
    ' leading-space',                   // leading space
    'trailing-space ',                  // trailing space
    'slug_with_underscores',            // underscore not allowed
    'slug.with.dots',                   // dots not allowed
    'slug@symbol',                      // symbols not allowed
    'slug/with/slashes',                // slashes not allowed
    'slug#hashtag',                     // hash not allowed
    'slug?param=1',                     // query params not allowed
    'double--hyphen',                   // consecutive hyphens
    'triple---hyphen',                  // triple hyphens
    '-leading-hyphen',                  // leading hyphen
    'trailing-hyphen-',                 // trailing hyphen
    '-',                                // single hyphen
    '--',                               // double hyphen only
    'ภาษาไทย-slug',                     // non-ASCII / Thai
    'café-slug',                        // accented characters
    'a'.repeat(121),                    // exceeds 120 chars
  ];

  for (const slug of invalidSlugs) {
    assert.throws(
      () => parseCreatePostInput({ ...baseInput, slug }),
      (err: unknown) => err instanceof CmsValidationError && err.field === 'post.slug',
      `Expected slug "${slug}" to fail validation`,
    );
  }

  // Non-string slug types
  for (const badType of [123, null, undefined, {}, true, []]) {
    assert.throws(
      () => parseCreatePostInput({ ...baseInput, slug: badType }),
      (err: unknown) => err instanceof CmsValidationError && err.field === 'post.slug',
    );
  }
});

// -----------------------------------------------------------------------------
// 3. Post CRUD Edge Cases: Duplicate Slug Enforcement (D1 Database)
// -----------------------------------------------------------------------------

test('D1 enforces UNIQUE (lang, slug) constraint: rejects duplicate slug within same language', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  // 1. Create first post
  await createPost(db, {
    id: 'post_dup_0000001',
    lang: 'th',
    slug: 'unique-editorial-analysis',
    title: 'First Article',
    bodyMarkdown: '# First',
  }, NOW);

  // 2. Attempt to create second post with same lang and slug -> must fail with UNIQUE constraint
  await assert.rejects(
    createPost(db, {
      id: 'post_dup_0000002',
      lang: 'th',
      slug: 'unique-editorial-analysis',
      title: 'Second Article (Duplicate)',
      bodyMarkdown: '# Second',
    }, NOW + 1),
    (err: unknown) => err instanceof CmsConflictError
      && err.code === 'CONFLICT'
      && String((err as any).cause?.message).includes('UNIQUE constraint failed'),
  );
});

test('D1 permits identical slug across different languages (bilingual pairing support)', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  const sharedSlug = 'shared-bilingual-slug';
  const groupId = 'grp_shared_0001';

  // Thai version
  const postTh = await createPost(db, {
    id: 'post_bi_th_00001',
    lang: 'th',
    translationGroupId: groupId,
    slug: sharedSlug,
    title: 'บทความภาษาไทย',
    bodyMarkdown: '# ภาษาไทย',
  }, NOW);

  // English version with identical slug
  const postEn = await createPost(db, {
    id: 'post_bi_en_00001',
    lang: 'en',
    translationGroupId: groupId,
    slug: sharedSlug,
    title: 'English Article',
    bodyMarkdown: '# English',
  }, NOW);

  assert.equal(postTh.slug, postEn.slug);
  assert.equal(postTh.lang, 'th');
  assert.equal(postEn.lang, 'en');

  // Both should be readable independently
  const readTh = await getPostDraft(db, postTh.id);
  const readEn = await getPostDraft(db, postEn.id);
  assert.equal(readTh.title, 'บทความภาษาไทย');
  assert.equal(readEn.title, 'English Article');
});

test('updating post slug to collide with existing post in same language is rejected', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  await createPost(db, {
    id: 'post_col_000001',
    lang: 'en',
    slug: 'article-alpha',
    title: 'Article Alpha',
    bodyMarkdown: '# Alpha',
  }, NOW);

  await createPost(db, {
    id: 'post_col_000002',
    lang: 'en',
    slug: 'article-beta',
    title: 'Article Beta',
    bodyMarkdown: '# Beta',
  }, NOW);

  // Attempt to rename Beta to Alpha -> should fail unique constraint
  await assert.rejects(
    updatePostDraft(db, 'post_col_000002', {
      expectedDraftVersion: 1,
      lang: 'en',
      slug: 'article-alpha',
      title: 'Article Beta Renamed',
      bodyMarkdown: '# Beta',
    }, NOW + 10),
    (err: unknown) => err instanceof CmsConflictError
      && err.code === 'CONFLICT'
      && String((err as any).cause?.message).includes('UNIQUE constraint failed'),
  );

  // Updating post with its own slug must succeed without constraint error
  const updatedAlpha = await updatePostDraft(db, 'post_col_000001', {
    expectedDraftVersion: 1,
    lang: 'en',
    slug: 'article-alpha',
    title: 'Article Alpha Updated',
    bodyMarkdown: '# Alpha Updated',
  }, NOW + 20);
  assert.equal(updatedAlpha.draft_version, 2);
  assert.equal(updatedAlpha.title, 'Article Alpha Updated');
});

test('updating post language that causes slug collision in target language is rejected', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  await createPost(db, {
    id: 'post_lang_col_th',
    lang: 'th',
    slug: 'cross-lang-collision',
    title: 'Thai Post',
    bodyMarkdown: '# Thai',
  }, NOW);

  await createPost(db, {
    id: 'post_lang_col_en',
    lang: 'en',
    slug: 'cross-lang-collision',
    title: 'English Post',
    bodyMarkdown: '# English',
  }, NOW);

  // Attempt to change English post's language to 'th' -> collisions with Thai post
  await assert.rejects(
    updatePostDraft(db, 'post_lang_col_en', {
      expectedDraftVersion: 1,
      lang: 'th',
      slug: 'cross-lang-collision',
      title: 'English Post Switched to Thai',
      bodyMarkdown: '# English',
    }, NOW + 10),
    (err: unknown) => err instanceof CmsConflictError
      && err.code === 'CONFLICT'
      && String((err as any).cause?.message).includes('UNIQUE constraint failed'),
  );
});

// -----------------------------------------------------------------------------
// 4. Post Status Transitions: Draft -> Published -> Archived
// -----------------------------------------------------------------------------

test('full post status transition lifecycle: Draft -> Published -> Active -> Archived', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  const postId = 'post_lifecycle_001';
  const revisionId = 'rev_lifecycle_0001';
  const releaseId = 'rel_lifecycle_0001';

  // ---------------------------------------------------------------------------
  // Step 1: Post creation defaults to 'draft' status
  // ---------------------------------------------------------------------------
  const post = await createPost(db, {
    id: postId,
    lang: 'th',
    slug: 'complete-lifecycle-journey',
    title: 'วงจรชีวิตของบทความ (Lifecycle)',
    excerpt: 'ทดสอบสถานะ Draft -> Published -> Archived',
    bodyMarkdown: '# ร่างเริ่มต้น (Draft)',
  }, NOW);

  assert.equal(post.lifecycle, 'draft');
  assert.equal(post.draft_version, 1);
  assert.equal(post.archived_at, null);

  // Query filter by lifecycle
  const draftList = await listPostDrafts(db, { lifecycle: 'draft' });
  assert.ok(draftList.some((p) => p.id === postId));

  const activeListEmpty = await listPostDrafts(db, { lifecycle: 'active' });
  assert.ok(!activeListEmpty.some((p) => p.id === postId));

  const archivedListEmpty = await listPostDrafts(db, { lifecycle: 'archived' });
  assert.ok(!archivedListEmpty.some((p) => p.id === postId));

  // ---------------------------------------------------------------------------
  // Step 2: Prepare attachments and publish via Release Snapshot
  // ---------------------------------------------------------------------------
  await upsertCategory(db, {
    id: 'cat_life_001', lang: 'th', slug: 'lifecycle', name: 'Lifecycle',
  }, NOW);
  await upsertTag(db, {
    id: 'tag_life_001', lang: 'th', slug: 'cms', name: 'CMS',
  }, NOW);
  await replacePostTaxonomy(db, postId, ['cat_life_001'], ['tag_life_001'], 1, NOW + 1);

  await createAsset(db, {
    id: 'asset_life_0001',
    mediaKind: 'chart',
    privateR2Key: 'draft/lifecycle.png',
    mimeType: 'image/png',
    width: 1200,
    height: 675,
    byteSize: 1024,
    sha256: 'b'.repeat(64),
  }, NOW + 2);
  await promoteAsset(db, 'asset_life_0001', 'articles/lifecycle.png', NOW + 3);

  await addPostAssetUsage(db, {
    id: 'usage_life_0001',
    postId,
    assetId: 'asset_life_0001',
    role: 'cover',
    altText: 'Lifecycle diagram',
    expectedDraftVersion: 2,
  }, NOW + 4);

  // Snapshot post into immutable revision (post draft is at version 3)
  const revision = await createRevisionSnapshot(db, {
    revisionId,
    postId,
    expectedDraftVersion: 3,
    publishedAt: NOW + 5,
  });
  assert.equal(revision.id, revisionId);
  assert.equal(revision.title, 'วงจรชีวิตของบทความ (Lifecycle)');

  // Build and confirm release
  const manifest = {
    schemaVersion: 1 as const,
    releaseId,
    generatedAt: new Date(NOW + 6).toISOString(),
    articles: [{
      postId,
      revisionId,
      lang: 'th' as const,
      slug: 'complete-lifecycle-journey',
      visible: true,
    }],
  };
  const canonical = await canonicalReleaseManifest(manifest);
  await createRelease(db, {
    id: releaseId,
    triggerKind: 'publish',
    triggerPostId: postId,
    idempotencyKey: 'idem_life_0001',
    manifest,
    manifestSha256: canonical.sha256,
  }, NOW + 7);

  await startReleaseAttempt(db, { id: 'att_life_0001', releaseId, attemptNumber: 1, now: NOW + 8 });
  await transitionRelease(db, releaseId, 'queued', 'building', { now: NOW + 9 });
  await transitionReleaseAttempt(db, 'att_life_0001', 'dispatching', 'building', { now: NOW + 9 });
  await transitionRelease(db, releaseId, 'building', 'deploying', { now: NOW + 10 });
  await transitionReleaseAttempt(db, 'att_life_0001', 'building', 'deploying', { now: NOW + 10 });
  await confirmReleaseLive(db, {
    releaseId,
    attemptId: 'att_life_0001',
    providerDeploymentId: 'dep_life_0001',
    now: NOW + 11,
  });

  // Verify published snapshot contains the article
  const liveSnapshot = await getLiveReleaseSnapshot(db, 'https://images.frong.me/');
  assert.equal(liveSnapshot?.articles.length, 1);
  assert.equal(liveSnapshot?.articles[0]?.id, postId);
  assert.equal(liveSnapshot?.articles[0]?.title, 'วงจรชีวิตของบทความ (Lifecycle)');

  // ---------------------------------------------------------------------------
  // Step 3: Transition lifecycle to 'active'
  // ---------------------------------------------------------------------------
  await db.run(
    `UPDATE posts SET lifecycle = 'active', updated_at = ?1 WHERE id = ?2`,
    [NOW + 12, postId],
  );

  const activePost = await getPostDraft(db, postId);
  assert.equal(activePost.lifecycle, 'active');

  const activeFiltered = await listPostDrafts(db, { lifecycle: 'active' });
  assert.ok(activeFiltered.some((p) => p.id === postId));

  const draftFiltered = await listPostDrafts(db, { lifecycle: 'draft' });
  assert.ok(!draftFiltered.some((p) => p.id === postId));

  // Active post can still receive draft updates (draft version bumped to 4)
  const editedActive = await updatePostDraft(db, postId, {
    expectedDraftVersion: 3,
    lang: 'th',
    slug: 'complete-lifecycle-journey',
    title: 'วงจรชีวิตของบทความ (แก้ไขระหว่าง Active)',
    bodyMarkdown: '# เนื้อหาใหม่',
  }, NOW + 13);
  assert.equal(editedActive.draft_version, 4);
  assert.equal(editedActive.lifecycle, 'active');

  // The live published snapshot remains completely isolated from the new draft edits
  const liveSnapshotAfterEdit = await getLiveReleaseSnapshot(db, 'https://images.frong.me/');
  assert.equal(liveSnapshotAfterEdit?.articles[0]?.title, 'วงจรชีวิตของบทความ (Lifecycle)');

  // ---------------------------------------------------------------------------
  // Step 4: Archive post (Transition Active -> Archived)
  // ---------------------------------------------------------------------------
  const archived = await archivePost(db, postId, 4, NOW + 14);
  assert.equal(archived.lifecycle, 'archived');
  assert.equal(archived.archived_at, NOW + 14);
  assert.equal(archived.draft_version, 5);

  const archivedPost = await getPostDraft(db, postId);
  assert.equal(archivedPost.lifecycle, 'archived');
  assert.equal(archivedPost.archived_at, NOW + 14);

  const archivedFiltered = await listPostDrafts(db, { lifecycle: 'archived' });
  assert.ok(archivedFiltered.some((p) => p.id === postId));

  const activeAfterArchive = await listPostDrafts(db, { lifecycle: 'active' });
  assert.ok(!activeAfterArchive.some((p) => p.id === postId));

  // ---------------------------------------------------------------------------
  // Step 5: Verify strict invariant guards on archived post
  // ---------------------------------------------------------------------------

  // 1. Re-archiving an already archived post must fail with conflict
  await assert.rejects(
    archivePost(db, postId, 5, NOW + 15),
    (err: unknown) => err instanceof CmsConflictError && err.code === 'DRAFT_VERSION_CONFLICT',
  );

  // 2. Updating an archived post must fail with conflict
  await assert.rejects(
    updatePostDraft(db, postId, {
      expectedDraftVersion: 5,
      lang: 'th',
      slug: 'complete-lifecycle-journey',
      title: 'Cannot edit archived post',
      bodyMarkdown: '# Failed edit',
    }, NOW + 16),
    (err: unknown) => err instanceof CmsConflictError && err.code === 'DRAFT_VERSION_CONFLICT',
  );

  // 3. updatePostBundle on archived post must fail with conflict
  await assert.rejects(
    updatePostBundle(db, postId, {
      draft: {
        expectedDraftVersion: 5,
        lang: 'th',
        slug: 'complete-lifecycle-journey',
        title: 'Cannot bundle edit archived',
        bodyMarkdown: '# Failed bundle',
      },
      categoryIds: [],
      tagIds: [],
      sources: [],
    }, NOW + 17),
    (err: unknown) => err instanceof CmsConflictError && err.code === 'DRAFT_VERSION_CONFLICT',
  );

  // 4. Replacing taxonomy on archived post must fail with conflict
  await assert.rejects(
    replacePostTaxonomy(db, postId, [], [], 5, NOW + 18),
    (err: unknown) => err instanceof CmsConflictError && err.code === 'DRAFT_VERSION_CONFLICT',
  );

  // 5. Replacing sources on archived post must fail with conflict
  await assert.rejects(
    replacePostSources(db, postId, [], 5, NOW + 19),
    (err: unknown) => err instanceof CmsConflictError && err.code === 'DRAFT_VERSION_CONFLICT',
  );

  // 6. Creating revision snapshot for archived post must fail
  await assert.rejects(
    createRevisionSnapshot(db, {
      revisionId: 'rev_forbidden_archived',
      postId,
      expectedDraftVersion: 5,
      publishedAt: NOW + 20,
    }),
    (err: unknown) => err instanceof CmsConflictError && err.code === 'DRAFT_VERSION_CONFLICT',
  );
});

test('D1 database CHECK constraints enforce valid lifecycle values and timestamp rules', async (t) => {
  const { binding, db } = createCmsDbFixture();
  t.after(() => binding.close());

  const postId = 'post_chk_0000001';
  await createPost(db, {
    id: postId,
    lang: 'en',
    slug: 'check-constraint-post',
    title: 'Check Constraint Test',
    bodyMarkdown: '# Check',
  }, NOW);

  // 1. Setting invalid lifecycle string fails SQLite CHECK constraint
  for (const badLifecycle of ['deleted', 'inactive', 'published', 'trash', 'pending', '']) {
    await assert.rejects(
      db.run(`UPDATE posts SET lifecycle = ?1 WHERE id = ?2`, [badLifecycle, postId]),
      (err: unknown) => err instanceof CmsDatabaseError
        && String((err as any).cause?.message).includes('CHECK constraint failed')
        && String((err as any).cause?.message).includes('lifecycle'),
    );
  }

  // 2. Setting archived_at < created_at fails CHECK constraint
  await assert.rejects(
    db.run(
      `UPDATE posts SET archived_at = ?1 WHERE id = ?2`,
      [NOW - 10_000, postId],
    ),
    (err: unknown) => err instanceof CmsDatabaseError
      && String((err as any).cause?.message).includes('CHECK constraint failed')
      && String((err as any).cause?.message).includes('archived_at'),
  );

  // 3. Setting updated_at < created_at fails CHECK constraint
  await assert.rejects(
    db.run(
      `UPDATE posts SET updated_at = ?1 WHERE id = ?2`,
      [NOW - 1, postId],
    ),
    (err: unknown) => err instanceof CmsDatabaseError
      && String((err as any).cause?.message).includes('CHECK constraint failed')
      && String((err as any).cause?.message).includes('updated_at'),
  );

  // 4. Setting draft_version < 1 fails CHECK constraint
  await assert.rejects(
    db.run(`UPDATE posts SET draft_version = 0 WHERE id = ?1`, [postId]),
    (err: unknown) => err instanceof CmsDatabaseError
      && String((err as any).cause?.message).includes('CHECK constraint failed')
      && String((err as any).cause?.message).includes('draft_version'),
  );
});

test('post query parsing enforces valid lifecycle_state filter', () => {
  // Valid values
  assert.equal(parsePostListQuery(new URLSearchParams('lifecycle_state=draft')).lifecycle, 'draft');
  assert.equal(parsePostListQuery(new URLSearchParams('lifecycle_state=active')).lifecycle, 'active');
  assert.equal(parsePostListQuery(new URLSearchParams('lifecycle_state=archived')).lifecycle, 'archived');

  // Invalid values
  for (const badState of ['deleted', 'published', 'unknown', 'trash', '']) {
    assert.throws(
      () => parsePostListQuery(new URLSearchParams(`lifecycle_state=${badState}`)),
      (err: unknown) => err instanceof CmsValidationError && err.field === 'query.lifecycle_state',
    );
  }
});
