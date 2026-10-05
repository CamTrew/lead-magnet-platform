import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@/db/schema';

declare global {
  var magnetsPgPool: Pool | undefined;
  var magnetsDrizzle: NodePgDatabase<typeof schema> | undefined;
}

const CONNECTION_TIMEOUT_MS = 10_000;
const CONNECTION_ATTEMPTS = 3;

function isConnectionAcquisitionTimeout(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof Error) {
      if (/connection terminated due to connection timeout/i.test(current.message)) return true;
      current = current.cause;
      continue;
    }
    break;
  }
  return false;
}

function discardTimedOutPool(pool: Pool) {
  if (globalThis.magnetsPgPool !== pool) return;
  globalThis.magnetsPgPool = undefined;
  globalThis.magnetsDrizzle = undefined;
  void pool.end().catch(() => undefined);
}

async function retryAfterConnectionTimeout<T>(operation: (pool: Pool) => Promise<T>) {
  for (let attempt = 1; attempt <= CONNECTION_ATTEMPTS; attempt += 1) {
    const pool = getPool();
    try {
      return await operation(pool);
    } catch (error) {
      // This error occurs before PostgreSQL accepts a query, so retrying is
      // safe even for writes. Do not retry generic disconnects: the server may
      // already have committed those operations before the socket disappeared.
      if (!isConnectionAcquisitionTimeout(error) || attempt === CONNECTION_ATTEMPTS) {
        throw error;
      }

      discardTimedOutPool(pool);
      await new Promise((resolve) => setTimeout(resolve, attempt * 150));
    }
  }

  throw new Error('Unable to acquire a PostgreSQL connection');
}

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to use the Magnets database');
  }

  if (!globalThis.magnetsPgPool) {
    globalThis.magnetsPgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
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
  return retryAfterConnectionTimeout((pool) => pool.query<T>(text, values));
}

export type QueryRunner = {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<QueryResult<T>>;
};

export async function withTransaction<T>(callback: (client: QueryRunner) => Promise<T>) {
  const client = await retryAfterConnectionTimeout((pool) => pool.connect());
  let discardClient = false;

  try {
    await client.query('begin');
    const result = await callback(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => { discardClient = true; });
    throw error;
  } finally {
    // A failed rollback must not return an open transaction (and its locks)
    // to the pool for the next request.
    client.release(discardClient);
  }
}

export async function withAdvisoryLock<T>(
  key: string,
  callback: (client: QueryRunner) => Promise<T>
) {
  // Neon transaction pooling can change PostgreSQL sessions between queries.
  // Pin the backend with a transaction and release the lock on commit/rollback.
  return withTransaction(async (client) => {
    const result = await client.query<{ locked: boolean }>(
      'select pg_try_advisory_xact_lock(hashtextextended($1::text, 0)) as locked',
      [key]
    );
    if (!result.rows[0]?.locked) return { acquired: false as const, value: null };

    return { acquired: true as const, value: await callback(client) };
  });
}

export function db() {
  if (!globalThis.magnetsDrizzle) {
    globalThis.magnetsDrizzle = drizzle(getPool(), { schema });
  }

  return globalThis.magnetsDrizzle;
}
