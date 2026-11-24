import { query } from '../lib/db';

async function main() {
  if (process.env.VERCEL_ENV !== 'preview') throw new Error('Preview deployment required.');
  if (process.env.MAGNETS_STAGING_PREVIEW === '1') {
    if (process.env.MAGNETS_DATABASE_READ_ONLY !== '1') throw new Error('Read-only preview settings required.');
    const result = await query<{ read_only: string }>("select current_setting('transaction_read_only') as read_only");
    if (result.rows[0]?.read_only !== 'on') throw new Error('Read-only enforcement was not confirmed.');
  } else {
    if (process.env.MAGNETS_STAGING_LIVE !== '1') throw new Error('Explicit functional preview required.');
    // Schema inspection only. Builds must never migrate or seed customer data.
    const result = await query<{ ready: boolean }>(`select
      to_regclass('public.magnets_campaigns') is not null and
      to_regclass('public.magnets_assistant_clients') is not null and
      to_regclass('public.magnets_assistant_grants') is not null and
      to_regclass('public.magnets_creation_briefs') is not null as ready`);
    if (!result.rows[0]?.ready) throw new Error('Campaign schema is not installed.');
  }
  console.log('Preview database configuration verified. No customer data was read or written.');
}
main().catch(() => {
  // Connection failures can contain credentials. Keep hosting logs generic.
  console.error('Staging database verification failed. No migration or write was attempted.');
  process.exitCode = 1;
}).finally(async () => { await globalThis.magnetsPgPool?.end(); });
