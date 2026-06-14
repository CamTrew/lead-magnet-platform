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

export function db() {
  if (!globalThis.magnetsDrizzle) {
    globalThis.magnetsDrizzle = drizzle(getPool(), { schema });
  }

  return globalThis.magnetsDrizzle;
}
