'use client';

import { useEffect } from 'react';
import {
  getLeadMagnetAnalyticsSessionId,
  getLeadMagnetAbVariantId,
  leadMagnetAnalyticsElapsedKey,
} from '@/lib/lead-magnet-analytics-client';

const MAX_ENGAGED_SECONDS = 6 * 60 * 60;

function readElapsedSeconds(leadMagnetId: string) {
  try {
    const value = Number(window.sessionStorage.getItem(leadMagnetAnalyticsElapsedKey(leadMagnetId)) || 0);
    return Number.isFinite(value) ? Math.min(Math.max(Math.round(value), 0), MAX_ENGAGED_SECONDS) : 0;
  } catch {
    return 0;
  }
}

function storeElapsedSeconds(leadMagnetId: string, seconds: number) {
  try {
    window.sessionStorage.setItem(leadMagnetAnalyticsElapsedKey(leadMagnetId), String(seconds));
  } catch {
    // Tracking remains functional for this page lifecycle without storage.
  }
}

export function LeadMagnetAnalyticsTracker({ leadMagnetId, variantIds = [] }: { leadMagnetId: string; variantIds?: string[] }) {
  const variantIdsKey = variantIds.join(',');
  useEffect(() => {
    const sessionId = getLeadMagnetAnalyticsSessionId(leadMagnetId);
    const variantId = getLeadMagnetAbVariantId(leadMagnetId, variantIdsKey ? variantIdsKey.split(',') : []);
    if (!sessionId) return;

    let accumulatedSeconds = readElapsedSeconds(leadMagnetId);
    let activeSince = document.visibilityState === 'visible' ? Date.now() : 0;
    let lastSentSeconds = -1;

    function currentSeconds() {
      const activeSeconds = activeSince ? Math.floor((Date.now() - activeSince) / 1000) : 0;
      return Math.min(accumulatedSeconds + activeSeconds, MAX_ENGAGED_SECONDS);
    }

    function pauseTimer() {
      if (!activeSince) return;
      accumulatedSeconds = currentSeconds();
      activeSince = 0;
      storeElapsedSeconds(leadMagnetId, accumulatedSeconds);
    }

    function payload() {
      return JSON.stringify({
        leadMagnetId,
        sessionId,
        engagedSeconds: currentSeconds(),
        variantId,
      });
    }

    function send({ beacon = false, force = false } = {}) {
      const seconds = currentSeconds();
      if (!force && seconds === lastSentSeconds) return;
      lastSentSeconds = seconds;
      storeElapsedSeconds(leadMagnetId, seconds);

      if (beacon && navigator.sendBeacon) {
        navigator.sendBeacon(
          '/api/analytics/visit',
          new Blob([payload()], { type: 'application/json' })
        );
        return;
      }

      void fetch('/api/analytics/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload(),
        keepalive: true,
      }).catch(() => undefined);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        pauseTimer();
        send({ beacon: true, force: true });
      } else if (!activeSince) {
        activeSince = Date.now();
      }
    }

    function handlePageHide() {
      pauseTimer();
      send({ beacon: true, force: true });
    }

    send({ force: true });
    const interval = window.setInterval(() => send(), 60_000);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      handlePageHide();
    };
  }, [leadMagnetId, variantIdsKey]);

  return null;
}
