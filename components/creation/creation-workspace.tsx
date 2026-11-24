"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Mail,
  Plus,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { hasWorkspaceAssistantConnection, type AssistantProvider } from "@/lib/assistant-provider";
import { platformLeadMagnetPath } from "@/lib/platform-username";
import { UsernameStep } from "./username-step";
import { BrandImport } from "./brand-import";
import { AssistantHandoff } from "./assistant-handoff";
import { AssistantSetup } from "./assistant-setup";
import type { CreationBrand } from "@/lib/types";
import { MagnetsLogo } from "@/components/magnets-logo-mark";
import {
  readCreationBrief,
  saveCreationBrief,
  clearCreationBrief,
} from "@/lib/creation-brief";
import {
  type CampaignPackage,
} from "@/lib/campaign-schema";
import { campaignDeliveryBody } from "@/lib/campaign-email";
import { exampleCampaign } from "@/lib/campaign-example";
import {
  renderDeliveryEmailHtml,
  renderFollowUpEmailHtml,
} from "@/lib/email-render";
import type { CampaignRecord } from "@/lib/platform-store";
import styles from "./creation-workspace.module.css";
type Connection = { id: string; name: string; created_at: string; access?: string; provider?: AssistantProvider | null };
type Panel = "resource" | "page" | "emails";
const demoStages = ["Creating the resource", "Designing the cover", "Building the landing page", "Writing the emails"];

export function CreationWorkspace({
  preview,
  connectionOrigin,
  initialBrand = null,
  initialUsername = "",
  initialPublishingReady = false,
  creatorName = "My magnets",
  initialSavedBrief = null,
  initialCampaigns,
  startNew = false,
  initialConnections,
  initialPanel = "resource",
  embedded = false,
  framed = false,
  initialSample,
  focused: initiallyFocused = false,
}: {
  preview: boolean;
  connectionOrigin?: string;
  initialBrand?: CreationBrand | null;
  initialUsername?: string;
  initialPublishingReady?: boolean;
  creatorName?: string;
  initialSavedBrief?: { request_id: string; brief: string; format: string } | null;
  initialPanel?: Panel;
  embedded?: boolean;
  framed?: boolean;
  initialSample?: boolean;
  focused?: boolean;
  initialCampaigns: CampaignRecord[];
  startNew?: boolean;
  initialConnections: Connection[];
}) {
  const [brief, setBrief] = useState(initialSavedBrief?.brief || "");
  const [brand, setBrand] = useState(initialBrand);
  const [ideaSubmitted, setIdeaSubmitted] = useState(Boolean(initialSavedBrief));
  const [brandReviewed, setBrandReviewed] = useState(false);
  const [username, setUsername] = useState(initialUsername);
  const [publishingReady, setPublishingReady] = useState(initialPublishingReady || Boolean(initialUsername));
  const [demoStep, setDemoStep] = useState(-1);
  const demoHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!preview || demoStep < 0 || demoStep >= demoStages.length) return;
    const timer = window.setTimeout(() => setDemoStep(step => step + 1), 1100);
    return () => window.clearTimeout(timer);
  }, [preview, demoStep]);
  const nextStepHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (ideaSubmitted) nextStepHeading.current?.focus(); }, [ideaSubmitted, brandReviewed, publishingReady]);
  const [format, setFormat] = useState(initialSavedBrief?.format || "checklist");
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [connections, setConnections] = useState(initialConnections);
  const [selected, setSelected] = useState(startNew ? "" : initialCampaigns[0]?.id || "");
  const [sample, setSample] = useState(initialSample ?? preview);
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(initialPanel);
  const [emailIndex, setEmailIndex] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [connect, setConnect] = useState<"ChatGPT" | "Claude" | null>(null);
  const [handoff, setHandoff] = useState<"ChatGPT" | "Claude" | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [json, setJson] = useState("");
  const [importFollowUps, setImportFollowUps] = useState(false);
  const [origin, setOrigin] = useState("");
  const coverUpload = useRef<HTMLInputElement>(null);
  const importKey = useRef("");
  const pendingRequest = useRef(initialCampaigns.some(c => c.request_id === initialSavedBrief?.request_id) ? "" : initialSavedBrief?.request_id || "");
  const dialog = useRef<HTMLDialogElement>(null);
  const importDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!initialSavedBrief && !startNew) setBrief(readCreationBrief());
    setOrigin(location.origin);
    const id = new URLSearchParams(location.search).get("campaign");
    if (id) setSelected(id);
  }, [initialSavedBrief, startNew]);
  useEffect(() => {
    if (connect) dialog.current?.showModal();
    else dialog.current?.close();
  }, [connect]);
  useEffect(() => {
    if (demoStep === 0 || demoStep === demoStages.length) demoHeading.current?.focus();
  }, [demoStep]);
  useEffect(() => {
    if (importOpen) importDialog.current?.showModal();
    else importDialog.current?.close();
  }, [importOpen]);
  useEffect(() => {
    if (preview) return;
    async function refresh() {
      if (document.hidden) return;
      try {
        const [a, b] = await Promise.all([
          fetch("/api/campaigns"),
          fetch("/api/assistant-connections"),
        ]);
        if (a.ok) {
          const rows: CampaignRecord[] = (await a.json()).campaigns;
          setCampaigns(rows);
          setSelected(current => current || (!startNew ? rows[0]?.id : "") || "");
          const created = rows.find(c => c.request_id === pendingRequest.current);
          if (created) {
            setSelected(created.id);
            setSample(false);
            setConnect(null);
            setHandoff(null);
            pendingRequest.current = '';
            clearCreationBrief();
          }
        }
        if (b.ok) setConnections((await b.json()).connections);
      } catch {
        /* Keep the last confirmed list while offline. */
      }
    }
    const timer = setInterval(refresh, 10000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [preview, startNew]);
  const selectedCampaign = campaigns.find((c) => c.id === selected);
  const focused = initiallyFocused && !selectedCampaign;
  const content: CampaignPackage | null = sample
    ? exampleCampaign
    : selectedCampaign?.content || null;
  const activeEmailIndex = Math.min(emailIndex, content?.followUps.length || 0);
  const published = Boolean(!sample && selectedCampaign?.published_at);
  const publicUrl = published
    ? `${origin}${platformLeadMagnetPath(username, selectedCampaign?.slug || "", selectedCampaign?.lead_magnet_id || "")}`
    : "";
  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(`${label} copied.`);
    } catch {
      setMessage(
        "Clipboard access was blocked. Select and copy the text instead.",
      );
    }
  }
  async function checkConnection() {
    const response = await fetch('/api/assistant-connections', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Could not check connection.');
    const body: { connections: Connection[] } = await response.json();
    setConnections(body.connections);
    return hasWorkspaceAssistantConnection(body.connections, connect);
  }
  async function continueWithAssistant(provider: AssistantProvider) {
    if (preview) { setConnect(provider); return; }
    setBusy(true);
    setMessage('');
    try {
      // Recheck the grant rather than trusting a stale tab or local setup progress.
      const response = await fetch('/api/assistant-connections', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('Could not check connection');
      const body: { connections: Connection[] } = await response.json();
      setConnections(body.connections);
      if (hasWorkspaceAssistantConnection(body.connections, provider)) setHandoff(provider);
      else setConnect(provider);
    } catch {
      setConnect(provider);
    } finally { setBusy(false); }
  }
  async function submitIdea(provider?: "ChatGPT" | "Claude") {
    if (!brief.trim()) return;
    if (preview) { setIdeaSubmitted(true); return; }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch('/api/campaigns/brief', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief, format }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not save your idea. Please retry.');
      pendingRequest.current = body.savedBrief.request_id;
      setIdeaSubmitted(true);
      if (provider) await continueWithAssistant(provider);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save your idea. Please retry.');
    } finally { setBusy(false); }
  }
  async function importPackage() {
    if (preview) {
      setMessage(
        "Import requires an isolated staging database. This preview does not save accounts or campaigns.",
      );
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const campaign = JSON.parse(
        json.replace(/^```(?:json)?\s*|\s*```$/g, ""),
      );
      if (!importKey.current) importKey.current = crypto.randomUUID();
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: importKey.current, brief, campaign, followUpsRequested: importFollowUps }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setCampaigns((c) => [
        body.campaign,
        ...c.filter((x) => x.id !== body.campaign.id),
      ]);
      setSelected(body.campaign.id);
      setSample(false);
      setImportOpen(false);
      setJson("");
      importKey.current = "";
      clearCreationBrief();
      setMessage(
        body.publicationError || (body.publicUrl ? "Your page is live. You can edit it here and share its link." : "Your campaign is saved. Open the editor to check its publishing status."),
      );
    } catch (error) {
      setMessage(
        error instanceof SyntaxError
          ? "That is not valid JSON. Copy the complete package from your assistant."
          : error instanceof Error
            ? error.message
            : "Import failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function uploadCover(file: File) {
    if (!selectedCampaign || published) return;
    setBusy(true); setMessage("");
    let bitmap: ImageBitmap | undefined;
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024)
        throw new Error('Choose a PNG, JPG or WebP up to 10 MB.');
      bitmap = await createImageBitmap(file);
      if (bitmap.width * bitmap.height > 16000000) throw new Error('Choose an image under 16 megapixels.');
      const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not prepare this image.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const imageBase64 = canvas.toDataURL('image/webp', 0.85).split(',')[1];
      const response = await fetch(`/api/campaigns/${selectedCampaign.id}/cover`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageBase64 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not upload image.');
      setCampaigns(rows => rows.map(row => row.id === selectedCampaign.id ? { ...row, revision: row.revision + 1 } : row));
      setMessage('Image added to your lead magnet. Review it, then publish when ready.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not upload image.'); }
    finally { bitmap?.close(); setBusy(false); if (coverUpload.current) coverUpload.current.value = ''; }
  }
  async function publish() {
    if (!selectedCampaign) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/campaigns/${selectedCampaign.id}/publish`,
        { method: "POST" },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setCampaigns((c) =>
        c.map((x) =>
          x.id === selectedCampaign.id
            ? { ...x, published_at: new Date().toISOString() }
            : x,
        ),
      );
      setMessage("Your page is live. Write an amazing post, include your URL, and start capturing emails.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Publishing failed. Your draft is saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    const response = await fetch("/api/assistant-connections", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (response.ok) {
      setConnections((c) => c.filter((x) => x.id !== id));
      setMessage("Assistant access revoked.");
    } else setMessage("Could not disconnect. Please retry.");
  }
  return (
    <div className={`${styles.shell} ${embedded ? styles.embedded : ""} ${framed ? styles.framed : ""} ${focused ? styles.focused : ""}`}>
      {!focused && <header className={styles.header}>
        <Link href="/">
          <MagnetsLogo variant="light" />
        </Link>
        <div>
          {preview && <Link href="/preview">Dashboard <ArrowRight size={14} /></Link>}
          {!preview && (
            <Link href="/dashboard/home">
              Dashboard <ArrowRight size={14} />
            </Link>
          )}
        </div>
      </header>}
      {preview && !focused && (
        <div className={styles.notice}>
          Design preview · Sample campaign · Account creation, publishing, and
          external connections are disabled. Database writes are blocked.
        </div>
      )}
      {(focused || (preview && demoStep >= 0)) && <>
        <header className={styles.focusHeader}>
          <Link href="/" aria-label="Magnets home"><MagnetsLogo variant="light" /></Link>
        </header>
        <main className={styles.focusMain}>
          <div className={styles.motionScene} aria-hidden="true">
            <div className={styles.softGlow} />
            <div className={styles.ideaOrbit}><i /><i /></div>
            <div className={styles.floatingBook}><div><span /><i /><i /><i /><b /></div></div>
            <div className={styles.floatingSheet}><span /><i /><i /><i /></div>
            <div className={styles.floatingEnvelope}><span /></div>
            <span className={styles.ideaSpark} /><span className={styles.ideaSpark} /><span className={styles.ideaSpark} />
          </div>
          {!preview && handoff ? <AssistantHandoff provider={handoff} /> : preview && demoStep >= 0 ? <section className={`${styles.ideaStart} ${styles.demoStage}`}>
            <span className={styles.demoLabel}>EXAMPLE WALKTHROUGH</span>
            {demoStep < demoStages.length ? <>
              <h1 ref={demoHeading} tabIndex={-1}>One idea.<br />Coming together.</h1>
              <p>A preview of what creation will look like.</p>
              <div className={styles.demoProgress} aria-hidden="true"><span style={{width:`${(demoStep + 1) / demoStages.length * 100}%`}} /></div>
              <p className={styles.demoCurrent} role="status"><Sparkles size={18}/>{demoStages[demoStep]}</p>
              <button className={styles.demoSkip} onClick={() => setDemoStep(demoStages.length)}>Skip to the example <ArrowRight size={14}/></button>
            </> : <>
              <h1 ref={demoHeading} tabIndex={-1}>Everything.<br />Ready to review.</h1>
              <p>Your resource, page and emails. Together.</p>
              <div className={styles.demoResult}><FileText size={25}/><div><span>Sample campaign</span><strong>{exampleCampaign.title}</strong></div><Check size={18}/></div>
              <Link className={styles.demoNext} href="/preview/resource">Explore the result <ArrowRight size={17}/></Link>
              <small>This is a fixed example, not content generated from your idea.</small>
            </>}
          </section> : !ideaSubmitted ? <section className={styles.ideaStart}>
            <h1>What’s your idea?</h1>
            <p>Turn what you know into a lead magnet people want.</p>
            <form onSubmit={e => { e.preventDefault(); void submitIdea(); }}>
              <label htmlFor="first-idea" className="sr-only">Your lead magnet idea</label>
              <textarea id="first-idea" required maxLength={1200} value={brief} placeholder="A lead magnet about…" onChange={e => { setBrief(e.target.value); saveCreationBrief(e.target.value); }} />
              <button type="submit" disabled={busy || !brief.trim()}>{busy ? "Saving your idea…" : "Create my lead magnet"} <ArrowRight size={17} /></button>
            </form>
            <small>A rough idea is all you need.</small>
          </section> : !preview && !brandReviewed ? <section className={styles.ideaStart}>
            <h1 ref={nextStepHeading} tabIndex={-1}>Make it look like you.</h1>
            <p>Add your website. We’ll find your name, logo and colours for you to review before your assistant starts creating.</p>
            <BrandImport inline currentBrand={brand} onApplied={next => { setBrand(next); setBrandReviewed(true); }} />
            <button className={styles.brandSkip} onClick={() => setBrandReviewed(true)}>Skip for now. Use my current brand <ArrowRight size={15} /></button>
            <small>You can change your brand later in Magnets.</small>
          </section> : !preview && !publishingReady ? <UsernameStep suggestedName={brand?.logoText || creatorName} onComplete={value => { setUsername(value); setPublishingReady(true); }} /> : <section className={styles.ideaStart}>
            <h1 ref={nextStepHeading} tabIndex={-1}>Create with your assistant.</h1>
            <p>Choose the assistant you already use.</p>
            <div className={styles.ideaSummary}><p>{brief}</p><button onClick={() => setIdeaSubmitted(false)}>Edit idea</button></div>
            {!preview && <button className={styles.brandSkip} onClick={() => setBrandReviewed(false)}>Review my brand</button>}
            <div className={styles.focusProviders}>
              <button disabled={busy} onClick={() => { void continueWithAssistant("ChatGPT"); }}>Continue with ChatGPT <ArrowRight size={17} /></button>
              <button disabled={busy} onClick={() => { void continueWithAssistant("Claude"); }}>Continue with Claude <ArrowRight size={17} /></button>
            </div>
            <small>Uses your assistant’s plan. One-time connection required.</small>
            {!preview && username && <small>Your links: magnets.so/{username}/your-lead-magnet</small>}
            {!preview && <p className={styles.costNote}>Your idea is saved. Ask your assistant to create it, then return here to review the result.</p>}
            {!preview && <Link className={styles.brandSkip} href="/dashboard/home">Set up later. Go to my dashboard <ArrowRight size={15} /></Link>}
            {preview && <Link className={styles.exampleLink} href="/preview/resource">See a sample result <ArrowRight size={13} /></Link>}
          </section>}
          {message && <p role="status" className={styles.message}>{message}</p>}
        </main>
        <footer className={styles.focusFooter}>{preview ? "Design preview · Creation is disabled" : "Completed assistant-created pages publish automatically"}</footer>
      </>}
      {!focused && handoff && <main className={styles.handoffMain}><AssistantHandoff provider={handoff} /></main>}
      {!focused && !handoff && !(preview && demoStep >= 0) && <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <Link href={preview ? "/preview" : "/dashboard"} className={styles.back}>
            <ArrowLeft size={13} /> Back to dashboard
          </Link>
          {!preview && <BrandImport currentBrand={brand} onApplied={next => setBrand(next)} />}
          <details className={styles.newCampaign} open={!content}>
          <summary><Plus size={15} /> Create another lead magnet</summary>
          <div className={styles.kicker}>CREATE A LEAD MAGNET</div>
          <h1>
            Your next
            <br />
            lead magnet.
          </h1>
          <p className={styles.intro}>
            Describe who it helps and what it helps them do.
            <br />
            Your assistant does the writing. Magnets brings it together.
          </p>
          <label className={styles.label} htmlFor="creation-brief">
            What do you want to share?
          </label>
          <textarea
            id="creation-brief"
            value={brief}
            maxLength={1200}
            placeholder="A checklist to help freelancers price their next project…"
            onChange={(e) => {
              setBrief(e.target.value);
              saveCreationBrief(e.target.value);
            }}
          />
          <label className={styles.label} htmlFor="resource-format">
            Make it a
          </label>
          <select
            id="resource-format"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          >
            {[
              "checklist",
              "cheat-sheet",
              "worksheet",
              "guide",
              "templates",
            ].map((f) => (
              <option key={f} value={f}>
                {f.replace("-", " ")}
              </option>
            ))}
          </select>
          <div className={styles.providers}>
            <button disabled={busy || !brief.trim()} onClick={() => void submitIdea("ChatGPT")}>
              Create with ChatGPT <ArrowRight size={15} />
            </button>
            <button disabled={busy || !brief.trim()} onClick={() => void submitIdea("Claude")}>
              Create with Claude <ArrowRight size={15} />
            </button>
          </div>
          <button
            className={styles.textButton}
            onClick={() => {
              setImportOpen(true);
              setMessage("");
            }}
          >
            <Upload size={13} /> Import a campaign from your chat
          </button>
          <p className={styles.costNote}>
            Generation uses your assistant’s plan and limits. Magnets does not
            call a paid AI API in this workflow.
          </p>
          </details>
          {connections.length > 0 && (
            <div className={styles.saved}>
              <h3>Connected assistants</h3>
              {connections.map((c) => (
                <div key={c.id} className={styles.connection}>
                  <span>
                    <Check size={12} />
                    {c.name}
                  </span>
                  <button onClick={() => revoke(c.id)}>Disconnect</button>
                </div>
              ))}
            </div>
          )}
          {campaigns.length > 0 && (
            <div className={styles.saved}>
              <h3>Your campaigns</h3>
              {campaigns.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelected(c.id);
                    setSample(false);
                  }}
                >
                  <FileText size={13} />
                  {c.content.title}
                  <span>{c.published_at ? "Live" : "Draft"}</span>
                </button>
              ))}
            </div>
          )}
        </aside>
        <section className={styles.workspace}>
          <div className={styles.workTop}>
            <div>
              <span className={styles.kicker}>
                {sample
                  ? "AN EXAMPLE OF WHAT YOU CAN MAKE"
                  : published
                    ? "READY TO SHARE"
                    : "YOUR CAMPAIGN"}
              </span>
              <h2>{content?.title || "Your campaign"}</h2>
            </div>
            <span className={styles.status}>
              {sample ? "Sample" : published ? "Published" : "Draft"}
            </span>
          </div>
          {content && !sample && selectedCampaign?.lead_magnet_id && <nav className={styles.campaignActions} aria-label="Lead magnet actions">
            {published ? <a href={publicUrl} target="_blank" rel="noopener noreferrer">View live page <ExternalLink size={17} /></a>
              : <button disabled={busy} onClick={publish}>{busy ? 'Working…' : 'Publish lead magnet'} <ArrowRight size={17} /></button>}
            <Link href={`/dashboard/pages/${selectedCampaign.lead_magnet_id}`}>Edit lead magnet <FileText size={17} /></Link>
            <Link href="/dashboard/signups">Audience <Mail size={17} /></Link>
          </nav>}
          {content && !sample && <p className={styles.reviewHint}>{published
            ? 'Write an amazing post, include your URL, and start capturing emails.'
            : 'Your draft is ready. Review each tab below, make any edits, then publish when you’re happy.'}</p>}
          <div
            className={styles.tabs}
            role="tablist"
            aria-label="Campaign preview"
          >
            {(
              [
                ["resource", FileText, "Resource"],
                ["page", ExternalLink, "Landing page"],
                ["emails", Mail, "Emails"],
              ] as const
            ).map(([key, Icon, label]) => (
              <button
                key={key}
                role={key === "page" && !sample ? undefined : "tab"}
                id={`tab-${key}`}
                aria-controls={key === "page" && !sample ? undefined : "campaign-panel"}
                aria-selected={key === "page" && !sample ? undefined : panel === key}
                disabled={key === "page" && !sample && !selectedCampaign?.lead_magnet_id}
                onClick={() => {
                  if (key === "page" && !sample) {
                    if (selectedCampaign?.lead_magnet_id) router.push(`/dashboard/pages/${selectedCampaign.lead_magnet_id}`);
                    return;
                  }
                  setPanel(key);
                }}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
          {message && (
            <p role="status" className={styles.message}>
              {message}
            </p>
          )}
          <div
            id="campaign-panel"
            role="tabpanel"
            aria-labelledby={`tab-${panel}`}
            className={styles.canvas}
          >
            {!content ? (
              <div className={styles.empty}>
                <Sparkles size={35} />
                <h3>Your campaign will appear here.</h3>
                <p>
                  Describe your resource, connect your assistant, and your
                  campaign will appear here.
                </p>

              </div>
            ) : (
              <>
                {panel === "resource" && (
                  <div className={`${styles.resource} ${!selectedCampaign?.has_cover ? styles.resourceWithoutCover : ""}`}>
                    <div className={styles.coverColumn}>
                    {!sample && selectedCampaign?.has_cover && <div
                      className={styles.cover}
                      style={
                        !sample
                          ? {
                              aspectRatio: "4/3",
                              padding: 0,
                              transform: "none",
                            }
                          : undefined
                      }
                    >
                      {!sample && (
                        <Image
                          src={`/api/campaigns/${selected}/resource?cover=1&revision=${selectedCampaign?.revision}`}
                          alt={content.title}
                          width={1200}
                          height={900}
                          unoptimized
                          style={{
                            width: "100%",
                            height: "auto",
                            position: "absolute",
                            inset: 0,
                          }}
                        />
                      )}
                    </div>}
                    {!sample && <div className={styles.coverActions}>
                      <p>{published ? "Your page is live. Change its image in the editor." : "Want an AI image? Ask your assistant to generate one and add it to this lead magnet."}</p>
                      {!published ? <>
                        <input ref={coverUpload} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1}
                          aria-label="Upload lead magnet image" onChange={event => { const file = event.target.files?.[0]; if (file) void uploadCover(file); }} />
                        <button type="button" disabled={busy} onClick={() => coverUpload.current?.click()}><Upload size={16} /> {busy ? 'Uploading…' : 'Upload image'}</button>
                      </> : <Link href={`/dashboard/pages/${selectedCampaign?.lead_magnet_id}`}>Edit page image <ArrowRight size={15} /></Link>}
                    </div>}
                    </div>
                    <div className={styles.resourceCopy}>
                      <span className={styles.kicker}>
                        WHAT YOUR SUBSCRIBERS GET
                      </span>
                      <h3>{content.title}</h3>
                      <p>{'hostedResource' in content.resource ? "Your original file is used unchanged. Open it to check the file or download a copy." : "Your resource has its own reading page. Open it to check the content, or download a PDF to keep and share."}</p>
                      {!sample && <Link className={styles.download} href={`/dashboard/campaigns/${selected}/resource`}><ExternalLink size={17} /> Open resource</Link>}
                      {!sample && (
                        <a
                          href={`/api/campaigns/${selected}/resource`}
                          className={styles.download}
                        >
                          <Download size={14} /> {'hostedResource' in content.resource ? "Download original file" : "Download PDF"}
                        </a>
                      )}
                    </div>
                  </div>
                )}
                {panel === "page" && sample && (
                  <div className={`${styles.resource} ${!selectedCampaign?.has_cover ? styles.resourceWithoutCover : ""}`}>
                    <div className={styles.resourceCopy}>
                      <span className={styles.kicker}>YOUR LANDING PAGE</span>
                      <h3>See it with your brand.</h3>
                      <p>Your page uses the logo, colours and theme saved in Brand. Open the editor to see the current page and make changes.</p>
                      {!sample && <Link className={styles.download} href={`/dashboard/pages/${selectedCampaign?.lead_magnet_id}`}><ExternalLink size={17} /> Preview and edit page</Link>}
                      {published && <a className={styles.download} href={publicUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} /> Open live page</a>}
                      <p><Link href="/dashboard/brand">Review my brand →</Link></p>
                    </div>
                  </div>
                )}
                {panel === "emails" && (
                  <div className={styles.emails}>
                    <div className={styles.emailList}>
                      {content.followUps.length === 0 && <p className={styles.emailNote}>One email with the download and how to use it. Add follow-ups only if you need them.</p>}
                      {["Delivery", ...content.followUps.map((_, i) => `Follow-up ${i + 1}`)].map((label, i) => (
                        <button
                          key={label}
                          aria-pressed={activeEmailIndex === i}
                          onClick={() => setEmailIndex(i)}
                        >
                          <span>
                            {i === 0
                              ? "Immediately"
                              : `${[0, 1, 3, 5][i]} ${i === 1 ? "day" : "days"} after previous`}
                          </span>
                          <strong>{label}</strong>
                          <small>
                            {i === 0
                              ? content.delivery.subject
                              : content.followUps[i - 1].subject}
                          </small>
                        </button>
                      ))}
                    </div>
                    <div className={styles.emailPreview}>
                      <span className={styles.kicker}>SUBJECT</span>
                      <h3>
                        {activeEmailIndex === 0
                          ? content.delivery.subject
                          : content.followUps[activeEmailIndex - 1].subject}
                      </h3>
                      <p>
                        {activeEmailIndex === 0
                          ? content.delivery.preview
                          : content.followUps[activeEmailIndex - 1].preview}
                      </p>
                      <button className={styles.download} onClick={() => copy(
                        `Subject: ${activeEmailIndex === 0 ? content.delivery.subject : content.followUps[activeEmailIndex - 1].subject}\n\n${activeEmailIndex === 0
                          ? campaignDeliveryBody(content, selectedCampaign ? `${origin}/campaign-resources/${selectedCampaign.public_token}` : "[Resource link]")
                          : content.followUps[activeEmailIndex - 1].body}`,
                        "Email",
                      )}><Copy size={16} /> Copy email</button>
                      <iframe
                        title="Email preview"
                        sandbox=""
                        srcDoc={
                          activeEmailIndex === 0
                            ? renderDeliveryEmailHtml(
                                campaignDeliveryBody(content, selectedCampaign
                                    ? `${origin}/campaign-resources/${selectedCampaign.public_token}`
                                    : "https://example.invalid/your-resource"),
                                content.delivery.preview,
                              )
                            : renderFollowUpEmailHtml(
                                content.followUps[activeEmailIndex - 1].body,
                                content.followUps[activeEmailIndex - 1].preview,
                                "#unsubscribe-preview",
                              )
                        }
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          {content && (
            <div className={styles.actionBar}>
              <span>
                <Check size={13} />
                {sample
                  ? "Example content for preview"
                  : published
                    ? "Your campaign is ready to share"
                    : "Review the content before publishing"}
              </span>
              {sample && embedded ? (
                <Link href="/preview/create">Start with my idea <ArrowRight size={14} /></Link>
              ) : sample ? (
                <button
                  className={styles.secondary}
                  onClick={() => {
                    setSample(false);
                    setSelected("");
                  }}
                >
                  Start with my idea <Plus size={14} />
                </button>
              ) : published ? (
                <button onClick={() => copy(publicUrl, "Public URL")}>
                  Copy your link <Copy size={14} />
                </button>
              ) : (
                <div>
                  {selectedCampaign?.lead_magnet_id && (
                    <Link
                      href={`/dashboard/pages/${selectedCampaign.lead_magnet_id}`}
                    >
                      Edit campaign
                    </Link>
                  )}
                  <button disabled={busy} onClick={publish}>
                    {busy ? "Preparing your campaign…" : "Publish campaign"}
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>}
      <dialog
        ref={dialog}
        className={`${styles.dialog} ${!preview ? styles.connectionDialog : ""}`}
        onCancel={() => setConnect(null)}
      >
        <button
          className={styles.close}
          aria-label="Close connection instructions"
          onClick={() => setConnect(null)}
        >
          <X size={19} />
        </button>
        {preview ? <>
          <h2>See it come together.</h2>
          <p>Preview the creation steps, then explore a complete example.</p>
          <button className={styles.primary} onClick={() => { setConnect(null); setDemoStep(0); }}>Show me the next step <ArrowRight size={16}/></button>
          <p className={styles.costNote}>Demo only. No assistant connection or AI generation.</p>
        </> : connect ? <AssistantSetup key={connect} provider={connect} origin={connectionOrigin || origin}
          connected={hasWorkspaceAssistantConnection(connections, connect)}
          onCheckConnection={checkConnection} onReady={() => { setHandoff(connect); setConnect(null); }} /> : null}
      </dialog>
      <dialog
        ref={importDialog}
        className={styles.dialog}
        onCancel={() => setImportOpen(false)}
      >
        <button
          className={styles.close}
          aria-label="Close import"
          onClick={() => setImportOpen(false)}
        >
          <X size={19} />
        </button>
        <span className={styles.kicker}>BRING YOUR CAMPAIGN HOME</span>
        <h2>Import from your chat</h2>
        <p>
          Paste the complete JSON campaign your assistant returned. We’ll
          validate the content and publish your completed landing page automatically.
        </p>
        <textarea
          aria-label="Campaign JSON"
          value={json}
          onChange={(e) => {
            setJson(e.target.value);
            importKey.current = "";
          }}
          placeholder={'{ "format": "checklist", "title": "…", … }'}
        />
        <label className={styles.importOption}>
          <input type="checkbox" checked={importFollowUps} onChange={event => setImportFollowUps(event.target.checked)} />
          Include the follow-up emails I requested in this package
        </label>
        {message && <p role="status">{message}</p>}
        <button
          className={styles.primary}
          disabled={busy || !json.trim()}
          onClick={importPackage}
        >
          {busy ? "Saving…" : "Import campaign"}
          <Upload size={14} />
        </button>
      </dialog>
    </div>
  );
}
