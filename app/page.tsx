"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Github } from "lucide-react";

const TICKER = [
  "Scanning GitHub repositories for exposed secrets...",
  "Analyzing API key rotation patterns...",
  "Checking Stripe dispute rate thresholds...",
  "Monitoring OpenAI token burn rate...",
  "Detecting stale credentials across integrations...",
  "Evaluating plan fit vs actual usage...",
  "Watching for quota exhaustion signals...",
  "Cross-referencing infrastructure risk vectors...",
];

export default function LandingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [tickerIndex, setTickerIndex] = useState(0);
  const [displayed, setDisplayed] = useState("");
  const [charIndex, setCharIndex] = useState(0);

  // Typing effect
  useEffect(() => {
    const current = TICKER[tickerIndex];
    if (charIndex < current.length) {
      const t = setTimeout(() => {
        setDisplayed(current.slice(0, charIndex + 1));
        setCharIndex(c => c + 1);
      }, 28);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(() => {
        setTickerIndex(i => (i + 1) % TICKER.length);
        setCharIndex(0);
        setDisplayed("");
      }, 1800);
      return () => clearTimeout(t);
    }
  }, [charIndex, tickerIndex]);

  async function connectGitHub() {
    setLoading(true);
    setAuthError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: "read:user user:email repo",
        },
      });
      if (error) {
        setAuthError(error.message);
        setLoading(false);
      }
      // On success the browser redirects to GitHub — no further action needed
    } catch (e) {
      setAuthError(String(e));
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center relative overflow-hidden">

      {/* Grid background */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: "linear-gradient(#00D4FF 1px, transparent 1px), linear-gradient(90deg, #00D4FF 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }} />

      {/* Radial glow center */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(ellipse, rgba(0,212,255,0.06) 0%, transparent 70%)" }} />

      {/* Scanning ring animations */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        {[1, 2, 3].map(i => (
          <div key={i} className="absolute rounded-full border border-cyan/10"
            style={{
              width: `${i * 180}px`,
              height: `${i * 180}px`,
              top: `${-i * 90}px`,
              left: `${-i * 90}px`,
              animation: `ping ${2 + i * 0.8}s ease-out infinite`,
              animationDelay: `${i * 0.4}s`,
            }} />
        ))}
      </div>

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-8 py-5 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">👁️</span>
          <span className="text-sm font-bold text-text tracking-wide">Eagle Eye</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-green pulse-green inline-block" />
          Active · Monitoring 4,200+ integrations globally
        </div>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-2xl">

        {/* Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-cyan/20 bg-cyan/5 text-cyan text-[11px] font-semibold mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan pulse-green" />
          AI Infrastructure Intelligence — Now watching
        </div>

        {/* Headline */}
        <h1 className="text-5xl font-bold text-text leading-tight mb-4 tracking-tight">
          Your infra has a<br />
          <span className="text-transparent bg-clip-text"
            style={{ backgroundImage: "linear-gradient(90deg, #00D4FF, #7B61FF)" }}>
            guardian robot
          </span>
        </h1>

        <p className="text-[15px] text-muted leading-relaxed mb-10 max-w-lg">
          Eagle Eye watches your APIs, keys, quotas and costs 24/7.
          It catches what breaks production before you do.
        </p>

        {/* Typing ticker */}
        <div className="w-full max-w-md mb-10 px-4 py-3 bg-surface border border-border rounded-xl text-left">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green pulse-green" />
            <span className="text-[10px] font-semibold text-muted uppercase tracking-[1.5px]">Eagle Eye · Live scan</span>
          </div>
          <p className="text-[12px] font-mono text-cyan min-h-[18px]">
            {displayed}<span className="animate-pulse">▌</span>
          </p>
        </div>

        {/* GitHub OAuth button */}
        <button
          onClick={connectGitHub}
          disabled={loading}
          className="relative flex items-center gap-3 px-7 py-4 bg-text text-bg text-[14px] font-bold rounded-xl hover:bg-white transition-all hover:shadow-[0_0_30px_rgba(0,212,255,0.2)] disabled:opacity-80 disabled:cursor-not-allowed overflow-hidden"
        >
          {loading && (
            <span className="absolute bottom-0 left-0 h-[3px] bg-cyan/60 rounded-full"
              style={{ animation: "oauth-progress 2.5s ease-in-out infinite" }} />
          )}
          {loading
            ? <span className="w-4 h-4 border-2 border-bg/30 border-t-bg rounded-full animate-spin flex-shrink-0" />
            : <Github className="w-5 h-5" />
          }
          {loading ? "Redirecting to GitHub..." : "Connect GitHub to get started"}
        </button>

        {loading && (
          <p className="text-[11px] text-muted mt-3 animate-pulse">
            Opening GitHub authorization page...
          </p>
        )}

        {authError && (
          <p className="text-[12px] text-red mt-3 max-w-sm text-center">
            {authError}
          </p>
        )}

        <p className="text-[11px] text-muted mt-4">
          Read-only access · No code is stored · Disconnect anytime
        </p>

        {/* Trust signals */}
        <div className="flex items-center gap-8 mt-14 text-[11px] text-muted">
          {[
            { val: "4,200+", label: "Integrations monitored" },
            { val: "$1.2M",  label: "Saved in wasted SaaS spend" },
            { val: "99.9%",  label: "Uptime on alerting" },
          ].map(({ val, label }) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <span className="text-[22px] font-bold text-text font-mono">{val}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        @keyframes ping {
          0%   { transform: scale(0.8); opacity: 0.6; }
          100% { transform: scale(1.4); opacity: 0; }
        }
        @keyframes oauth-progress {
          0%   { width: 0%; left: 0; }
          50%  { width: 70%; left: 15%; }
          100% { width: 0%; left: 100%; }
        }
      `}</style>
    </div>
  );
}
