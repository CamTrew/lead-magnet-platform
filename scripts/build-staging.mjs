import { spawnSync } from 'node:child_process';
// This artifact can only be built for the dedicated preview project, never the live site.
if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_PROJECT_ID !== 'prj_ZKMwKWLDTyH1lDQO52W5pm3d9o3B') {
  throw new Error('This artifact requires the dedicated staging project and a Preview deployment.');
}
const visual = process.env.MAGNETS_STAGING_PREVIEW === '1';
if (!visual) {
  if (process.env.MAGNETS_STAGING_LIVE !== '1' || process.env.MAGNETS_CREATION_ENABLED !== '1' || process.env.MAGNETS_DATABASE_READ_ONLY === '1') {
    throw new Error('Functional preview requires explicit live-staging configuration.');
  }
  const origin = 'https://magnets-viral-staging-cameron-trews-projects.vercel.app';
  if (process.env.MAGNETS_ASSISTANT_ORIGIN !== origin || process.env.NEXT_PUBLIC_SITE_URL !== origin) {
    throw new Error('Functional preview must use its own canonical and OAuth origin.');
  }
  for (const key of ['DATABASE_URL', 'MAGNETS_ENCRYPTION_KEY', 'MAGNETS_RESEND_API_KEY', 'MAGNETS_RESEND_FROM_EMAIL']) {
    if (!process.env[key]) throw new Error(`Missing required preview configuration: ${key}`);
  }
  const verificationKey = process.env.MAGNETS_VERIFICATION_KEY;
  const legacyKey = process.env.MAGNETS_ENCRYPTION_KEY || process.env.DATA_ENCRYPTION_KEY;
  if (verificationKey !== undefined ? verificationKey.trim().length < 32 : !legacyKey || legacyKey.trim().length < 16) {
    throw new Error('Functional preview requires a valid email verification key.');
  }
}
if (process.env.DATABASE_URL) {
  if (visual && process.env.MAGNETS_DATABASE_READ_ONLY !== '1') throw new Error('Visual preview requires read-only enforcement.');
  const check = spawnSync('pnpm', ['exec', 'tsx', 'scripts/check-staging-database.ts'], {stdio:'inherit',env:process.env});
  if (check.status !== 0) process.exit(check.status ?? 1);
}
// Deliberately bypass the production postbuild automation hook.
const result = spawnSync('pnpm', ['exec', 'next', 'build'], {stdio:'inherit',env:process.env});
process.exit(result.status ?? 1);
