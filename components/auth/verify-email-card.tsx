"use client";
import authStyles from "./auth-scene.module.css";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { readCreationBrief } from "@/lib/creation-brief";
import { CheckCircle2, Loader2, MailCheck } from "lucide-react";
import { AuthSurface } from "./auth-surface";
import { AceternityButton, AceternityInput } from "@/components/ui/aceternity";

export function VerifyEmailPendingCard({ initialEmail = "" }: { initialEmail?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"verify" | "resend" | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function submit(action: "verify" | "resend") {
    setBusy(action);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/auth/email-verification/${action === "verify" ? "confirm" : "resend"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "verify" ? { email, code } : { email }),
      });
      const data = await response.json().catch(() => null) as { error?: string; message?: string } | null;
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("Too many attempts. Please wait a few minutes before trying again.");
        }
        throw new Error(data?.error || "Something went wrong. Please try again.");
      }
      if (action === "resend") {
        setCode("");
        setCooldown(60);
        setMessage(data?.message || "A new code has been sent. Check your inbox.");
      } else {
        window.dispatchEvent(new Event("magnets:navigation-start"));
        router.replace(readCreationBrief() ? "/create" : "/dashboard/pages?verified=1");
        router.refresh();
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
    setBusy(null);
  }

  function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit("verify");
  }

  return (
    <AuthSurface>
      <MailCheck className="mx-auto h-10 w-10 text-brand-orange" />
      <h1 className="mt-5 text-center text-3xl font-semibold">Check your inbox</h1>
      <p className={authStyles.verificationIntro}>
        Enter the six-digit code sent to
        {initialEmail ? <strong className={authStyles.verificationEmail}>{initialEmail}</strong> : " your email."}
      </p>
      <form className="mt-7 space-y-4" onSubmit={verify}>
        {!initialEmail && (
          <label className="block">
            <span className="mb-2 block text-sm">Email address</span>
            <AceternityInput type="email" autoComplete="email" required value={email}
              onChange={(event) => setEmail(event.target.value)} disabled={Boolean(busy)} />
          </label>
        )}
        <label className="block">
          <span className="mb-2 block text-sm">Verification code</span>
          <input className={authStyles.verificationCode} type="text" inputMode="numeric"
            autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="000000"
            required value={code} disabled={Boolean(busy)} aria-describedby="verification-hint"
            onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, "").slice(0, 6))} />
        </label>
        <p id="verification-hint" className="text-center text-sm">Your code expires in 10 minutes.</p>
        {error && <p role="alert" className={authStyles.verificationError}>{error}</p>}
        {message && <p role="status" className={authStyles.verificationMessage}>{message}</p>}
        <button className={authStyles.verificationSubmit} type="submit" disabled={Boolean(busy) || code.length !== 6 || !email}>
          {busy === "verify" ? "Verifying..." : "Verify email"}
        </button>
        <button className={authStyles.verificationResend} type="button"
          disabled={Boolean(busy) || cooldown > 0 || !email} onClick={() => void submit("resend")}>
          {busy === "resend" ? "Sending..." : cooldown ? `Resend code in ${cooldown}s` : "Resend code"}
        </button>
      </form>
      <p className="mt-5 text-center text-sm leading-6">
        Already verified? <Link href="/login">Sign in</Link>
      </p>
    </AuthSurface>
  );
}

export function VerifyEmailConfirmCard({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/email-verification/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok)
        throw new Error(data?.error || "Could not verify this email.");
      window.dispatchEvent(new Event("magnets:navigation-start"));
      router.replace(
        readCreationBrief() ? "/create" : "/dashboard/pages?verified=1",
      );
      router.refresh();
    } catch (confirmError) {
      setError(
        confirmError instanceof Error
          ? confirmError.message
          : "Could not verify this email.",
      );
      setBusy(false);
    }
  }

  return (
    <AuthSurface>
      <CheckCircle2 className="mx-auto h-10 w-10 text-brand-orange" />
      <h1 className="mt-5 text-center text-2xl font-semibold text-ink-950">
        Confirm your email
      </h1>
      <p className="mt-2 text-center text-sm leading-6 text-ink-600">
        One last step. Confirm this address to activate your Magnets account.
      </p>
      {error && (
        <p className="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
          {error}
        </p>
      )}
      <AceternityButton
        className="mt-6 w-full"
        disabled={busy || !token}
        onClick={confirm}
        size="md"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy ? "Verifying..." : "Verify email address"}
      </AceternityButton>
      {!token && (
        <p className="mt-4 text-center text-xs text-red-700">
          This link is incomplete. Request a new verification email.
        </p>
      )}
      <p className="mt-5 text-center text-xs leading-5 text-ink-500">
        <Link
          className="font-medium text-ink-800 underline-offset-4 hover:underline"
          href="/verify-email"
        >
          Request a new code
        </Link>
      </p>
    </AuthSurface>
  );
}
