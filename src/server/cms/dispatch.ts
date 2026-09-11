import type { ReleaseDispatchPayload } from '../../lib/cms/contracts.ts';
import type { CmsApiEnvironment } from './api.ts';
import type { CmsDatabase } from './db.ts';
import { CmsInvariantError } from './errors.ts';
import {
  getRelease,
  startReleaseAttempt,
  transitionRelease,
  transitionReleaseAttempt,
} from './repositories/releases.ts';

const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export async function dispatchRelease(
  db: CmsDatabase,
  releaseId: string,
  attempt: { attemptId: string; attemptNumber: number },
  env: CmsApiEnvironment,
  fetcher: typeof fetch = fetch,
) {
  const token = env.GITHUB_DISPATCH_TOKEN?.trim();
  const repository = env.GITHUB_REPO?.trim();
  if (!token || !repository || !REPOSITORY_PATTERN.test(repository)) {
    throw new CmsInvariantError('Repository dispatch is not configured');
  }

  const release = await getRelease(db, releaseId);
  const releaseAttempt = await startReleaseAttempt(db, {
    id: attempt.attemptId,
    releaseId,
    attemptNumber: attempt.attemptNumber,
  });
  const payload: ReleaseDispatchPayload = {
    releaseId: release.id,
    manifestSha256: release.manifest_sha256,
  };

  let response: Response;
  try {
    response = await fetcher(`https://api.github.com/repos/${repository}/dispatches`, {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'user-agent': 'frong-me-cms',
        'x-github-api-version': '2026-03-10',
      },
      body: JSON.stringify({
        event_type: 'cms-staging-release',
        client_payload: {
          release_id: payload.releaseId,
          manifest_sha256: payload.manifestSha256,
        },
      }),
    });
  } catch (error) {
    await transitionRelease(db, releaseId, 'queued', 'reconciling');
    await transitionReleaseAttempt(db, releaseAttempt.id, 'dispatching', 'failed', {
      errorMessage: 'Repository dispatch outcome is uncertain',
    });
    throw new CmsInvariantError('Repository dispatch outcome is uncertain', { cause: error });
  }

  if (response.status !== 204) {
    await transitionReleaseAttempt(db, releaseAttempt.id, 'dispatching', 'failed', {
      errorMessage: `Repository dispatch returned HTTP ${response.status}`,
    });
    await transitionRelease(db, releaseId, 'queued', 'failed', {
      errorCode: 'REPOSITORY_DISPATCH_FAILED',
      errorMessage: `Repository dispatch returned HTTP ${response.status}`,
    });
    throw new CmsInvariantError('Repository dispatch was rejected');
  }

  const buildingAttempt = await transitionReleaseAttempt(
    db,
    releaseAttempt.id,
    'dispatching',
    'building',
  );
  const buildingRelease = await transitionRelease(db, releaseId, 'queued', 'building');
  return { release: buildingRelease, attempt: buildingAttempt };
}
