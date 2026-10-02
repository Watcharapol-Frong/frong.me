import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/cms-ci.yml', 'utf8');
const [verification, deployment] = workflow.split('\n  deploy:\n');

test('only main changes can reach production after verification', () => {
  assert.deepEqual(readdirSync('.github/workflows').filter((file) => /\.ya?ml$/.test(file)), ['cms-ci.yml']);
  assert.equal((verification.match(/branches: \[main\]/g) ?? []).length, 2);
  assert.match(deployment, /needs: cms-ci/);
  assert.match(deployment, /if: github\.ref == 'refs\/heads\/main' && github\.event_name != 'pull_request'/);
  assert.match(deployment, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(deployment, /environment: production/);
  assert.doesNotMatch(verification, /secrets\.|CLOUDFLARE_API_TOKEN/);
});

test('production keeps binding safeguards and never migrates or seeds automatically', () => {
  assert.match(verification, /npm run test:cms/);
  assert.match(verification, /npx tsc --noEmit/);
  assert.match(verification, /npm run build/);
  assert.match(deployment, /verify-bindings\.mjs --env production/);
  assert.match(deployment, /CLOUDFLARE_VITE_FORCE_LOCAL=true CLOUDFLARE_ENV=production npm run build/);
  assert.match(deployment, /wrangler deploy --env production/);
  assert.match(deployment, /verify-search\.mjs/);
  assert.match(deployment, /cancel-in-progress: false/);
  assert.doesNotMatch(workflow, /migrations apply|db\/seeds|--env local/);
});

test('local bindings do not reference retired or production storage', () => {
  const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
  assert.deepEqual(Object.keys(config.env), ['production']);
  assert.equal(config.name, 'frong-me-local');
  assert.equal(config.d1_databases[0].database_id, '00000000-0000-0000-0000-000000000000');
  assert.equal(config.d1_databases[0].database_name, 'portfolio-db-local');
  assert.equal(config.r2_buckets[0].bucket_name, 'portfolio-media-local');
  assert.equal(config.env.production.name, 'frong-me');
  assert.equal(config.env.production.d1_databases[0].database_id, 'e8442532-a929-40d5-8ff4-c05510fad616');
  assert.equal(config.env.production.r2_buckets[0].bucket_name, 'portfolio-media-prod');
  const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
  assert.equal(scripts['deploy:local'], undefined);
  assert.equal(scripts['deploy:local:dry'], undefined);
});

test('maintained commands and fixture paths use their current names', () => {
  const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
  assert.equal(scripts['verify:access'], 'node scripts/build/verify-access.mjs');
  assert.equal(scripts['verify:access:dry'], 'node scripts/build/verify-access.mjs --dry-run');
  assert.equal(scripts['verify:r2:dry'], 'node scripts/db/verify-r2.mjs --dry-run');
  for (const file of ['scripts/build/verify-access.mjs', 'scripts/db/verify-r2.mjs',
    'scripts/db/verify-database.mjs', 'db/seeds/local.sql']) {
    assert.ok(readFileSync(file, 'utf8').length > 0, `${file} must exist`);
  }
});
