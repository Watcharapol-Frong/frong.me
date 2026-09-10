import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const RELEASE_ID_PATTERN = /^rel_[A-Za-z0-9_-]{8,80}$/;
const RELEASE_QUERY = `SELECT release_id, manifest_json, manifest_sha256
FROM cms_releases
WHERE release_id = ? AND status IN ('ready', 'live')
LIMIT 1`;

function requireValue(value, name) {
  if (!value?.trim()) throw new Error(`Missing ${name}`);
  return value.trim();
}

export function validatePublicSnapshot(snapshot, requestedReleaseId) {
  if (!snapshot || snapshot.release_id !== requestedReleaseId || !Array.isArray(snapshot.articles)) {
    throw new Error('D1 returned an invalid release manifest');
  }
  const forbiddenKeys = new Set([
    'draft',
    'draft_id',
    'internal_notes',
    'provider_key',
    'secret',
    'token',
  ]);
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenKeys.has(key.toLowerCase())) {
        throw new Error(`Public snapshot contains forbidden key: ${key}`);
      }
      visit(child);
    }
  };
  visit(snapshot);
  return snapshot;
}

export async function fetchRelease(options, fetchImpl = fetch) {
  const accountId = requireValue(options.accountId, 'CF_ACCOUNT_ID');
  const databaseId = requireValue(options.databaseId, 'CF_D1_DATABASE_ID');
  const apiToken = requireValue(options.apiToken, 'CF_D1_READ_TOKEN');
  const releaseId = requireValue(options.releaseId, 'CMS_RELEASE_ID');
  if (!RELEASE_ID_PATTERN.test(releaseId)) throw new Error('Invalid CMS_RELEASE_ID');

  const apiBaseUrl = (options.apiBaseUrl || 'https://api.cloudflare.com/client/v4').replace(/\/$/, '');
  const response = await fetchImpl(
    `${apiBaseUrl}/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/query`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ sql: RELEASE_QUERY, params: [releaseId] }),
    },
  );
  if (!response.ok) throw new Error(`D1 HTTP API returned ${response.status}`);

  const body = await response.json();
  const queryResult = body?.result?.[0];
  if (body?.success !== true || queryResult?.success !== true) {
    throw new Error('D1 HTTP API query failed');
  }
  const row = queryResult.results?.[0];
  if (!row) throw new Error(`Release not found: ${releaseId}`);

  let snapshot;
  try {
    snapshot = JSON.parse(row.manifest_json);
  } catch {
    throw new Error('D1 returned malformed manifest JSON');
  }
  return {
    snapshot: validatePublicSnapshot(snapshot, releaseId),
    manifestSha256: row.manifest_sha256,
  };
}

async function main() {
  const { snapshot, manifestSha256 } = await fetchRelease({
    accountId: process.env.CF_ACCOUNT_ID,
    databaseId: process.env.CF_D1_DATABASE_ID,
    apiToken: process.env.CF_D1_READ_TOKEN,
    releaseId: process.env.CMS_RELEASE_ID,
    apiBaseUrl: process.env.CF_D1_API_BASE_URL,
  });
  if (
    process.env.CMS_MANIFEST_SHA256 &&
    process.env.CMS_MANIFEST_SHA256 !== manifestSha256
  ) {
    throw new Error('Release manifest hash does not match dispatch payload');
  }
  const output = process.env.CMS_SNAPSHOT_PATH || new URL('../src/data/release.json', import.meta.url);
  const outputUrl = output instanceof URL ? output : pathToFileURL(output);
  await mkdir(new URL('.', outputUrl), { recursive: true });
  await writeFile(outputUrl, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
  console.log(`Fetched public snapshot for ${snapshot.release_id}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
