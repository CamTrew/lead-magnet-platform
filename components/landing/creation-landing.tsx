"use client";

import { type FormEvent, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUpRight,
  ArrowRight,
  Check,
  CheckCheck,
  Mail,
  Sparkles,
} from "lucide-react";
import { MagnetsLogo } from "@/components/magnets-logo-mark";
import { saveCreationBrief } from "@/lib/creation-brief";
import styles from "./creation-landing.module.css";

const examples = [
  {
    label: "A pricing checklist",
    text: "I want a lead magnet about pricing my freelance work.",
  },
  {
    label: "A fitness cheat sheet",
    text: "I want a lead magnet about building a sustainable fitness routine.",
  },
  {
    label: "A LinkedIn playbook",
    text: "I want a lead magnet about finding clients on LinkedIn.",
  },
];

export function CreationLanding({ designPreview = false }: { designPreview?: boolean }) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [brief, setBrief] = useState("");
  const [placeholder, setPlaceholder] = useState("I want a lead magnet about ");
  const [focused, setFocused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [error, setError] = useState("");
  const scene = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { router.prefetch('/register?create=1'); }, [router]);

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (reduced || focused || brief) return;
    let index = 0;
    let length = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;
    function tick() {
      const text = examples[index].text;
      length += deleting ? -2 : 1;
      setPlaceholder(text.slice(0, Math.max(0, length)));
      let delay = deleting ? 19 : 43;
      if (!deleting && length >= text.length) {
        deleting = true;
        delay = 2300;
      }
      if (deleting && length <= 0) {
        deleting = false;
        index = (index + 1) % examples.length;
        delay = 350;
      }
      timer = setTimeout(tick, delay);
    }
    timer = setTimeout(tick, 550);
    return () => clearTimeout(timer);
  }, [reduced, focused, brief]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!brief.trim()) {
      setError("What would you like your lead magnet to be about?");
      input.current?.focus();
      return;
    }
    saveCreationBrief(brief);
    window.dispatchEvent(new Event("magnets:navigation-start"));
    startNavigation(() => router.push("/register?create=1"));
  }

  return (
    <div className={styles.page} data-reduced-motion={reduced}>
      <header className={styles.header}>
        <Link href="/" aria-label="Magnets home">
          <MagnetsLogo variant="light" />
        </Link>
        <nav aria-label="Main navigation" className={styles.nav}>
          {designPreview && <a href="https://magnets.so/login">Sign in on magnets.so</a>}
          <Link href={designPreview ? "/preview/signup-fields" : "/login"} prefetch>
            {designPreview ? "Try the signup form" : "Sign in"} <ArrowRight size={15} />
          </Link>
        </nav>
      </header>

      <main className={styles.main}>
        <div className={styles.ambient} aria-hidden="true" />
        <div
          ref={scene}
          className={styles.scene}
          aria-hidden="true"
          onPointerMove={(event) => {
            if (reduced || event.pointerType === "touch") return;
            const bounds = event.currentTarget.getBoundingClientRect();
            scene.current?.style.setProperty(
              "--pointer-x",
              `${((event.clientX - bounds.left) / bounds.width - 0.5) * 12}deg`,
            );
            scene.current?.style.setProperty(
              "--pointer-y",
              `${((event.clientY - bounds.top) / bounds.height - 0.5) * -9}deg`,
            );
          }}
          onPointerLeave={() => {
            scene.current?.style.setProperty("--pointer-x", "0deg");
            scene.current?.style.setProperty("--pointer-y", "0deg");
          }}
        >
          <div className={styles.orbit} />
          <div className={styles.orbitTwo} />
          <div className={styles.bookPosition}>
            <div className={styles.book}>
              <div className={styles.bookSpine} />
              <div className={styles.bookCover}>
                <span className={styles.bookEyebrow}>THE PRACTICAL GUIDE</span>
                <span className={styles.bookTitle}>
                  Big ideas.
                  <br />
                  Real
                  <br />
                  clients.
                </span>
                <ArrowUpRight className={styles.coverArrow} aria-hidden="true" strokeWidth={2.8} />
                <span className={styles.bookBottom}>
                  A little knowledge.
                  <br />A lot of possibility. <ArrowDown size={20} />
                </span>
              </div>
              <div className={styles.bookPages} />
            </div>
            <span className={styles.objectLabel}>01 / YOUR KNOW-HOW</span>
          </div>

          <div className={styles.pagePosition}>
            <div className={styles.previewCard}>
              <div className={styles.browserBar}>
                <i />
                <i />
                <i />
                <span>your next big thing</span>
              </div>
              <div className={styles.miniPage}>
                <span className={styles.miniPill}>THE FREE CHECKLIST</span>
                <strong>
                  Good work.
                  <br />
                  Better prices.
                </strong>
                <p>
                  Your next project deserves
                  <br />a better starting point.
                </p>
                <span className={styles.miniField}>
                  Your email address <ArrowRight size={11} />
                </span>
                <div className={styles.miniLines}>
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            </div>
            <span className={styles.objectLabel}>02 / YOUR LANDING PAGE</span>
          </div>

          <div className={styles.mailPosition}>
            <div className={styles.emailCard}>
              <span className={styles.mailIcon}>
                <Mail size={18} />
              </span>
              <div>
                <small>YOU’VE GOT SOMETHING GOOD</small>
                <strong>Your checklist is here.</strong>
                <span>One useful email. A new connection.</span>
              </div>
              <CheckCheck size={17} />
            </div>
          </div>
          <div className={styles.subscriberPosition}>
            <div className={styles.subscriber}>
              <span>
                <Check size={14} />
              </span>
              <div>
                <strong>A new connection</strong>
                <small>That’s where it starts.</small>
              </div>
              <Sparkles size={16} />
            </div>
          </div>
          <div className={styles.sparkOne}>✳</div>
          <div className={styles.sparkTwo}>✳</div>
          <div className={styles.dotOne} />
          <div className={styles.dotTwo} />
        </div>

        <section className={styles.hero} aria-labelledby="landing-title">
          <div className={styles.eyebrow}>
            <span /> SMALL IDEA. BIG POTENTIAL.
          </div>
          <h1 id="landing-title">
            You know something
            <br />
            people{" "}
            <span className={styles.want}>
              want.
              <svg
                viewBox="0 0 300 20"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path d="M4 13 Q135 -2 295 9 M18 18 Q165 7 275 14" />
              </svg>
            </span>
          </h1>
          <p className={styles.description}>
            Turn it into a lead magnet.
            <br className={styles.mobileBreak} /> Grow your list. Make your next
            sale.
          </p>
          <form className={styles.prompt} onSubmit={submit}>
            <label className={styles.promptLabel} htmlFor="magnet-idea">
              <Sparkles size={14} /> WHAT’S YOUR IDEA?
            </label>
            <textarea
              ref={input}
              id="magnet-idea"
              aria-describedby={error ? "idea-error" : "idea-hint"}
              maxLength={1200}
              rows={2}
              placeholder={
                focused || reduced ? "I want a lead magnet about…" : placeholder
              }
              value={brief}
              onChange={(event) => {
                setBrief(event.target.value);
                setError("");
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className={styles.promptBottom}>
              <span id="idea-hint">Your expertise. Put to work.</span>
              <button type="submit" disabled={navigating} aria-busy={navigating}>
                {navigating ? 'Opening your account…' : 'Create my magnet'} <ArrowRight size={17} />
              </button>
            </div>
          </form>
          {error && (
            <p id="idea-error" role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <div className={styles.suggestions}>
            <span>Try an idea</span>
            {examples.map((example) => (
              <button
                type="button"
                key={example.label}
                onClick={() => {
                  setBrief(example.text);
                  setError("");
                  input.current?.focus();
                }}
              >
                {example.label}
                <ArrowRight size={11} />
              </button>
            ))}
          </div>
          <div className={styles.benefits}>
            <span>
              <Check size={13} /> Free to start
            </span>
            <span>
              <Check size={13} /> No website needed
            </span>
            <span>
              <Check size={13} /> Made for your next customer
            </span>
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <span>A little magnetic attraction.</span>
        <div>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </div>
      </footer>
    </div>
  );
}
