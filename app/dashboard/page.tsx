"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/topbar";
import clsx from "clsx";
import { timeAgo } from "@/lib/github";
import type { RepoInsight } from "@/lib/github";
import type { Recommendation } from "@/lib/analyze";
import { getCachedScan, setCachedScan } from "@/lib/scan-cache";
import { DynamicProviderCard } from "@/components/dynamic-provider-card";
import type { ProviderSummary } from "@/lib/discovery-engine";

const SCAN_STEPS = [
  "Connecting to GitHub...",
  "Fetching repo activity and commit history...",
  "Checking CI/CD run status...",
  "Scanning for risky files and secrets...",
  "Querying provider APIs...",
  "Checking domain expiry via RDAP...",
  "Running AI analysis...",
  "Generating recommendations...",
];

// ── Types ──────────────────────────────────────────────────────────────────

interface ScanResult {
  id: string;
  scanned_at: string;
  github_data: RepoInsight[];
  provider_data: Record<string, any>;
  domain_data: any[];
  analysis: {
    summary: string;
    totalMonthlySpendUsd: number | null;
    potentialMonthlySavingsUsd: number | null;
    nextScanIn: number;
    recommendations: Recommendation[];
  } | null;
  error: string | null;
}

// ── CI color helper ────────────────────────────────────────────────────────

function ciColor(run: RepoInsight["ciRuns"][0] | undefined) {
  if (!run) return { dot: "bg-muted", label: "No CI", color: "text-muted" };
  if (run.status !== "completed") return { dot: "bg-cyan pulse-green", label: "Running", color: "text-cyan" };
  if (run.conclusion === "success") return { dot: "bg-green", label: "Passing", color: "text-green" };
  if (run.conclusion === "failure") return { dot: "bg-red pulse-red", label: "Failing", color: "text-red" };
  return { dot: "bg-amber", label: run.conclusion ?? "Unknown", color: "text-amber" };
}

// ── Component ──────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanStep, setScanStep] = useState(0);

  useEffect(() => {
    loadLatest();
  }, []);

  async function loadLatest() {
    // Use cache to avoid redundant API calls on every navigation
    const cached = getCachedScan();
    if (cached) {
      setResult(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/scan/results");
      if (res.status === 401) { router.replace("/"); return; }
      if (res.ok) {
        const { result: latest } = await res.json();
        if (latest) {
          setCachedScan(latest);
          setResult(latest);
        } else {
          // No saved scan — run one automatically
          setLoading(false);
          triggerScan();
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function triggerScan() {
    setScanning(true);
    setScanStep(0);
    const interval = setInterval(() => {
      setScanStep(s => (s + 1) % SCAN_STEPS.length);
    }, 2200);
    try {
      const res = await fetch("/api/scan/trigger", { method: "POST" });
      if (res.ok) {
        const { result: fresh } = await res.json();
        // Auto-save every scan so sub-pages (recommendations, plan-fit, usage) can read it from DB
        const saveRes = await fetch("/api/scan/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ result: fresh }),
        });
        const saved = saveRes.ok ? (await saveRes.json()).result : fresh;
        setCachedScan(saved);
        setResult(saved);
      }
    } finally {
      clearInterval(interval);
      setScanning(false);
      setScanStep(0);
    }
  }

  // ── Derived values ───────────────────────────────────────────────────────

  const insights: RepoInsight[] = result?.github_data ?? [];
  const providers = result?.provider_data ?? {};
  const domains = result?.domain_data ?? [];
  const analysis = result?.analysis;
  const recommendations: Recommendation[] = analysis?.recommendations ?? [];

  const failingCI = insights.filter(i => i.ciRuns[0]?.conclusion === "failure").length;
  const totalOpenPRs = insights.reduce((s, i) => s + i.openPRs, 0);
  const riskyRepos = insights.filter(i => i.riskyFiles.length > 0).length;
  const criticalAlerts = failingCI + riskyRepos
    + recommendations.filter(r => r.severity === "critical").length;
  const servicesMonitored = Object.keys(providers).length;

  const isActive = loading || scanning;

  // ── Dynamic provider summaries (rich grouped cards from LLM discovery) ──
  // All providers now go through the same LLM discovery pipeline — no hardcoded cards.
  const dynamicProviderSummaries: ProviderSummary[] = [];
  for (const [, provData] of Object.entries(providers)) {
    const d = provData as any;
    if (d?._providerSummary) {
      dynamicProviderSummaries.push(d._providerSummary as ProviderSummary);
    }
  }
  // Fallback cards for providers that returned data but no _providerSummary (e.g. credential errors, no LLM key)
  type ProviderCard = { id: string; emoji: string; label: string; value: string; sub: string; color: string; extra?: React.ReactNode };
  const providerCards: ProviderCard[] = [];
  const PROVIDER_EMOJIS: Record<string, string> = {
    openai: "🤖", stripe: "💳", vercel: "▲", anthropic: "🧠", supabase: "⚡",
    resend: "📧", twilio: "📞", github: "🐙",
    planetscale: "🪐", neon: "⚡", railway: "🚂", render: "🎨", fly: "✈️",
    cloudflare: "☁️", aws: "🟠", gcp: "🔵", azure: "🔷", mongodb: "🍃",
    redis: "🔴", sendgrid: "📨", mailgun: "📪", datadog: "🐕", sentry: "🔍",
  };
  for (const [provId, provData] of Object.entries(providers)) {
    if (!provData || typeof provData !== "object") continue;
    const d = provData as any;
    // Skip providers that already have a rich _providerSummary card
    if (d._providerSummary) continue;
    const hasCredError = d._credentialError === true || (d.error && (d.error.includes("401") || d.error.includes("403") || d.error.includes("Invalid")));
    const emoji = PROVIDER_EMOJIS[provId] ?? "🔌";
    const label = provId.charAt(0).toUpperCase() + provId.slice(1);
    const value = hasCredError ? "Key Error" : (d._noLlmKey ? "No LLM key" : "Connected");
    const sub = hasCredError ? (d._credentialMessage ?? d.error ?? "Invalid or expired API key") : (d._signal ?? d._summary ?? "");
    providerCards.push({
      id: provId, emoji, label,
      value,
      sub: sub.length > 60 ? sub.slice(0, 57) + "..." : sub,
      color: hasCredError ? "var(--red)" : d._status === "warn" ? "var(--amber)" : "var(--text)",
    });
  }
    // ── Credential failure alerts (loud banners for invalid/expired keys) ──
  const credentialErrors: { provider: string; message: string }[] = [];
  for (const [provId, provData] of Object.entries(providers)) {
    const d = provData as any;
    if (!d) continue;
    if (
      d._credentialError === true ||
      (d.error && (d.error.includes("Invalid") || d.error.includes("401") || d.error.includes("403") || d.error.includes("invalid")))
    ) {
      credentialErrors.push({
        provider: provId.charAt(0).toUpperCase() + provId.slice(1),
        message: d._credentialMessage ?? d.error ?? "API key may be invalid or expired. Update it in Integrations.",
      });
    }
  }

  const providerCols = Math.min(providerCards.length, 4);

  return (
    <>
      <Topbar title="Overview" alerts={criticalAlerts} />

      <main className="flex-1 overflow-y-auto p-7 flex flex-col gap-6">

        {/* ── BOT STATUS CARD (always visible) ── */}
        <div className="relative rounded-2xl border bg-surface"
          style={{ borderColor: isActive ? "rgba(0,212,255,0.25)" : "var(--border)" }}>
          <div className="flex items-center gap-5 px-6 py-5">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div className={clsx(
                "w-12 h-12 rounded-2xl bg-gradient-to-br from-purple to-cyan flex items-center justify-center text-2xl shadow-[0_0_24px_rgba(123,97,255,0.35)]",
                isActive && "animate-pulse"
              )}>
                🤖
              </div>
              <span className={clsx(
                "absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-bg",
                isActive ? "bg-cyan pulse-green" : "bg-green"
              )} />
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[13px] font-bold text-text">Eagle Eye</span>
                <span className={clsx(
                  "text-[9px] font-bold uppercase tracking-[1.5px] px-2 py-0.5 rounded-full border",
                  isActive ? "bg-cyan/10 text-cyan border-cyan/20" : "bg-green/10 text-green border-green/20"
                )}>
                  {scanning ? "Scanning" : loading ? "Loading" : "Watching"}
                </span>
              </div>

              {/* Scanning: show step + progress bar. Idle: show summary */}
              {scanning ? (
                <div className="flex flex-col gap-2 mt-1">
                  <p className="text-[11px] font-mono text-cyan/80">
                    ▸ {SCAN_STEPS[scanStep]}<span className="animate-pulse">▌</span>
                  </p>
                  <div className="w-full h-1 bg-surface2 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyan rounded-full transition-all duration-[2200ms] ease-linear"
                      style={{ width: `${((scanStep + 1) / SCAN_STEPS.length) * 100}%` }}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-[12px] font-mono text-cyan truncate">
                  {loading
                    ? "▸ Loading last scan..."
                    : analysis?.summary
                      ? `▸ ${analysis.summary}`
                      : result
                        ? `▸ ${insights.length} repo${insights.length !== 1 ? "s" : ""} monitored · ${criticalAlerts} issue${criticalAlerts !== 1 ? "s" : ""} detected`
                        : "▸ No scan yet — run your first scan to get started"
                  }
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 flex-shrink-0">
              {result && !scanning && (
                <div className="text-right">
                  <div className="text-[10px] text-muted uppercase tracking-wide">Last scan</div>
                  <div className="text-[12px] font-mono text-text">{timeAgo(result.scanned_at)}</div>
                </div>
              )}
              <button
                onClick={triggerScan}
                disabled={scanning}
                className="text-[11px] font-semibold text-cyan px-3 py-1.5 rounded-lg border border-cyan/30 bg-cyan/5 hover:bg-cyan/10 transition-colors disabled:opacity-40"
              >
                {scanning ? `${scanStep + 1}/${SCAN_STEPS.length}` : "Scan now"}
              </button>
            </div>
          </div>
        </div>

        {/* ── STAT CARDS ── */}
        <div className="grid grid-cols-4 gap-3.5">
          {[
            { label: "Failing CI",   value: loading ? "—" : String(failingCI),   color: failingCI > 0 ? "text-red" : "text-green",   glow: failingCI > 0 ? "shadow-[0_0_20px_rgba(255,68,68,0.12)]" : "", sub: "Workflow runs",         dot: failingCI > 0 ? "bg-red pulse-red" : "bg-green" },
            { label: "Open PRs",     value: loading ? "—" : String(totalOpenPRs), color: "text-amber",  glow: "", sub: "Across all repos",      dot: "bg-amber" },
            { label: "Secret Risk",  value: loading ? "—" : String(riskyRepos),  color: riskyRepos > 0 ? "text-red" : "text-green",   glow: riskyRepos > 0 ? "shadow-[0_0_20px_rgba(255,68,68,0.12)]" : "", sub: "Repos with risky files", dot: riskyRepos > 0 ? "bg-red pulse-red" : "bg-green" },
            { label: "Services",     value: loading ? "—" : String(servicesMonitored), color: "text-cyan", glow: "shadow-[0_0_20px_rgba(0,212,255,0.08)]", sub: "Integrations monitored", dot: "bg-cyan" },
          ].map(({ label, value, color, glow, sub, dot }) => (
            <div key={label} className={clsx("bg-surface border border-border rounded-2xl p-5 flex flex-col gap-3", glow)}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted uppercase tracking-[0.8px]">{label}</span>
                <span className={clsx("w-2 h-2 rounded-full", dot)} />
              </div>
              <div className={clsx("text-[32px] font-bold font-mono leading-none", color)}>{value}</div>
              <div className="text-[11px] text-muted">{sub}</div>
            </div>
          ))}
        </div>

        {/* ── NO LLM KEY BANNER ── */}
        {!loading && !scanning && result?.error === "NO_LLM_KEY" && (
          <div className="bg-amber/5 border border-amber/20 rounded-2xl px-5 py-4 flex items-start gap-3">
            <span className="text-xl mt-0.5">⚠️</span>
            <div className="flex-1">
              <div className="text-[13px] font-semibold text-amber mb-1">AI analysis disabled — no LLM key configured</div>
              <div className="text-[12px] text-muted">
                Eagle Eye scanned your infrastructure but couldn't generate insights. Add an OpenAI, Anthropic, or Gemini API key in{" "}
                <a href="/dashboard/integrations" className="text-cyan underline underline-offset-2 hover:text-cyan/80">Integrations → AI Analysis Engine</a>{" "}
                to enable cross-provider recommendations.
              </div>
            </div>
          </div>
        )}

        {/* ── CREDENTIAL ERROR BANNERS (loud, per-provider) ── */}
        {credentialErrors.length > 0 && (
          <div className="flex flex-col gap-2">
            {credentialErrors.map(({ provider, message }) => (
              <div key={provider} className="bg-red/5 border border-red/25 rounded-2xl px-5 py-4 flex items-start gap-3">
                <span className="text-xl mt-0.5">🔑</span>
                <div className="flex-1">
                  <div className="text-[13px] font-semibold text-red mb-1">
                    {provider} — API key invalid or expired
                  </div>
                  <div className="text-[12px] text-muted">
                    {message}{" "}
                    <a href="/dashboard/integrations" className="text-cyan underline underline-offset-2 hover:text-cyan/80">
                      Update in Integrations →
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── EMPTY STATE: no scan yet and not loading ── */}
        {!loading && !scanning && !result && (
          <div className="bg-surface border border-border rounded-2xl p-10 flex flex-col items-center gap-4 text-center">
            <div className="text-4xl">🦅</div>
            <div>
              <h3 className="text-[15px] font-semibold text-text mb-1">No scan data yet</h3>
              <p className="text-[12px] text-muted max-w-sm">
                Eagle Eye needs to scan your repositories and connected services to show insights.
                Hit <span className="text-cyan font-semibold">Scan now</span> to run your first scan.
              </p>
            </div>
            <button
              onClick={triggerScan}
              className="text-[12px] font-semibold text-bg px-5 py-2 rounded-lg bg-cyan hover:bg-cyan/90 transition-colors"
            >
              Run first scan
            </button>
          </div>
        )}

        {/* ── PROVIDER HEALTH & SPEND ── */}
        {providerCards.length > 0 && (
          <div className="bg-surface border border-border rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-[13px] font-semibold text-text flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan" />
                Provider Health &amp; Spend
              </h2>
              <div className="flex items-center gap-3">
                {analysis?.totalMonthlySpendUsd != null && (
                  <span className="text-[12px] font-mono font-bold text-text">
                    ${analysis.totalMonthlySpendUsd.toFixed(2)}<span className="text-muted font-normal">/mo total</span>
                  </span>
                )}
                {analysis?.potentialMonthlySavingsUsd != null && analysis.potentialMonthlySavingsUsd > 0 && (
                  <span className="text-[11px] font-semibold text-green px-2 py-0.5 rounded-full bg-green/10 border border-green/20">
                    ${analysis.potentialMonthlySavingsUsd.toFixed(0)}/mo saveable
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${providerCols}, 1fr)` }}>
              {providerCards.map((card, i) => (
                <div key={card.id} style={{
                  padding: "20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  minHeight: "100px",
                  borderLeft: i > 0 ? "1px solid var(--border)" : "none",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "16px", lineHeight: "1" }}>{card.emoji}</span>
                    <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>{card.label}</span>
                  </div>
                  <div style={{ fontSize: "22px", fontWeight: 700, lineHeight: "1.1", color: card.color, fontFamily: "monospace" }}>
                    {card.value}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--muted)", lineHeight: "1.4" }}>{card.sub}</div>
                  {card.extra}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SERVICE INTELLIGENCE (LLM-discovered providers with grouped data) ── */}
        {dynamicProviderSummaries.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-purple" />
              <h2 className="text-[13px] font-semibold text-text">Service Intelligence</h2>
              <span className="text-[10px] font-mono text-muted">{dynamicProviderSummaries.length} service{dynamicProviderSummaries.length !== 1 ? "s" : ""} scanned</span>
            </div>
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
              {dynamicProviderSummaries.map((summary) => (
                <DynamicProviderCard key={summary.serviceId} summary={summary} />
              ))}
            </div>
          </div>
        )}

        {/* ── DOMAIN EXPIRY ── */}
        {domains.length > 0 && (
          <div className="bg-surface border border-border rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-[13px] font-semibold text-text flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan" />
                Domain Expiry
              </h2>
              <span className="text-[10px] font-mono text-muted">{domains.length} tracked</span>
            </div>
            <div className="flex flex-col">
              {domains.map((d: any) => {
                const urgent = d.daysLeft !== null && d.daysLeft <= 30;
                const warn = d.daysLeft !== null && d.daysLeft <= 90;
                const dot = urgent ? "bg-red pulse-red" : warn ? "bg-amber pulse-amber" : "bg-green";
                const color = urgent ? "text-red" : warn ? "text-amber" : "text-green";
                return (
                  <div key={d.domain} className="hover:bg-dim transition-colors border-b border-border/50 last:border-0" style={{ display: "flex", alignItems: "center", gap: "16px", padding: "14px 20px" }}>
                    <span className={clsx("w-2 h-2 rounded-full flex-shrink-0", dot)} />
                    <div className="flex-1 font-mono text-[13px] text-text">{d.domain}</div>
                    {d.expiresAt && (
                      <div className="text-right">
                        <div className={clsx("text-[12px] font-mono font-semibold", color)}>
                          {d.daysLeft !== null ? (d.daysLeft <= 0 ? "EXPIRED" : `${d.daysLeft}d left`) : "—"}
                        </div>
                        <div className="text-[10px] text-muted">
                          {new Date(d.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </div>
                      </div>
                    )}
                    {d.error && <span className="text-[11px] text-muted">{d.error}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── REPOSITORIES ── */}
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="text-[13px] font-semibold text-text flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple shadow-[0_0_6px_#7B61FF]" />
              Project Repos
            </h2>
            <span className="text-[10px] font-mono text-muted">{insights.length} in this project</span>
          </div>
          {isActive && (
            <div className="flex items-center gap-2 px-5 py-8 text-[12px] text-muted font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan pulse-green" />
              Analyzing repos...
            </div>
          )}
          {!isActive && insights.map(({ repo, ciRuns, riskyFiles, openPRs }) => {
            const ci = ciColor(ciRuns[0]);
            return (
              <div key={repo.full_name} className="hover:bg-dim transition-colors cursor-pointer border-b border-border/50 last:border-0" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 20px" }}>
                <div className="w-8 h-8 rounded-lg bg-surface2 border border-border flex items-center justify-center text-sm flex-shrink-0 font-bold text-muted">
                  {repo.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-text truncate">{repo.name}</div>
                  <div className="text-[10px] text-muted flex items-center gap-1.5 mt-0.5">
                    <span className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", ci.dot)} />
                    <span className={ci.color}>{ci.label}</span>
                    {openPRs > 0 && <span className="text-muted">· {openPRs} PR{openPRs !== 1 ? "s" : ""}</span>}
                    {riskyFiles.length > 0 && <span className="text-red">· ⚠ risky files</span>}
                  </div>
                </div>
                <div className="text-[10px] text-muted font-mono flex-shrink-0">{repo.language ?? "—"}</div>
              </div>
            );
          })}
        </div>

        {/* ── RISKY FILES ── */}
        {!isActive && insights.some(i => i.riskyFiles.length > 0) && (
          <div className="bg-surface border border-red/20 rounded-2xl overflow-hidden shadow-[0_0_20px_rgba(255,68,68,0.06)]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-[13px] font-semibold text-text flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red pulse-red" />
                Secret Risk — Suspicious Files Detected
              </h2>
              <span className="text-[10px] font-mono text-red">
                {insights.reduce((s, i) => s + i.riskyFiles.length, 0)} files flagged
              </span>
            </div>
            {insights.filter(i => i.riskyFiles.length > 0).map(({ repo, riskyFiles }) =>
              riskyFiles.map(file => (
                <div key={`${repo.full_name}/${file}`} className="hover:bg-dim transition-colors border-b border-border/50 last:border-0" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 20px" }}>
                  <span className="text-red text-[12px]">⚠</span>
                  <div className="flex-1 font-mono text-[12px] text-text">{file}</div>
                  <div className="text-[11px] text-muted">{repo.name}</div>
                </div>
              ))
            )}
          </div>
        )}


        {/* ── ALL CLEAR ── */}
        {!isActive && criticalAlerts === 0 && recommendations.length === 0 && result && (
          <div className="bg-surface border border-green/20 rounded-2xl px-6 py-5 flex items-center gap-4 shadow-[0_0_20px_rgba(0,230,118,0.06)]">
            <span className="text-2xl">✅</span>
            <div>
              <div className="text-[13px] font-semibold text-green">All clear</div>
              <div className="text-[12px] text-muted">No CI failures, risky files, or critical issues detected.</div>
            </div>
          </div>
        )}

      </main>

    </>
  );
}
