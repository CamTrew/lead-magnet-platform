'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

function isModifiedClick(event: MouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationKey = `${pathname}?${searchParams.toString()}`;

  useEffect(() => {
    function stopSoon() {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setLoading(false), 220);
    }

    stopSoon();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [locationKey]);

  useEffect(() => {
    function start() {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setLoading(true);
    }

    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || isModifiedClick(event)) return;

      const target = event.target instanceof Element ? event.target : null;
      const link = target?.closest('a[href]');
      if (!link) return;

      const href = link.getAttribute('href');
      const targetAttr = link.getAttribute('target');
      if (!href || targetAttr === '_blank' || href.startsWith('#')) return;

      const nextUrl = new URL(href, window.location.href);
      if (nextUrl.origin !== window.location.origin) return;
      if (nextUrl.pathname === window.location.pathname && nextUrl.search === window.location.search) return;

      start();
    }

    window.addEventListener('magnets:navigation-start', start);
    document.addEventListener('click', handleClick, true);

    return () => {
      window.removeEventListener('magnets:navigation-start', start);
      document.removeEventListener('click', handleClick, true);
    };
  }, []);

  if (!loading) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[80] h-0.5 overflow-hidden" aria-hidden="true">
      <div className="h-full w-1/2 animate-[navigation-progress_1s_ease-in-out_infinite] bg-ink-950" />
    </div>
  );
}
