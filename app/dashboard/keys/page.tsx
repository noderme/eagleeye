"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/topbar";
import clsx from "clsx";
import { Calendar, Check, AlertTriangle, ShieldAlert } from "lucide-react";

interface Integration {
  provider: string;
  extra_config?: {
    keyExpiresAt?: string | null; // null = confirmed no expiry concept for this service
    expiryChecked?: boolean;      // true = discovery engine explicitly checked
    _autoDetectedExpiry?: boolean;
  };
}

interface KeyStatus {
  githubConnected: boolean;
  integrations: Integration[];
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

const PROVIDER_META: Record<string, { name: string; emoji: string }> = {
  github:    { name: "GitHub",    emoji: "🐙" },
  openai:    { name: "OpenAI",    emoji: "🤖" },
  stripe:    { name: "Stripe",    emoji: "💳" },
  vercel:    { name: "Vercel",    emoji: "▲"  },
  resend:    { name: "Resend",    emoji: "📧" },
  twilio:    { name: "Twilio",    emoji: "📱" },
  anthropic: { name: "Anthropic", emoji: "🧠" },
  supabase:  { name: "Supabase",  emoji: "⚡" },
  domains:   { name: "Domains",   emoji: "🌐" },
};

const PROVIDER_INSIGHTS: Record<string, string> = {
  stripe:    "No usage tracking — billing risk unknown",
  openai:    "No spend cap check — runaway costs possible",
  anthropic: "Token usage not tracked — cost unknown",
  github:    "CI failures detected — real-time alerts not set",
  vercel:    "Bandwidth limits not monitored",
  resend:    "Email quota not tracked",
  twilio:    "SMS spend not monitored",
  supabase:  "Storage limits not checked",
  domains:   "Expiry monitored — SSL not checked",
};

const PROVIDER_CONSEQUENCES: Record<string, string> = {
  stripe:    "Payments may fail after expiry",
  openai:    "AI features will stop responding",
  anthropic: "AI features will stop responding",
  github:    "CI/CD and repo access will break",
  vercel:    "Deployments will stop working",
  resend:    "Email delivery will stop",
  twilio:    "SMS and calls will stop",
  supabase:  "Database access will be lost",
  domains:   "Site may go offline after expiry",
};

export default function KeysPage() {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/keys/status")
      .then(r => r.json())
      .then(setStatus)
      .finally(() => setLoading(false));
  }, []);

  const integrations = status?.integrations ?? [];
  const connected = integrations.filter(i => i.provider !== "domains");
  if (status?.githubConnected) {
    connected.unshift({ provider: "github" });
  }

  // Three states for expiry:
  // 1. Has a real expiry date (keyExpiresAt is a non-null string)
  // 2. Confirmed no expiry (keyExpiresAt === null, expiryChecked === true) — service doesn't have expiry concept
  // 3. Unknown — not yet scanned or scan didn't check (show manual prompt)
  const withExpiry = connected.filter(i => typeof i.extra_config?.keyExpiresAt === "string");
  const confirmedNoExpiry = connected.filter(i =>
    i.extra_config?.keyExpiresAt === null && i.extra_config?.expiryChecked === true
  );
  // Only show "no expiry set" warning for services where we don't know yet
  const unknownExpiry = connected.filter(i =>
    !withExpiry.includes(i) && !confirmedNoExpiry.includes(i)
  );

  const expired = withExpiry.filter(i => daysUntil(i.extra_config!.keyExpiresAt as string) < 0);
  const expiringSoon = withExpiry.filter(i => {
    const d = daysUntil(i.extra_config!.keyExpiresAt as string);
    return d >= 0 && d <= 30;
  });
  const healthy = withExpiry.filter(i => daysUntil(i.extra_config!.keyExpiresAt as string) > 30);

  const issues = expired.length + expiringSoon.length;

  function expiryColor(days: number) {
    if (days < 0)   return { text: "text-red",   badge: "bg-red/10 border-red/20 text-red",       label: "EXPIRED" };
    if (days <= 7)  return { text: "text-red",   badge: "bg-red/10 border-red/20 text-red",       label: `${days}d left` };
    if (days <= 30) return { text: "text-amber", badge: "bg-amber/10 border-amber/20 text-amber", label: `${days}d left` };
    return { text: "text-green", badge: "bg-green/10 border-green/20 text-green", label: `${days}d left` };
  }

  function KeyCard({ integration }: { integration: Integration }) {
    const meta = PROVIDER_META[integration.provider] ?? { name: integration.provider, emoji: "🔑" };
    const expiresAt = integration.extra_config?.keyExpiresAt;
    const isConfirmedNoExpiry = expiresAt === null && integration.extra_config?.expiryChecked === true;
    const days = typeof expiresAt === "string" ? daysUntil(expiresAt) : null;
    const cfg = days !== null ? expiryColor(days) : null;

    return (
      <div className="bg-surface border border-border rounded-2xl p-5 flex items-center gap-4 hover:bg-dim transition-colors">
        <div className="w-10 h-10 rounded-xl bg-surface2 border border-border flex items-center justify-center text-lg flex-shrink-0">
          {meta.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-text">{meta.name}</div>
          {PROVIDER_INSIGHTS[integration.provider] && (
            <div className="text-[11px] text-muted/50 mt-0.5">{PROVIDER_INSIGHTS[integration.provider]}</div>
          )}
          {typeof expiresAt === "string" ? (
            <div className="mt-0.5">
              <div className="text-[11px] text-muted font-mono">
                Expires {new Date(expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </div>
              {days !== null && days <= 30 && PROVIDER_CONSEQUENCES[integration.provider] && (
                <div className={clsx("text-[11px] mt-0.5", days <= 7 ? "text-red" : "text-amber")}>
                  {days < 0
                    ? `${PROVIDER_CONSEQUENCES[integration.provider]} — key has expired`
                    : `${PROVIDER_CONSEQUENCES[integration.provider]} in ${days} day${days !== 1 ? "s" : ""}`}
                </div>
              )}
            </div>
          ) : isConfirmedNoExpiry ? (
            <div className="text-[11px] text-muted/40 mt-0.5">Keys do not expire for this service</div>
          ) : (
            <div className="text-[11px] text-muted/50 mt-0.5">⚪ Scan to detect expiry</div>
          )}
        </div>
        <div className="flex-shrink-0">
          {cfg ? (
            <div className={clsx("flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold", cfg.badge)}>
              <Calendar className="w-3 h-3" />
              {cfg.label}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface2 border border-border text-muted text-[10px]">
              <Check className="w-3 h-3" />
              Connected
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <Topbar title="API Key Health" alerts={issues} />
      <main className="flex-1 overflow-y-auto p-7 flex flex-col gap-6">

        {loading && (
          <div className="flex items-center gap-2 text-[12px] text-muted font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan pulse-green" />
            Loading key status...
          </div>
        )}

        {/* Summary cards */}
        {!loading && (
          <div className="grid grid-cols-3 gap-3.5">
            {[
              { label: "Expired",          value: expired.length,       color: expired.length > 0 ? "text-red" : "text-green",   dot: expired.length > 0 ? "bg-red pulse-red" : "bg-green" },
              { label: "Expiring soon",    value: expiringSoon.length,  color: expiringSoon.length > 0 ? "text-amber" : "text-green", dot: expiringSoon.length > 0 ? "bg-amber" : "bg-green" },
              { label: "Scan to detect",   value: unknownExpiry.length,  color: "text-muted",                                          dot: "bg-muted" },
            ].map(({ label, value, color, dot }) => (
              <div key={label} className="bg-surface border border-border rounded-2xl p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-muted uppercase tracking-[0.8px]">{label}</span>
                  <span className={clsx("w-2 h-2 rounded-full", dot)} />
                </div>
                <div className={clsx("text-[32px] font-bold font-mono leading-none", color)}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Expired keys */}
        {expired.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-red flex items-center gap-2">
              <ShieldAlert className="w-3.5 h-3.5" />
              Expired keys — rotate immediately
            </h2>
            {expired.map(i => <KeyCard key={i.provider} integration={i} />)}
          </section>
        )}

        {/* Expiring soon */}
        {expiringSoon.length > 0 && (
          <section className="flex flex-col gap-3">
            {expiringSoon.some(i => daysUntil(i.extra_config!.keyExpiresAt as string) <= 7) ? (
              <h2 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-red flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                🔴 Expiring within 7 days — rotate now
              </h2>
            ) : (
              <h2 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-amber flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                🟡 Expiring within 30 days
              </h2>
            )}
            {expiringSoon.map(i => <KeyCard key={i.provider} integration={i} />)}
          </section>
        )}

        {/* Healthy with expiry */}
        {healthy.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-muted flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green" />
              Healthy
            </h2>
            {healthy.map(i => <KeyCard key={i.provider} integration={i} />)}
          </section>
        )}

        {/* Confirmed no expiry — informational only, no action needed */}
        {confirmedNoExpiry.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-muted flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-muted" />
              No expiry concept
            </h2>
            <p className="text-[12px] text-muted -mt-1">
              These services confirmed their API keys do not expire.
            </p>
            {confirmedNoExpiry.map(i => <KeyCard key={i.provider} integration={i} />)}
          </section>
        )}

        {/* Unknown expiry — run a scan or set manually */}
        {unknownExpiry.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-muted flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-muted" />
              ⚪ Not yet scanned — run a scan to detect
            </h2>
            <p className="text-[12px] text-muted -mt-1">
              Eagle Eye will auto-detect expiry dates on next scan, or set manually on the{" "}
              <a href="/dashboard/integrations" className="text-cyan hover:underline">Integrations</a>{" "}
              page.
            </p>
            {unknownExpiry.map(i => <KeyCard key={i.provider} integration={i} />)}
          </section>
        )}

        {!loading && connected.length === 0 && (
          <div className="bg-surface border border-border rounded-2xl px-6 py-8 text-center">
            <div className="text-[13px] text-muted">No integrations connected yet.</div>
            <a href="/dashboard/integrations" className="text-[12px] text-cyan hover:underline mt-1 block">
              Add integrations →
            </a>
          </div>
        )}

      </main>
    </>
  );
}
