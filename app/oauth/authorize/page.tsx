import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentDashboardBase } from "@/lib/auth";
import { assistantEnabled, validateAuthorization, WORKSPACE_ASSISTANT_SCOPE } from "@/lib/assistant-auth";
import { MagnetsLogo } from "@/components/magnets-logo-mark";
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  if (!assistantEnabled())
    return (
      <main className="p-10">
        Assistant connections are not enabled in this environment.
      </main>
    );
  const params = await searchParams;
  let authorization;
  try {
    authorization = await validateAuthorization(params);
  } catch {
    return (
      <main className="p-10">
        This connection request is invalid. Return to your assistant and try
        again.
      </main>
    );
  }
  const payload = await getCurrentDashboardBase();
  if (!payload)
    redirect(
      `/login?next=${encodeURIComponent("/oauth/authorize?" + new URLSearchParams(params))}`,
    );
  const workspace = authorization.args.scope === WORKSPACE_ASSISTANT_SCOPE;
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#141310] p-4 text-[#f4f3ed]">
      <div className="flex max-h-[calc(100dvh-32px)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-[#38362f] bg-[#1c1a16] p-5 shadow-2xl sm:p-8">
        <div className="min-h-0 overflow-y-auto overscroll-contain pr-1" tabIndex={0} role="region" aria-label="Connection permissions">
        <MagnetsLogo variant="light" />
        <h1 className="mt-8 text-2xl font-semibold">Connect your assistant</h1>
        <p className="mt-3 text-sm text-[#c4bcae]">
          {authorization.client.name} is requesting access to {workspace ? "manage your Magnets workspace" : "create lead magnets in your Magnets account"}.
        </p>
        <p className="mt-2 break-all text-xs text-[#a79e90]">
          Connection returns to{" "}
          {new URL(authorization.args.redirect_uri).origin}
        </p>
        <ul className="my-6 space-y-3 text-sm">
          <li>✓ Use your saved brand name, logo and colours</li>
          <li>✓ Create, review and edit campaign copy</li>
          <li>✓ Upload files you select as lead magnets, attach covers and publish campaigns you approve</li>
          {workspace ? <>
            <li>✓ Read and edit all your lead magnets, including existing pages</li>
            <li>✓ View, import, export and delete signups; view analytics</li>
            <li>✓ Manage branding, publishing settings, files and email sequences</li>
            <li>✓ Make live changes or delete items when you ask</li>
          </> : <li>✓ Read campaigns created through this connection workflow. Live edits require your permission</li>}
        </ul>
        <p className="mb-6 text-xs leading-5 text-[#a79e90]">
          {workspace ? "Passwords, integration secrets and provider sign-in stay in the secure browser screens. Only connect an assistant you trust with your workspace and subscriber data." : "It cannot read subscribers, change your domain, access integration secrets, or edit existing magnets outside this workflow."} You can revoke access in Magnets at any time.
        </p>
        </div>
        <form className="mt-4 shrink-0" action="/oauth/authorize/confirm" method="post">
          {Object.entries(authorization.args).map(([name, value]) => (
            <input type="hidden" name={name} value={value} key={name} />
          ))}
          <button className="w-full rounded-lg bg-[#fe7138] p-3 text-sm font-semibold text-[#141310]">
            Connect to my Magnets account
          </button>
        </form>
        <Link href="/create" className="mt-3 block shrink-0 py-1 text-center text-sm">
          Cancel
        </Link>
      </div>
    </main>
  );
}
