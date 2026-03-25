"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/topbar";
import clsx from "clsx";
import { timeAgo } from "@/lib/github";
import type { RepoInsight } from "@/lib/github";

interface ScanResult {
  scanned_at: string;
  github_data: RepoInsight[];
  domain_data: any[];
  analysis: { recommendations: any[] } | null;
}

export default function AlertsPage() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/scan/results")
      .then(r => r.json())
      .then(({ result }) => setResult(result))
      .finally(() => setLoading(false));
  }, []);

  const insights: RepoInsight[] = result?.github_data ?? [];
  const domains: any[] = result?.domain_data ?? [];

  // Real alerts only — no AI recommendations here (those live on the Recommendations page)
  const failingCI = insights.filter(i => i.ciRuns[0]?.conclusion === "failure");
  const riskyFiles = insights.flatMap(i => i.riskyFiles.map(f => ({ file: f, repo: i.repo.name })));
  const urgentDomains = domains.filter(d => d.daysLeft !== null && d.daysLeft <= 30);

  const totalAlerts = failingCI.length + riskyFiles.length + urgentDomains.length;

  return (
    <>
      <Topbar title="Alerts" alerts={totalAlerts} />
      <main className="flex-1 overflow-y-auto p-7 flex flex-col gap-5">

        {loading && (
          <div className="flex items-center gap-2 text-[12px] text-muted font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan pulse-green" />
            Loading alerts...
          </div>
        )}

        {!loading && totalAlerts === 0 && (
          <div className="bg-surface border border-green/20 rounded-2xl px-6 py-8 flex items-center gap-4">
            <span className="text-3xl">✅</span>
            <div>
              <div className="text-[14px] font-semibold text-green">No active alerts</div>
              <div className="text-[12px] text-muted mt-0.5">
                All systems healthy. Last scan {result ? timeAgo(result.scanned_at) : "—"}
              </div>
              <div className="text-[11px] text-muted mt-2">
                AI recommendations and cost-saving suggestions are on the{" "}
                <a href="/dashboard/recommendations" className="text-cyan underline underline-offset-2">Recommendations</a> page.
              </div>
            </div>
          </div>
        )}

        {/* Failing CI */}
        {failingCI.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-red flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red pulse-red" />
              Failing CI ({failingCI.length})
            </h2>
            <div className="bg-surface border border-red/20 rounded-2xl overflow-hidden">
              {failingCI.map(({ repo, ciRuns }) => (
                <div key={repo.full_name} className="flex items-center gap-4 px-5 py-4 border-b border-border/50 last:border-0 hover:bg-dim transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-red/10 border border-red/20 flex items-center justify-center text-sm font-bold text-red flex-shrink-0">
                    {repo.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-text">{repo.name}</div>
                    <div className="text-[11px] text-muted font-mono mt-0.5">{ciRuns[0]?.name ?? "Workflow"}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-[11px] font-bold text-red">FAILED</div>
                    <div className="text-[10px] text-muted font-mono">{timeAgo(ciRuns[0]?.created_at ?? "")}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Risky files */}
        {riskyFiles.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-red flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red" />
              Secret Risk — Suspicious Files ({riskyFiles.length})
            </h2>
            <div className="bg-surface border border-red/20 rounded-2xl overflow-hidden">
              {riskyFiles.map(({ file, repo }, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3.5 border-b border-border/50 last:border-0 hover:bg-dim transition-colors">
                  <span className="text-red text-[13px]">⚠</span>
                  <div className="flex-1 font-mono text-[12px] text-text">{file}</div>
                  <div className="text-[11px] text-muted">{repo}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Urgent domains */}
        {urgentDomains.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-amber flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber" />
              Domain Expiry Warning ({urgentDomains.length})
            </h2>
            <div className="bg-surface border border-amber/20 rounded-2xl overflow-hidden">
              {urgentDomains.map((d: any) => (
                <div key={d.domain} className="flex items-center gap-4 px-5 py-4 border-b border-border/50 last:border-0 hover:bg-dim transition-colors">
                  <span className="text-xl">🌐</span>
                  <div className="flex-1 font-mono text-[13px] text-text">{d.domain}</div>
                  <div className="text-right">
                    <div className={clsx("text-[12px] font-bold font-mono", d.daysLeft <= 7 ? "text-red" : "text-amber")}>
                      {d.daysLeft <= 0 ? "EXPIRED" : `${d.daysLeft}d left`}
                    </div>
                    <div className="text-[10px] text-muted">
                      {d.expiresAt ? new Date(d.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

      </main>
    </>
  );
}
