import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import type {
  D1DatabaseBinding,
  D1PreparedStatementLike,
  D1ResultLike,
  D1Value,
} from '../../src/server/cms/db.ts';

export class SqliteD1Binding implements D1DatabaseBinding {
  readonly database = new DatabaseSync(':memory:');

  constructor() {
    this.database.exec('PRAGMA foreign_keys = ON;');
  }

  migrate(...paths: string[]): void {
    for (const path of paths) this.database.exec(readFileSync(path, 'utf8'));
  }

  prepare(query: string): D1PreparedStatementLike {
    return new SqliteD1Statement(this.database, query, []);
  }

  async batch<T = Record<string, unknown>>(
    statements: D1PreparedStatementLike[],
  ): Promise<D1ResultLike<T>[]> {
    this.database.exec('BEGIN IMMEDIATE;');
    try {
      const results: D1ResultLike<T>[] = [];
      for (const statement of statements) {
        if (!(statement instanceof SqliteD1Statement)) {
          throw new TypeError('Unexpected statement implementation');
        }
        results.push(statement.execute<T>());
      }
      this.database.exec('COMMIT;');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK;');
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }
}

class SqliteD1Statement implements D1PreparedStatementLike {
  private readonly database: DatabaseSync;
  private readonly query: string;
  private readonly params: D1Value[];

  constructor(
    database: DatabaseSync,
    query: string,
    params: D1Value[],
  ) {
    this.database = database;
    this.query = query;
    this.params = params;
  }

  bind(...values: D1Value[]): D1PreparedStatementLike {
    return new SqliteD1Statement(this.database, this.query, values);
  }

  async first<T = Record<string, unknown>>(columnName?: string): Promise<T | null> {
    const row = this.database.prepare(this.query).get(...sqliteValues(this.params)) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (columnName ? row[columnName] : row) as T;
  }

  async all<T = Record<string, unknown>>(): Promise<D1ResultLike<T>> {
    return this.execute<T>();
  }

  async run<T = Record<string, unknown>>(): Promise<D1ResultLike<T>> {
    return this.execute<T>();
  }

  execute<T>(): D1ResultLike<T> {
    const statement = this.database.prepare(this.query);
    const results = statement.all(...sqliteValues(this.params)) as T[];
    const changeRow = this.database.prepare('SELECT changes() AS changes').get() as { changes: number };
    const isRead = /^\s*(SELECT|PRAGMA)\b/i.test(this.query);
    return {
      success: true,
      results,
      meta: {
        changes: isRead ? 0 : changeRow.changes,
        changed_db: !isRead && changeRow.changes > 0,
      },
    };
  }
}

function sqliteValues(values: D1Value[]) {
  return values.map((value) => value instanceof ArrayBuffer ? new Uint8Array(value) : value);
}
