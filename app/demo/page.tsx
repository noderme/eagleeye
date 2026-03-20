"use client";

import React, { useState } from "react";
import {
  Eye, LayoutDashboard, Zap, KeyRound, Puzzle,
  Lightbulb, TrendingUp, ShieldCheck, Settings,
} from "lucide-react";
import clsx from "clsx";

// ── Demo data ──────────────────────────────────────────────────────────────

const DEMO_REPOS = [
  { name: "rootcanal", lang: "TypeScript", ci: "passing", prs: 2, risky: false },
  { name: "dashboard", lang: "TypeScript", ci: "passing", prs: 1, risky: false },
  { name: "scraper",   lang: "Python",     ci: "none",    prs: 0, risky: false },
];

const DEMO_PROVIDERS = [
  {
    id: "openai", emoji: "🤖", label: "OpenAI",
    value: "$127.40", sub: "pay-as-you-go", color: "var(--text)",
    extra: (
      <div style={{ marginTop: "8px" }}>
        <div style={{ fontSize: "10px", color: "var(--muted)", marginBottom: "4px" }}>of $175 limit · 73%</div>
        <div style={{ width: "100%", height: "6px", background: "var(--dim)", borderRadius: "999px", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: "999px", background: "var(--red)", width: "73%" }} />
        </div>
      </div>
    ),
  },
  {
    id: "stripe", emoji: "💳", label: "Stripe MRR",
    value: "$4,200", sub: "87 active subs", color: "var(--text)",
  },
  {
    id: "vercel", emoji: "▲", label: "Vercel",
    value: "Pro", sub: "4 projects", color: "var(--text)",
  },
  {
    id: "anthropic", emoji: "🧠", label: "Anthropic",
    value: "Active", sub: "expires today", color: "var(--red)",
  },
  {
    id: "supabase", emoji: "⚡", label: "Supabase",
    value: "free", sub: "2 projects", color: "var(--text)",
  },
  {
    id: "resend", emoji: "📧", label: "Resend",
    value: "3", sub: "domains connected", color: "var(--text)",
  },
];

const DEMO_DOMAINS = [
  { domain: "rootcanal.dev",     daysLeft: 8,   expires: "Mar 28, 2026" },
  { domain: "api.rootcanal.dev", daysLeft: 287, expires: "Jan 1, 2027" },
];

const DEMO_RECS = [
  {
    id: "r1", icon: "🔑", severity: "critical",
    badge: "CRITICAL", badgeClass: "bg-red/10 text-red border-red/20",
    title: "Anthropic API key expires today",
    desc: "Your Anthropic API key expires TODAY. Every service calling Claude will start returning 401 errors the moment this key is invalidated. This is a production-down-level event.",
    action: "Rotate the key immediately at console.anthropic.com/settings/keys and update every secret store referencing it.",
  },
  {
    id: "r2", icon: "⚡", severity: "warning",
    badge: "WARNING", badgeClass: "bg-amber/10 text-amber border-amber/20",
    title: "Supabase free project slots full",
    desc: "You are using 2 of 2 allowed active projects on the Supabase free plan — 100% of the project quota. You cannot create any new project without pausing an existing one or upgrading.",
    action: "Upgrade one project to Supabase Pro ($25/mo) if you need a third project, or pause an unused project to free a slot.",
  },
  {
    id: "r3", icon: "🌐", severity: "warning",
    badge: "WARNING", badgeClass: "bg-amber/10 text-amber border-amber/20",
    title: "rootcanal.dev expires in 8 days",
    desc: "Your primary domain expires on Mar 28, 2026 and auto-renew is disabled. If this domain lapses, your app goes offline and a competitor could register it.",
    action: "Enable auto-renew in your registrar immediately, or manually renew for at least 1 year.",
  },
  {
    id: "r4", icon: "📊", severity: "info",
    badge: "SAVE $40/mo", badgeClass: "bg-green/10 text-green border-green/20",
    title: "OpenAI spend at 73% — consider upgrading tier",
    desc: "You are spending $127/mo and approaching the $175 hard limit. At current growth rate you will hit the cap in ~11 days, triggering 429 errors across all AI-powered features.",
    action: "Raise your hard limit in OpenAI platform settings, or audit high-volume prompts to reduce token usage.",
  },
];

const DEMO_STATS = [
  { label: "Failing CI",  value: "0", color: "text-green", dot: "bg-green",       sub: "Workflow runs",         glow: "" },
  { label: "Open PRs",    value: "3", color: "text-amber", dot: "bg-amber",       sub: "Across all repos",      glow: "" },
  { label: "Secret Risk", value: "0", color: "text-green", dot: "bg-green",       sub: "Repos with risky files", glow: "" },
  { label: "Services",    value: "6", color: "text-cyan",  dot: "bg-cyan",        sub: "Integrations monitored", glow: "shadow-[0_0_20px_rgba(0,212,255,0.08)]" },
];

// ── Views ──────────────────────────────────────────────────────────────────

function OverviewView() {
  const providerCols = Math.min(DEMO_PROVIDERS.length, 4);

  return (
    <main className="flex-1 overflow-y-auto p-7 flex flex-col gap-6">

      {/* Bot status */}
      <div className="relative rounded-2xl border bg-surface" style={{ borderColor: "rgba(0,212,255,0.25)" }}>
        <div className="flex items-center gap-5 px-6 py-5">
          <div className="relative flex-shrink-0">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple to-cyan flex items-center justify-center text-2xl shadow-[0_0_24px_rgba(123,97,255,0.35)]">
              🤖
            </div>
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-bg bg-green" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[13px] font-bold text-text">Eagle Eye</span>
              <span className="text-[9px] font-bold uppercase tracking-[1.5px] px-2 py-0.5 rounded-full border bg-green/10 text-green border-green/20">
                Watching
              </span>
            </div>
            <p className="text-[12px] font-mono text-cyan truncate">
              ▸ 2 critical issues require immediate attention across 6 monitored services
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              <div className="text-[10px] text-muted uppercase tracking-wide">Last scan</div>
              <div className="text-[12px] font-mono text-text">3 min ago</div>
            </div>
            <button className="text-[11px] font-semibold text-cyan px-3 py-1.5 rounded-lg border border-cyan/30 bg-cyan/5 hover:bg-cyan/10 transition-colors">
              Scan now
            </button>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3.5">
        {DEMO_STATS.map(({ label, value, color, dot, sub, glow }) => (
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

      {/* Provider health */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-[13px] font-semibold text-text flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan" />
            Provider Health &amp; Spend
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-[12px] font-mono font-bold text-text">
              $4,492.40<span className="text-muted font-normal">/mo total</span>
            </span>
            <span className="text-[11px] font-semibold text-green px-2 py-0.5 rounded-full bg-green/10 border border-green/20">
              $40/mo saveable
            </span>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${providerCols}, 1fr)` }}>
          {DEMO_PROVIDERS.map((card, i) => (
            <div key={card.id} style={{
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              minHeight: "100px",
              borderLeft: i > 0 && i % providerCols !== 0 ? "1px solid var(--border)" : "none",
              borderTop: i >= providerCols ? "1px solid var(--border)" : "none",
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

      {/* Domain expiry */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-[13px] font-semibold text-text flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan" />
            Domain Expiry
          </h2>
          <span className="text-[10px] font-mono text-muted">2 tracked</span>
        </div>
        <div className="flex flex-col">
          {DEMO_DOMAINS.map(d => {
            const urgent = d.daysLeft <= 30;
            const dot = urgent ? "bg-red pulse-red" : "bg-green";
            const color = urgent ? "text-red" : "text-green";
            return (
              <div key={d.domain} className="hover:bg-dim transition-colors border-b border-border/50 last:border-0" style={{ display: "flex", alignItems: "center", gap: "16px", padding: "14px 20px" }}>
                <span className={clsx("w-2 h-2 rounded-full flex-shrink-0", dot)} />
                <div className="flex-1 font-mono text-[13px] text-text">{d.domain}</div>
                <div className="text-right">
                  <div className={clsx("text-[12px] font-mono font-semibold", color)}>
                    {d.daysLeft <= 0 ? "EXPIRED" : `${d.daysLeft}d left`}
                  </div>
                  <div className="text-[10px] text-muted">{d.expires}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Repositories */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-[13px] font-semibold text-text flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple shadow-[0_0_6px_#7B61FF]" />
            Project Repos
          </h2>
          <span className="text-[10px] font-mono text-muted">3 in this project</span>
        </div>
        {DEMO_REPOS.map(r => {
          const ci = r.ci === "passing"
            ? { dot: "bg-green", label: "Passing", color: "text-green" }
            : { dot: "bg-muted", label: "No CI", color: "text-muted" };
          return (
            <div key={r.name} className="hover:bg-dim transition-colors cursor-pointer border-b border-border/50 last:border-0" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 20px" }}>
              <div className="w-8 h-8 rounded-lg bg-surface2 border border-border flex items-center justify-center text-sm flex-shrink-0 font-bold text-muted">
                {r.name[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold text-text truncate">{r.name}</div>
                <div className="text-[10px] text-muted flex items-center gap-1.5 mt-0.5">
                  <span className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", ci.dot)} />
                  <span className={ci.color}>{ci.label}</span>
                  {r.prs > 0 && <span className="text-muted">· {r.prs} PR{r.prs !== 1 ? "s" : ""}</span>}
                </div>
              </div>
              <div className="text-[10px] text-muted font-mono flex-shrink-0">{r.lang}</div>
            </div>
          );
        })}
      </div>

    </main>
  );
}

function RecommendationsView() {
  return (
    <main className="flex-1 overflow-y-auto p-7 flex flex-col gap-6">
      <div>
        <h1 className="text-[20px] font-bold text-text">Recommendations</h1>
        <p className="text-[13px] text-muted mt-0.5">AI analysis from 3 min ago</p>
      </div>
      <div className="flex flex-col gap-3">
        {DEMO_RECS.map(rec => (
          <div key={rec.id} className="bg-surface border border-border rounded-2xl p-5 flex gap-4">
            <span className="text-2xl flex-shrink-0 mt-0.5">{rec.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="text-[13px] font-semibold text-text">{rec.title}</span>
                <span className={`text-[10px] font-bold uppercase tracking-[1px] px-2 py-0.5 rounded-full border ${rec.badgeClass}`}>
                  {rec.badge}
                </span>
              </div>
              <p className="text-[12px] text-muted leading-relaxed">{rec.desc}</p>
              <div className="flex items-center gap-3 mt-3">
                <span className="text-[11px] font-semibold text-text">→ {rec.action}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

// ── Main demo page ─────────────────────────────────────────────────────────

const VIEWS: Record<string, { label: string; component: () => React.ReactNode }> = {
  overview:       { label: "Overview",        component: OverviewView },
  recommendations:{ label: "Recommendations", component: RecommendationsView },
};

export default function DemoPage() {
  const [view, setView] = useState<keyof typeof VIEWS>("overview");
  const ViewComponent = VIEWS[view].component;

  const sidebarActive: Record<string, string> = {
    overview:        "#overview",
    recommendations: "#recs",
  };

  return (
    <div className="flex h-screen bg-bg overflow-hidden">

      {/* Demo banner */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-3 py-2 bg-amber/10 border-b border-amber/20 text-[11px] font-semibold text-amber">
        <span className="w-1.5 h-1.5 rounded-full bg-amber" />
        DEMO MODE — sample data only, no real credentials used
        <span className="mx-3 text-amber/40">·</span>
        <a href="/" className="underline underline-offset-2 hover:text-text transition-colors">Get started free →</a>
      </div>

      <div className="flex w-full h-full pt-[33px]">
        {/* Sidebar with view switcher */}
        <aside className="w-[220px] h-full flex flex-col flex-shrink-0 bg-surface border-r border-border">
          <div className="flex items-center gap-3 px-5 py-6 border-b border-border flex-shrink-0">
            <div className="w-8 h-8 flex items-center justify-center">
              <Eye className="w-7 h-7 text-cyan drop-shadow-[0_0_6px_#00D4FF]" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-bold text-text tracking-wide">Eagle Eye</span>
              <span className="text-[9px] font-semibold text-cyan tracking-[2px] uppercase">Infrastructure AI</span>
            </div>
          </div>

          <nav className="flex-1 px-2.5 py-4 flex flex-col gap-0.5 overflow-y-auto">
            {[
              { section: "Monitor", items: [
                { key: "overview",         label: "Overview",        icon: LayoutDashboard, badge: 2, bc: "red" },
                { key: null,               label: "Alerts",          icon: Zap,             badge: 2, bc: "red" },
                { key: null,               label: "Key Hygiene",     icon: KeyRound,        badge: 1, bc: "amber" },
                { key: null,               label: "Integrations",    icon: Puzzle,          badge: 6, bc: "green" },
              ]},
              { section: "Intelligence", items: [
                { key: "recommendations",  label: "Recommendations", icon: Lightbulb },
                { key: null,               label: "Usage Trends",    icon: TrendingUp },
                { key: null,               label: "Plan Fit",        icon: ShieldCheck },
              ]},
              { section: "Settings", items: [
                { key: null,               label: "Settings",        icon: Settings },
              ]},
            ].map(({ section, items }) => (
              <div key={section}>
                <div className="text-[9px] font-semibold text-muted uppercase tracking-[1.5px] px-2.5 py-3 mt-1">{section}</div>
                {items.map((item) => {
                  const { key, label, icon: Icon } = item;
                  const badge = "badge" in item ? item.badge : undefined;
                  const bc = "bc" in item ? item.bc : undefined;
                  const isActive = key === view;
                  const badgeStyles: Record<string, string> = {
                    red:   "bg-red/15 text-red border border-red/30",
                    amber: "bg-amber/15 text-amber border border-amber/30",
                    green: "bg-green/15 text-green border border-green/30",
                  };
                  return (
                    <button
                      key={label}
                      onClick={() => key && setView(key)}
                      className={clsx(
                        "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all relative text-left",
                        isActive ? "bg-cyan/8 text-cyan" : key ? "text-muted hover:bg-dim hover:text-text" : "text-muted/40 cursor-default"
                      )}
                    >
                      {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] bg-cyan rounded-r-full" />}
                      <Icon className="w-[15px] h-[15px] flex-shrink-0" />
                      <span className="flex-1">{label}</span>
                      {badge !== undefined && badge > 0 && (
                        <span className={clsx("text-[9px] font-bold px-1.5 py-0.5 rounded-full", badgeStyles[bc ?? "red"])}>
                          {badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="p-4 border-t border-border flex-shrink-0">
            <div className="flex items-center gap-2.5 px-2.5 py-2 bg-dim rounded-lg">
              <div className="w-7 h-7 rounded-md bg-gradient-to-br from-purple to-cyan flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
                JD
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold text-text truncate">Jane Dev</div>
                <div className="text-[10px] text-muted">6 integrations</div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Topbar */}
          <header className="h-14 flex items-center gap-4 px-7 border-b border-border bg-bg/95 backdrop-blur-sm flex-shrink-0">
            <h1 className="text-[15px] font-semibold text-text flex-1">{VIEWS[view].label}</h1>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold border bg-red/8 border-red/20 text-red">
              <span className="w-1.5 h-1.5 rounded-full bg-red" style={{ animation: "pulse-dot-red 2s infinite" }} />
              2 critical alerts
            </div>
            <span className="text-[11px] text-muted font-mono">Last scan: 3 min ago</span>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-muted text-[12px] font-medium rounded-lg border border-border hover:border-cyan/40 hover:text-cyan transition-colors">
              ⇄ Switch Project
            </button>
          </header>

          {/* Page */}
          <ViewComponent />
        </div>
      </div>
    </div>
  );
}
