import {
  CMS_SCHEMA_VERSION,
  type PostRevision,
  type PostRevisionAssetRow,
  type PublicArticle,
  type PublicAsset,
  type ReleaseAttemptRow,
  type ReleaseAttemptStatus,
  type ReleaseManifest,
  type ReleaseRow,
  type ReleaseSnapshot,
  type ReleaseStatus,
  type SiteStateRow,
} from '../../../lib/cms/contracts.ts';
import {
  parseBeginReleaseInput,
  parseCreateReleaseInput,
  parseReleaseManifest,
  parseReleaseSnapshot,
} from '../../../lib/cms/validation.ts';
import { type CmsDatabase, requireChanged } from '../db.ts';
import {
  CmsBadRequestError,
  CmsConflictError,
  CmsInvariantError,
  CmsNotFoundError,
  CmsStateTransitionError,
} from '../errors.ts';

const RELEASE_COLUMNS = `
  id, schema_version, status, trigger_kind, trigger_post_id, base_release_id,
  idempotency_key, manifest_json, manifest_sha256, code_commit, error_code,
  error_message, created_at, updated_at, finished_at
`;

const REVISION_COLUMNS = `
  id, post_id, source_draft_version, lang, translation_group_id, slug,
  title, excerpt, body_markdown, categories_json, tags_json, sources_json,
  published_at, created_at
`;

export interface CreateRevisionSnapshotInput {
  revisionId: string;
  postId: string;
  expectedDraftVersion: number;
  publishedAt: number;
  createdAt?: number;
}

export interface TransitionReleaseOptions {
  errorCode?: string | null;
  errorMessage?: string | null;
  now?: number;
}

export interface StartReleaseAttemptInput {
  id: string;
  releaseId: string;
  attemptNumber: number;
  now?: number;
}

export interface ConfirmLiveReleaseInput {
  releaseId: string;
  attemptId: string;
  providerDeploymentId: string;
  now?: number;
}

const RELEASE_TRANSITIONS: Readonly<Record<ReleaseStatus, readonly ReleaseStatus[]>> = {
  queued: ['building', 'reconciling', 'failed'],
  building: ['deploying', 'reconciling', 'failed'],
  deploying: ['live', 'reconciling', 'failed'],
  reconciling: ['queued', 'live', 'failed'],
  failed: ['queued'],
  live: [],
};

const ATTEMPT_TRANSITIONS: Readonly<Record<ReleaseAttemptStatus, readonly ReleaseAttemptStatus[]>> = {
  dispatching: ['building', 'failed'],
  building: ['deploying', 'failed'],
  deploying: ['confirmed', 'failed'],
  confirmed: [],
  failed: [],
};

export async function createRevisionSnapshot(
  db: CmsDatabase,
  input: CreateRevisionSnapshotInput,
): Promise<PostRevision> {
  validateSnapshotInput(input);
  const createdAt = input.createdAt ?? Date.now();
  const results = await db.batch([
    {
      sql: `INSERT INTO post_revisions (
              id, post_id, source_draft_version, lang, translation_group_id,
              slug, title, excerpt, body_markdown, categories_json, tags_json,
              sources_json, published_at, created_at
            )
            SELECT
              ?1,
              post.id,
              post.draft_version,
              post.lang,
              post.translation_group_id,
              post.slug,
              post.title,
              post.excerpt,
              post.body_markdown,
              COALESCE((
                SELECT json_group_array(json(snapshot))
                FROM (
                  SELECT json_object('id', category.id, 'slug', category.slug, 'name', category.name) AS snapshot
                  FROM post_categories AS relation
                  JOIN categories AS category ON category.id = relation.category_id
                  WHERE relation.post_id = post.id
                  ORDER BY relation.position ASC, category.id ASC
                )
              ), '[]'),
              COALESCE((
                SELECT json_group_array(json(snapshot))
                FROM (
                  SELECT json_object('id', tag.id, 'slug', tag.slug, 'name', tag.name) AS snapshot
                  FROM post_tags AS relation
                  JOIN tags AS tag ON tag.id = relation.tag_id
                  WHERE relation.post_id = post.id
                  ORDER BY relation.position ASC, tag.id ASC
                )
              ), '[]'),
              COALESCE((
                SELECT json_group_array(json(snapshot))
                FROM (
                  SELECT json_patch(
                    json_object('label', source.label, 'url', source.url),
                    json_patch(
                      CASE
                        WHEN source.publisher IS NULL THEN json('{}')
                        ELSE json_object('publisher', source.publisher)
                      END,
                      CASE
                        WHEN source.accessed_at IS NULL THEN json('{}')
                        ELSE json_object(
                          'accessedAt',
                          strftime('%Y-%m-%dT%H:%M:%fZ', source.accessed_at / 1000.0, 'unixepoch')
                        )
                      END
                    )
                  ) AS snapshot
                  FROM post_sources AS source
                  WHERE source.post_id = post.id
                  ORDER BY source.position ASC, source.id ASC
                )
              ), '[]'),
              ?4,
              ?5
            FROM posts AS post
            WHERE post.id = ?2
              AND post.draft_version = ?3
              AND post.lifecycle <> 'archived'`,
      params: [
        input.revisionId,
        input.postId,
        input.expectedDraftVersion,
        input.publishedAt,
        createdAt,
      ],
    },
    {
      sql: `INSERT INTO post_revision_assets (
              revision_id, usage_id, asset_id, role, public_r2_key, mime_type,
              width, height, byte_size, sha256, alt_text, caption, crop_json, position
            )
            SELECT
              revision.id,
              usage.id,
              asset.id,
              usage.role,
              asset.public_r2_key,
              asset.mime_type,
              asset.width,
              asset.height,
              asset.byte_size,
              asset.sha256,
              usage.alt_text,
              usage.caption,
              usage.crop_json,
              usage.position
            FROM post_asset_usages AS usage
            JOIN assets AS asset ON asset.id = usage.asset_id
            JOIN post_revisions AS revision
              ON revision.id = ?1 AND revision.post_id = usage.post_id
            WHERE usage.post_id = ?2
              AND asset.lifecycle = 'public'
              AND asset.public_r2_key IS NOT NULL
            ORDER BY CASE usage.role WHEN 'cover' THEN 0 ELSE 1 END,
                     usage.position ASC,
                     usage.id ASC`,
      params: [input.revisionId, input.postId],
    },
  ]);
  requireChanged(
    results[0],
    'The post draft changed before its revision could be created',
    'DRAFT_VERSION_CONFLICT',
  );
  return getPostRevision(db, input.revisionId);
}

export async function getPostRevision(
  db: CmsDatabase,
  revisionId: string,
): Promise<PostRevision> {
  const revision = await db.first<PostRevision>(
    `SELECT ${REVISION_COLUMNS}
     FROM post_revisions
     WHERE id = ?1
     LIMIT 1`,
    [revisionId],
  );
  if (!revision) throw new CmsNotFoundError('Post revision', revisionId);
  return revision;
}

export async function canonicalReleaseManifest(
  manifest: unknown,
): Promise<{ manifest: ReleaseManifest; json: string; sha256: string }> {
  const parsed = parseReleaseManifest(manifest);
  const canonical: ReleaseManifest = {
    schemaVersion: CMS_SCHEMA_VERSION,
    releaseId: parsed.releaseId,
    generatedAt: parsed.generatedAt,
    articles: [...parsed.articles].sort((left, right) =>
      left.postId < right.postId ? -1 : left.postId > right.postId ? 1 : 0,
    ),
  };
  const json = JSON.stringify(canonical);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return { manifest: canonical, json, sha256 };
}

export async function createRelease(
  db: CmsDatabase,
  value: unknown,
  now = Date.now(),
): Promise<ReleaseRow> {
  const input = parseCreateReleaseInput(value);
  const canonical = await canonicalReleaseManifest(input.manifest);
  if (canonical.sha256 !== input.manifestSha256) {
    throw new CmsBadRequestError('Release manifest SHA-256 does not match its canonical payload');
  }

  const existing = await findReleaseByIdempotencyKey(db, input.idempotencyKey);
  if (existing) return requireIdempotentRelease(existing, input.id, canonical.sha256);
  await validateReleaseDelta(db, input, canonical.manifest);

  const statements = [
    {
      sql: `INSERT INTO releases (
              id, schema_version, status, trigger_kind, trigger_post_id,
              base_release_id, idempotency_key, manifest_json, manifest_sha256,
              code_commit, created_at, updated_at
            ) VALUES (?1, 1, 'queued', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)`,
      params: [
        input.id,
        input.triggerKind,
        input.triggerPostId ?? null,
        input.baseReleaseId ?? null,
        input.idempotencyKey,
        canonical.json,
        canonical.sha256,
        input.codeCommit ?? null,
        now,
      ],
    },
    ...canonical.manifest.articles.map((article) => ({
      sql: `INSERT INTO release_items (
              release_id, post_id, revision_id, lang, slug, visible
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
      params: [
        input.id,
        article.postId,
        article.revisionId,
        article.lang,
        article.slug,
        article.visible ? 1 : 0,
      ],
    })),
  ];

  try {
    await db.batch(statements);
  } catch (error) {
    const raced = await findReleaseByIdempotencyKey(db, input.idempotencyKey);
    if (raced) return requireIdempotentRelease(raced, input.id, canonical.sha256);
    throw error;
  }
  return getRelease(db, input.id);
}

/**
 * API-facing release composition. A retry whose release already exists skips
 * revision creation and is checked by createRelease's idempotency contract.
 */
export async function beginRelease(
  db: CmsDatabase,
  value: unknown,
  now = Date.now(),
): Promise<ReleaseRow> {
  const input = parseBeginReleaseInput(value);
  const { revisionSnapshot, ...releaseInput } = input;
  if (revisionSnapshot) {
    let releaseAlreadyExists = false;
    try {
      await getRelease(db, input.id);
      releaseAlreadyExists = true;
    } catch (error) {
      if (!(error instanceof CmsNotFoundError)) throw error;
    }
    if (!releaseAlreadyExists) {
      await createRevisionSnapshot(db, {
        ...revisionSnapshot,
        createdAt: now,
      });
    }
  }
  return createRelease(db, releaseInput, now);
}

export async function getRelease(db: CmsDatabase, releaseId: string): Promise<ReleaseRow> {
  const release = await db.first<ReleaseRow>(
    `SELECT ${RELEASE_COLUMNS} FROM releases WHERE id = ?1 LIMIT 1`,
    [releaseId],
  );
  if (!release) throw new CmsNotFoundError('Release', releaseId);
  return release;
}

export async function getActiveRelease(db: CmsDatabase): Promise<ReleaseRow | null> {
  return db.first<ReleaseRow>(
    `SELECT ${RELEASE_COLUMNS}
     FROM releases
     WHERE status IN ('queued', 'building', 'deploying', 'reconciling')
     LIMIT 1`,
  );
}

export async function listReleases(db: CmsDatabase, limit = 20): Promise<ReleaseRow[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  return db.all<ReleaseRow>(
    `SELECT ${RELEASE_COLUMNS}
     FROM releases
     ORDER BY created_at DESC, id ASC
     LIMIT ?1`,
    [safeLimit],
  );
}

export async function countVisibleReleaseItems(
  db: CmsDatabase,
  releaseIds: readonly string[],
): Promise<Map<string, number>> {
  if (releaseIds.length === 0) return new Map();
  const placeholders = releaseIds.map((_, index) => `?${index + 1}`).join(', ');
  const rows = await db.all<{ release_id: string; item_count: number }>(
    `SELECT release_id, COUNT(*) AS item_count
     FROM release_items
     WHERE visible = 1 AND release_id IN (${placeholders})
     GROUP BY release_id`,
    releaseIds,
  );
  return new Map(rows.map((row) => [row.release_id, row.item_count]));
}

export async function transitionRelease(
  db: CmsDatabase,
  releaseId: string,
  expectedStatus: ReleaseStatus,
  nextStatus: Exclude<ReleaseStatus, 'live'>,
  options: TransitionReleaseOptions = {},
): Promise<ReleaseRow> {
  if ((nextStatus as ReleaseStatus) === 'live') {
    throw new CmsStateTransitionError('Use confirmReleaseLive to transition a release to live');
  }
  if (!RELEASE_TRANSITIONS[expectedStatus].includes(nextStatus)) {
    throw new CmsStateTransitionError(`Release cannot transition from ${expectedStatus} to ${nextStatus}`);
  }
  const now = options.now ?? Date.now();
  const terminal = nextStatus === 'failed' ? now : null;
  const results = await db.batch<ReleaseRow>([
    {
      sql: `UPDATE releases
            SET status = ?1,
                error_code = ?2,
                error_message = ?3,
                updated_at = ?4,
                finished_at = ?5
            WHERE id = ?6 AND status = ?7
            RETURNING ${RELEASE_COLUMNS}`,
      params: [
        nextStatus,
        options.errorCode ?? null,
        options.errorMessage ?? null,
        now,
        terminal,
        releaseId,
        expectedStatus,
      ],
    },
  ]);
  if ((results[0].meta.changes ?? 0) === 0) {
    const current = await getRelease(db, releaseId);
    if (current.status === nextStatus) return current;
    throw new CmsStateTransitionError(
      `Release ${releaseId} is ${current.status}, expected ${expectedStatus}`,
    );
  }
  return requiredRelease(results[0].results[0], releaseId);
}

export async function startReleaseAttempt(
  db: CmsDatabase,
  input: StartReleaseAttemptInput,
): Promise<ReleaseAttemptRow> {
  if (!Number.isSafeInteger(input.attemptNumber) || input.attemptNumber < 1) {
    throw new CmsBadRequestError('Attempt number must be a positive integer');
  }
  const now = input.now ?? Date.now();
  const results = await db.batch<ReleaseAttemptRow>([
    {
      sql: `INSERT INTO release_attempts (
              id, release_id, attempt_number, status, started_at
            )
            SELECT ?1, id, ?3, 'dispatching', ?4
            FROM releases
            WHERE id = ?2
              AND status IN ('queued', 'building', 'deploying', 'reconciling')
            RETURNING *`,
      params: [input.id, input.releaseId, input.attemptNumber, now],
    },
  ]);
  requireChanged(results[0], 'Release is not active and cannot start an attempt');
  return requiredAttempt(results[0].results[0], input.id);
}

export async function transitionReleaseAttempt(
  db: CmsDatabase,
  attemptId: string,
  expectedStatus: ReleaseAttemptStatus,
  nextStatus: Exclude<ReleaseAttemptStatus, 'confirmed'>,
  options: {
    workflowRunId?: string | null;
    errorMessage?: string | null;
    now?: number;
  } = {},
): Promise<ReleaseAttemptRow> {
  if ((nextStatus as ReleaseAttemptStatus) === 'confirmed') {
    throw new CmsStateTransitionError('Use confirmReleaseLive to confirm a deployment attempt');
  }
  if (!ATTEMPT_TRANSITIONS[expectedStatus].includes(nextStatus)) {
    throw new CmsStateTransitionError(
      `Release attempt cannot transition from ${expectedStatus} to ${nextStatus}`,
    );
  }
  const now = options.now ?? Date.now();
  const results = await db.batch<ReleaseAttemptRow>([
    {
      sql: `UPDATE release_attempts
            SET status = ?1,
                workflow_run_id = COALESCE(?2, workflow_run_id),
                error_message = ?3,
                finished_at = CASE WHEN ?1 = 'failed' THEN ?4 ELSE NULL END
            WHERE id = ?5 AND status = ?6
            RETURNING *`,
      params: [
        nextStatus,
        options.workflowRunId ?? null,
        options.errorMessage ?? null,
        now,
        attemptId,
        expectedStatus,
      ],
    },
  ]);
  if ((results[0].meta.changes ?? 0) === 0) {
    const current = await getReleaseAttempt(db, attemptId);
    if (current.status === nextStatus) return current;
    throw new CmsStateTransitionError(
      `Release attempt ${attemptId} is ${current.status}, expected ${expectedStatus}`,
    );
  }
  return requiredAttempt(results[0].results[0], attemptId);
}

export async function confirmReleaseLive(
  db: CmsDatabase,
  input: ConfirmLiveReleaseInput,
): Promise<ReleaseRow> {
  if (!input.providerDeploymentId.trim()) {
    throw new CmsBadRequestError('Provider deployment id is required');
  }
  const now = input.now ?? Date.now();
  await db.batch([
    {
      sql: `UPDATE release_attempts
            SET status = 'confirmed',
                provider_deployment_id = ?1,
                finished_at = ?2
            WHERE id = ?3
              AND release_id = ?4
              AND status = 'deploying'
              AND (provider_deployment_id IS NULL OR provider_deployment_id = ?1)`,
      params: [
        input.providerDeploymentId,
        now,
        input.attemptId,
        input.releaseId,
      ],
    },
    {
      sql: `UPDATE releases
            SET status = 'live', updated_at = ?1, finished_at = ?1,
                error_code = NULL, error_message = NULL
            WHERE id = ?2
              AND status IN ('deploying', 'reconciling')
              AND EXISTS (
                SELECT 1 FROM release_attempts
                WHERE id = ?3
                  AND release_id = ?2
                  AND status = 'confirmed'
                  AND provider_deployment_id = ?4
              )`,
      params: [now, input.releaseId, input.attemptId, input.providerDeploymentId],
    },
    {
      sql: `UPDATE site_state
            SET live_release_id = ?1, updated_at = ?2
            WHERE id = 1
              AND live_release_id IS (
                SELECT base_release_id FROM releases
                WHERE id = ?1 AND status = 'live'
              )`,
      params: [input.releaseId, now],
    },
  ]);

  const [release, attempt, state] = await Promise.all([
    getRelease(db, input.releaseId),
    getReleaseAttempt(db, input.attemptId),
    getSiteState(db),
  ]);
  if (
    release.status !== 'live'
    || attempt.status !== 'confirmed'
    || attempt.provider_deployment_id !== input.providerDeploymentId
    || state.live_release_id !== input.releaseId
  ) {
    throw new CmsStateTransitionError('Release deployment confirmation did not advance the live pointer');
  }
  return release;
}

export async function getReleaseSnapshot(
  db: CmsDatabase,
  releaseId: string,
  publicAssetBaseUrl: string,
): Promise<ReleaseSnapshot> {
  const release = await getRelease(db, releaseId);
  let manifest: ReleaseManifest;
  try {
    manifest = parseReleaseManifest(JSON.parse(release.manifest_json));
  } catch (error) {
    throw new CmsInvariantError('Stored release manifest is invalid', { cause: error });
  }
  if (manifest.releaseId !== release.id) {
    throw new CmsInvariantError('Stored release manifest id does not match its release row');
  }

  // Deliberately read only immutable release/revision tables. Never add posts or
  // mutable draft relationship tables to this build-time query path.
  const revisions = await db.all<PostRevision>(
    `SELECT
       revision.id,
       revision.post_id,
       revision.source_draft_version,
       revision.lang,
       revision.translation_group_id,
       revision.slug,
       revision.title,
       revision.excerpt,
       revision.body_markdown,
       revision.categories_json,
       revision.tags_json,
       revision.sources_json,
       revision.published_at,
       revision.created_at
     FROM release_items AS item
     JOIN post_revisions AS revision ON revision.id = item.revision_id
     WHERE item.release_id = ?1 AND item.visible = 1
     ORDER BY revision.published_at DESC, revision.id ASC`,
    [releaseId],
  );
  const assetRows = await db.all<PostRevisionAssetRow & { revision_id: string }>(
    `SELECT asset.*
     FROM release_items AS item
     JOIN post_revision_assets AS asset ON asset.revision_id = item.revision_id
     WHERE item.release_id = ?1 AND item.visible = 1
     ORDER BY asset.revision_id ASC,
              CASE asset.role WHEN 'cover' THEN 0 ELSE 1 END,
              asset.position ASC,
              asset.usage_id ASC`,
    [releaseId],
  );
  const assetsByRevision = new Map<string, PublicAsset[]>();
  for (const asset of assetRows) {
    const publicAsset = revisionAssetToPublic(asset, publicAssetBaseUrl);
    const list = assetsByRevision.get(asset.revision_id) ?? [];
    list.push(publicAsset);
    assetsByRevision.set(asset.revision_id, list);
  }

  const articles: PublicArticle[] = revisions.map((revision) => ({
    id: revision.post_id,
    revisionId: revision.id,
    lang: revision.lang,
    ...(revision.translation_group_id
      ? { translationGroupId: revision.translation_group_id }
      : {}),
    slug: revision.slug,
    title: revision.title,
    ...(revision.excerpt ? { excerpt: revision.excerpt } : {}),
    bodyMarkdown: revision.body_markdown,
    categories: parseStoredArray(revision.categories_json, 'revision categories'),
    tags: parseStoredArray(revision.tags_json, 'revision tags'),
    sources: parseStoredArray(revision.sources_json, 'revision sources'),
    assets: assetsByRevision.get(revision.id) ?? [],
    publishedAt: new Date(revision.published_at).toISOString(),
  }));

  try {
    return parseReleaseSnapshot({ manifest, articles });
  } catch (error) {
    throw new CmsInvariantError('Stored release snapshot is invalid', { cause: error });
  }
}

export async function getLiveReleaseSnapshot(
  db: CmsDatabase,
  publicAssetBaseUrl: string,
): Promise<ReleaseSnapshot | null> {
  const state = await getSiteState(db);
  return state.live_release_id
    ? getReleaseSnapshot(db, state.live_release_id, publicAssetBaseUrl)
    : null;
}

export async function getSiteState(db: CmsDatabase): Promise<SiteStateRow> {
  const state = await db.first<SiteStateRow>(
    `SELECT id, live_release_id, updated_at FROM site_state WHERE id = 1 LIMIT 1`,
  );
  if (!state) throw new CmsInvariantError('CMS site_state singleton is missing');
  return state;
}

export async function getReleaseAttempt(
  db: CmsDatabase,
  attemptId: string,
): Promise<ReleaseAttemptRow> {
  const attempt = await db.first<ReleaseAttemptRow>(
    `SELECT * FROM release_attempts WHERE id = ?1 LIMIT 1`,
    [attemptId],
  );
  if (!attempt) throw new CmsNotFoundError('Release attempt', attemptId);
  return attempt;
}

async function findReleaseByIdempotencyKey(
  db: CmsDatabase,
  idempotencyKey: string,
): Promise<ReleaseRow | null> {
  return db.first<ReleaseRow>(
    `SELECT ${RELEASE_COLUMNS} FROM releases WHERE idempotency_key = ?1 LIMIT 1`,
    [idempotencyKey],
  );
}

async function validateReleaseDelta(
  db: CmsDatabase,
  input: ReturnType<typeof parseCreateReleaseInput>,
  manifest: ReleaseManifest,
): Promise<void> {
  const state = await getSiteState(db);
  if (state.live_release_id !== (input.baseReleaseId ?? null)) {
    throw new CmsConflictError('Release base does not match the current live release');
  }
  if (input.triggerKind === 'rollback') return;
  if (!input.triggerPostId) {
    throw new CmsBadRequestError(`${input.triggerKind} releases require a trigger post id`);
  }

  let baseArticles: ReleaseManifest['articles'] = [];
  if (input.baseReleaseId) {
    const baseRelease = await getRelease(db, input.baseReleaseId);
    try {
      baseArticles = parseReleaseManifest(JSON.parse(baseRelease.manifest_json)).articles;
    } catch (error) {
      throw new CmsInvariantError('Base release manifest is invalid', { cause: error });
    }
  }

  const baseByPost = new Map(baseArticles.map((article) => [article.postId, article]));
  const nextByPost = new Map(manifest.articles.map((article) => [article.postId, article]));
  const allPostIds = new Set([...baseByPost.keys(), ...nextByPost.keys()]);
  let triggerChanged = false;
  for (const postId of allPostIds) {
    const before = baseByPost.get(postId);
    const after = nextByPost.get(postId);
    const unchanged = manifestArticleEquals(before, after);
    if (postId === input.triggerPostId) {
      triggerChanged = !unchanged;
    } else if (!unchanged) {
      throw new CmsBadRequestError('A publish or withdrawal release may change only its trigger post');
    }
  }
  if (!triggerChanged) {
    throw new CmsBadRequestError('Release manifest does not change its trigger post');
  }

  const triggerArticle = nextByPost.get(input.triggerPostId);
  if (input.triggerKind === 'publish' && (!triggerArticle || !triggerArticle.visible)) {
    throw new CmsBadRequestError('Publish release must contain a visible trigger post revision');
  }
  if (input.triggerKind === 'withdraw' && triggerArticle?.visible) {
    throw new CmsBadRequestError('Withdrawal release cannot retain a visible trigger post');
  }
}

function manifestArticleEquals(
  left: ReleaseManifest['articles'][number] | undefined,
  right: ReleaseManifest['articles'][number] | undefined,
): boolean {
  if (!left || !right) return left === right;
  return left.postId === right.postId
    && left.revisionId === right.revisionId
    && left.lang === right.lang
    && left.slug === right.slug
    && left.visible === right.visible;
}

function requireIdempotentRelease(
  existing: ReleaseRow,
  expectedId: string,
  expectedHash: string,
): ReleaseRow {
  if (existing.id !== expectedId || existing.manifest_sha256 !== expectedHash) {
    throw new CmsConflictError('Idempotency key was already used for a different release');
  }
  return existing;
}

function revisionAssetToPublic(
  asset: PostRevisionAssetRow,
  baseUrl: string,
): PublicAsset {
  const base = validatePublicAssetBaseUrl(baseUrl);
  const encodedKey = asset.public_r2_key
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  let crop: PublicAsset['crop'];
  if (asset.crop_json) {
    try {
      crop = JSON.parse(asset.crop_json) as PublicAsset['crop'];
    } catch (error) {
      throw new CmsInvariantError('Stored revision asset crop is invalid', { cause: error });
    }
  }
  return {
    usageId: asset.usage_id,
    assetId: asset.asset_id,
    role: asset.role,
    url: new URL(encodedKey, base).href,
    mimeType: asset.mime_type,
    width: asset.width,
    height: asset.height,
    byteSize: asset.byte_size,
    sha256: asset.sha256,
    alt: asset.alt_text,
    ...(asset.caption ? { caption: asset.caption } : {}),
    ...(crop ? { crop } : {}),
    position: asset.position,
  };
}

function validatePublicAssetBaseUrl(baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  } catch {
    throw new CmsBadRequestError('Public asset base URL is invalid');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new CmsBadRequestError('Public asset base URL must use HTTPS without credentials');
  }
  return url;
}

function parseStoredArray<T>(json: string, field: string): T[] {
  try {
    const value = JSON.parse(json) as unknown;
    if (!Array.isArray(value)) throw new Error('expected an array');
    return value as T[];
  } catch (error) {
    throw new CmsInvariantError(`Stored ${field} JSON is invalid`, { cause: error });
  }
}

function validateSnapshotInput(input: CreateRevisionSnapshotInput): void {
  if (!input.revisionId || !input.postId) {
    throw new CmsBadRequestError('Revision id and post id are required');
  }
  if (!Number.isSafeInteger(input.expectedDraftVersion) || input.expectedDraftVersion < 1) {
    throw new CmsBadRequestError('Expected draft version must be a positive integer');
  }
  if (!Number.isSafeInteger(input.publishedAt) || input.publishedAt < 0) {
    throw new CmsBadRequestError('Published timestamp must be epoch milliseconds');
  }
  if (input.createdAt !== undefined && (!Number.isSafeInteger(input.createdAt) || input.createdAt < 0)) {
    throw new CmsBadRequestError('Created timestamp must be epoch milliseconds');
  }
}

function requiredRelease(release: ReleaseRow | undefined, releaseId: string): ReleaseRow {
  if (!release) throw new CmsNotFoundError('Release', releaseId);
  return release;
}

function requiredAttempt(
  attempt: ReleaseAttemptRow | undefined,
  attemptId: string,
): ReleaseAttemptRow {
  if (!attempt) throw new CmsNotFoundError('Release attempt', attemptId);
  return attempt;
}
