import { createCmsDatabase } from '../../src/server/cms/db.ts';
import { SqliteD1Binding } from './d1-test-adapter.ts';

export function createCmsDbFixture() {
  const binding = new SqliteD1Binding();
  binding.migrate(
    'db/migrations/0001_articles.sql',
    'db/migrations/0002_taxonomy_assets.sql',
    'db/migrations/0003_releases.sql',
  );
  return { binding, db: createCmsDatabase(binding) };
}
