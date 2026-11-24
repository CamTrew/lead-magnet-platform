import { pathToFileURL } from 'node:url';

// Read-only preflight. It never deploys, migrates, sends email or prints values.
export function productionConfigurationErrors(env) {
  const errors = [];
  if (env.VERCEL_ENV !== 'production') errors.push('Run with the production environment configuration.');
  if (env.VERCEL_PROJECT_ID !== 'prj_rqah5nwTIEIYLfniOiBUmKGFudni') errors.push('VERCEL_PROJECT_ID must identify the existing Magnets production project.');
  for (const key of ['MAGNETS_STAGING_PREVIEW', 'MAGNETS_STAGING_LIVE', 'MAGNETS_DATABASE_READ_ONLY']) {
    if (env[key] === '1') errors.push(`${key} must not be enabled in production.`);
  }
  if (env.MAGNETS_CREATION_ENABLED !== '1') errors.push('MAGNETS_CREATION_ENABLED must be 1 for the assistant-led release.');
  for (const key of ['NEXT_PUBLIC_SITE_URL', 'MAGNETS_ASSISTANT_ORIGIN']) {
    if (env[key] !== 'https://magnets.so') errors.push(`${key} must be https://magnets.so for this release.`);
  }
  for (const key of ['DATABASE_URL', 'MAGNETS_RESEND_API_KEY', 'MAGNETS_RESEND_FROM_EMAIL', 'HOSTED_RESOURCES_BLOB_STORE_ID']) {
    if (!env[key]?.trim()) errors.push(`${key} is required.`);
  }
  if (!env.MAGNETS_ENCRYPTION_KEY && !env.DATA_ENCRYPTION_KEY) errors.push('Preserve the existing encryption key; MAGNETS_ENCRYPTION_KEY or DATA_ENCRYPTION_KEY is required.');
  if (env.MAGNETS_VERIFICATION_KEY !== undefined && env.MAGNETS_VERIFICATION_KEY.trim().length < 32) errors.push('MAGNETS_VERIFICATION_KEY must contain at least 32 characters when supplied.');
  if (!['private', 'public'].includes(env.NEXT_PUBLIC_MAGNETS_IMAGE_BLOB_ACCESS)) errors.push('NEXT_PUBLIC_MAGNETS_IMAGE_BLOB_ACCESS must match the configured image store access mode.');
  if (!env.BLOB_STORE_ID && !env.BLOB_READ_WRITE_TOKEN) errors.push('An image Blob store is required.');
  if (env.BLOB_STORE_ID && env.BLOB_STORE_ID === env.HOSTED_RESOURCES_BLOB_STORE_ID) errors.push('Image uploads and private hosted resources must use different Blob stores.');
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = productionConfigurationErrors(process.env);
  if (errors.length) {
    for (const error of errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log('Production configuration preflight passed. No services were contacted or changed. Verify schema, Blob access modes and OAuth connections separately.');
  }
}
