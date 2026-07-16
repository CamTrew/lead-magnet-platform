import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createLeadMagnetDisplayImage,
  isLeadMagnetDisplayImageUrl,
} from '../lib/lead-magnet-display-image';
import {
  listLeadMagnetImageSources,
  updateLeadMagnetImageUrl,
} from '../lib/platform-store';

function loadLocalEnvironment() {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;

  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator < 1) continue;

    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    const value = rawValue.replace(/^(['"])(.*)\1$/, '$2');
    if (!process.env[key]) process.env[key] = value;
  }
}

loadLocalEnvironment();

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const sources = await listLeadMagnetImageSources();
  const pending = sources.filter((source) => !isLeadMagnetDisplayImageUrl(source.imageUrl));

  console.log(
    `${pending.length} of ${sources.length} stored lead magnet images ${
      dryRun ? 'would be' : 'will be'
    } converted to public display renditions.`
  );

  if (dryRun) return;

  let migrated = 0;
  let failed = 0;

  for (const source of pending) {
    try {
      const displayImageUrl = await createLeadMagnetDisplayImage({
        accountId: source.accountId,
        leadMagnetId: source.id,
        sourceUrl: source.imageUrl,
      });

      const updated = await updateLeadMagnetImageUrl(
        source.accountId,
        source.id,
        displayImageUrl
      );

      if (!updated) throw new Error('Lead magnet could not be updated.');

      migrated += 1;
      console.log(`Optimised ${source.id}`);
    } catch (error) {
      failed += 1;
      console.error(
        `Could not optimise ${source.id}:`,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  console.log(`Completed image migration: ${migrated} optimised, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

void main();
