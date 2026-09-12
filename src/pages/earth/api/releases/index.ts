import type { APIRoute } from 'astro';

import { parseBeginReleaseInput, parseReleaseManifest } from '../../../../lib/cms/validation.ts';
import {
  resolveCmsDatabase,
  privateJson,
  readJsonRequest,
  releaseRowToSummary,
} from '../../../../server/cms/api.ts';
import { cmsErrorResponse } from '../../../../server/cms/errors.ts';
import {
  beginRelease,
  countVisibleReleaseItems,
  getActiveRelease,
  getRelease,
  getSiteState,
  listReleases,
} from '../../../../server/cms/repositories/releases.ts';
import { listPostDrafts } from '../../../../server/cms/repositories/posts.ts';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  try {
    const db = await resolveCmsDatabase(locals);
    const [state, activeRelease, releases, posts] = await Promise.all([
      getSiteState(db),
      getActiveRelease(db),
      listReleases(db),
      listPostDrafts(db, { limit: 200 }),
    ]);
    const counts = await countVisibleReleaseItems(db, releases.map((release) => release.id));
    const liveRelease = state.live_release_id ? await getRelease(db, state.live_release_id) : null;
    const liveManifest = liveRelease
      ? parseReleaseManifest(JSON.parse(liveRelease.manifest_json) as unknown)
      : null;
    const visibleLive = liveManifest?.articles.filter((article) => article.visible) ?? [];
    const revisionIds = visibleLive.map((article) => article.revisionId);
    const revisions = revisionIds.length === 0
      ? []
      : await db.all<{ id: string; source_draft_version: number }>(
          `SELECT id, source_draft_version FROM post_revisions
           WHERE id IN (${revisionIds.map((_, index) => `?${index + 1}`).join(', ')})`,
          revisionIds,
        );
    const versionByRevision = new Map(
      revisions.map((revision) => [revision.id, revision.source_draft_version]),
    );
    const liveByPost = new Map(visibleLive.map((article) => [article.postId, article]));
    const postById = new Map(posts.map((post) => [post.id, post]));
    const entries: Array<{
      postId: string;
      lang: 'th' | 'en';
      slug: string;
      title: string;
      change: 'added' | 'updated' | 'removed';
    }> = [];
    for (const post of posts) {
      const live = liveByPost.get(post.id);
      if (post.lifecycle === 'archived') {
        if (live) entries.push({
          postId: post.id, lang: live.lang, slug: live.slug, title: post.title, change: 'removed',
        });
        continue;
      }
      if (!live) {
        entries.push({
          postId: post.id, lang: post.lang, slug: post.slug, title: post.title, change: 'added',
        });
        continue;
      }
      if (
        versionByRevision.get(live.revisionId) !== post.draft_version
        || live.lang !== post.lang
        || live.slug !== post.slug
      ) {
        entries.push({
          postId: post.id, lang: post.lang, slug: post.slug, title: post.title, change: 'updated',
        });
      }
    }
    for (const live of visibleLive) {
      if (!postById.has(live.postId)) {
        entries.push({
          postId: live.postId,
          lang: live.lang,
          slug: live.slug,
          title: live.slug,
          change: 'removed',
        });
      }
    }
    const changedLiveIds = new Set(
      entries.filter((entry) => entry.change !== 'added').map((entry) => entry.postId),
    );
    return privateJson({
      liveReleaseId: state.live_release_id,
      liveManifest,
      activeRelease: activeRelease
        ? releaseRowToSummary(activeRelease, counts.get(activeRelease.id) ?? 0)
        : null,
      releases: releases.map((release) =>
        releaseRowToSummary(release, counts.get(release.id) ?? 0)),
      pendingDiff: {
        baseReleaseId: state.live_release_id,
        entries,
        unchangedCount: visibleLive.filter((article) => !changedLiveIds.has(article.postId)).length,
      },
    });
  } catch (error) {
    return cmsErrorResponse(error);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const input = parseBeginReleaseInput(await readJsonRequest(request));
    const release = await beginRelease(await resolveCmsDatabase(locals), input);
    return privateJson(
      releaseRowToSummary(release, input.manifest.articles.filter((item) => item.visible).length),
      201,
    );
  } catch (error) {
    return cmsErrorResponse(error);
  }
};
