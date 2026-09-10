import assert from 'node:assert/strict';
import test from 'node:test';
import { beginRelease, transition } from '../scripts/release-state.mjs';

const oldLive = {
  live: { releaseId: 'rel_20260909_old0001', manifestSha256: '0'.repeat(64), providerDeploymentId: 'cf-old' },
  pending: null,
};

test('a failed build preserves the live deployment', () => {
  let state = beginRelease(oldLive, 'rel_20260910_spike001', 'a'.repeat(64));
  state = transition(state, state.pending.releaseId, { type: 'dispatch_accepted' });
  state = transition(state, state.pending.releaseId, { type: 'build_failed' });
  assert.deepEqual(state.live, oldLive.live);
  assert.equal(state.pending.status, 'failed');
});

test('dispatch timeout requires reconciliation before retrying the same release', () => {
  const releaseId = 'rel_20260910_spike001';
  let state = beginRelease(oldLive, releaseId, 'a'.repeat(64));
  state = transition(state, releaseId, { type: 'dispatch_timeout' });
  assert.equal(state.pending.status, 'reconciling');
  assert.deepEqual(state.live, oldLive.live);
  assert.equal(transition(state, releaseId, { type: 'retry' }), state);
  state = transition(state, releaseId, { type: 'reconcile_not_found' });
  state = transition(state, releaseId, { type: 'dispatch_accepted' });
  state = transition(state, releaseId, { type: 'build_succeeded', workflowRunId: 'run-1' });
  assert.deepEqual(state.live, oldLive.live);
  state = transition(state, releaseId, { type: 'deployment_confirmed', providerDeploymentId: 'cf-new' });
  assert.equal(state.live.releaseId, releaseId);
  assert.equal(state.live.providerDeploymentId, 'cf-new');
});

test('missing deployment callback reconciles provider state before changing live', () => {
  const releaseId = 'rel_20260910_spike001';
  let state = beginRelease(oldLive, releaseId, 'a'.repeat(64));
  state = transition(state, releaseId, { type: 'dispatch_accepted' });
  state = transition(state, releaseId, { type: 'build_succeeded', workflowRunId: 'run-2' });
  state = transition(state, releaseId, { type: 'confirmation_timeout' });
  assert.equal(state.pending.status, 'reconciling');
  assert.deepEqual(state.live, oldLive.live);
  state = transition(state, releaseId, { type: 'reconcile_deployed', providerDeploymentId: 'cf-reconciled' });
  assert.equal(state.live.releaseId, releaseId);
  assert.equal(state.live.providerDeploymentId, 'cf-reconciled');
});

test('repeat publish and stale callbacks are idempotent', () => {
  const releaseId = 'rel_20260910_spike001';
  const initial = beginRelease(oldLive, releaseId, 'a'.repeat(64));
  assert.equal(beginRelease(initial, releaseId, 'a'.repeat(64)), initial);
  assert.throws(() => beginRelease(initial, 'rel_20260910_other001', 'b'.repeat(64)), /release_busy/);
  assert.equal(transition(initial, 'rel_stale_00000001', { type: 'build_failed' }), initial);
});
