import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const RELEASE_ID_PATTERN = /^rel_[A-Za-z0-9_-]{8,80}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export function validateDispatch(value) {
  const eventType = value?.event_type ?? value?.action;
  const payload = value?.client_payload;
  if (eventType !== 'cms-staging-release') throw new Error('Unexpected event_type');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('client_payload must be an object');
  }
  const keys = Object.keys(payload).sort();
  if (keys.join(',') !== 'manifest_sha256,release_id') {
    throw new Error('client_payload must contain only release_id and manifest_sha256');
  }
  if (!RELEASE_ID_PATTERN.test(payload.release_id)) throw new Error('Invalid release_id');
  if (!SHA256_PATTERN.test(payload.manifest_sha256)) {
    throw new Error('Invalid manifest_sha256');
  }
  return payload;
}

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error('Usage: node scripts/validate-dispatch.mjs <event.json>');
  const value = JSON.parse(await readFile(path, 'utf8'));
  const payload = validateDispatch(value);
  console.log(`Valid dispatch payload for ${payload.release_id}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
