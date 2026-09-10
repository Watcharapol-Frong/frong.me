import { CmsConflictError, CmsDatabaseError, mapCmsError } from './errors.ts';

export type D1Value = string | number | null | ArrayBuffer;

export interface D1ResultMeta {
  changes?: number;
  last_row_id?: number;
  changed_db?: boolean;
  rows_read?: number;
  rows_written?: number;
  [key: string]: unknown;
}

export interface D1ResultLike<T = Record<string, unknown>> {
  success: boolean;
  results: T[];
  meta: D1ResultMeta;
  error?: string;
}

export interface D1PreparedStatementLike {
  bind(...values: D1Value[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1ResultLike<T>>;
  run<T = Record<string, unknown>>(): Promise<D1ResultLike<T>>;
}

/** Structural subset implemented by Cloudflare's D1Database binding. */
export interface D1DatabaseBinding {
  prepare(query: string): D1PreparedStatementLike;
  batch<T = Record<string, unknown>>(
    statements: D1PreparedStatementLike[],
  ): Promise<D1ResultLike<T>[]>;
}

export interface SqlStatement {
  sql: string;
  params?: readonly D1Value[];
}

export class CmsDatabase {
  readonly binding: D1DatabaseBinding;

  constructor(binding: D1DatabaseBinding) {
    this.binding = binding;
  }

  statement(sql: string, params: readonly D1Value[] = []): D1PreparedStatementLike {
    return this.binding.prepare(sql).bind(...params);
  }

  async first<T>(sql: string, params: readonly D1Value[] = []): Promise<T | null> {
    try {
      return await this.statement(sql, params).first<T>();
    } catch (error) {
      throw mapCmsError(error, 'query:first');
    }
  }

  async all<T>(sql: string, params: readonly D1Value[] = []): Promise<T[]> {
    try {
      const result = await this.statement(sql, params).all<T>();
      assertSuccessfulResult(result, 'query:all');
      return result.results;
    } catch (error) {
      throw mapCmsError(error, 'query:all');
    }
  }

  async run<T>(sql: string, params: readonly D1Value[] = []): Promise<D1ResultLike<T>> {
    try {
      const result = await this.statement(sql, params).run<T>();
      assertSuccessfulResult(result, 'query:run');
      return result;
    } catch (error) {
      throw mapCmsError(error, 'query:run');
    }
  }

  /**
   * D1 batch is transactional: statements execute sequentially and the entire
   * batch rolls back when any statement fails.
   */
  async batch<T = Record<string, unknown>>(
    statements: readonly SqlStatement[],
  ): Promise<D1ResultLike<T>[]> {
    if (statements.length === 0) return [];
    try {
      const prepared = statements.map(({ sql, params = [] }) => this.statement(sql, params));
      const results = await this.binding.batch<T>(prepared);
      if (results.length !== statements.length) {
        throw new CmsDatabaseError('D1 returned an incomplete batch result');
      }
      results.forEach((result) => assertSuccessfulResult(result, 'query:batch'));
      return results;
    } catch (error) {
      throw mapCmsError(error, 'query:batch');
    }
  }
}

export function createCmsDatabase(binding: D1DatabaseBinding): CmsDatabase {
  return new CmsDatabase(binding);
}

export function changes(result: D1ResultLike<unknown>): number {
  return typeof result.meta.changes === 'number' ? result.meta.changes : 0;
}

export function requireChanged(
  result: D1ResultLike<unknown>,
  message: string,
  code: 'DRAFT_VERSION_CONFLICT' | 'CONFLICT' = 'CONFLICT',
): void {
  if (changes(result) === 0) throw new CmsConflictError(message, code);
}

function assertSuccessfulResult(result: D1ResultLike<unknown>, operation: string): void {
  if (!result.success) {
    throw new CmsDatabaseError(`D1 reported an unsuccessful ${operation}`, {
      details: result.error ? { d1Error: result.error } : undefined,
    });
  }
}
