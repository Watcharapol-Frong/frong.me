import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDispatch } from '../scripts/validate-dispatch.mjs';

const valid = {
  event_type: 'cms-staging-release',
  client_payload: {
    release_id: 'rel_20260910_spike001',
    manifest_sha256: 'a'.repeat(64),
  },
};

test('accepts the minimal non-secret repository dispatch contract', () => {
  assert.deepEqual(validateDispatch(valid), valid.client_payload);
});

test('rejects extra payload fields, malformed identifiers, and wrong event type', () => {
  assert.throws(() => validateDispatch({ ...valid, event_type: 'other' }), /event_type/);
  assert.throws(() => validateDispatch({ ...valid, client_payload: { ...valid.client_payload, token: 'secret' } }), /only/);
  assert.throws(() => validateDispatch({ ...valid, client_payload: { ...valid.client_payload, release_id: '../bad' } }), /release_id/);
});
