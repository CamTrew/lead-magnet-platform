import assert from 'node:assert/strict';
import { productionConfigurationErrors } from './check-production-config.mjs';

const valid = {
  VERCEL_ENV: 'production', VERCEL_PROJECT_ID: 'prj_rqah5nwTIEIYLfniOiBUmKGFudni',
  MAGNETS_CREATION_ENABLED: '1', NEXT_PUBLIC_SITE_URL: 'https://magnets.so',
  MAGNETS_ASSISTANT_ORIGIN: 'https://magnets.so', DATABASE_URL: 'test-only',
  MAGNETS_ENCRYPTION_KEY: 'test-only', MAGNETS_RESEND_API_KEY: 'test-only',
  MAGNETS_RESEND_FROM_EMAIL: 'test@example.invalid', BLOB_STORE_ID: 'image-test', NEXT_PUBLIC_MAGNETS_IMAGE_BLOB_ACCESS: 'private',
  HOSTED_RESOURCES_BLOB_STORE_ID: 'private-test',
};
assert.deepEqual(productionConfigurationErrors(valid), []);
for (const key of ['MAGNETS_STAGING_PREVIEW', 'MAGNETS_STAGING_LIVE', 'MAGNETS_DATABASE_READ_ONLY']) {
  assert.ok(productionConfigurationErrors({ ...valid, [key]: '1' }).some(error => error.includes(key)));
}
for (const key of ['NEXT_PUBLIC_SITE_URL', 'MAGNETS_ASSISTANT_ORIGIN']) {
  for (const value of ['https://staging.example.com', 'http://magnets.so', 'https://magnets.so/path', '']) {
    assert.ok(productionConfigurationErrors({ ...valid, [key]: value }).some(error => error.includes(key)));
  }
}
for (const key of ['DATABASE_URL', 'MAGNETS_RESEND_API_KEY', 'MAGNETS_RESEND_FROM_EMAIL', 'HOSTED_RESOURCES_BLOB_STORE_ID', 'MAGNETS_CREATION_ENABLED', 'VERCEL_PROJECT_ID', 'NEXT_PUBLIC_MAGNETS_IMAGE_BLOB_ACCESS']) {
  assert.ok(productionConfigurationErrors({ ...valid, [key]: '' }).some(error => error.includes(key)));
}
assert.ok(productionConfigurationErrors({ ...valid, HOSTED_RESOURCES_BLOB_STORE_ID: valid.BLOB_STORE_ID }).some(error => error.includes('different Blob stores')));
assert.ok(productionConfigurationErrors({ ...valid, MAGNETS_ENCRYPTION_KEY: '' }).length);
assert.deepEqual(productionConfigurationErrors({ ...valid, MAGNETS_ENCRYPTION_KEY: '', DATA_ENCRYPTION_KEY: 'legacy-test-only' }), []);
assert.ok(productionConfigurationErrors({ ...valid, MAGNETS_VERIFICATION_KEY: 'short' }).length);
console.log('Production configuration checks passed: staging isolation, canonical origins, required settings and separate stores.');
