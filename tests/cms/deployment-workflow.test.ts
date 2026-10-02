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
  assert.doesNotMatch(workflow, /migrations apply|db\/seeds|--env staging/);
});
