import assert from 'node:assert/strict';
import test from 'node:test';

import { createCmsDatabase, type D1DatabaseBinding } from '../../src/server/cms/db.ts';
import { listPublishedPostCards } from '../../src/server/cms/repositories/public.ts';
import { SqliteD1Binding } from './d1-test-adapter.ts';

test('listPublishedPostCards returns homepage data with a fixed three-query cost', async (t) => {
  const rawBinding = new SqliteD1Binding();
  t.after(() => rawBinding.close());
  rawBinding.migrate(
    'db/migrations/0001_articles.sql',
    'db/migrations/0002_taxonomy_assets.sql',
    'db/migrations/0003_releases.sql',
    'db/migrations/0004_direct_publish.sql',
    'db/migrations/0005_post_cover_url.sql',
    'db/migrations/0006_post_cover_crop.sql',
    'db/migrations/0007_site_settings.sql',
    'db/migrations/0008_ai_provider_configs.sql',
    'db/migrations/0009_primary_topic.sql',
  );

  let selectCount = 0;
  const countingBinding: D1DatabaseBinding = {
    prepare(query) {
      if (/^\s*SELECT\b/i.test(query)) selectCount += 1;
      return rawBinding.prepare(query);
    },
    batch: (statements) => rawBinding.batch(statements),
  };
  const db = createCmsDatabase(countingBinding);

  for (const [id, slug, title, primaryTopic] of [
    ['post_card_0001', 'first-card', 'First card', 'data'],
    ['post_card_0002', 'second-card', 'Second card', null],
  ]) {
    await db.run(
      `INSERT INTO posts (
         id, lang, slug, title, body_markdown, lifecycle,
         created_at, updated_at, published_at, primary_topic
       ) VALUES (?1, 'en', ?2, ?3, '# Body', 'active', 1000, 1000, 1000, ?4)`,
      [id, slug, title, primaryTopic],
    );
  }
  await db.run(
    `INSERT INTO tags (id, lang, slug, name, created_at, updated_at)
     VALUES ('tag_card_0001', 'en', 'analytics', 'Analytics', 1000, 1000)`,
  );
  await db.run(
    `INSERT INTO post_tags (post_id, tag_id, position)
     VALUES ('post_card_0001', 'tag_card_0001', 0)`,
  );
  await db.run(
    `INSERT INTO assets (
       id, media_kind, lifecycle, private_r2_key, public_r2_key,
       mime_type, width, height, byte_size, sha256, created_at, promoted_at
     ) VALUES (
       'asset_card_001', 'photo', 'public', 'private/cover.jpg', 'public/cover.jpg',
       'image/jpeg', 1200, 630, 100, ?1, 1000, 1000
     )`,
    ['a'.repeat(64)],
  );
  await db.run(
    `INSERT INTO post_asset_usages (
       id, post_id, asset_id, role, alt_text, position
     ) VALUES ('usage_card_001', 'post_card_0001', 'asset_card_001', 'cover', 'Cover', 0)`,
  );

  selectCount = 0;
  const cards = await listPublishedPostCards(db, { limit: 60 });

  assert.equal(selectCount, 3);
  assert.equal(cards.length, 2);
  const first = cards.find((card) => card.id === 'post_card_0001');
  assert.deepEqual(first?.tags, ['analytics']);
  assert.equal(first?.primaryTopic, 'data');
  assert.equal(first?.coverAsset?.public_r2_key, 'public/cover.jpg');
  const unclassified = cards.find((card) => card.id === 'post_card_0002');
  assert.equal(unclassified?.coverAsset, null);
  assert.equal(unclassified?.primaryTopic, null, 'older posts stay visible under Everything without receiving a topic');
});
