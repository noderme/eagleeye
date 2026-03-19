"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/topbar";
import clsx from "clsx";
import { timeAgo } from "@/lib/github";
import { getCachedScan } from "@/lib/scan-cache";

interface ScanResult {
  scanned_at: string;
  provider_data: Record<string, any>;
  github_data: any[];
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

  const openai = providers.openai ?? null;
  const stripe = providers.stripe && !providers.stripe.error ? providers.stripe : null;
  const vercel = providers.vercel && !providers.vercel.error ? providers.vercel : null;
  const resend = providers.resend && !providers.resend.error ? providers.resend : null;
  const twilio = providers.twilio && !providers.twilio.error ? providers.twilio : null;

  const totalCIRuns = insights.reduce((s: number, i: any) => s + (i.ciRuns?.length ?? 0), 0);
  const totalCommits = insights.reduce((s: number, i: any) => s + (i.commits?.length ?? 0), 0);
  const totalOpenPRs = insights.reduce((s: number, i: any) => s + (i.openPRs ?? 0), 0);

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

        {/* OpenAI usage */}
        {openai && (
          <section className="flex flex-col gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-muted flex items-center gap-2">
              <span className="text-base">🤖</span>
              OpenAI Usage
            </h2>
            {openai.error ? (
              <div className="bg-surface border border-red/20 rounded-2xl px-5 py-4 text-[12px] text-red">
                {openai.error}
              </div>
            ) : (
              <div className="bg-surface border border-border rounded-2xl p-5 flex flex-col gap-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-[10px] text-muted uppercase tracking-wide mb-1">This month</div>
                    <div className="text-[24px] font-bold font-mono text-text">
                      {openai.monthlySpendUsd != null ? `$${openai.monthlySpendUsd.toFixed(2)}` : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Spend limit</div>
                    <div className="text-[24px] font-bold font-mono text-text">
                      {openai.hardLimitUsd != null ? `$${openai.hardLimitUsd}` : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Plan</div>
                    <div className="text-[24px] font-bold font-mono text-text capitalize">
                      {openai.plan ?? "—"}
                    </div>
                  </div>
                </div>
                {openai.hardLimitUsd && openai.monthlySpendUsd != null && (
                  <div>
                    <div className="flex justify-between text-[10px] text-muted mb-1.5">
                      <span>Quota used</span>
                      <span>{((openai.monthlySpendUsd / openai.hardLimitUsd) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full h-2 bg-dim rounded-full overflow-hidden">
                      <div
                        className={clsx("h-full rounded-full transition-all", (openai.monthlySpendUsd / openai.hardLimitUsd) > 0.8 ? "bg-red" : "bg-cyan")}
                        style={{ width: `${Math.min(100, (openai.monthlySpendUsd / openai.hardLimitUsd) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Stripe */}
        {stripe && (
          <section className="flex flex-col gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-muted flex items-center gap-2">
              <span className="text-base">💳</span>
              Stripe Revenue
            </h2>
            <div className="bg-surface border border-border rounded-2xl p-5">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-[10px] text-muted uppercase tracking-wide mb-1">MRR</div>
                  <div className="text-[24px] font-bold font-mono text-green">${stripe.monthlyRecurringRevenue?.toFixed(2) ?? "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Active subscriptions</div>
                  <div className="text-[24px] font-bold font-mono text-text">{stripe.activeSubscriptions ?? "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Balance</div>
                  <div className="text-[24px] font-bold font-mono text-text">
                    {stripe.availableBalanceUsd != null ? `$${stripe.availableBalanceUsd.toFixed(2)}` : "—"}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Vercel */}
        {vercel && (
          <section className="flex flex-col gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-muted flex items-center gap-2">
              <span className="text-base">▲</span>
              Vercel Usage
            </h2>
            <div className="bg-surface border border-border rounded-2xl p-5">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Plan</div>
                  <div className="text-[24px] font-bold font-mono text-text capitalize">{vercel.plan ?? "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Projects</div>
                  <div className="text-[24px] font-bold font-mono text-text">{vercel.projectCount ?? "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Team</div>
                  <div className="text-[14px] font-semibold text-muted mt-2 truncate">{vercel.teamName ?? "Personal"}</div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Resend */}
        {resend && (
          <section className="flex flex-col gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-muted flex items-center gap-2">
              <span className="text-base">📧</span>
              Resend Email
            </h2>
            <div className="bg-surface border border-border rounded-2xl p-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Domains</div>
                  <div className="text-[24px] font-bold font-mono text-text">{resend.domainCount ?? "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Verified domains</div>
                  <div className="text-[24px] font-bold font-mono text-green">
                    {resend.domains ? resend.domains.filter((d: any) => d.status === "verified").length : "—"}
                  </div>
                </div>
              </div>
              {resend.domains?.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {resend.domains.map((d: any) => (
                    <div key={d.name} className={clsx(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-mono",
                      d.status === "verified" ? "bg-green/5 border-green/20 text-green" : "bg-dim border-border text-muted"
                    )}>
                      {d.name}
                      <span className="text-[9px] uppercase">{d.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Twilio */}
        {twilio && (
          <section className="flex flex-col gap-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-muted flex items-center gap-2">
              <span className="text-base">📱</span>
              Twilio
            </h2>
            <div className="bg-surface border border-border rounded-2xl p-5">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Balance</div>
                  <div className="text-[24px] font-bold font-mono text-text">
                    {twilio.balance != null ? `$${parseFloat(twilio.balance).toFixed(2)}` : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Phone numbers</div>
                  <div className="text-[24px] font-bold font-mono text-text">{twilio.phoneNumberCount ?? "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Account type</div>
                  <div className="text-[14px] font-semibold text-muted mt-2 capitalize">{twilio.type ?? "—"}</div>
                </div>
              </div>
            </div>
          </section>
        )}

        {!loading && Object.keys(providers).length === 0 && insights.length === 0 && (
          <div className="bg-surface border border-border rounded-2xl px-6 py-10 text-center">
            <div className="text-[13px] text-muted">No usage data available yet.</div>
            <a href="/dashboard" className="text-[12px] text-cyan hover:underline mt-1 block">Trigger a scan →</a>
          </div>
        )}

      </main>
    </>
  );
}
