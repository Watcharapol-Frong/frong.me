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
 * | POST | `/earth/api/posts/:id/publish` | `{ expectedDraftVersion }` | {@link PostDetail} |
 * | POST | `/earth/api/posts/:id/unpublish` | `{ expectedDraftVersion }` | {@link PostDetail} |
 *
 * The query parameter is `lifecycle_state`, not `lifecycle`, and unknown
 * parameters are rejected: see `parsePostListQuery` in `validation.ts`.
 */

import type {
  CreatePostInput,
  EpochMilliseconds,
  Language,
  PostLifecycle,
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
  | 'DATABASE_BUSY'
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
}

export type CmsResult<T> =
  | { ok: true; data: T }
  | { ok: false; conflict: CmsConflict };

const CONFLICT_CODES: readonly string[] = [
  'DRAFT_VERSION_CONFLICT',
  'CONFLICT',
  'DATABASE_BUSY',
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
    case 'DATABASE_BUSY':
      return `${conflict.message}. Retry the request.`;
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
  publishedAt: EpochMilliseconds | null;
  coverImageUrl: string | null;
  coverCrop: { x: number; y: number; zoom: number } | null;
  /**
   * Tag names. List responses only — the detail route sends full `tags`
   * objects under that name instead, so this one stays distinct to keep the
   * two shapes from colliding in one parser. Defaults to `[]`.
   */
  tagNames: string[];
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

function toConflict(envelope: ErrorEnvelope): CmsConflict {
  const code: CmsConflictCode = isConflictCode(envelope.code) ? envelope.code : 'CONFLICT';
  const currentDraftVersion = optionalCount(envelope.details, 'currentDraftVersion');
  const expectedDraftVersion = optionalCount(envelope.details, 'expectedDraftVersion');
  return {
    code,
    message: envelope.message,
    ...(envelope.details ? { details: envelope.details } : {}),
    ...(currentDraftVersion === undefined ? {} : { currentDraftVersion }),
    ...(expectedDraftVersion === undefined ? {} : { expectedDraftVersion }),
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

function nullableCrop(value: unknown, field: string): { x: number; y: number; zoom: number } | null {
  if (value === null || value === undefined) return null;
  const row = obj(value, field);
  return {
    x: num(row.x, `${field}.x`),
    y: num(row.y, `${field}.y`),
    zoom: num(row.zoom, `${field}.zoom`),
  };
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
    publishedAt: nullableNum(row.publishedAt ?? null, `${field}.publishedAt`),
    coverImageUrl: nullableStr(row.coverImageUrl ?? null, `${field}.coverImageUrl`),
    coverCrop: nullableCrop(row.coverCrop, `${field}.coverCrop`),
    tagNames: list(row.tagNames ?? [], `${field}.tagNames`, str),
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
    // The detail route sends resolved `{id, slug, name}` objects. The editor's
    // tag field holds names, not ids — writing ids back into it would make the
    // next save upsert literal "tag_<uuid>" tags (`resolveTagIds` treats the
    // field as free text), so the names are pulled out here.
    tagNames: list(
      row.tags ?? [],
      `${field}.tags`,
      (entry, entryField) => str(obj(entry, entryField).name, `${entryField}.name`),
    ),
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
export function newCmsId(prefix: 'post' | 'grp' | 'src' | 'asset' | 'usage'): string {
  const id = `${prefix}_${randomToken()}`;
  if (!ID_PATTERN.test(id)) {
    throw new CmsApiError(`Generated id ${id} is not a valid CMS identifier.`, 'INVALID_RESPONSE', 0);
  }
  return id;
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

/**
 * `POST /earth/api/posts/:id/publish`. Direct SSR: flips the post live
 * immediately, no release/manifest step.
 */
export async function publishPost(
  postId: string,
  expectedDraftVersion: number,
  options?: CmsClientOptions,
): Promise<CmsResult<PostDetail>> {
  return sendAllowingConflict(
    `/posts/${encodeURIComponent(postId)}/publish`,
    { method: 'POST', body: JSON.stringify({ expectedDraftVersion }) },
    parsePostDetail,
    options,
  );
}

/** `POST /earth/api/posts/:id/unpublish`. */
export async function unpublishPost(
  postId: string,
  expectedDraftVersion: number,
  options?: CmsClientOptions,
): Promise<CmsResult<PostDetail>> {
  return sendAllowingConflict(
    `/posts/${encodeURIComponent(postId)}/unpublish`,
    { method: 'POST', body: JSON.stringify({ expectedDraftVersion }) },
    parsePostDetail,
    options,
  );
}

export interface AttachPostAssetRequest {
  id: string;
  assetId: string;
  role: 'cover' | 'body';
  altText: string;
  caption?: string | null;
  crop?: { x: number; y: number; zoom: number } | null;
  position?: number;
  expectedDraftVersion: number;
}

/** `POST /earth/api/posts/:id/assets`. Links an already-uploaded asset to a post. */
export async function attachPostAsset(
  postId: string,
  request: AttachPostAssetRequest,
  options?: CmsClientOptions,
): Promise<CmsResult<PostDetail>> {
  return sendAllowingConflict(
    `/posts/${encodeURIComponent(postId)}/assets`,
    { method: 'POST', body: JSON.stringify(request) },
    parsePostDetail,
    options,
  );
}

export interface UploadedAsset {
  id: string;
  mediaKind: string;
  url: string;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
  sha256: string;
}

/**
 * `POST /earth/api/assets/upload`. Direct-to-R2 multipart upload; immediately
 * public under direct SSR (no private/promote step).
 */
export async function uploadAsset(
  file: File,
  mediaKind: 'photo' | 'chart' | 'illustration' = 'photo',
  options?: CmsClientOptions,
): Promise<UploadedAsset> {
  const form = new FormData();
  form.append('file', file);
  form.append('mediaKind', mediaKind);
  const response = await fetch(endpoint('/assets/upload', options), {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const envelope = payload && typeof payload === 'object' ? (payload as { error?: unknown }).error : undefined;
    const message = envelope && typeof envelope === 'object' && typeof (envelope as { message?: unknown }).message === 'string'
      ? (envelope as { message: string }).message
      : `Upload failed (${response.status})`;
    throw new CmsApiError(message, 'INVALID_RESPONSE', response.status);
  }
  const root = obj(payload, 'response');
  return {
    id: str(root.id, 'response.id'),
    mediaKind: str(root.mediaKind, 'response.mediaKind'),
    url: str(root.url, 'response.url'),
    mimeType: str(root.mimeType, 'response.mimeType'),
    width: num(root.width, 'response.width'),
    height: num(root.height, 'response.height'),
    byteSize: num(root.byteSize, 'response.byteSize'),
    sha256: str(root.sha256, 'response.sha256'),
  };
}

/* ------------------------------------------------------------------ */
/* Site settings + session                                            */
/* ------------------------------------------------------------------ */

export interface SiteSettings {
  ownerName: string;
  ownerHandle: string;
  defaultFont: string;
  defaultAiProvider: string;
}

export interface UpdateSiteSettingsRequest {
  ownerName?: string;
  ownerHandle?: string;
  defaultFont?: string;
  defaultAiProvider?: string;
}

function parseSiteSettings(value: unknown): SiteSettings {
  const root = obj(value, 'settings');
  return {
    ownerName: str(root.ownerName, 'settings.ownerName'),
    ownerHandle: str(root.ownerHandle, 'settings.ownerHandle'),
    defaultFont: str(root.defaultFont, 'settings.defaultFont'),
    defaultAiProvider: str(root.defaultAiProvider, 'settings.defaultAiProvider'),
  };
}

/** `GET /earth/api/settings`. */
export async function getSettings(options?: CmsClientOptions): Promise<SiteSettings> {
  return send('/settings', { method: 'GET' }, parseSiteSettings, options);
}

/** `PUT /earth/api/settings`. Partial update — only supplied fields change. */
export async function updateSettings(
  request: UpdateSiteSettingsRequest,
  options?: CmsClientOptions,
): Promise<SiteSettings> {
  return send('/settings', { method: 'PUT', body: JSON.stringify(request) }, parseSiteSettings, options);
}

/** `GET /earth/api/session`. `email` is `null` in local dev (Access bypass, no real JWT). */
export async function getSession(options?: CmsClientOptions): Promise<{ email: string | null }> {
  return send('/session', { method: 'GET' }, (value) => {
    const root = obj(value, 'session');
    return { email: nullableStr(root.email ?? null, 'session.email') };
  }, options);
}
