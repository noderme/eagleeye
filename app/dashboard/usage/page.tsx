"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/topbar";
import clsx from "clsx";
import { timeAgo } from "@/lib/github";
import { getCachedScan } from "@/lib/scan-cache";
import type { ProviderSummary } from "@/lib/discovery-engine";

interface ScanResult {
  scanned_at: string;
  provider_data: Record<string, any>;
  github_data: any[];
}

const PROVIDER_EMOJIS: Record<string, string> = {
  openai: "🤖", stripe: "💳", vercel: "▲", anthropic: "🧠", supabase: "⚡",
  resend: "📧", twilio: "📞", github: "🐙",
  planetscale: "🪐", neon: "⚡", railway: "🚂", render: "🎨", fly: "✈️",
  cloudflare: "☁️", aws: "🟠", gcp: "🔵", azure: "🔷", mongodb: "🍃",
  redis: "🔴", sendgrid: "📨", mailgun: "📪", datadog: "🐕", sentry: "🔍",
};

const CATEGORY_ORDER = ["billing", "usage", "limits", "account", "health", "info", "warnings"];

function ProviderUsageCard({ serviceId, summary }: { serviceId: string; summary: ProviderSummary }) {
  const emoji = PROVIDER_EMOJIS[serviceId] ?? "🔌";
  const label = summary.serviceName || (serviceId.charAt(0).toUpperCase() + serviceId.slice(1));

  // Sort groups by category priority
  const sortedGroups = [...(summary.groups ?? [])].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.category);
    const bi = CATEGORY_ORDER.indexOf(b.category);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const statusColor = summary.status === "critical" ? "text-red border-red/20"
    : summary.status === "warn" ? "text-amber border-amber/20"
    : "text-text border-border";

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-muted flex items-center gap-2">
        <span className="text-base">{emoji}</span>
        {label}
      </h2>
      <div className={clsx("bg-surface border rounded-2xl overflow-hidden", statusColor.split(" ")[1] || "border-border")}>
        {sortedGroups.map((group) => (
          <div key={group.category} className="border-b border-border/50 last:border-0">
            <div className="px-5 py-3 bg-surface2/30">
              <span className="text-[10px] font-semibold uppercase tracking-[1px] text-muted">
                {group.category}
              </span>
            </div>
            <div className="px-5 py-4 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
              {group.items.map((item) => {
                const isWarning = group.category === "warnings";
                const isGood = item.value?.toLowerCase().includes("ok") || item.value?.toLowerCase().includes("active") || item.value?.toLowerCase().includes("healthy");
                const isBad = item.value?.toLowerCase().includes("error") || item.value?.toLowerCase().includes("fail") || item.value?.toLowerCase().includes("critical");
                const valueColor = isWarning ? "text-amber" : isBad ? "text-red" : isGood ? "text-green" : "text-text";
                return (
                  <div key={item.key} className="flex flex-col gap-1">
                    <div className="text-[10px] text-muted uppercase tracking-wide">{item.key}</div>
                    <div className={clsx("text-[18px] font-bold font-mono leading-tight", valueColor)}>
                      {item.value ?? "—"}
                    </div>
                    {item.alert && (
                      <div className={clsx("text-[9px] font-bold uppercase tracking-wide", item.alert === "critical" ? "text-red" : "text-amber")}>{item.alert}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {sortedGroups.length === 0 && (
          <div className="px-5 py-6 text-[12px] text-muted">No data available for this service.</div>
        )}

      </div>
    </section>
  );
}

export default function UsagePage() {
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

  const providers = result?.provider_data ?? {};
  const insights = result?.github_data ?? [];

  const totalCommits = insights.reduce((s: number, i: any) => s + (i.commits?.length ?? 0), 0);
  const totalOpenPRs = insights.reduce((s: number, i: any) => s + (i.openPRs ?? 0), 0);

  // Collect all providers that have _providerSummary (dynamic LLM-discovered data)
  const providerSummaries: Array<{ serviceId: string; summary: ProviderSummary }> = [];
  for (const [serviceId, provData] of Object.entries(providers)) {
    const d = provData as any;
    if (d?._providerSummary) {
      providerSummaries.push({ serviceId, summary: d._providerSummary as ProviderSummary });
    }
  }

  // Providers with errors but no summary
  const errorProviders: Array<{ serviceId: string; error: string }> = [];
  for (const [serviceId, provData] of Object.entries(providers)) {
    const d = provData as any;
    if (!d?._providerSummary && (d?.error || d?._credentialError)) {
      errorProviders.push({
        serviceId,
        error: d._credentialMessage ?? d.error ?? "Unknown error",
      });
    }
  }

  const hasAnyData = providerSummaries.length > 0 || errorProviders.length > 0 || insights.length > 0;

  return (
    <>
      <Topbar title="Usage Trends" />
      <main className="flex-1 overflow-y-auto p-7 flex flex-col gap-6">

        {loading && (
          <div className="flex items-center gap-2 text-[12px] text-muted font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan pulse-green" />
            Loading usage data...
          </div>
        )}

        {result && (
          <p className="text-[12px] text-muted -mt-2">
            Data from {timeAgo(result.scanned_at)}
          </p>
        )}

        {/* GitHub activity */}
        <section className="flex flex-col gap-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-muted flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan" />
            GitHub Activity
          </h2>
          <div className="grid grid-cols-3 gap-3.5">
            {[
              { label: "Repos monitored",  value: insights.length,  color: "text-cyan"  },
              { label: "Recent commits",   value: totalCommits,     color: "text-text"  },
              { label: "Open pull requests", value: totalOpenPRs,   color: totalOpenPRs > 0 ? "text-amber" : "text-green" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-surface border border-border rounded-2xl p-5 flex flex-col gap-2">
                <span className="text-[11px] font-semibold text-muted uppercase tracking-[0.8px]">{label}</span>
                <div className={clsx("text-[32px] font-bold font-mono leading-none", color)}>
                  {loading ? "—" : value}
                </div>
              </div>
            ))}
          </div>

          {/* Per-repo CI breakdown */}
          {insights.length > 0 && (
            <div className="bg-surface border border-border rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="text-[12px] font-semibold text-text">CI Run Status per Repo</h3>
              </div>
              {insights.map((i: any) => {
                const latest = i.ciRuns?.[0];
                const statusColor = !latest ? "text-muted"
                  : latest.status !== "completed" ? "text-cyan"
                  : latest.conclusion === "success" ? "text-green"
                  : latest.conclusion === "failure" ? "text-red"
                  : "text-amber";
                const statusLabel = !latest ? "No CI"
                  : latest.status !== "completed" ? "Running"
                  : latest.conclusion ?? "Unknown";
                return (
                  <div key={i.repo.full_name} className="hover:bg-dim transition-colors" style={{ display: "flex", alignItems: "center", gap: "16px", padding: "14px 20px", borderBottom: "1px solid rgba(26,37,64,0.5)" }}>
                    <div className="w-7 h-7 rounded-md bg-surface2 border border-border flex items-center justify-center text-[11px] font-bold text-muted flex-shrink-0">
                      {i.repo.name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 text-[12px] font-semibold text-text">{i.repo.name}</div>
                    <div className="flex items-center gap-3 text-[11px] text-muted">
                      <span>{i.commits?.length ?? 0} commits</span>
                      <span>{i.openPRs} PRs</span>
                    </div>
                    <span className={clsx("text-[11px] font-semibold capitalize w-16 text-right", statusColor)}>
                      {statusLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Dynamic provider usage cards — one per service, all from LLM discovery */}
        {providerSummaries.map(({ serviceId, summary }) => (
          <ProviderUsageCard key={serviceId} serviceId={serviceId} summary={summary} />
        ))}

        {/* Error providers */}
        {errorProviders.map(({ serviceId, error }) => (
          <section key={serviceId} className="flex flex-col gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-muted flex items-center gap-2">
              <span className="text-base">{PROVIDER_EMOJIS[serviceId] ?? "🔌"}</span>
              {serviceId.charAt(0).toUpperCase() + serviceId.slice(1)}
            </h2>
            <div className="bg-surface border border-red/20 rounded-2xl px-5 py-4 text-[12px] text-red">
              {error}
            </div>
          </section>
        ))}

        {!loading && !hasAnyData && (
          <div className="bg-surface border border-border rounded-2xl px-6 py-10 text-center">
            <div className="text-[13px] text-muted">No usage data available yet.</div>
            <a href="/dashboard" className="text-[12px] text-cyan hover:underline mt-1 block">Trigger a scan →</a>
          </div>
        )}

      </main>
    </>
  );
}
