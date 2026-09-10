const ACTIVE = new Set(['queued', 'building', 'deploying', 'reconciling']);

export function beginRelease(state, releaseId, manifestSha256) {
  if (state.pending?.releaseId === releaseId) return state;
  if (state.pending && ACTIVE.has(state.pending.status)) throw new Error('release_busy');
  return {
    ...state,
    pending: {
      releaseId,
      manifestSha256,
      status: 'queued',
      attempts: 0,
      workflowRunId: null,
      providerDeploymentId: null,
    },
  };
}

export function transition(state, releaseId, event) {
  const pending = state.pending;
  if (!pending || pending.releaseId !== releaseId) return state;

  switch (event.type) {
    case 'dispatch_accepted':
      if (pending.status !== 'queued') return state;
      return { ...state, pending: { ...pending, status: 'building', attempts: pending.attempts + 1 } };
    case 'dispatch_timeout':
      if (!['queued', 'building'].includes(pending.status)) return state;
      return { ...state, pending: { ...pending, status: 'reconciling' } };
    case 'retry':
      if (pending.status !== 'failed') return state;
      return { ...state, pending: { ...pending, status: 'queued' } };
    case 'build_succeeded':
      if (pending.status !== 'building') return state;
      return {
        ...state,
        pending: { ...pending, status: 'deploying', workflowRunId: event.workflowRunId },
      };
    case 'build_failed':
      if (pending.status !== 'building') return state;
      return { ...state, pending: { ...pending, status: 'failed' } };
    case 'deployment_failed':
      if (pending.status !== 'deploying') return state;
      return { ...state, pending: { ...pending, status: 'failed' } };
    case 'confirmation_timeout':
      if (pending.status !== 'deploying') return state;
      return { ...state, pending: { ...pending, status: 'reconciling' } };
    case 'reconcile_not_found':
      if (pending.status !== 'reconciling') return state;
      return { ...state, pending: { ...pending, status: 'queued' } };
    case 'reconcile_deployed':
      if (pending.status !== 'reconciling' || !event.providerDeploymentId) return state;
      return {
        live: {
          releaseId: pending.releaseId,
          manifestSha256: pending.manifestSha256,
          providerDeploymentId: event.providerDeploymentId,
        },
        pending: { ...pending, status: 'live', providerDeploymentId: event.providerDeploymentId },
      };
    case 'deployment_confirmed':
      if (pending.status !== 'deploying' || !event.providerDeploymentId) return state;
      return {
        live: {
          releaseId: pending.releaseId,
          manifestSha256: pending.manifestSha256,
          providerDeploymentId: event.providerDeploymentId,
        },
        pending: { ...pending, status: 'live', providerDeploymentId: event.providerDeploymentId },
      };
    default:
      throw new Error(`unknown_event:${event.type}`);
  }
}
