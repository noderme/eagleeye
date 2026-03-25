"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/topbar";
import clsx from "clsx";
import { Check, ChevronDown, ChevronUp, Plus, X, Calendar, RefreshCw } from "lucide-react";
import { timeAgo } from "@/lib/github";

// ── Provider definitions ───────────────────────────────────────────────────

interface ProviderDef {
  id: string;
  name: string;
  emoji: string;
  description: string;
  category: string;
  hint?: string;
  fields: { key: string; label: string; placeholder: string; secret?: boolean }[];
}

const PROVIDERS: ProviderDef[] = [
  {
    id: "github",
    name: "GitHub",
    emoji: "🐙",
    description: "Repos, CI/CD, Actions minutes, token health",
    category: "DevOps",
    fields: [],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    emoji: "🧠",
    description: "Claude API key health and validity",
    category: "AI",
    hint: "Use any workspace API key — all keys share the same billing. Create one in Console → API Keys.",
    fields: [
      { key: "key", label: "API Key", placeholder: "sk-ant-...", secret: true },
    ],
  },
  {
    id: "supabase",
    name: "Supabase",
    emoji: "⚡",
    description: "Projects, plan tier, database and bandwidth usage",
    category: "Database",
    hint: "Use a Personal Access Token (not a project anon/service key). Create a dedicated account for your org and use its PAT so it's not tied to any one person. Get it from supabase.com/dashboard/account/tokens.",
    fields: [
      { key: "accessToken", label: "Personal Access Token", placeholder: "sbp_...", secret: true },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    emoji: "🤖",
    description: "API spend, token usage, quota limits",
    category: "AI",
    hint: "Use an Admin API key (not a regular user key) — only admin keys can read org-wide spend and limits. Create one in platform.openai.com → Organization → API Keys → Admin keys.",
    fields: [
      { key: "key", label: "Admin API Key", placeholder: "sk-admin-...", secret: true },
    ],
  },
  {
    id: "stripe",
    name: "Stripe",
    emoji: "💳",
    description: "Subscriptions, MRR, billing cycles",
    category: "Payments",
    hint: "Create a Restricted Key (not the full secret key) with read-only access to Balance and Subscriptions. Dashboard → Developers → API Keys → Create restricted key.",
    fields: [
      { key: "key", label: "Restricted API Key", placeholder: "rk_live_...", secret: true },
    ],
  },
  {
    id: "vercel",
    name: "Vercel",
    emoji: "▲",
    description: "Deployments, bandwidth, function usage, plan fit",
    category: "Hosting",
    hint: "Use a Team token (not a personal token) so it covers all projects. Create one in Team Settings → Tokens.",
    fields: [
      { key: "key", label: "Team API Token", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", secret: true },
    ],
  },
  {
    id: "resend",
    name: "Resend",
    emoji: "📧",
    description: "Email quota, domain health, sending limits",
    category: "Email",
    hint: "Use an API key scoped to your team/workspace. Create one in Resend → API Keys.",
    fields: [
      { key: "key", label: "API Key", placeholder: "re_...", secret: true },
    ],
  },
  {
    id: "twilio",
    name: "Twilio",
    emoji: "📱",
    description: "Phone numbers, messaging spend, renewal dates",
    category: "Comms",
    hint: "Use your main Account SID and Auth Token from the Twilio Console dashboard — these are org-level credentials.",
    fields: [
      { key: "accountSid", label: "Account SID", placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
      { key: "authToken", label: "Auth Token", placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", secret: true },
    ],
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

function keyExpiryBadge(expiresAt: string | undefined) {
  if (!expiresAt) return null;
  const days = daysUntil(expiresAt);
  if (days < 0) return { label: "Key expired", color: "bg-red/10 border-red/20 text-red" };
  if (days <= 7) return { label: `Key expires in ${days}d`, color: "bg-red/10 border-red/20 text-red" };
  if (days <= 30) return { label: `Key expires in ${days}d`, color: "bg-amber/10 border-amber/20 text-amber" };
  return { label: `Key expires in ${days}d`, color: "bg-surface2 border-border text-muted" };
}

// ── Component ──────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const [detected, setDetected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [keyExpiries, setKeyExpiries] = useState<Record<string, string>>({});
  const [domains, setDomains] = useState<string[]>([]);
  const [domainInput, setDomainInput] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<{ id: string; msg: string } | null>(null);
  const [showMore, setShowMore] = useState(false);

  // Custom (unknown) providers the user has added
  const [customProviders, setCustomProviders] = useState<string[]>([]);
  const [customForm, setCustomForm] = useState<{ name: string; fields: { key: string; value: string }[] } | null>(null);
  const [scanAge, setScanAge] = useState<string | null>(null);
  const [rescanning, setRescanning] = useState(false);

  async function rescan() {
    setRescanning(true);
    try {
      const scanRes = await fetch("/api/scan/trigger", { method: "POST" });
      if (scanRes.ok) {
        const { result } = await scanRes.json();
        // Save so /api/integrations/detected can read the github_data
        await fetch("/api/scan/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ result }),
        });
      }
      const detectedData = await fetch("/api/integrations/detected").then(r => r.json());
      setDetected(new Set(detectedData.detected ?? []));
      if (detectedData.scannedAt) setScanAge(timeAgo(detectedData.scannedAt));
    } finally {
      setRescanning(false);
    }
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/keys/status").then(r => r.json()),
      fetch("/api/integrations/detected").then(r => r.json()),
    ]).then(([status, detectedData]) => {
        const providers = new Set<string>((status.integrations ?? []).map((i: any) => i.provider as string));
        if (status.githubConnected) providers.add("github");
        setConnected(providers);

        const expiries: Record<string, string> = {};
        for (const row of status.integrations ?? []) {
          if (row.extra_config?.keyExpiresAt) {
            expiries[row.provider] = row.extra_config.keyExpiresAt;
          }
        }
        setKeyExpiries(expiries);

        const domainsRow = (status.integrations ?? []).find((i: any) => i.provider === "domains");
        if (domainsRow?.extra_config?.domains) setDomains(domainsRow.extra_config.domains);

        setDetected(new Set(detectedData.detected ?? []));
        if (detectedData.scannedAt) setScanAge(timeAgo(detectedData.scannedAt));

        // Any connected provider not in our PROVIDERS list is a custom one
        // Exclude llm_* providers (they live in the Analysis Engine section)
        const knownIds = new Set(PROVIDERS.map(p => p.id).concat(["domains", "llm_openai", "llm_anthropic", "llm_gemini"]));
        const custom = (status.integrations ?? [])
          .map((i: any) => i.provider as string)
          .filter((p: string) => !knownIds.has(p));
        setCustomProviders(custom);
      })
      .catch(() => {});
  }, []);

  function toggle(id: string) {
    if (id === "github") return;
    setInputs(keyExpiries[id] ? { keyExpiresAt: keyExpiries[id] } : {});
    setSaveError(null);
    setExpanded(prev => prev === id ? null : id);
  }

  async function save(id: string) {
    setSaving(id);
    setSaveError(null);
    try {
      const { keyExpiresAt, ...credentials } = inputs;
      const res = await fetch("/api/keys/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: id,
          credentials,
          extraConfig: keyExpiresAt ? { keyExpiresAt } : {},
        }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Request failed" }));
        setSaveError({ id, msg: error ?? "Failed to save key." });
        return;
      }
      if (inputs.keyExpiresAt) {
        setKeyExpiries(prev => ({ ...prev, [id]: inputs.keyExpiresAt }));
      }
      setConnected(prev => new Set([...prev, id]));
      setExpanded(null);
      setSavedMsg(id);
      setTimeout(() => setSavedMsg(null), 2000);
    } finally {
      setSaving(null);
    }
  }

  async function disconnect(id: string) {
    await fetch("/api/keys/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: id }),
    });
    setConnected(prev => { const next = new Set(prev); next.delete(id); return next; });
    setKeyExpiries(prev => { const next = { ...prev }; delete next[id]; return next; });
    setExpanded(null);
  }

  async function addDomain() {
    const d = domainInput.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!d || domains.includes(d)) return;
    const next = [...domains, d];
    setDomains(next);
    setDomainInput("");
    await fetch("/api/keys/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "domains", credentials: {}, extraConfig: { domains: next } }),
    });
    setConnected(prev => new Set([...prev, "domains"]));
  }

  async function removeDomain(d: string) {
    const next = domains.filter(x => x !== d);
    setDomains(next);
    if (next.length === 0) {
      await fetch("/api/keys/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "domains" }),
      });
      setConnected(prev => { const s = new Set(prev); s.delete("domains"); return s; });
    } else {
      await fetch("/api/keys/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "domains", credentials: {}, extraConfig: { domains: next } }),
      });
    }
  }

  async function saveCustom() {
    if (!customForm || !customForm.name.trim()) return;
    const id = customForm.name.trim().toLowerCase().replace(/\s+/g, "-");
    const credentials: Record<string, string> = {};
    for (const { key, value } of customForm.fields) {
      if (key.trim()) credentials[key.trim()] = value;
    }
    setSaving(id);
    try {
      await fetch("/api/keys/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: id, credentials, extraConfig: {} }),
      });
      setConnected(prev => new Set([...prev, id]));
      setCustomProviders(prev => prev.includes(id) ? prev : [...prev, id]);
      setCustomForm(null);
      setSavedMsg(id);
      setTimeout(() => setSavedMsg(null), 2000);
    } finally {
      setSaving(null);
    }
  }

  async function disconnectCustom(id: string) {
    await fetch("/api/keys/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: id }),
    });
    setConnected(prev => { const s = new Set(prev); s.delete(id); return s; });
    setCustomProviders(prev => prev.filter(p => p !== id));
  }

  // Split providers into sections (exclude github from the provider lists, handle separately)
  const knownIds = new Set(PROVIDERS.map(p => p.id));
  const connectedProviders = PROVIDERS.filter(p => connected.has(p.id) && p.id !== "github");
  const detectedNotConnected = PROVIDERS.filter(p => !connected.has(p.id) && detected.has(p.id) && p.id !== "github");
  const otherProviders = PROVIDERS.filter(p => !connected.has(p.id) && !detected.has(p.id) && p.id !== "github");
  // Services detected in repos that aren't in our known PROVIDERS list
  const detectedUnknown = Array.from(detected).filter(
    id => id !== "github" && !knownIds.has(id) && !connected.has(id)
  );

  function renderProviderCard(provider: ProviderDef) {
    const isConn = connected.has(provider.id);
    const isOpen = expanded === provider.id;
    const expiryBadge = keyExpiryBadge(keyExpiries[provider.id]);

    return (
      <div key={provider.id}
        className={clsx(
          "bg-surface border rounded-2xl overflow-hidden transition-all",
          isConn ? "border-border" : "border-border/60",
          isOpen && "border-cyan/30"
        )}>

        {/* Card header */}
        <div
          className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-dim transition-colors"
          onClick={() => toggle(provider.id)}
        >
          <div className="w-10 h-10 rounded-xl bg-surface2 border border-border flex items-center justify-center text-lg flex-shrink-0">
            {provider.emoji}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-text">{provider.name}</span>
              <span className="text-[9px] font-semibold uppercase tracking-[1.5px] text-muted px-1.5 py-0.5 rounded bg-dim">
                {provider.category}
              </span>
            </div>
            <p className="text-[11px] text-muted mt-0.5">{provider.description}</p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {isConn && expiryBadge && (
              <div className={clsx("flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-semibold", expiryBadge.color)}>
                <Calendar className="w-3 h-3" />
                {expiryBadge.label}
              </div>
            )}
            {isConn && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green/10 border border-green/20 text-green text-[10px] font-semibold">
                <Check className="w-3 h-3" />
                Connected
              </div>
            )}
            {isOpen
              ? <ChevronUp className="w-4 h-4 text-muted" />
              : <ChevronDown className="w-4 h-4 text-muted" />
            }
          </div>
        </div>

        {/* Expanded credential form */}
        {isOpen && (
          <div className="px-5 pb-5 border-t border-border pt-4 bg-dim/30">
            <div className="flex flex-col gap-3">
              {provider.hint && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-cyan/5 border border-cyan/15">
                  <span className="text-cyan text-[11px] mt-px">ⓘ</span>
                  <p className="text-[11px] text-muted leading-relaxed">{provider.hint}</p>
                </div>
              )}
              {provider.fields.map(field => (
                <div key={field.key}>
                  <label className="text-[10px] font-semibold text-muted uppercase tracking-[1px] block mb-1.5">
                    {field.label}
                  </label>
                  <input
                    type={field.secret ? "password" : "text"}
                    value={inputs[field.key] ?? ""}
                    onChange={e => setInputs(prev => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-[12px] font-mono text-text placeholder:text-muted/50 outline-none focus:border-cyan/40 transition-colors"
                  />
                </div>
              ))}

              {/* Key validity note */}
              <p className="text-[10px] text-muted">
                Eagle Eye will automatically validate this key when you save and alert you if it becomes invalid.
              </p>

              {saveError?.id === provider.id && (
                <div className="mb-2 px-3 py-2 rounded-lg bg-red/8 border border-red/20 text-[11px] text-red flex items-start gap-2">
                  <span className="flex-shrink-0 mt-0.5">✗</span>
                  <span>{saveError.msg}</span>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => save(provider.id)}
                  disabled={!!saving}
                  className="flex items-center gap-1.5 px-4 py-2 bg-cyan text-bg text-[12px] font-bold rounded-lg hover:bg-cyan/90 transition-colors disabled:opacity-60"
                >
                  <Check className="w-3.5 h-3.5" />
                  {saving === provider.id ? "Validating..." : savedMsg === provider.id ? "Saved!" : isConn ? "Update" : "Connect"}
                </button>
                {isConn && (
                  <button
                    onClick={() => disconnect(provider.id)}
                    className="px-4 py-2 text-[12px] text-red border border-red/20 rounded-lg hover:bg-red/5 transition-colors"
                  >
                    Disconnect
                  </button>
                )}
                <button
                  onClick={() => setExpanded(null)}
                  className="px-4 py-2 text-[12px] text-muted hover:text-text transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <Topbar title="Integrations" />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-8">

        {/* Page header */}
        <div>
          <h1 className="text-[22px] font-bold text-text">Integrations</h1>
          <p className="text-[13px] text-muted mt-1">
            Connect your tools so Eagle Eye can monitor spend, health, and expiry.
          </p>
        </div>

        {/* ── GitHub (always shown at top) ── */}
        <section className="flex flex-col gap-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-muted">Source control</h2>
          <div className={clsx(
            "bg-surface border rounded-2xl overflow-hidden",
            connected.has("github") ? "border-border" : "border-border/60"
          )}>
            <div className="flex items-center gap-4 px-5 py-4">
              <div className="w-10 h-10 rounded-xl bg-surface2 border border-border flex items-center justify-center text-lg flex-shrink-0">
                🐙
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-text">GitHub</span>
                  <span className="text-[9px] font-semibold uppercase tracking-[1.5px] text-muted px-1.5 py-0.5 rounded bg-dim">
                    DevOps
                  </span>
                </div>
                <p className="text-[11px] text-muted mt-0.5">Repos, CI/CD, Actions minutes, token health</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {connected.has("github") ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green/10 border border-green/20 text-green text-[10px] font-semibold">
                    <Check className="w-3 h-3" />
                    Connected
                  </div>
                ) : (
                  <a
                    href="/"
                    className="text-[11px] text-cyan px-3 py-1.5 rounded-lg border border-cyan/30 bg-cyan/5 hover:bg-cyan/10 transition-colors"
                  >
                    Connect via OAuth
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── Connected integrations ── */}
        {(connectedProviders.length > 0 || domains.length > 0) && (
          <section className="flex flex-col gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-muted">Connected</h2>
            {connectedProviders.map(p => renderProviderCard(p))}

            {/* Domains card (connected) */}
            {domains.length > 0 && (
              <div className="bg-surface border border-border rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-surface2 border border-border flex items-center justify-center text-lg">
                      🌐
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-text">Domains</span>
                        <span className="text-[9px] font-semibold uppercase tracking-[1.5px] text-muted px-1.5 py-0.5 rounded bg-dim">
                          Infrastructure
                        </span>
                      </div>
                      <p className="text-[11px] text-muted mt-0.5">
                        Track expiry dates via free WHOIS/RDAP
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green/10 border border-green/20 text-green text-[10px] font-semibold">
                    <Check className="w-3 h-3" />
                    {domains.length} domain{domains.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <div className="p-5 flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    {domains.map(d => (
                      <div key={d} className="flex items-center gap-2 px-3 py-1.5 bg-dim border border-border rounded-lg">
                        <span className="text-[12px] font-mono text-text">{d}</span>
                        <button onClick={() => removeDomain(d)} className="text-muted hover:text-red transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={domainInput}
                      onChange={e => setDomainInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addDomain()}
                      placeholder="example.com"
                      className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-[12px] font-mono text-text placeholder:text-muted/50 outline-none focus:border-cyan/40 transition-colors"
                    />
                    <button
                      onClick={addDomain}
                      className="flex items-center gap-1.5 px-4 py-2 bg-surface border border-border text-[12px] text-text rounded-lg hover:bg-dim hover:border-cyan/30 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Detected in your repos ── */}
        {(detectedNotConnected.length > 0 || detectedUnknown.length > 0) && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-muted">Detected in your repos</h2>
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-cyan/10 border border-cyan/20 text-cyan">
                  {detectedNotConnected.length + detectedUnknown.length} found
                </span>
                {scanAge && (
                  <span className="text-[9px] text-muted/60">· from scan {scanAge}</span>
                )}
              </div>
              <button
                onClick={rescan}
                disabled={rescanning}
                className="flex items-center gap-1.5 text-[10px] text-muted hover:text-cyan transition-colors disabled:opacity-50"
              >
                <RefreshCw className={clsx("w-3 h-3", rescanning && "animate-spin")} />
                {rescanning ? "Scanning..." : "Rescan"}
              </button>
            </div>
            <p className="text-[11px] text-muted -mt-1">
              Eagle Eye found these providers in your code. Connect them to enable monitoring.
            </p>
            {detectedNotConnected.map(p => renderProviderCard(p))}
            {detectedUnknown.map(id => (
              <div key={id} className="bg-surface border border-border/60 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-4 px-5 py-4">
                  <div className="w-10 h-10 rounded-xl bg-surface2 border border-border flex items-center justify-center text-lg flex-shrink-0">
                    🔌
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-text capitalize">{id}</span>
                      <span className="text-[9px] font-semibold uppercase tracking-[1.5px] text-cyan px-1.5 py-0.5 rounded bg-cyan/10 border border-cyan/20">
                        Detected
                      </span>
                    </div>
                    <p className="text-[11px] text-muted mt-0.5">Found in your repo env vars — add as custom integration to enable monitoring.</p>
                  </div>
                  <button
                    onClick={() => setCustomForm({ name: id, fields: [{ key: "apiKey", value: "" }] })}
                    className="text-[11px] font-semibold text-cyan px-3 py-1.5 rounded-lg border border-cyan/30 bg-cyan/5 hover:bg-cyan/10 transition-colors flex-shrink-0"
                  >
                    + Connect
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* ── Other integrations (collapsed) ── */}
        {otherProviders.length > 0 && (
          <section className="flex flex-col gap-3">
            <button
              onClick={() => setShowMore(prev => !prev)}
              className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[1.5px] text-muted hover:text-text transition-colors w-fit"
            >
              {showMore ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              Other integrations ({otherProviders.length})
            </button>

            {showMore && (
              <div className="flex flex-col gap-3">
                {otherProviders.map(p => renderProviderCard(p))}

                {/* Domains add card (not yet connected) */}
                {domains.length === 0 && (
                  <div className="bg-surface border border-border/60 rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-surface2 border border-border flex items-center justify-center text-lg">
                          🌐
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold text-text">Domains</span>
                            <span className="text-[9px] font-semibold uppercase tracking-[1.5px] text-muted px-1.5 py-0.5 rounded bg-dim">
                              Infrastructure
                            </span>
                          </div>
                          <p className="text-[11px] text-muted mt-0.5">
                            Track expiry dates, renewal alerts, nameservers — via free WHOIS/RDAP
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="p-5 flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={domainInput}
                          onChange={e => setDomainInput(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && addDomain()}
                          placeholder="example.com"
                          className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-[12px] font-mono text-text placeholder:text-muted/50 outline-none focus:border-cyan/40 transition-colors"
                        />
                        <button
                          onClick={addDomain}
                          className="flex items-center gap-1.5 px-4 py-2 bg-surface border border-border text-[12px] text-text rounded-lg hover:bg-dim hover:border-cyan/30 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add
                        </button>
                      </div>
                      <p className="text-[10px] text-muted">
                        No API key needed — Eagle Eye uses public RDAP/WHOIS to check expiry and renewal info.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* ── Custom / unknown integrations ── */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-muted">Custom integrations</h2>
              <p className="text-[11px] text-muted/60 mt-0.5">
                Any service Eagle Eye doesn't know yet — Claude will research its API and fetch data automatically.
              </p>
            </div>
          </div>

          {/* Already-connected custom providers */}
          {customProviders.filter(id => connected.has(id)).map(id => (
            <div key={id} className="bg-surface border border-border rounded-2xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-surface2 border border-border flex items-center justify-center text-lg flex-shrink-0">
                🔌
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-text capitalize">{id.replace(/-/g, " ")}</div>
                <div className="text-[11px] text-muted">Eagle Eye will use Claude to fetch data from this provider's API.</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green/10 border border-green/20 text-green text-[10px] font-semibold">
                  <Check className="w-3 h-3" />
                  Connected
                </div>
                <button
                  onClick={() => disconnectCustom(id)}
                  className="px-3 py-1 text-[11px] text-red border border-red/20 rounded-lg hover:bg-red/5 transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}

          {/* Add custom provider form */}
          {customForm ? (
            <div className="bg-surface border border-cyan/20 rounded-2xl p-5 flex flex-col gap-4">
              <div>
                <label className="text-[10px] font-semibold text-muted uppercase tracking-[1px] block mb-1.5">
                  Provider name
                </label>
                <input
                  type="text"
                  value={customForm.name}
                  onChange={e => setCustomForm(f => f ? { ...f, name: e.target.value } : f)}
                  placeholder="e.g. PlanetScale, Railway, Fly.io"
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-[12px] text-text placeholder:text-muted/50 outline-none focus:border-cyan/40 transition-colors"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-semibold text-muted uppercase tracking-[1px]">
                  Credentials
                </label>
                {customForm.fields.map((field, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={field.key}
                      onChange={e => setCustomForm(f => {
                        if (!f) return f;
                        const fields = [...f.fields];
                        fields[i] = { ...fields[i], key: e.target.value };
                        return { ...f, fields };
                      })}
                      placeholder="Field name (e.g. apiKey)"
                      className="w-36 bg-surface border border-border rounded-lg px-3 py-2 text-[12px] font-mono text-muted outline-none focus:border-cyan/40 transition-colors"
                    />
                    <input
                      type="password"
                      value={field.value}
                      onChange={e => setCustomForm(f => {
                        if (!f) return f;
                        const fields = [...f.fields];
                        fields[i] = { ...fields[i], value: e.target.value };
                        return { ...f, fields };
                      })}
                      placeholder="Value"
                      className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-[12px] font-mono text-text outline-none focus:border-cyan/40 transition-colors"
                    />
                    <button
                      onClick={() => setCustomForm(f => f ? { ...f, fields: f.fields.filter((_, j) => j !== i) } : f)}
                      className="text-muted hover:text-red transition-colors p-1"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setCustomForm(f => f ? { ...f, fields: [...f.fields, { key: "", value: "" }] } : f)}
                  className="text-[11px] text-cyan hover:underline w-fit"
                >
                  + Add field
                </button>
              </div>

              <p className="text-[10px] text-muted/70">
                During the next scan, Claude will research this provider's API docs and fetch plan, usage, and health data using these credentials.
              </p>

              <div className="flex items-center gap-2">
                <button
                  onClick={saveCustom}
                  disabled={!customForm.name.trim() || !!saving}
                  className="flex items-center gap-1.5 px-4 py-2 bg-cyan text-bg text-[12px] font-bold rounded-lg hover:bg-cyan/90 transition-colors disabled:opacity-60"
                >
                  <Check className="w-3.5 h-3.5" />
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => setCustomForm(null)}
                  className="px-4 py-2 text-[12px] text-muted hover:text-text transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCustomForm({ name: "", fields: [{ key: "apiKey", value: "" }] })}
              className="flex items-center gap-2 px-4 py-3 bg-surface border border-dashed border-border rounded-2xl text-[12px] text-muted hover:border-cyan/30 hover:text-text hover:bg-dim transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add custom integration
            </button>
          )}
        </section>

        {/* ── LLM Analysis Engine ─────────────────────────────────────────── */}
        <section className="flex flex-col gap-3 mt-4">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">AI Analysis Engine</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan/10 border border-cyan/20 text-cyan">Required for insights</span>
          </div>
          <div className="p-4 bg-surface border border-border rounded-2xl flex flex-col gap-3">
            <p className="text-[12px] text-muted leading-relaxed">
              Eagle Eye uses your own LLM API key to generate cross-provider insights. Your key is encrypted and never shared. Add one key — OpenAI, Anthropic, or Gemini.
            </p>
            <LLMKeySection connected={connected} setConnected={setConnected} />
          </div>
        </section>

        </div>
      </main>
    </>
  );
}

// ── LLM Key Section Component ──────────────────────────────────────────────

const LLM_PROVIDERS = [
  { id: "llm_openai", name: "OpenAI", emoji: "🤖", placeholder: "sk-...", hint: "Uses gpt-4o-mini. Get your key at platform.openai.com → API Keys." },
  { id: "llm_anthropic", name: "Anthropic", emoji: "🧠", placeholder: "sk-ant-...", hint: "Uses claude-3-5-sonnet. Get your key at console.anthropic.com → API Keys." },
  { id: "llm_gemini", name: "Gemini", emoji: "✨", placeholder: "AIza...", hint: "Uses gemini-2.0-flash (free tier available). Get your key at aistudio.google.com → Get API Key." },
];

function LLMKeySection({ connected, setConnected }: { connected: Set<string>; setConnected: (s: Set<string>) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(id: string) {
    const key = inputs[id]?.trim();
    if (!key) return;
    setSaving(id);
    setError(null);
    try {
      const res = await fetch("/api/keys/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: id, credentials: { key } }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to save"); return; }
      setConnected(new Set([...connected, id]));
      setExpanded(null);
      setSavedMsg(id);
      setTimeout(() => setSavedMsg(null), 3000);
    } finally {
      setSaving(null);
    }
  }

  async function disconnect(id: string) {
    await fetch("/api/keys/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: id }),
    });
    const next = new Set(connected);
    next.delete(id);
    setConnected(next);
  }

  const connectedLLM = LLM_PROVIDERS.filter(p => connected.has(p.id));
  const availableLLM = LLM_PROVIDERS.filter(p => !connected.has(p.id));

  return (
    <div className="flex flex-col gap-2">
      {connectedLLM.map(p => (
        <div key={p.id} className="flex items-center justify-between px-3 py-2 bg-dim border border-border rounded-xl">
          <div className="flex items-center gap-2">
            <span>{p.emoji}</span>
            <span className="text-[12px] font-medium text-text">{p.name}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green/10 border border-green/20 text-green">Active</span>
          </div>
          <button onClick={() => disconnect(p.id)} className="text-[11px] text-muted hover:text-red transition-colors">Remove</button>
        </div>
      ))}
      {connectedLLM.length === 0 && (
        <div className="text-[12px] text-amber flex items-center gap-2">
          <span>⚠️</span> No LLM key added — AI insights will be disabled until you add one.
        </div>
      )}
      {availableLLM.map(p => (
        <div key={p.id} className="border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setExpanded(expanded === p.id ? null : p.id)}
            className="w-full flex items-center justify-between px-3 py-2 bg-surface hover:bg-dim transition-colors"
          >
            <div className="flex items-center gap-2">
              <span>{p.emoji}</span>
              <span className="text-[12px] text-text">{p.name}</span>
            </div>
            {expanded === p.id ? <ChevronUp className="w-3.5 h-3.5 text-muted" /> : <ChevronDown className="w-3.5 h-3.5 text-muted" />}
          </button>
          {expanded === p.id && (
            <div className="px-3 pb-3 flex flex-col gap-2 bg-dim border-t border-border">
              {p.hint && <p className="text-[11px] text-muted mt-2">{p.hint}</p>}
              <input
                type="password"
                placeholder={p.placeholder}
                value={inputs[p.id] ?? ""}
                onChange={e => setInputs({ ...inputs, [p.id]: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-[12px] text-text placeholder:text-muted focus:outline-none focus:border-cyan/40"
              />
              {error && <p className="text-[11px] text-red">{error}</p>}
              <button
                onClick={() => save(p.id)}
                disabled={!inputs[p.id]?.trim() || saving === p.id}
                className="px-4 py-1.5 bg-cyan text-black text-[12px] font-semibold rounded-lg disabled:opacity-40 hover:bg-cyan/90 transition-colors"
              >
                {saving === p.id ? "Saving..." : "Save key"}
              </button>
            </div>
          )}
        </div>
      ))}
      {savedMsg && (
        <p className="text-[11px] text-green flex items-center gap-1"><Check className="w-3 h-3" /> Key saved successfully</p>
      )}
    </div>
  );
}
