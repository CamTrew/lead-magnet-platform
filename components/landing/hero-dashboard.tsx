'use client';

import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { WalkthroughVideo } from '@/components/walkthrough-video';

export function HeroDashboard() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start end', 'end start'],
  });
  const motionConfig = { damping: 28, stiffness: 120, mass: 0.7 };
  const rawY = useTransform(scrollYProgress, [0, 0.38, 0.76, 1], reduceMotion ? [0, 0, 0, 0] : [88, 18, -14, -40]);
  const rawScale = useTransform(scrollYProgress, [0, 0.4, 1], reduceMotion ? [1, 1, 1] : [0.94, 1, 0.985]);
  const rawRotateX = useTransform(scrollYProgress, [0, 0.42, 1], reduceMotion ? [0, 0, 0] : [5, 0, -1.5]);
  const rawRotateZ = useTransform(scrollYProgress, [0, 0.42, 1], reduceMotion ? [0, 0, 0] : [-1.2, 0, 0.35]);
  const y = useSpring(rawY, motionConfig);
  const scale = useSpring(rawScale, motionConfig);
  const rotateX = useSpring(rawRotateX, motionConfig);
  const rotateZ = useSpring(rawRotateZ, motionConfig);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  return (
    <div className="relative z-10 mx-auto mt-14 max-w-6xl sm:mt-16" ref={containerRef}>
      <motion.div
        // Keep the server and initial browser render identical before applying scroll motion.
        className="origin-top will-change-transform"
        style={isHydrated ? { perspective: 1400, rotateX, rotateZ, scale, y } : undefined}
      >
        <div className="relative overflow-hidden rounded-lg border border-ink-200 bg-white p-2 shadow-[0_32px_90px_-46px_rgba(17,17,17,0.5)] sm:p-3">
          <div className="flex h-9 items-center gap-1.5 border-b border-ink-100 px-2 pb-2">
            <span className="h-2.5 w-2.5 rounded-full bg-brand-coral" />
            <span className="h-2.5 w-2.5 rounded-full bg-brand-yellow" />
            <span className="h-2.5 w-2.5 rounded-full bg-brand-aqua" />
            <span className="ml-3 hidden rounded bg-ink-50 px-2 py-1 font-mono text-[10px] text-ink-400 sm:block">
              Magnets platform walkthrough
            </span>
          </div>
          <WalkthroughVideo className="mt-2 border border-ink-100" />
        </div>
      </motion.div>
    </div>
  );
}
