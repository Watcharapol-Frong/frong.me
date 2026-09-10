/**
 * Browser client for the Earth admin API.
 *
 * This module is the only place the admin UI is allowed to talk to
 * `/earth/api/*`. Components stay transport-agnostic (see the header comments
 * in `src/components/cms/*.tsx`), the shell wires their callbacks to the
 * functions here, and every request/response shape is stated once in this file.
 *
 * Two rules shape the design:
 *
 * 1. **409 is data, not an exception.** Optimistic draft versions and the
 *    single-active-release index make conflicts a normal outcome of concurrent
 *    editing, so mutations return `CmsResult<T>` and a conflict arrives as a
 *    structured {@link CmsConflict}. Every other failure throws
 *    {@link CmsApiError}.
 * 2. **The server owns validation.** These wrappers check response shape only
 *    far enough to fail loudly on a contract mismatch. Request bodies mirror
 *    the parsers in `src/lib/cms/validation.ts` exactly, because `object()`
 *    there rejects unknown fields.
 *
 * Wire contract implemented here (routes live in `src/pages/earth/api/`, built
 * in parallel — do not edit them from the UI layer):
 *
 * | Method | Path | Body | Success |
 * |---|---|---|---|
 * | GET | `/earth/api/posts?lang&lifecycle_state&search` | — | {@link PostListResponse} |
 * | POST | `/earth/api/posts` | `CreatePostInput` | {@link PostDetail} |
 * | GET | `/earth/api/posts/:id` | — | {@link PostDetail} |
 * | PUT | `/earth/api/posts/:id` | {@link UpdatePostDraftRequest} | {@link PostDetail} |
 * | POST | `/earth/api/posts/:id/archive` | `{ expectedDraftVersion }` | {@link PostDetail} |
 * | GET | `/earth/api/releases` | — | {@link ReleaseOverview} |
 * | GET | `/earth/api/releases/:id` | — | {@link ReleaseDetail} |
 * | POST | `/earth/api/releases` | `BeginReleaseInput` | {@link ReleaseSummary} |
 *
 * The query parameter is `lifecycle_state`, not `lifecycle`, and unknown
 * parameters are rejected: see `parsePostListQuery` in `validation.ts`.
 */

import type {
  BeginReleaseInput,
  CreatePostInput,
  EpochMilliseconds,
  Language,
  PostLifecycle,
  ReleaseManifest,
  ReleaseManifestArticle,
  ReleaseStatus,
  ReleaseTriggerKind,
  TaxonomySnapshot,
  UpdatePostDraftInput,
} from '../contracts.ts';
/**
 * Type-only import: the code union is defined once, by the server. It is erased
 * at build time (`verbatimModuleSyntax`), so no server code reaches the browser
 * bundle. Never turn this into a value import.
 */
import type { CmsErrorCode } from '../../../server/cms/errors.ts';

export const EARTH_API_BASE = '/earth/api';

/* ------------------------------------------------------------------ */
/* Errors and conflicts                                                */
/* ------------------------------------------------------------------ */

/** Transport-level failures that never reach the server's error envelope. */
export type CmsClientErrorCode =
  | 'NETWORK_ERROR'
  /** Cloudflare Access served a login page instead of the API. */
  | 'SESSION_EXPIRED'
  | 'INVALID_RESPONSE';

export type CmsApiErrorCode = CmsErrorCode | CmsClientErrorCode;

/** Every non-409 failure. 409 is returned as a {@link CmsConflict} instead. */
export class CmsApiError extends Error {
  readonly code: CmsApiErrorCode;
  readonly status: number;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    message: string,
    code: CmsApiErrorCode,
    status: number,
    options: { cause?: unknown; details?: Readonly<Record<string, unknown>> } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'CmsApiError';
    this.code = code;
    this.status = status;
    this.details = options.details;
  }

  /** True when reloading the page (re-running Access) is the likely fix. */
  get requiresReauthentication(): boolean {
    return this.code === 'SESSION_EXPIRED' || this.status === 401 || this.status === 403;
  }
}

/** The 409 codes the server can return; see `errors.ts`. */
export type CmsConflictCode =
  | 'DRAFT_VERSION_CONFLICT'
  | 'CONFLICT'
  | 'RELEASE_BUSY'
  | 'INVALID_STATE_TRANSITION';

/**
 * A structured 409. `message` is the server's own text, safe to show as-is
 * because `errors.ts` only exposes messages for statuses below 500.
 */
export interface CmsConflict {
  code: CmsConflictCode;
  message: string;
  details?: Readonly<Record<string, unknown>>;
  /**
   * Draft version the server currently holds, when it reports one. The editor
   * needs it to offer a reload; it is absent when the server sends no details.
   */
  currentDraftVersion?: number;
  /** Version the rejected request claimed. */
  expectedDraftVersion?: number;
  /** Release that is already in flight, for `RELEASE_BUSY`. */
  activeReleaseId?: string;
}

export type CmsResult<T> =
  | { ok: true; data: T }
  | { ok: false; conflict: CmsConflict };

const CONFLICT_CODES: readonly string[] = [
  'DRAFT_VERSION_CONFLICT',
  'CONFLICT',
  'RELEASE_BUSY',
  'INVALID_STATE_TRANSITION',
];

function isConflictCode(value: unknown): value is CmsConflictCode {
  return typeof value === 'string' && CONFLICT_CODES.includes(value);
}

/** Narrow a {@link CmsResult} without repeating the discriminant everywhere. */
export function isConflict<T>(
  result: CmsResult<T>,
): result is { ok: false; conflict: CmsConflict } {
  return !result.ok;
}

/** Unwrap a result, turning a conflict into a throw. For call sites that cannot recover. */
export function unwrap<T>(result: CmsResult<T>): T {
  if (result.ok) return result.data;
  throw new CmsApiError(result.conflict.message, result.conflict.code, 409, {
    details: result.conflict.details,
  });
}

/** Sentence a human can act on, for the editor header and dashboard banner. */
export function describeConflict(conflict: CmsConflict): string {
  switch (conflict.code) {
    case 'DRAFT_VERSION_CONFLICT':
      return conflict.currentDraftVersion === undefined
        ? `${conflict.message}. Reload the post before saving again.`
        : `${conflict.message}. The server is at draft version ${conflict.currentDraftVersion}; reload before saving again.`;
    case 'RELEASE_BUSY':
      return conflict.activeReleaseId === undefined
        ? `${conflict.message}. Wait for the in-flight release to finish.`
        : `${conflict.message}. Release ${conflict.activeReleaseId} is still in flight.`;
    default:
      return conflict.message;
  }
}

/* ------------------------------------------------------------------ */
/* Response shapes                                                     */
/* ------------------------------------------------------------------ */

export interface PostSummary {
  id: string;
  lang: Language;
  translationGroupId: string | null;
  slug: string;
  title: string;
  excerpt: string | null;
  lifecycle: PostLifecycle;
  draftVersion: number;
  updatedAt: EpochMilliseconds;
  /** Draft edits exist that no release has picked up yet. Derived by the server. */
  hasUnpublishedChanges?: boolean;
}

export interface PostSourceDto {
  id: string;
  label: string;
  url: string;
  publisher: string | null;
  accessedAt: EpochMilliseconds | null;
}

export interface PostDetail extends PostSummary {
  bodyMarkdown: string;
  categoryIds: string[];
  tagIds: string[];
  sources: PostSourceDto[];
}

/** Taxonomy options are per-language rows, so the catalog is keyed by language. */
export interface TaxonomyCatalog {
  categories: Record<Language, TaxonomySnapshot[]>;
  tags: Record<Language, TaxonomySnapshot[]>;
}

export interface PostListResponse {
  posts: PostSummary[];
  taxonomy: TaxonomyCatalog;
}

export interface ReleaseSummary {
  id: string;
  status: ReleaseStatus;
  triggerKind: ReleaseTriggerKind;
  itemCount: number;
  manifestSha256: string;
  codeCommit: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: EpochMilliseconds;
  updatedAt: EpochMilliseconds;
  finishedAt: EpochMilliseconds | null;
}

export type ReleaseChangeKind = 'added' | 'updated' | 'removed';

export interface ReleaseDiffEntry {
  postId: string;
  lang: Language;
  slug: string;
  title: string;
  change: ReleaseChangeKind;
}

export interface ReleaseDiff {
  baseReleaseId: string | null;
  entries: ReleaseDiffEntry[];
  unchangedCount: number;
}

/** One release plus the manifest it deployed; needed to replay it on rollback. */
export interface ReleaseDetail {
  release: ReleaseSummary;
  manifest: ReleaseManifest;
}

export interface ReleaseOverview {
  liveReleaseId: string | null;
  /**
   * Manifest of the live release. The next manifest is built from it, so a
   * release cannot be assembled while this is unknown.
   */
  liveManifest: ReleaseManifest | null;
  releases: ReleaseSummary[];
  pendingDiff: ReleaseDiff;
}

/**
 * `PUT /earth/api/posts/:id` envelope.
 *
 * `draft` is exactly `UpdatePostDraftInput` because `parseUpdatePostDraftInput`
 * rejects unknown fields. Taxonomy and sources travel alongside it so the route
 * can apply all three in one guarded D1 batch: every child-table statement is
 * guarded by the same `expectedDraftVersion`, and `posts.draft_version` is
 * bumped last (P1-02 decision, recorded in `docs/plan.md`).
 */
export interface UpdatePostDraftRequest {
  draft: UpdatePostDraftInput;
  categoryIds: string[];
  tagIds: string[];
  sources: PostSourceDto[];
}

export interface PostListQuery {
  lang?: Language;
  lifecycle?: PostLifecycle;
  search?: string;
}

/* ------------------------------------------------------------------ */
/* Request plumbing                                                    */
/* ------------------------------------------------------------------ */

export interface CmsClientOptions {
  /** Injected in tests; defaults to the global `fetch`. */
  fetch?: typeof globalThis.fetch;
  /** Defaults to {@link EARTH_API_BASE}. */
  baseUrl?: string;
  signal?: AbortSignal;
}

function endpoint(path: string, options: CmsClientOptions | undefined): string {
  return `${options?.baseUrl ?? EARTH_API_BASE}${path}`;
}

interface ErrorEnvelope {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Reads the server's error envelope, `{ error: { code, message, details? } }`.
 * The flat `{ error, message }` form is also accepted: `cmsErrorResponse` used
 * it before the nested envelope landed, and both may be deployed at once while
 * the API routes are still being written.
 */
function readErrorEnvelope(body: unknown): ErrorEnvelope | null {
  if (!body || typeof body !== 'object') return null;
  const root = body as Record<string, unknown>;
  const error = root.error;

  if (error && typeof error === 'object' && !Array.isArray(error)) {
    const nested = error as Record<string, unknown>;
    if (typeof nested.code !== 'string') return null;
    return {
      code: nested.code,
      message: typeof nested.message === 'string' ? nested.message : nested.code,
      ...(nested.details && typeof nested.details === 'object' && !Array.isArray(nested.details)
        ? { details: nested.details as Record<string, unknown> }
        : {}),
    };
  }

  if (typeof error === 'string') {
    return {
      code: error,
      message: typeof root.message === 'string' ? root.message : error,
      ...(root.details && typeof root.details === 'object' && !Array.isArray(root.details)
        ? { details: root.details as Record<string, unknown> }
        : {}),
    };
  }

  return null;
}

function optionalCount(details: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = details?.[key];
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

function optionalId(details: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = details?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function toConflict(envelope: ErrorEnvelope): CmsConflict {
  const code: CmsConflictCode = isConflictCode(envelope.code) ? envelope.code : 'CONFLICT';
  const currentDraftVersion = optionalCount(envelope.details, 'currentDraftVersion');
  const expectedDraftVersion = optionalCount(envelope.details, 'expectedDraftVersion');
  const activeReleaseId = optionalId(envelope.details, 'activeReleaseId');
  return {
    code,
    message: envelope.message,
    ...(envelope.details ? { details: envelope.details } : {}),
    ...(currentDraftVersion === undefined ? {} : { currentDraftVersion }),
    ...(expectedDraftVersion === undefined ? {} : { expectedDraftVersion }),
    ...(activeReleaseId === undefined ? {} : { activeReleaseId }),
  };
}

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    // Cloudflare Access answers an expired session with an HTML login document.
    throw new CmsApiError(
      response.status === 200
        ? 'The admin session expired. Reload the page to sign in again.'
        : `The API returned ${response.status} without a JSON body.`,
      response.status === 401 || response.status === 403 || response.status === 200
        ? 'SESSION_EXPIRED'
        : 'INVALID_RESPONSE',
      response.status,
    );
  }
  try {
    return await response.json();
  } catch (cause) {
    throw new CmsApiError('The API returned a malformed JSON body.', 'INVALID_RESPONSE', response.status, {
      cause,
    });
  }
}

/** Runs the request and returns the parsed body, or throws for every failure. */
async function send<T>(
  path: string,
  init: RequestInit,
  parse: (body: unknown) => T,
  options?: CmsClientOptions,
): Promise<T> {
  const result = await sendAllowingConflict(path, init, parse, options);
  return unwrap(result);
}

/** Runs the request, returning a structured conflict for HTTP 409. */
async function sendAllowingConflict<T>(
  path: string,
  init: RequestInit,
  parse: (body: unknown) => T,
  options?: CmsClientOptions,
): Promise<CmsResult<T>> {
  const doFetch = options?.fetch ?? globalThis.fetch;
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (init.body !== undefined) headers.set('content-type', 'application/json');

  let response: Response;
  try {
    response = await doFetch(endpoint(path, options), {
      ...init,
      headers,
      // Access identity travels on the cookie; the browser also supplies the
      // exact `Origin` the Worker middleware compares against `CMS_SITE_ORIGIN`.
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'manual',
      ...(options?.signal ? { signal: options.signal } : {}),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new CmsApiError(
      'The admin API could not be reached. Check the connection and retry.',
      'NETWORK_ERROR',
      0,
      { cause },
    );
  }

  // An opaque redirect is Access bouncing the request to its login origin.
  if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
    throw new CmsApiError(
      'The admin session expired. Reload the page to sign in again.',
      'SESSION_EXPIRED',
      response.status,
    );
  }

  const body = await readJson(response);

  if (response.status === 409) {
    const envelope = readErrorEnvelope(body);
    if (!envelope) {
      throw new CmsApiError('The API returned a 409 without an error envelope.', 'INVALID_RESPONSE', 409);
    }
    return { ok: false, conflict: toConflict(envelope) };
  }

  if (!response.ok) {
    const envelope = readErrorEnvelope(body);
    throw new CmsApiError(
      envelope?.message ?? `The API returned HTTP ${response.status}.`,
      (envelope?.code as CmsApiErrorCode | undefined) ?? 'INVALID_RESPONSE',
      response.status,
      envelope?.details ? { details: envelope.details } : {},
    );
  }

  try {
    return { ok: true, data: parse(body) };
  } catch (cause) {
    throw new CmsApiError(
      cause instanceof Error ? cause.message : 'The API response did not match the expected shape.',
      'INVALID_RESPONSE',
      response.status,
      { cause },
    );
  }
}

/* ------------------------------------------------------------------ */
/* Response guards                                                     */
/*                                                                     */
/* Deliberately shallow: enough to fail loudly when the API drifts from */
/* this contract, not a second copy of `validation.ts`.                 */
/* ------------------------------------------------------------------ */

class ResponseShapeError extends Error {
  constructor(field: string, expected: string) {
    super(`Response field ${field} ${expected}`);
    this.name = 'ResponseShapeError';
  }
}

function obj(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ResponseShapeError(field, 'must be an object');
  }
  return value as Record<string, unknown>;
}

function str(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new ResponseShapeError(field, 'must be a string');
  return value;
}

function nullableStr(value: unknown, field: string): string | null {
  return value === null ? null : str(value, field);
}

function num(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ResponseShapeError(field, 'must be a finite number');
  }
  return value;
}

function nullableNum(value: unknown, field: string): number | null {
  return value === null ? null : num(value, field);
}

function list<T>(value: unknown, field: string, item: (entry: unknown, field: string) => T): T[] {
  if (!Array.isArray(value)) throw new ResponseShapeError(field, 'must be an array');
  return value.map((entry, index) => item(entry, `${field}[${index}]`));
}

function oneOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  const text = str(value, field);
  if (!(allowed as readonly string[]).includes(text)) {
    throw new ResponseShapeError(field, `must be one of ${allowed.join(', ')}`);
  }
  return text as T;
}

const LANGUAGES: readonly Language[] = ['th', 'en'];
const LIFECYCLES: readonly PostLifecycle[] = ['draft', 'active', 'archived'];
const RELEASE_STATUSES: readonly ReleaseStatus[] = [
  'queued', 'building', 'deploying', 'reconciling', 'live', 'failed',
];
const TRIGGER_KINDS: readonly ReleaseTriggerKind[] = ['publish', 'withdraw', 'rollback'];
const CHANGE_KINDS: readonly ReleaseChangeKind[] = ['added', 'updated', 'removed'];

function parsePostSummary(value: unknown, field: string): PostSummary {
  const row = obj(value, field);
  return {
    id: str(row.id, `${field}.id`),
    lang: oneOf(row.lang, `${field}.lang`, LANGUAGES),
    translationGroupId: nullableStr(row.translationGroupId ?? null, `${field}.translationGroupId`),
    slug: str(row.slug, `${field}.slug`),
    title: str(row.title, `${field}.title`),
    excerpt: nullableStr(row.excerpt ?? null, `${field}.excerpt`),
    lifecycle: oneOf(row.lifecycle, `${field}.lifecycle`, LIFECYCLES),
    draftVersion: num(row.draftVersion, `${field}.draftVersion`),
    updatedAt: num(row.updatedAt, `${field}.updatedAt`),
    ...(typeof row.hasUnpublishedChanges === 'boolean'
      ? { hasUnpublishedChanges: row.hasUnpublishedChanges }
      : {}),
  };
}

function parsePostSource(value: unknown, field: string): PostSourceDto {
  const row = obj(value, field);
  return {
    id: str(row.id, `${field}.id`),
    label: str(row.label, `${field}.label`),
    url: str(row.url, `${field}.url`),
    publisher: nullableStr(row.publisher ?? null, `${field}.publisher`),
    accessedAt: nullableNum(row.accessedAt ?? null, `${field}.accessedAt`),
  };
}

function parsePostDetail(value: unknown, field = 'post'): PostDetail {
  const row = obj(value, field);
  return {
    ...parsePostSummary(row, field),
    bodyMarkdown: str(row.bodyMarkdown, `${field}.bodyMarkdown`),
    categoryIds: list(row.categoryIds ?? [], `${field}.categoryIds`, str),
    tagIds: list(row.tagIds ?? [], `${field}.tagIds`, str),
    sources: list(row.sources ?? [], `${field}.sources`, parsePostSource),
  };
}

function parseTaxonomySnapshot(value: unknown, field: string): TaxonomySnapshot {
  const row = obj(value, field);
  return {
    id: str(row.id, `${field}.id`),
    slug: str(row.slug, `${field}.slug`),
    name: str(row.name, `${field}.name`),
  };
}

function parseTaxonomyByLanguage(
  value: unknown,
  field: string,
): Record<Language, TaxonomySnapshot[]> {
  const row = obj(value ?? {}, field);
  return {
    th: list(row.th ?? [], `${field}.th`, parseTaxonomySnapshot),
    en: list(row.en ?? [], `${field}.en`, parseTaxonomySnapshot),
  };
}

function parsePostListResponse(value: unknown): PostListResponse {
  const root = obj(value, 'response');
  const taxonomy = obj(root.taxonomy ?? {}, 'response.taxonomy');
  return {
    posts: list(root.posts, 'response.posts', parsePostSummary),
    taxonomy: {
      categories: parseTaxonomyByLanguage(taxonomy.categories, 'response.taxonomy.categories'),
      tags: parseTaxonomyByLanguage(taxonomy.tags, 'response.taxonomy.tags'),
    },
  };
}

function parseReleaseSummary(value: unknown, field = 'release'): ReleaseSummary {
  const row = obj(value, field);
  return {
    id: str(row.id, `${field}.id`),
    status: oneOf(row.status, `${field}.status`, RELEASE_STATUSES),
    triggerKind: oneOf(row.triggerKind, `${field}.triggerKind`, TRIGGER_KINDS),
    itemCount: num(row.itemCount, `${field}.itemCount`),
    manifestSha256: str(row.manifestSha256, `${field}.manifestSha256`),
    codeCommit: nullableStr(row.codeCommit ?? null, `${field}.codeCommit`),
    errorCode: nullableStr(row.errorCode ?? null, `${field}.errorCode`),
    errorMessage: nullableStr(row.errorMessage ?? null, `${field}.errorMessage`),
    createdAt: num(row.createdAt, `${field}.createdAt`),
    updatedAt: num(row.updatedAt, `${field}.updatedAt`),
    finishedAt: nullableNum(row.finishedAt ?? null, `${field}.finishedAt`),
  };
}

function parseManifestArticle(value: unknown, field: string): ReleaseManifestArticle {
  const row = obj(value, field);
  return {
    postId: str(row.postId, `${field}.postId`),
    revisionId: str(row.revisionId, `${field}.revisionId`),
    lang: oneOf(row.lang, `${field}.lang`, LANGUAGES),
    slug: str(row.slug, `${field}.slug`),
    visible: row.visible === true,
  };
}

function parseManifest(value: unknown, field: string): ReleaseManifest {
  const row = obj(value, field);
  return {
    schemaVersion: 1,
    releaseId: str(row.releaseId, `${field}.releaseId`),
    generatedAt: str(row.generatedAt, `${field}.generatedAt`),
    articles: list(row.articles, `${field}.articles`, parseManifestArticle),
  };
}

function parseDiffEntry(value: unknown, field: string): ReleaseDiffEntry {
  const row = obj(value, field);
  return {
    postId: str(row.postId, `${field}.postId`),
    lang: oneOf(row.lang, `${field}.lang`, LANGUAGES),
    slug: str(row.slug, `${field}.slug`),
    title: str(row.title, `${field}.title`),
    change: oneOf(row.change, `${field}.change`, CHANGE_KINDS),
  };
}

function parseReleaseOverview(value: unknown): ReleaseOverview {
  const root = obj(value, 'response');
  const diff = obj(root.pendingDiff ?? {}, 'response.pendingDiff');
  return {
    liveReleaseId: nullableStr(root.liveReleaseId ?? null, 'response.liveReleaseId'),
    liveManifest: root.liveManifest == null
      ? null
      : parseManifest(root.liveManifest, 'response.liveManifest'),
    releases: list(root.releases, 'response.releases', parseReleaseSummary),
    pendingDiff: {
      baseReleaseId: nullableStr(diff.baseReleaseId ?? null, 'response.pendingDiff.baseReleaseId'),
      entries: list(diff.entries ?? [], 'response.pendingDiff.entries', parseDiffEntry),
      unchangedCount: num(diff.unchangedCount ?? 0, 'response.pendingDiff.unchangedCount'),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Identifiers                                                         */
/* ------------------------------------------------------------------ */

/** `ID_PATTERN` in `validation.ts`: first character alphanumeric, 8–96 total. */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,95}$/;

function randomToken(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid.replace(/-/g, '');
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Client-generated identifier, e.g. `post_1f0c…`. Ids are generated here rather
 * than server-side so a retried create reuses the same id instead of inserting
 * a duplicate row.
 */
export function newCmsId(prefix: 'post' | 'grp' | 'rel' | 'rev' | 'src'): string {
  const id = `${prefix}_${randomToken()}`;
  if (!ID_PATTERN.test(id)) {
    throw new CmsApiError(`Generated id ${id} is not a valid CMS identifier.`, 'INVALID_RESPONSE', 0);
  }
  return id;
}

/** Stable key so a retried publish resolves to the existing release row. */
export function newIdempotencyKey(): string {
  return randomToken();
}

/* ------------------------------------------------------------------ */
/* Release manifests                                                   */
/* ------------------------------------------------------------------ */

/**
 * Canonicalize and hash a manifest exactly as the server does.
 *
 * This mirrors `canonicalReleaseManifest` in
 * `src/server/cms/repositories/releases.ts`, which cannot be imported here
 * because that module pulls in the D1 layer. `createRelease` rejects any
 * mismatch between the submitted hash and its own canonical hash, so
 * `tests/cms/client-api.test.ts` pins the two implementations together.
 */
export async function canonicalManifest(
  manifest: ReleaseManifest,
): Promise<{ manifest: ReleaseManifest; json: string; sha256: string }> {
  const canonical: ReleaseManifest = {
    schemaVersion: 1,
    releaseId: manifest.releaseId,
    generatedAt: manifest.generatedAt,
    articles: [...manifest.articles].sort((left, right) =>
      left.postId < right.postId ? -1 : left.postId > right.postId ? 1 : 0,
    ),
  };
  const json = JSON.stringify(canonical);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return { manifest: canonical, json, sha256 };
}

export interface BuildReleaseOptions {
  triggerKind: ReleaseTriggerKind;
  /** Manifest of the live release; `null` before anything has been published. */
  liveManifest: ReleaseManifest | null;
  baseReleaseId: string | null;
  /** The single post this release adds, replaces, or removes. */
  change: {
    postId: string;
    lang: Language;
    slug: string;
    kind: ReleaseChangeKind;
    /** Draft version the revision is cut from; omitted for a removal. */
    expectedDraftVersion?: number;
  };
  now?: () => number;
}

/**
 * Assemble the `BeginReleaseInput` for one post.
 *
 * A release row carries a single `trigger_post_id` and at most one
 * `revisionSnapshot`, so one release publishes, withdraws, or restores one
 * post; every other route in the live manifest is carried over untouched.
 * Rolling back to an earlier release uses that release's manifest directly and
 * does not go through this helper.
 */
export async function buildBeginReleaseInput(
  options: BuildReleaseOptions,
): Promise<BeginReleaseInput> {
  const now = options.now?.() ?? Date.now();
  const releaseId = newCmsId('rel');
  const carried = (options.liveManifest?.articles ?? []).filter(
    (article) => article.postId !== options.change.postId,
  );

  let articles: ReleaseManifestArticle[] = carried;
  let revisionSnapshot: BeginReleaseInput['revisionSnapshot'];

  if (options.change.kind === 'removed') {
    // Withdrawal drops the route; the old revision row stays for rollback.
    articles = carried;
  } else {
    if (options.change.expectedDraftVersion === undefined) {
      throw new CmsApiError(
        'A published post requires the draft version its revision is cut from.',
        'BAD_REQUEST',
        0,
      );
    }
    const revisionId = newCmsId('rev');
    articles = [
      ...carried,
      {
        postId: options.change.postId,
        revisionId,
        lang: options.change.lang,
        slug: options.change.slug,
        visible: true,
      },
    ];
    revisionSnapshot = {
      revisionId,
      postId: options.change.postId,
      expectedDraftVersion: options.change.expectedDraftVersion,
      publishedAt: now,
    };
  }

  const canonical = await canonicalManifest({
    schemaVersion: 1,
    releaseId,
    generatedAt: new Date(now).toISOString(),
    articles,
  });

  return {
    id: releaseId,
    triggerKind: options.triggerKind,
    triggerPostId: options.change.postId,
    ...(options.baseReleaseId ? { baseReleaseId: options.baseReleaseId } : {}),
    idempotencyKey: newIdempotencyKey(),
    manifest: canonical.manifest,
    manifestSha256: canonical.sha256,
    ...(revisionSnapshot ? { revisionSnapshot } : {}),
  };
}

/**
 * Manifest for restoring `sourceManifest` under a new release id. Rollback
 * replays a manifest that already passed a build; it cuts no new revision.
 */
export async function buildRollbackReleaseInput(
  sourceManifest: ReleaseManifest,
  baseReleaseId: string | null,
  now: number = Date.now(),
): Promise<BeginReleaseInput> {
  const releaseId = newCmsId('rel');
  const canonical = await canonicalManifest({
    schemaVersion: 1,
    releaseId,
    generatedAt: new Date(now).toISOString(),
    articles: sourceManifest.articles,
  });
  return {
    id: releaseId,
    triggerKind: 'rollback',
    ...(baseReleaseId ? { baseReleaseId } : {}),
    idempotencyKey: newIdempotencyKey(),
    manifest: canonical.manifest,
    manifestSha256: canonical.sha256,
  };
}

/* ------------------------------------------------------------------ */
/* Posts                                                               */
/* ------------------------------------------------------------------ */

/** `GET /earth/api/posts`. Unknown query parameters are rejected server-side. */
export async function listPosts(
  query: PostListQuery = {},
  options?: CmsClientOptions,
): Promise<PostListResponse> {
  const params = new URLSearchParams();
  if (query.lang) params.set('lang', query.lang);
  if (query.lifecycle) params.set('lifecycle_state', query.lifecycle);
  if (query.search?.trim()) params.set('search', query.search.trim());
  const search = params.toString();
  const suffix = search.length > 0 ? `?${search}` : '';
  return send(`/posts${suffix}`, { method: 'GET' }, parsePostListResponse, options);
}

/** `GET /earth/api/posts/:id`. */
export async function getPost(postId: string, options?: CmsClientOptions): Promise<PostDetail> {
  return send(`/posts/${encodeURIComponent(postId)}`, { method: 'GET' }, parsePostDetail, options);
}

/**
 * `POST /earth/api/posts`. Returns a conflict when the id or the language/slug
 * pair already exists.
 */
export async function createPost(
  input: CreatePostInput,
  options?: CmsClientOptions,
): Promise<CmsResult<PostDetail>> {
  return sendAllowingConflict(
    '/posts',
    { method: 'POST', body: JSON.stringify(input) },
    parsePostDetail,
    options,
  );
}

/**
 * `PUT /earth/api/posts/:id`. A `DRAFT_VERSION_CONFLICT` means someone else
 * saved first: the returned conflict carries the server's current version.
 */
export async function updatePostDraft(
  postId: string,
  request: UpdatePostDraftRequest,
  options?: CmsClientOptions,
): Promise<CmsResult<PostDetail>> {
  return sendAllowingConflict(
    `/posts/${encodeURIComponent(postId)}`,
    { method: 'PUT', body: JSON.stringify(request) },
    parsePostDetail,
    options,
  );
}

/** `POST /earth/api/posts/:id/archive`. Archives without deleting revisions. */
export async function archivePost(
  postId: string,
  expectedDraftVersion: number,
  options?: CmsClientOptions,
): Promise<CmsResult<PostDetail>> {
  return sendAllowingConflict(
    `/posts/${encodeURIComponent(postId)}/archive`,
    { method: 'POST', body: JSON.stringify({ expectedDraftVersion }) },
    parsePostDetail,
    options,
  );
}

/* ------------------------------------------------------------------ */
/* Releases                                                            */
/* ------------------------------------------------------------------ */

function parseReleaseDetail(value: unknown): ReleaseDetail {
  const root = obj(value, 'response');
  return {
    release: parseReleaseSummary(root.release ?? root, 'response.release'),
    manifest: parseManifest(root.manifest, 'response.manifest'),
  };
}

/** `GET /earth/api/releases`. */
export async function getReleaseOverview(options?: CmsClientOptions): Promise<ReleaseOverview> {
  return send('/releases', { method: 'GET' }, parseReleaseOverview, options);
}

/**
 * `POST /earth/api/releases`.
 *
 * `RELEASE_BUSY` is the expected answer while another release is in flight —
 * `idx_one_active_release` permits exactly one. Retrying with the same
 * `idempotencyKey` returns the existing release instead of creating a second.
 */
export async function beginRelease(
  input: BeginReleaseInput,
  options?: CmsClientOptions,
): Promise<CmsResult<ReleaseSummary>> {
  return sendAllowingConflict(
    '/releases',
    { method: 'POST', body: JSON.stringify(input) },
    (body) => parseReleaseSummary(obj(body, 'response').release ?? body, 'release'),
    options,
  );
}

/** `GET /earth/api/releases/:id`. Supplies the manifest a rollback replays. */
export async function getRelease(
  releaseId: string,
  options?: CmsClientOptions,
): Promise<ReleaseDetail> {
  return send(
    `/releases/${encodeURIComponent(releaseId)}`,
    { method: 'GET' },
    parseReleaseDetail,
    options,
  );
}
