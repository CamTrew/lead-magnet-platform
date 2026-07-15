'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type ScrollRevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
};

export function ScrollReveal({ children, className, delay = 0 }: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const rect = element.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.88 && rect.bottom > 0) {
      setIsVisible(true);
      setIsReady(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setIsVisible(true);
        observer.unobserve(entry.target);
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.1 }
    );

    observer.observe(element);
    setIsReady(true);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={cn(
        'transition-[opacity,transform,filter] duration-700 ease-out',
        isReady && !isVisible && 'translate-y-10 opacity-0 blur-[2px]',
        isVisible && 'translate-y-0 opacity-100',
        className
      )}
      ref={ref}
      style={isVisible ? { transitionDelay: `${delay}s` } : undefined}
    >
      {children}
    </div>
  );
}
