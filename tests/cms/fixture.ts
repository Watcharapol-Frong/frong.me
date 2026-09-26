import { createCmsDatabase } from '../../src/server/cms/db.ts';
import { SqliteD1Binding } from './d1-test-adapter.ts';

export function createCmsDbFixture() {
  const binding = new SqliteD1Binding();
  binding.migrate(
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
  return { binding, db: createCmsDatabase(binding) };
}
