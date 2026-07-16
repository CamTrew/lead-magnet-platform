import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/db/schema';

declare global {
  var magnetsPgPool: Pool | undefined;
  var magnetsDrizzle: NodePgDatabase<typeof schema> | undefined;
}

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to use the Magnets database');
  }

  if (!globalThis.magnetsPgPool) {
    globalThis.magnetsPgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      query_timeout: 12_000,
      statement_timeout: 10_000,
      keepAlive: true,
    });
  }

  return globalThis.magnetsPgPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = []
) {
  return getPool().query<T>(text, values);
}

export type QueryRunner = {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<QueryResult<T>>;
};

export async function withTransaction<T>(callback: (client: QueryRunner) => Promise<T>) {
  const client = await getPool().connect();

  try {
    await client.query('begin');
    const result = await callback(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function withAdvisoryLock<T>(
  key: string,
  callback: (client: QueryRunner) => Promise<T>
) {
  const client = await getPool().connect();
  let acquired = false;

  try {
    const result = await client.query<{ locked: boolean }>(
      'select pg_try_advisory_lock(hashtextextended($1::text, 0)) as locked',
      [key]
    );
    acquired = Boolean(result.rows[0]?.locked);
    if (!acquired) return { acquired: false as const, value: null };

    return { acquired: true as const, value: await callback(client) };
  } finally {
    if (acquired) {
      await client
        .query('select pg_advisory_unlock(hashtextextended($1::text, 0))', [key])
        .catch(() => undefined);
    }
    client.release();
  }
}

export function db() {
  if (!globalThis.magnetsDrizzle) {
    globalThis.magnetsDrizzle = drizzle(getPool(), { schema });
  }

  return globalThis.magnetsDrizzle;
}
