import { revalidateTag, unstable_cache } from 'next/cache';
import {
  findPublishedLeadMagnet,
  findPublishedLeadMagnetById,
  findPublishedLeadMagnetByUsername,
} from './platform-store';

const PUBLISHED_LEAD_MAGNET_CACHE_TAG = 'published-lead-magnets';
const PUBLIC_PAGE_REVALIDATE_SECONDS = 60 * 5;

export const getCachedPublishedLeadMagnet = unstable_cache(
  findPublishedLeadMagnet,
  ['published-lead-magnet-by-host-v1'],
  {
    revalidate: PUBLIC_PAGE_REVALIDATE_SECONDS,
    tags: [PUBLISHED_LEAD_MAGNET_CACHE_TAG],
  }
);

export const getCachedPublishedLeadMagnetByUsername = unstable_cache(
  findPublishedLeadMagnetByUsername,
  ['published-lead-magnet-by-username-v1'],
  {
    revalidate: PUBLIC_PAGE_REVALIDATE_SECONDS,
    tags: [PUBLISHED_LEAD_MAGNET_CACHE_TAG],
  }
);

export const getCachedPublishedLeadMagnetById = unstable_cache(
  findPublishedLeadMagnetById,
  ['published-lead-magnet-by-id-v1'],
  {
    revalidate: PUBLIC_PAGE_REVALIDATE_SECONDS,
    tags: [PUBLISHED_LEAD_MAGNET_CACHE_TAG],
  }
);

export function invalidatePublishedLeadMagnetCache() {
  revalidateTag(PUBLISHED_LEAD_MAGNET_CACHE_TAG);
}
