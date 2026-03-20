"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/topbar";
import clsx from "clsx";
import { timeAgo } from "@/lib/github";
import type { Recommendation } from "@/lib/analyze";
import { getCachedScan } from "@/lib/scan-cache";

interface ScanResult {
  scanned_at: string;
  analysis: {
    summary: string;
    totalMonthlySpendUsd: number | null;
    potentialMonthlySavingsUsd: number | null;
    recommendations: Recommendation[];
  } | null;
}

const SEVERITY_ORDER = ["critical", "warning", "saving", "info"] as const;

export default function RecommendationsPage() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    const cached = getCachedScan();
    if (cached) { setResult(cached); setLoading(false); return; }
    fetch("/api/scan/results")
      .then(r => r.json())
      .then(({ result }) => setResult(result))
      .finally(() => setLoading(false));
  }, []);

  const allRecs: Recommendation[] = result?.analysis?.recommendations ?? [];

  const sorted = [...allRecs].sort((a, b) =>
    SEVERITY_ORDER.indexOf(a.severity as any) - SEVERITY_ORDER.indexOf(b.severity as any)
  );

  const filtered = filter === "all" ? sorted : sorted.filter(r => r.severity === filter);

  const counts = {
    all:      allRecs.length,
    critical: allRecs.filter(r => r.severity === "critical").length,
    warning:  allRecs.filter(r => r.severity === "warning").length,
    saving:   allRecs.filter(r => r.severity === "saving").length,
    info:     allRecs.filter(r => r.severity === "info").length,
  };

  const severityCfg = {
    critical: { badge: "bg-red/10 text-red border-red/20",     label: "Critical" },
    warning:  { badge: "bg-amber/10 text-amber border-amber/20", label: "Warning"  },
    saving:   { badge: "bg-green/10 text-green border-green/20", label: "Saving"   },
    info:     { badge: "bg-cyan/10 text-cyan border-cyan/20",   label: "Info"     },
  };

  return (
    <>
      <Topbar title="Recommendations" />
      <main className="flex-1 overflow-y-auto p-7 flex flex-col gap-6">

        {/* Stale scan warning */}
        {result && (() => {
          const ageMs = Date.now() - new Date(result.scanned_at).getTime();
          const ageHours = ageMs / 3600000;
          if (ageHours < 24) return null;
          const ageDays = Math.floor(ageMs / 86400000);
          return (
            <div className="flex items-center gap-3 px-4 py-3 bg-amber/5 border border-amber/20 rounded-xl text-[12px] text-amber">
              <span>⚠</span>
              <span>
                This scan is <strong>{ageDays} day{ageDays !== 1 ? "s" : ""} old</strong> — deadlines and expiry alerts may be outdated.
                Run a fresh scan from the Overview page.
              </span>
            </div>
          );
        })()}

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[13px] text-muted mt-0.5">
              {result ? `AI analysis from ${timeAgo(result.scanned_at)}` : "No scan data yet"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {result?.analysis?.potentialMonthlySavingsUsd != null && result.analysis.potentialMonthlySavingsUsd > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green/10 border border-green/20 text-green text-[11px] font-semibold">
                💰 ${result.analysis.potentialMonthlySavingsUsd.toFixed(0)}/mo saveable
              </div>
            )}
          </div>
        </div>

        {/* AI summary */}
        {result?.analysis?.summary && (
          <div className="bg-surface border border-purple/20 rounded-2xl px-5 py-4 flex gap-3">
            <span className="text-purple text-lg flex-shrink-0">🤖</span>
            <p className="text-[12px] text-muted leading-relaxed">{result.analysis.summary}</p>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex items-center gap-2">
          {(["all", "critical", "warning", "saving", "info"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={clsx(
                "px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors",
                filter === f
                  ? "bg-cyan/10 text-cyan border border-cyan/30"
                  : "text-muted border border-border hover:bg-dim hover:text-text"
              )}
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              {counts[f] > 0 && (
                <span className="ml-1.5 opacity-60">{counts[f]}</span>
              )}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-[12px] text-muted font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan pulse-green" />
            Loading recommendations...
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="bg-surface border border-border rounded-2xl px-6 py-10 text-center">
            <div className="text-3xl mb-3">✅</div>
            <div className="text-[13px] font-semibold text-text">
              {allRecs.length === 0 ? "No recommendations yet" : "No recommendations in this category"}
            </div>
            <div className="text-[12px] text-muted mt-1">
              {allRecs.length === 0
                ? "Trigger a scan from the Overview page to get AI analysis."
                : "Try the 'All' filter to see everything."}
            </div>
          </div>
        )}

        {/* Recommendations list */}
        <div className="flex flex-col gap-3">
          {filtered.map(rec => {
            const cfg = severityCfg[rec.severity as keyof typeof severityCfg] ?? severityCfg.info;
            return (
              <div key={rec.id} className="bg-surface border border-border rounded-2xl p-5 flex gap-4 hover:bg-dim transition-colors">
                <span className="text-2xl flex-shrink-0 mt-0.5">{rec.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="text-[13px] font-semibold text-text">{rec.title}</span>
                    <span className={clsx("text-[10px] font-bold uppercase tracking-[1px] px-2 py-0.5 rounded-full border", cfg.badge)}>
                      {rec.saving ?? cfg.label}
                    </span>
                  </div>
                  <p className="text-[12px] text-muted leading-relaxed">{rec.description}</p>
                  <div className="flex items-center gap-3 mt-3">
                    <span className="text-[11px] font-semibold text-text">→ {rec.action}</span>
                    {rec.deadline && (() => {
                      const deadlineMs = new Date(rec.deadline).getTime();
                      const isPast = deadlineMs < Date.now();
                      return isPast ? (
                        <span className="text-[10px] font-bold text-red font-mono">OVERDUE</span>
                      ) : (
                        <span className="text-[10px] text-muted font-mono">
                          by {new Date(rec.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </main>
    </>
  );
}
