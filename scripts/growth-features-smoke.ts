import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import { selectLeadMagnetAbWinner } from '../lib/ab-testing';
import {
  getLeadMagnetAbVariantId,
  leadMagnetAbBucket,
} from '../lib/lead-magnet-analytics-client';
import { preferredLeadMagnetUrl } from '../lib/lead-magnet-metadata';
import type { AccountSettings } from '../lib/types';

async function main() {
  const targetUrl = 'https://example.com/free-guide';
  const png = await QRCode.toBuffer(targetUrl, { width: 1200 });
  assert.deepEqual(Array.from(png.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
  const svg = await QRCode.toString(targetUrl, { type: 'svg' });
  assert.match(svg, /^<svg/);

  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      sessionStorage: {
        getItem(key: string) { return storage.get(key) || null; },
        setItem(key: string, value: string) { storage.set(key, value); },
      },
    },
  });
  const firstVariant = getLeadMagnetAbVariantId('00000000-0000-4000-8000-000000000001', ['variant-a', 'variant-b']);
  const repeatedVariant = getLeadMagnetAbVariantId('00000000-0000-4000-8000-000000000001', ['variant-a', 'variant-b']);
  assert.equal(firstVariant, repeatedVariant);
  assert.ok(['control', 'variant-a', 'variant-b'].includes(firstVariant));

  const twoWayBuckets = Array.from({ length: 1_000 }, (_, index) => (
    leadMagnetAbBucket(index.toString(16).padStart(8, '0'), 2)
  ));
  assert.equal(twoWayBuckets.filter((bucket) => bucket === 0).length, 500);
  assert.equal(twoWayBuckets.filter((bucket) => bucket === 1).length, 500);

  assert.equal(selectLeadMagnetAbWinner([
    { variantId: 'control', visits: 100, conversions: 10 },
    { variantId: 'variant-b', visits: 100, conversions: 14 },
  ], 25)?.variantId, 'variant-b');
  assert.equal(selectLeadMagnetAbWinner([
    { variantId: 'control', visits: 100, conversions: 10 },
    { variantId: 'variant-b', visits: 100, conversions: 10 },
  ], 25)?.variantId, 'control');
  assert.equal(selectLeadMagnetAbWinner([
    { variantId: 'control', visits: 24, conversions: 10 },
    { variantId: 'variant-b', visits: 100, conversions: 14 },
  ], 25), null);

  const account = {
    domainAttachedHost: 'get.customer.example',
    username: 'customer',
  } as AccountSettings;
  assert.equal(
    preferredLeadMagnetUrl(account, { id: '00000000-0000-4000-8000-000000000002', slug: 'free-guide' }),
    targetUrl.replace('example.com', 'get.customer.example')
  );

  delete (globalThis as { window?: unknown }).window;
  console.log('Growth feature smoke test passed: QR output, stable/even A/B assignment, safe winner selection, and custom-domain URLs.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
