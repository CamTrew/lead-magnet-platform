import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, ChevronDown, LockKeyhole, Mail, Sparkles } from 'lucide-react';
import { MagnetsLogo } from '@/components/magnets-logo-mark';
import styles from './auth-scene.module.css';

export function AuthScene({ children, brief, stagingPreview, mode }: {
  mode: "login" | "register";
  children: ReactNode;
  brief: string;
  stagingPreview: boolean;
}) {
  const isLogin = mode === "login";
  return (
    <main className={styles.page}>
      <div className={styles.ambient} aria-hidden="true" />
      <header className={styles.header}>
        <Link href="/" aria-label="Magnets home"><MagnetsLogo variant="light" /></Link>
        <Link href={isLogin ? "/register" : "/login"} prefetch>{isLogin ? "New around here?" : "Already a member?"} <span>{isLogin ? "Start for free" : "Sign in"} <ArrowRight size={14} /></span></Link>
      </header>
      <div className={styles.layout}>
        <section className={styles.story} aria-label="Your next creation">
          <p className={styles.eyebrow}><span /> {isLogin ? "Good to have you back." : "A little idea. A lot of possibility."}</p>
          <h2>{isLogin ? <>Your next chapter<br />is <em>waiting for you.</em></> : <>Your next big thing<br />starts <em>right here.</em></>}</h2>
          <p className={styles.intro}>{isLogin ? <>Back to your ideas. Back to your people.<br />Your lead magnets, pages, and emails. All in one place.</> : <>Turn what you know into something people want.<br />Your lead magnet, landing page, and emails. Together.</>}</p>
          <div className={styles.scene} aria-hidden="true">
            <div className={styles.orbit}><i /></div>
            <div className={styles.orbitTwo}><i /></div>
            <div className={styles.spark}><Sparkles size={24} /></div>
            <div className={styles.bookFloat}>
              <div className={styles.book}>
                <div className={styles.bookSpine} />
                <div className={styles.bookFace}>
                  <span className={styles.bookKicker}>YOUR NEXT CHAPTER</span>
                  <strong>Big ideas.<br />Real<br />possibilities.</strong>
                  <div className={styles.bookArt}><i /><i /><i /></div>
                  <span className={styles.bookFooter}>MADE BY YOU. <ArrowRight size={17} /></span>
                </div>
                <div className={styles.bookPages} />
              </div>
            </div>
            <div className={styles.pageCard}>
              <div className={styles.windowDots}><i /><i /><i /></div>
              <span className={styles.miniLabel}>YOUR LANDING PAGE</span>
              <strong>Something worth<br />signing up for.</strong>
              <div className={styles.miniLines}><i /><i /></div>
              <span className={styles.miniButton}>Get the free guide <ArrowRight size={10} /></span>
            </div>
            <div className={styles.emailCard}>
              <span className={styles.emailIcon}><Mail size={18} /></span>
              <div><span>THE FIRST HELLO</span><strong>Your guide is inside.</strong></div>
              <Check size={15} />
            </div>
            <span className={styles.sceneCaption}>ONE IDEA. EVERYTHING YOU NEED TO SHARE IT.</span>
          </div>
          <div className={styles.benefits}>
            <span><Check size={14} /> Your own space</span>
            <span><Check size={14} /> Your own audience</span>
            <span><Check size={14} /> Your next move</span>
          </div>
        </section>
        <section className={`${styles.card} ${isLogin ? styles.loginCard : styles.registerCard}`} aria-labelledby="auth-title">
          <div className={styles.cardTop}><span className={styles.freeBadge}><Sparkles size={12} /> {isLogin ? "YOUR CREATIVE HOME" : "FREE TO GET STARTED"}</span><span className={styles.step}>{isLogin ? "SIGN IN" : "01 / CREATE"}</span></div>
          <h1 id="auth-title">{isLogin ? "Welcome back." : "Make it yours."}</h1>
          {isLogin && <p className={styles.description}>A familiar place for your next big idea. Sign in to pick up where you left off.</p>}
          {!isLogin && <p className={styles.noCard}><Check size={14} /> Free account <span /> No credit card required</p>}
          {brief && <details className={styles.brief}><summary><Sparkles size={12} /> Your idea is saved <ChevronDown size={14} /></summary><p>{brief}</p></details>}
          {children}
          {stagingPreview ? (
            <div className={styles.preview}>
              <p><LockKeyhole size={12} /> Read-only staging. {isLogin ? "Sign-in" : "Signup"} is disabled.</p>
              <Link href="/preview/verification">Explore the workspace preview <ArrowRight size={13} /></Link>
            </div>
          ) : <p className={styles.reassurance}><LockKeyhole size={12} /> {isLogin ? "Your workspace. Right where you left it." : "Your idea stays here while you get set up."}</p>}
          {isLogin && <div className={styles.newAccount}><span>Something to share?</span><Link href="/register">Create a free account <ArrowRight size={14} /></Link><p>No credit card required.</p></div>}
        </section>
      </div>
      <footer className={styles.footer}><span>A small start. An open door.</span><span>Made for people with something to share.</span></footer>
    </main>
  );
}
