import type { ReactNode } from 'react';
import Link from 'next/link';
import { MagnetsLogoMark } from '@/components/magnets-logo-mark';
import styles from './auth-scene.module.css';

/** Shared dark frame for verification and account recovery. */
export function AuthSurface({ children }: { children: ReactNode }) {
  return <main className={styles.verificationPage}>
    <div className={styles.verificationPanel}>
      <Link href="/" aria-label="Magnets home" className="mb-7 flex justify-center"><MagnetsLogoMark className="h-12 w-12" /></Link>
      <div className={styles.verificationCard}>{children}</div>
    </div>
  </main>;
}
