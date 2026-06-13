import { Pool, type QueryResultRow } from 'pg';
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

export function db() {
  if (!globalThis.magnetsDrizzle) {
    globalThis.magnetsDrizzle = drizzle(getPool(), { schema });
  }

  return globalThis.magnetsDrizzle;
}
