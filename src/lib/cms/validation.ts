import {
  CMS_SCHEMA_VERSION,
  type CreatePostInput,
  type BeginReleaseInput,
  type AttachPostAssetInput,
  type ConfirmReleaseInput,
  type CreateReleaseInput,
  type DispatchReleaseInput,
  type FailReleaseAttemptInput,
  type Language,
  type PublicArticle,
  type PublicAsset,
  type PublicSource,
  type ReleaseManifest,
  type ReleaseManifestArticle,
  type ReleaseSnapshot,
  type TaxonomySnapshot,
  type UpdatePostDraftInput,
  type UpdatePostBundleInput,
} from './contracts.ts';

export class CmsValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(`${field}: ${message}`);
    this.name = 'CmsValidationError';
    this.field = field;
  }
}

type JsonObject = Record<string, unknown>;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,95}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function object(value: unknown, field: string, keys: readonly string[]): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CmsValidationError(field, 'must be an object');
  }

  const result = value as JsonObject;
  const extras = Object.keys(result).filter((key) => !keys.includes(key));
  if (extras.length > 0) {
    throw new CmsValidationError(field, `contains unknown field ${extras[0]}`);
  }
  return result;
}

function string(value: unknown, field: string, maximum = 10_000): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) {
    throw new CmsValidationError(field, `must be a non-empty string of at most ${maximum} characters`);
  }
  return value;
}

function optionalString(value: unknown, field: string, maximum = 10_000): string | undefined {
  return value === undefined ? undefined : string(value, field, maximum);
}

function nullableString(
  value: unknown,
  field: string,
  maximum = 10_000,
): string | null | undefined {
  return value === undefined || value === null ? value : string(value, field, maximum);
}

function identifier(value: unknown, field: string): string {
  const result = string(value, field, 96);
  if (!ID_PATTERN.test(result)) throw new CmsValidationError(field, 'has an invalid identifier format');
  return result;
}

function optionalIdentifier(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : identifier(value, field);
}

function slug(value: unknown, field: string): string {
  const result = string(value, field, 120);
  if (!SLUG_PATTERN.test(result)) {
    throw new CmsValidationError(field, 'must be a lowercase ASCII slug separated by hyphens');
  }
  return result;
}

function language(value: unknown, field: string): Language {
  if (value !== 'th' && value !== 'en') {
    throw new CmsValidationError(field, 'must be th or en');
  }
  return value;
}

function integer(value: unknown, field: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new CmsValidationError(field, `must be a safe integer greater than or equal to ${minimum}`);
  }
  return value as number;
}

function finiteNumber(value: unknown, field: string, minimum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    throw new CmsValidationError(field, `must be a finite number greater than or equal to ${minimum}`);
  }
  return value;
}

function isoDateTime(value: unknown, field: string): string {
  const result = string(value, field, 30);
  const date = new Date(result);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== result) {
    throw new CmsValidationError(field, 'must be a canonical ISO-8601 UTC timestamp');
  }
  return result;
}

function httpsUrl(value: unknown, field: string): string {
  const result = string(value, field, 2_048);
  let url: URL;
  try {
    url = new URL(result);
  } catch {
    throw new CmsValidationError(field, 'must be a valid URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new CmsValidationError(field, 'must be an HTTPS URL without credentials');
  }
  return result;
}

function array<T>(
  value: unknown,
  field: string,
  parseItem: (item: unknown, itemField: string) => T,
  maximum = 1_000,
): T[] {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new CmsValidationError(field, `must be an array with at most ${maximum} items`);
  }
  return value.map((item, index) => parseItem(item, `${field}[${index}]`));
}

function taxonomy(value: unknown, field: string): TaxonomySnapshot {
  const row = object(value, field, ['id', 'slug', 'name']);
  return {
    id: identifier(row.id, `${field}.id`),
    slug: slug(row.slug, `${field}.slug`),
    name: string(row.name, `${field}.name`, 120),
  };
}

function source(value: unknown, field: string): PublicSource {
  const row = object(value, field, ['label', 'url', 'publisher', 'accessedAt']);
  const publisher = optionalString(row.publisher, `${field}.publisher`, 200);
  const accessedAt = row.accessedAt === undefined
    ? undefined
    : isoDateTime(row.accessedAt, `${field}.accessedAt`);
  return {
    label: string(row.label, `${field}.label`, 300),
    url: httpsUrl(row.url, `${field}.url`),
    ...(publisher === undefined ? {} : { publisher }),
    ...(accessedAt === undefined ? {} : { accessedAt }),
  };
}

function publicAsset(value: unknown, field: string): PublicAsset {
  const row = object(value, field, [
    'usageId', 'assetId', 'role', 'url', 'mimeType', 'width', 'height',
    'byteSize', 'sha256', 'alt', 'caption', 'crop', 'position',
  ]);
  if (row.role !== 'cover' && row.role !== 'body') {
    throw new CmsValidationError(`${field}.role`, 'must be cover or body');
  }
  if (row.mimeType !== 'image/jpeg' && row.mimeType !== 'image/png' && row.mimeType !== 'image/webp') {
    throw new CmsValidationError(`${field}.mimeType`, 'is not an allowed raster image MIME type');
  }
  const checksum = string(row.sha256, `${field}.sha256`, 64);
  if (!SHA256_PATTERN.test(checksum)) {
    throw new CmsValidationError(`${field}.sha256`, 'must be a lowercase SHA-256 digest');
  }
  const caption = optionalString(row.caption, `${field}.caption`, 1_000);
  let crop: PublicAsset['crop'];
  if (row.crop !== undefined) {
    const cropRow = object(row.crop, `${field}.crop`, ['x', 'y', 'zoom']);
    const x = finiteNumber(cropRow.x, `${field}.crop.x`, 0);
    const y = finiteNumber(cropRow.y, `${field}.crop.y`, 0);
    const zoom = finiteNumber(cropRow.zoom, `${field}.crop.zoom`, Number.EPSILON);
    if (x > 100 || y > 100) {
      throw new CmsValidationError(`${field}.crop`, 'x and y must be percentages from 0 to 100');
    }
    crop = { x, y, zoom };
  }
  return {
    usageId: identifier(row.usageId, `${field}.usageId`),
    assetId: identifier(row.assetId, `${field}.assetId`),
    role: row.role,
    url: httpsUrl(row.url, `${field}.url`),
    mimeType: row.mimeType,
    width: integer(row.width, `${field}.width`, 1),
    height: integer(row.height, `${field}.height`, 1),
    byteSize: integer(row.byteSize, `${field}.byteSize`, 1),
    sha256: checksum,
    alt: string(row.alt, `${field}.alt`, 1_000),
    ...(caption === undefined ? {} : { caption }),
    ...(crop === undefined ? {} : { crop }),
    position: integer(row.position, `${field}.position`),
  };
}

function manifestArticle(value: unknown, field: string): ReleaseManifestArticle {
  const row = object(value, field, ['postId', 'revisionId', 'lang', 'slug', 'visible']);
  if (typeof row.visible !== 'boolean') {
    throw new CmsValidationError(`${field}.visible`, 'must be a boolean');
  }
  return {
    postId: identifier(row.postId, `${field}.postId`),
    revisionId: identifier(row.revisionId, `${field}.revisionId`),
    lang: language(row.lang, `${field}.lang`),
    slug: slug(row.slug, `${field}.slug`),
    visible: row.visible,
  };
}

function publicArticle(value: unknown, field: string): PublicArticle {
  const row = object(value, field, [
    'id', 'revisionId', 'lang', 'translationGroupId', 'slug', 'title',
    'excerpt', 'bodyMarkdown', 'categories', 'tags', 'sources', 'assets', 'publishedAt',
  ]);
  const translationGroupId = optionalString(row.translationGroupId, `${field}.translationGroupId`, 96);
  const excerpt = optionalString(row.excerpt, `${field}.excerpt`, 1_000);
  return {
    id: identifier(row.id, `${field}.id`),
    revisionId: identifier(row.revisionId, `${field}.revisionId`),
    lang: language(row.lang, `${field}.lang`),
    ...(translationGroupId === undefined ? {} : { translationGroupId }),
    slug: slug(row.slug, `${field}.slug`),
    title: string(row.title, `${field}.title`, 300),
    ...(excerpt === undefined ? {} : { excerpt }),
    bodyMarkdown: string(row.bodyMarkdown, `${field}.bodyMarkdown`, 1_500_000),
    categories: array(row.categories, `${field}.categories`, taxonomy, 20),
    tags: array(row.tags, `${field}.tags`, taxonomy, 100),
    sources: array(row.sources, `${field}.sources`, source, 200),
    assets: array(row.assets, `${field}.assets`, publicAsset, 500),
    publishedAt: isoDateTime(row.publishedAt, `${field}.publishedAt`),
  };
}

export function parseReleaseManifest(value: unknown): ReleaseManifest {
  const row = object(value, 'manifest', ['schemaVersion', 'releaseId', 'generatedAt', 'articles']);
  if (row.schemaVersion !== CMS_SCHEMA_VERSION) {
    throw new CmsValidationError('manifest.schemaVersion', `must be ${CMS_SCHEMA_VERSION}`);
  }
  const articles = array(row.articles, 'manifest.articles', manifestArticle, 10_000);
  const postIds = new Set<string>();
  const routes = new Set<string>();
  for (const article of articles) {
    if (postIds.has(article.postId)) {
      throw new CmsValidationError('manifest.articles', `contains duplicate post ${article.postId}`);
    }
    postIds.add(article.postId);
    if (article.visible) {
      const route = `${article.lang}:${article.slug}`;
      if (routes.has(route)) {
        throw new CmsValidationError('manifest.articles', `contains duplicate route ${route}`);
      }
      routes.add(route);
    }
  }
  return {
    schemaVersion: CMS_SCHEMA_VERSION,
    releaseId: identifier(row.releaseId, 'manifest.releaseId'),
    generatedAt: isoDateTime(row.generatedAt, 'manifest.generatedAt'),
    articles,
  };
}

export function parseReleaseSnapshot(value: unknown): ReleaseSnapshot {
  const row = object(value, 'snapshot', ['manifest', 'articles']);
  const manifest = parseReleaseManifest(row.manifest);
  const articles = array(row.articles, 'snapshot.articles', publicArticle, 10_000);
  const visibleByRevision = new Map(
    manifest.articles
      .filter((article) => article.visible)
      .map((article) => [article.revisionId, article]),
  );
  if (articles.length !== visibleByRevision.size) {
    throw new CmsValidationError('snapshot.articles', 'does not contain exactly one article per visible revision');
  }
  for (const article of articles) {
    const manifestArticle = visibleByRevision.get(article.revisionId);
    if (
      !manifestArticle
      || manifestArticle.postId !== article.id
      || manifestArticle.lang !== article.lang
      || manifestArticle.slug !== article.slug
    ) {
      throw new CmsValidationError('snapshot.articles', `does not match manifest revision ${article.revisionId}`);
    }
  }
  return { manifest, articles };
}

export function parseCreatePostInput(value: unknown): CreatePostInput {
  const row = object(value, 'post', [
    'id', 'lang', 'translationGroupId', 'slug', 'title', 'excerpt', 'bodyMarkdown',
  ]);
  const translationGroupId = optionalIdentifier(row.translationGroupId, 'post.translationGroupId');
  const excerpt = optionalString(row.excerpt, 'post.excerpt', 1_000);
  const bodyMarkdown = optionalString(row.bodyMarkdown, 'post.bodyMarkdown', 1_500_000);
  return {
    id: identifier(row.id, 'post.id'),
    lang: language(row.lang, 'post.lang'),
    ...(translationGroupId === undefined ? {} : { translationGroupId }),
    slug: slug(row.slug, 'post.slug'),
    title: string(row.title, 'post.title', 300),
    ...(excerpt === undefined ? {} : { excerpt }),
    ...(bodyMarkdown === undefined ? {} : { bodyMarkdown }),
  };
}

export function parseUpdatePostDraftInput(value: unknown): UpdatePostDraftInput {
  const row = object(value, 'post', [
    'expectedDraftVersion', 'lang', 'translationGroupId', 'slug', 'title', 'excerpt', 'bodyMarkdown',
  ]);
  const translationGroupId = row.translationGroupId === null
    ? null
    : optionalIdentifier(row.translationGroupId, 'post.translationGroupId');
  const excerpt = nullableString(row.excerpt, 'post.excerpt', 1_000);
  return {
    expectedDraftVersion: integer(row.expectedDraftVersion, 'post.expectedDraftVersion', 1),
    lang: language(row.lang, 'post.lang'),
    ...(translationGroupId === undefined ? {} : { translationGroupId }),
    slug: slug(row.slug, 'post.slug'),
    title: string(row.title, 'post.title', 300),
    ...(excerpt === undefined ? {} : { excerpt }),
    bodyMarkdown: string(row.bodyMarkdown, 'post.bodyMarkdown', 1_500_000),
  };
}

export function parseUpdatePostBundleInput(value: unknown): UpdatePostBundleInput {
  const row = object(value, 'request', ['draft', 'categoryIds', 'tagIds', 'sources']);
  const categoryIds = array(row.categoryIds, 'request.categoryIds', identifier, 20);
  const tagIds = array(row.tagIds, 'request.tagIds', identifier, 100);
  if (new Set(categoryIds).size !== categoryIds.length) {
    throw new CmsValidationError('request.categoryIds', 'contains duplicate identifiers');
  }
  if (new Set(tagIds).size !== tagIds.length) {
    throw new CmsValidationError('request.tagIds', 'contains duplicate identifiers');
  }
  const sources = array(row.sources, 'request.sources', (value, field) => {
    const sourceRow = object(value, field, ['id', 'label', 'url', 'publisher', 'accessedAt']);
    return {
      id: identifier(sourceRow.id, `${field}.id`),
      label: string(sourceRow.label, `${field}.label`, 300),
      url: httpsUrl(sourceRow.url, `${field}.url`),
      publisher: sourceRow.publisher === null
        ? null
        : optionalString(sourceRow.publisher, `${field}.publisher`, 200) ?? null,
      accessedAt: sourceRow.accessedAt === null
        ? null
        : integer(sourceRow.accessedAt, `${field}.accessedAt`),
    };
  }, 200);
  if (new Set(sources.map((source) => source.id)).size !== sources.length) {
    throw new CmsValidationError('request.sources', 'contains duplicate identifiers');
  }
  return {
    draft: parseUpdatePostDraftInput(row.draft),
    categoryIds,
    tagIds,
    sources,
  };
}

export function parseCreateReleaseInput(value: unknown): CreateReleaseInput {
  const row = object(value, 'release', [
    'id', 'triggerKind', 'triggerPostId', 'baseReleaseId', 'idempotencyKey',
    'codeCommit', 'manifest', 'manifestSha256',
  ]);
  if (row.triggerKind !== 'publish' && row.triggerKind !== 'withdraw' && row.triggerKind !== 'rollback') {
    throw new CmsValidationError('release.triggerKind', 'must be publish, withdraw, or rollback');
  }
  const id = identifier(row.id, 'release.id');
  const manifest = parseReleaseManifest(row.manifest);
  if (manifest.releaseId !== id) {
    throw new CmsValidationError('release.manifest.releaseId', 'must equal release.id');
  }
  const triggerPostId = row.triggerPostId === undefined
    ? undefined
    : identifier(row.triggerPostId, 'release.triggerPostId');
  const baseReleaseId = row.baseReleaseId === undefined
    ? undefined
    : identifier(row.baseReleaseId, 'release.baseReleaseId');
  const codeCommit = optionalString(row.codeCommit, 'release.codeCommit', 64);
  const checksum = string(row.manifestSha256, 'release.manifestSha256', 64);
  if (!SHA256_PATTERN.test(checksum)) {
    throw new CmsValidationError('release.manifestSha256', 'must be a lowercase SHA-256 digest');
  }
  return {
    id,
    triggerKind: row.triggerKind,
    ...(triggerPostId === undefined ? {} : { triggerPostId }),
    ...(baseReleaseId === undefined ? {} : { baseReleaseId }),
    idempotencyKey: string(row.idempotencyKey, 'release.idempotencyKey', 128),
    ...(codeCommit === undefined ? {} : { codeCommit }),
    manifest,
    manifestSha256: checksum,
  };
}

export function parseBeginReleaseInput(value: unknown): BeginReleaseInput {
  const row = object(value, 'release', [
    'id', 'triggerKind', 'triggerPostId', 'baseReleaseId', 'idempotencyKey',
    'codeCommit', 'manifest', 'manifestSha256', 'revisionSnapshot',
  ]);
  const release = parseCreateReleaseInput({
    id: row.id,
    triggerKind: row.triggerKind,
    ...(row.triggerPostId === undefined ? {} : { triggerPostId: row.triggerPostId }),
    ...(row.baseReleaseId === undefined ? {} : { baseReleaseId: row.baseReleaseId }),
    idempotencyKey: row.idempotencyKey,
    ...(row.codeCommit === undefined ? {} : { codeCommit: row.codeCommit }),
    manifest: row.manifest,
    manifestSha256: row.manifestSha256,
  });
  if (row.revisionSnapshot === undefined) return release;
  const snapshot = object(row.revisionSnapshot, 'release.revisionSnapshot', [
    'revisionId', 'postId', 'expectedDraftVersion', 'publishedAt',
  ]);
  const revisionSnapshot = {
    revisionId: identifier(snapshot.revisionId, 'release.revisionSnapshot.revisionId'),
    postId: identifier(snapshot.postId, 'release.revisionSnapshot.postId'),
    expectedDraftVersion: integer(
      snapshot.expectedDraftVersion,
      'release.revisionSnapshot.expectedDraftVersion',
      1,
    ),
    publishedAt: integer(snapshot.publishedAt, 'release.revisionSnapshot.publishedAt'),
  };
  const manifestArticle = release.manifest.articles.find(
    (article) => article.postId === revisionSnapshot.postId,
  );
  if (
    release.triggerKind !== 'publish'
    || release.triggerPostId !== revisionSnapshot.postId
    || manifestArticle?.revisionId !== revisionSnapshot.revisionId
    || !manifestArticle.visible
  ) {
    throw new CmsValidationError(
      'release.revisionSnapshot',
      'must describe the visible trigger post revision of a publish release',
    );
  }
  return {
    ...release,
    revisionSnapshot,
  };
}

export function parseConfirmReleaseInput(value: unknown): ConfirmReleaseInput {
  const row = object(value, 'confirmation', ['attemptId', 'providerDeploymentId', 'workflowRunId']);
  return {
    attemptId: identifier(row.attemptId, 'confirmation.attemptId'),
    providerDeploymentId: string(
      row.providerDeploymentId,
      'confirmation.providerDeploymentId',
      200,
    ),
    ...(row.workflowRunId === undefined
      ? {}
      : { workflowRunId: string(row.workflowRunId, 'confirmation.workflowRunId', 100) }),
  };
}

export function parseFailReleaseAttemptInput(value: unknown): FailReleaseAttemptInput {
  const row = object(value, 'failure', ['attemptId', 'errorMessage', 'workflowRunId']);
  return {
    attemptId: identifier(row.attemptId, 'failure.attemptId'),
    errorMessage: string(row.errorMessage, 'failure.errorMessage', 2000),
    ...(row.workflowRunId === undefined
      ? {}
      : { workflowRunId: string(row.workflowRunId, 'failure.workflowRunId', 100) }),
  };
}

export function parseAttachPostAssetInput(value: unknown): AttachPostAssetInput {
  const row = object(value, 'assetUsage', [
    'id', 'assetId', 'role', 'altText', 'caption', 'crop', 'position',
    'expectedDraftVersion',
  ]);
  if (row.role !== 'cover' && row.role !== 'body') {
    throw new CmsValidationError('assetUsage.role', 'must be cover or body');
  }
  const caption = nullableString(row.caption, 'assetUsage.caption', 1_000);
  let crop: AttachPostAssetInput['crop'];
  if (row.crop === null) {
    crop = null;
  } else if (row.crop !== undefined) {
    const cropRow = object(row.crop, 'assetUsage.crop', ['x', 'y', 'zoom']);
    const x = finiteNumber(cropRow.x, 'assetUsage.crop.x', 0);
    const y = finiteNumber(cropRow.y, 'assetUsage.crop.y', 0);
    const zoom = finiteNumber(cropRow.zoom, 'assetUsage.crop.zoom', Number.EPSILON);
    if (x > 100 || y > 100) {
      throw new CmsValidationError('assetUsage.crop', 'x and y must be percentages from 0 to 100');
    }
    crop = { x, y, zoom };
  }
  const position = row.position === undefined
    ? undefined
    : integer(row.position, 'assetUsage.position', 0);
  return {
    id: identifier(row.id, 'assetUsage.id'),
    assetId: identifier(row.assetId, 'assetUsage.assetId'),
    role: row.role,
    altText: string(row.altText, 'assetUsage.altText', 500),
    ...(caption === undefined ? {} : { caption }),
    ...(crop === undefined ? {} : { crop }),
    ...(position === undefined ? {} : { position }),
    expectedDraftVersion: integer(
      row.expectedDraftVersion,
      'assetUsage.expectedDraftVersion',
      1,
    ),
  };
}

export function parseDispatchReleaseInput(value: unknown): DispatchReleaseInput {
  const row = object(value, 'dispatch', ['attemptId', 'attemptNumber']);
  return {
    attemptId: identifier(row.attemptId, 'dispatch.attemptId'),
    attemptNumber: integer(row.attemptNumber, 'dispatch.attemptNumber', 1),
  };
}

export function parseArchivePostInput(value: unknown): { expectedDraftVersion: number } {
  const row = object(value, 'post', ['expectedDraftVersion']);
  return {
    expectedDraftVersion: integer(row.expectedDraftVersion, 'post.expectedDraftVersion', 1),
  };
}

export function parseCmsIdentifier(value: unknown, field = 'id'): string {
  return identifier(value, field);
}

export interface PostListQuery {
  lang?: Language;
  lifecycle?: import('./contracts.ts').PostLifecycle;
  search?: string;
}

export function parsePostListQuery(searchParams: URLSearchParams): PostListQuery {
  const allowed = new Set(['lang', 'lifecycle_state', 'search']);
  for (const key of searchParams.keys()) {
    if (!allowed.has(key)) throw new CmsValidationError('query', `contains unknown field ${key}`);
  }
  const langValue = searchParams.get('lang');
  const lifecycleValue = searchParams.get('lifecycle_state');
  const searchValue = searchParams.get('search');
  if (langValue !== null && langValue !== 'th' && langValue !== 'en') {
    throw new CmsValidationError('query.lang', 'must be th or en');
  }
  if (
    lifecycleValue !== null
    && lifecycleValue !== 'draft'
    && lifecycleValue !== 'active'
    && lifecycleValue !== 'archived'
  ) {
    throw new CmsValidationError(
      'query.lifecycle_state',
      'must be draft, active, or archived',
    );
  }
  if (searchValue !== null && searchValue.length > 300) {
    throw new CmsValidationError('query.search', 'must be at most 300 characters');
  }
  const search = searchValue?.trim();
  return {
    ...(langValue ? { lang: langValue } : {}),
    ...(lifecycleValue ? { lifecycle: lifecycleValue } : {}),
    ...(search ? { search } : {}),
  };
}
