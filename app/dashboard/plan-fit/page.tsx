"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/topbar";
import clsx from "clsx";
import { timeAgo } from "@/lib/github";
import { getCachedScan } from "@/lib/scan-cache";

interface ScanResult {
  scanned_at: string;
  provider_data: Record<string, any>;
}

type FitStatus = "good" | "warn" | "upgrade";

// Provider display names and emojis for known services.
// This is purely cosmetic — unknown providers still show up, just with a generic icon.
const PROVIDER_DISPLAY: Record<string, { name: string; emoji: string }> = {
  openai:    { name: "OpenAI",    emoji: "🤖" },
  anthropic: { name: "Anthropic", emoji: "🧠" },
  supabase:  { name: "Supabase",  emoji: "⚡" },
  stripe:    { name: "Stripe",    emoji: "💳" },
  vercel:    { name: "Vercel",    emoji: "▲"  },
  resend:    { name: "Resend",    emoji: "📧" },
  twilio:    { name: "Twilio",    emoji: "📱" },
};

function PlanCard({ id, data }: { id: string; data: any }) {
  const display = PROVIDER_DISPLAY[id];
  const name    = display?.name  ?? id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, " ");
  const emoji   = display?.emoji ?? "🔌";
  const summary = data._summary  ?? (data.plan ?? data.status ?? "Connected");
  const signal  = data._signal   ?? (Object.entries(data).filter(([k]) => !k.startsWith("_") && k !== "provider" && k !== "error").slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(" · ") || "No details available.");
  const status: FitStatus = (["good", "warn", "upgrade"].includes(data._status) ? data._status : "good") as FitStatus;

  const colors: Record<FitStatus, { badge: string; label: string; dot: string }> = {
    good:    { badge: "bg-green/10 text-green border-green/20",  label: "Good fit",    dot: "bg-green" },
    warn:    { badge: "bg-amber/10 text-amber border-amber/20",  label: "Monitor",     dot: "bg-amber" },
    upgrade: { badge: "bg-red/10 text-red border-red/20",        label: "Review plan", dot: "bg-red pulse-red" },
  };
  const cfg = colors[status];

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 flex gap-4 hover:bg-dim transition-colors">
      <div className="w-12 h-12 rounded-xl bg-surface2 border border-border flex items-center justify-center text-xl flex-shrink-0">
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-[13px] font-semibold text-text">{name}</span>
          <div className={clsx("flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-bold", cfg.badge)}>
            <span className={clsx("w-1.5 h-1.5 rounded-full", cfg.dot)} />
            {cfg.label}
          </div>
          {data._agentFetched && (
            <span className="text-[9px] text-muted px-1.5 py-0.5 rounded bg-dim border border-border">AI fetched</span>
          )}
        </div>
        <div className="text-[11px] text-muted">
          Current: <span className="text-text font-semibold">{summary}</span>
        </div>
        <div className="text-[11px] text-muted mt-1">{signal}</div>
      </div>
    </div>
  );
}

export default function PlanFitPage() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = getCachedScan();
    if (cached) { setResult(cached); setLoading(false); return; }
    fetch("/api/scan/results")
      .then(r => r.json())
      .then(({ result }) => setResult(result))
      .finally(() => setLoading(false));
  }, []);

  const providerData = result?.provider_data ?? {};
  const activeProviders = Object.entries(providerData).filter(([, data]) => data && !data.error);

  return (
    <>
      <Topbar title="Plan Fit" />
      <main className="flex-1 overflow-y-auto p-7 flex flex-col gap-6">

        <p className="text-[12px] text-muted -mt-2">
          {result ? `Based on scan from ${timeAgo(result.scanned_at)}` : "No scan data yet"}
        </p>

        {loading && (
          <div className="flex items-center gap-2 text-[12px] text-muted font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan pulse-green" />
            Analyzing plan fit...
          </div>
        )}

        {!loading && activeProviders.length === 0 && (
          <div className="bg-surface border border-border rounded-2xl px-6 py-10 text-center">
            <div className="text-3xl mb-3">📊</div>
            <div className="text-[13px] font-semibold text-text">No provider data yet</div>
            <div className="text-[12px] text-muted mt-1">Connect integrations and run a scan.</div>
            <a href="/dashboard/integrations" className="text-[12px] text-cyan hover:underline mt-2 block">
              Add integrations →
            </a>
          </div>
        )}

        {activeProviders.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-muted">Provider Plans</h2>
            {activeProviders.map(([id, data]) => (
              <PlanCard key={id} id={id} data={data} />
            ))}
          </section>
        )}


      </main>
    </>
  );
}
