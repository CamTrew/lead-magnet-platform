import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

function readLocalDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (!existsSync('.env.local')) return undefined;

  const match = readFileSync('.env.local', 'utf8').match(/^DATABASE_URL=(?:"([^"]+)"|'([^']+)'|(.+))$/m);
  return match?.[1] || match?.[2] || match?.[3];
}

const databaseUrl = readLocalDatabaseUrl();

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for Drizzle migrations');
}

export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
