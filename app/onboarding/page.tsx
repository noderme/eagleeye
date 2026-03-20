"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Eye, Github, Check, Search, ArrowRight, Lock, Star, RefreshCw } from "lucide-react";
import clsx from "clsx";
import { setCachedScan } from "@/lib/scan-cache";

const SCAN_STEPS = [
  "Saving selected repositories…",
  "Connecting to GitHub…",
  "Fetching repo activity and commit history…",
  "Checking CI/CD run status…",
  "Scanning for risky files and secrets…",
  "Querying provider APIs…",
  "Checking domain expiry…",
  "Running Claude AI analysis…",
  "Generating recommendations…",
  "Almost done…",
];

interface Repo {
  id: number;
  full_name: string;
  name: string;
  private: boolean;
  stargazers_count: number;
  language: string | null;
  updated_at: string;
  description: string | null;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scanStatus, setScanStatus] = useState<"idle" | "saving" | "scanning" | "done">("idle");
  const [scanStep, setScanStep] = useState(0);
  const stepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchRepos();
  }, []);

  async function fetchRepos() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/");
      return;
    }

    let res = await fetch("/api/github/repos");

    // Token not saved server-side (PKCE flow) — recover from browser session
    if (res.status === 404) {
      const { data: { session } } = await supabase.auth.getSession();
      const providerToken = session?.provider_token;
      if (providerToken) {
        await fetch("/api/github/store-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerToken }),
        });
        res = await fetch("/api/github/repos");
      }
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to fetch repositories.");
      setLoading(false);
      return;
    }

    const { repos: data }: { repos: Repo[] } = await res.json();
    setRepos(data);
    setLoading(false);
  }

  function toggle(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleStart() {
    if (selected.size === 0) return;
    setSaving(true);
    setScanStep(0);
    setScanStatus("saving");

    // Advance step every 2.5s — loops through all steps during the scan
    stepIntervalRef.current = setInterval(() => {
      setScanStep(s => Math.min(s + 1, SCAN_STEPS.length - 1));
    }, 2500);

    const picked = repos.filter(r => selected.has(r.id));
    await fetch("/api/repos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repos: picked }),
    });

    setScanStatus("scanning");
    try {
      const scanRes = await fetch("/api/scan/trigger", { method: "POST" });
      if (scanRes.ok) {
        const { result } = await scanRes.json();
        const saveRes = await fetch("/api/scan/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ result }),
        });
        if (saveRes.ok) {
          const { result: saved } = await saveRes.json();
          setCachedScan(saved);
        }
      }
    } catch {
      // Scan failed — still redirect, dashboard will show the error
    }

    if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
    setScanStep(SCAN_STEPS.length - 1);
    setScanStatus("done");
    router.push("/dashboard");
  }

  const filtered = repos.filter(r =>
    r.full_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-6 py-12">

      {/* Header */}
      <div className="flex items-center gap-3 mb-10">
        <Eye className="w-7 h-7 text-cyan drop-shadow-[0_0_8px_#00D4FF]" />
        <span className="text-[15px] font-bold text-text tracking-wide">Eagle Eye</span>
      </div>

      <div className="w-full max-w-2xl">

        {/* Title */}
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Github className="w-5 h-5 text-text" />
            <h1 className="text-[22px] font-bold text-text">Select repos to monitor</h1>
          </div>
          <p className="text-[13px] text-muted">
            Eagle Eye will watch these for secrets, key hygiene, and CI health.
          </p>
        </div>

        {/* Progress view — shown while scanning */}
        {saving ? (
          <div className="bg-surface border border-cyan/20 rounded-2xl p-8 flex flex-col gap-6 shadow-[0_0_40px_rgba(0,212,255,0.08)]">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple to-cyan flex items-center justify-center text-2xl shadow-[0_0_24px_rgba(123,97,255,0.35)] animate-pulse flex-shrink-0">
                🤖
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[13px] font-bold text-text">Eagle Eye</span>
                  <span className="text-[9px] font-bold uppercase tracking-[1.5px] px-2 py-0.5 rounded-full border bg-cyan/10 text-cyan border-cyan/20">
                    {scanStatus === "done" ? "Done" : "Scanning"}
                  </span>
                </div>
                <p className="text-[11px] font-mono text-cyan/80">
                  ▸ {SCAN_STEPS[scanStep]}<span className="animate-pulse">▌</span>
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-[10px] text-muted font-mono">
                <span>Step {scanStep + 1} of {SCAN_STEPS.length}</span>
                <span>{Math.round(((scanStep + 1) / SCAN_STEPS.length) * 100)}%</span>
              </div>
              <div className="w-full h-2 bg-dim rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan rounded-full transition-all duration-[2500ms] ease-linear"
                  style={{ width: `${((scanStep + 1) / SCAN_STEPS.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Step list */}
            <div className="flex flex-col gap-1.5">
              {SCAN_STEPS.map((step, i) => (
                <div key={step} className="flex items-center gap-2.5">
                  <span className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors",
                    i < scanStep ? "bg-green" : i === scanStep ? "bg-cyan pulse-green" : "bg-border"
                  )} />
                  <span className={clsx("text-[11px] font-mono transition-colors",
                    i < scanStep ? "text-green" : i === scanStep ? "text-cyan" : "text-muted/40"
                  )}>
                    {step}
                  </span>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-muted text-center">
              This takes about 30–60 seconds. You&apos;ll be redirected automatically.
            </p>
          </div>
        ) : (
          <>
            {/* Card */}
            <div className="bg-surface border border-border rounded-2xl overflow-hidden">

              {/* Search */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                <Search className="w-4 h-4 text-muted flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Search repositories..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="flex-1 bg-transparent text-[13px] text-text placeholder:text-muted outline-none"
                />
                {selected.size > 0 && (
                  <span className="text-[11px] font-semibold text-cyan px-2 py-0.5 rounded-full bg-cyan/10 border border-cyan/20">
                    {selected.size} selected
                  </span>
                )}
              </div>

              {/* Repo list */}
              <div className="max-h-[420px] overflow-y-auto">
                {loading && (
                  <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-muted font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan pulse-green" />
                    Fetching repositories...
                  </div>
                )}

                {error && (
                  <div className="flex flex-col items-center gap-4 py-16">
                    <p className="text-[13px] text-red text-center max-w-sm">{error}</p>
                    <button
                      onClick={fetchRepos}
                      className="flex items-center gap-2 px-4 py-2 text-[12px] font-semibold text-cyan border border-cyan/30 rounded-lg hover:bg-cyan/5 transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Retry
                    </button>
                  </div>
                )}

                {!loading && !error && filtered.length === 0 && (
                  <div className="flex items-center justify-center py-16 text-[13px] text-muted">
                    No repositories found.
                  </div>
                )}

                {!loading && !error && filtered.map(repo => {
                  const isSelected = selected.has(repo.id);
                  return (
                    <div
                      key={repo.id}
                      onClick={() => toggle(repo.id)}
                      className={clsx(
                        "flex items-center gap-4 px-4 py-3.5 border-b border-border/50 last:border-0 cursor-pointer transition-colors",
                        isSelected ? "bg-cyan/5" : "hover:bg-dim"
                      )}
                    >
                      <div className={clsx(
                        "w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all",
                        isSelected ? "bg-cyan border-cyan" : "border-border"
                      )}>
                        {isSelected && <Check className="w-3 h-3 text-bg" strokeWidth={3} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold text-text truncate">{repo.full_name}</span>
                          {repo.private && <Lock className="w-3 h-3 text-muted flex-shrink-0" />}
                        </div>
                        {repo.description && (
                          <p className="text-[11px] text-muted truncate mt-0.5">{repo.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 text-[11px] text-muted">
                        {repo.language && <span className="font-mono">{repo.language}</span>}
                        {repo.stargazers_count > 0 && (
                          <span className="flex items-center gap-1">
                            <Star className="w-3 h-3" />
                            {repo.stargazers_count}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CTA */}
            <div className="mt-5 flex justify-end">
              <button
                onClick={handleStart}
                disabled={selected.size === 0 || saving}
                className="flex items-center gap-2 px-6 py-3 bg-cyan text-bg text-[13px] font-bold rounded-xl hover:bg-cyan/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-[0_0_24px_rgba(0,212,255,0.25)]"
              >
                Start monitoring {selected.size > 0 ? `${selected.size} repo${selected.size !== 1 ? "s" : ""}` : "repos"}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
