"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
// Mock mode check — read directly from process.env at compile time
// NEXT_PUBLIC_ vars are inlined by Next.js at build/dev time
const IS_MOCK_MODE = process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";
import { Github, Eye, Zap, KeyRound, TrendingUp, ShieldCheck, Globe, GitBranch, ArrowRight, Check } from "lucide-react";

const TICKER = [
  "Scanning GitHub repositories for exposed secrets...",
  "Anthropic API key expires in 2 days — rotate now...",
  "OpenAI spend at 87% of hard limit...",
  "Supabase: 2 of 2 free project slots used...",
  "Domain expiring in 11 days — auto-renew disabled...",
  "Active repo has zero CI coverage...",
  "Stripe plan under-utilised — downgrade saves $40/mo...",
  "Checking domain expiry via RDAP...",
];

const FEATURES = [
  {
    icon: Zap,
    title: "AI Recommendations",
    desc: "Claude Opus reasons across all your signals and tells you exactly what to fix — no dashboards to interpret, just verdicts.",
  },
  {
    icon: ShieldCheck,
    title: "Plan Fit Verdicts",
    desc: "Upgrade, downgrade, or stay — backed by your actual usage numbers, not guesses.",
  },
  {
    icon: KeyRound,
    title: "Key Expiry Tracking",
    desc: "Every API key with an expiry date is watched. You get warned before it kills your production app.",
  },
  {
    icon: TrendingUp,
    title: "Spend Intelligence",
    desc: "Monthly spend across OpenAI, Stripe, Twilio and more in one place. Know where your money goes.",
  },
  {
    icon: Globe,
    title: "Domain Monitoring",
    desc: "RDAP-based domain expiry tracking with day-level precision. No more forgotten renewals.",
  },
  {
    icon: GitBranch,
    title: "Repo Health",
    desc: "CI status, open PRs, risky files and secrets across all your repos — in one view.",
  },
];

const INTEGRATIONS = [
  { emoji: "🤖", name: "OpenAI" },
  { emoji: "💳", name: "Stripe" },
  { emoji: "▲",  name: "Vercel" },
  { emoji: "⚡", name: "Supabase" },
  { emoji: "📧", name: "Resend" },
  { emoji: "📞", name: "Twilio" },
  { emoji: "🧠", name: "Anthropic" },
  { emoji: "🐙", name: "GitHub" },
];

const MOCK_RECS = [
  {
    icon: "🔑",
    severity: "critical",
    badge: "CRITICAL",
    badgeColor: "bg-red/10 text-red border-red/20",
    title: "Anthropic API key expires today",
    desc: "Your Anthropic API key expires TODAY. Every service calling Claude will return 401 errors the moment this key is invalidated.",
    action: "Rotate the key immediately at console.anthropic.com/settings/keys",
  },
  {
    icon: "⚡",
    severity: "warning",
    badge: "WARNING",
    badgeColor: "bg-amber/10 text-amber border-amber/20",
    title: "Supabase free project slots full",
    desc: "You are using 2 of 2 allowed active projects on the Supabase free plan — 100% of the project quota.",
    action: "Upgrade to Supabase Pro ($25/mo) or pause an unused project",
  },
  {
    icon: "⚙️",
    severity: "warning",
    badge: "WARNING",
    badgeColor: "bg-amber/10 text-amber border-amber/20",
    title: "Active repo has zero CI coverage",
    desc: "Your most active repo was pushed to today but has no CI pipeline. Bugs will reach production undetected.",
    action: "Add a GitHub Actions workflow at .github/workflows/ci.yml",
  },
];

const PAIN_POINTS = [
  {
    emoji: "😴",
    title: "Your API key expired at 2am",
    desc: "Everything broke. You found out from a user at 9am. The fix took 4 minutes — after an hour of panic.",
  },
  {
    emoji: "💸",
    title: "You're on the wrong plan",
    desc: "Paying for Stripe Pro, using 8% of the limits. Or on the free tier, one week from getting throttled.",
  },
  {
    emoji: "🌐",
    title: "Your domain renews in 3 days",
    desc: "Auto-renew was off. You had no idea. It expired. Your app went down. A competitor grabbed the domain.",
  },
];

export default function LandingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [tickerIndex, setTickerIndex] = useState(0);
  const [displayed, setDisplayed] = useState("");
  const [charIndex, setCharIndex] = useState(0);
  const [email, setEmail] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [isMock, setIsMock] = useState(IS_MOCK_MODE);

  // Double-check mock mode at runtime by hitting the API
  useEffect(() => {
    fetch("/api/scan/results")
      .then(res => {
        if (res.ok) {
          // If scan/results returns 200 without auth, mock mode is active
          setIsMock(true);
        }
      })
      .catch(() => {});
  }, []);

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

    // In mock mode, skip OAuth entirely and go straight to dashboard
    if (isMock || IS_MOCK_MODE) {
      router.push("/dashboard");
      return;
    }

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
    } catch (e) {
      setAuthError(String(e));
      setLoading(false);
    }
  }

  function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    // Store in localStorage as fallback — can wire to API later
    const existing = JSON.parse(localStorage.getItem("eagle_eye_waitlist") ?? "[]");
    localStorage.setItem("eagle_eye_waitlist", JSON.stringify([...existing, { email, ts: Date.now() }]));
    setEmailSubmitted(true);
  }

  return (
    <div className="min-h-screen bg-bg text-text">

      {/* ── NAV ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-4 border-b border-border/40 bg-bg/90 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <Eye className="w-6 h-6 text-cyan drop-shadow-[0_0_6px_#00D4FF]" />
          <span className="text-[15px] font-bold text-text tracking-wide">Eagle Eye</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="https://github.com/noderme/eagleeye" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[12px] text-muted hover:text-text transition-colors">
            <Github className="w-4 h-4" />
            Open source
          </a>
          <button
            onClick={connectGitHub}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-cyan text-bg text-[12px] font-bold rounded-lg hover:bg-cyan/90 transition-colors disabled:opacity-60"
          >
            {loading ? "Redirecting..." : "Get started free"}
          </button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-20 overflow-hidden">

        {/* Grid bg */}
        <div className="absolute inset-0 opacity-[0.025]" style={{
          backgroundImage: "linear-gradient(#00D4FF 1px, transparent 1px), linear-gradient(90deg, #00D4FF 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }} />

        {/* Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(ellipse, rgba(0,212,255,0.07) 0%, transparent 65%)" }} />

        {/* Rings */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          {[1, 2, 3].map(i => (
            <div key={i} className="absolute rounded-full border border-cyan/8"
              style={{
                width: `${i * 220}px`,
                height: `${i * 220}px`,
                top: `${-i * 110}px`,
                left: `${-i * 110}px`,
                animation: `ping ${2.5 + i * 0.9}s ease-out infinite`,
                animationDelay: `${i * 0.5}s`,
              }} />
          ))}
        </div>

        <div className="relative z-10 flex flex-col items-center text-center max-w-3xl">

          {/* Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-cyan/20 bg-cyan/5 text-cyan text-[11px] font-semibold mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan" style={{ animation: "pulse 2s infinite" }} />
            AI Infrastructure Intelligence · Free beta
          </div>

          {/* Headline */}
          <h1 className="text-[56px] font-bold leading-[1.1] tracking-tight mb-5">
            Your infra has a<br />
            <span className="text-transparent bg-clip-text"
              style={{ backgroundImage: "linear-gradient(90deg, #00D4FF 0%, #7B61FF 100%)" }}>
              guardian robot
            </span>
          </h1>

          <p className="text-[17px] text-muted leading-relaxed mb-10 max-w-xl">
            Eagle Eye watches your GitHub repos, API keys, SaaS spend, and domains 24/7 —
            then tells you exactly what needs your attention, before it breaks production.
          </p>

          {/* Ticker */}
          <div className="w-full max-w-lg mb-10 px-5 py-4 bg-surface border border-border rounded-2xl text-left shadow-[0_0_40px_rgba(0,212,255,0.06)]">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green" style={{ animation: "pulse 2s infinite" }} />
              <span className="text-[10px] font-semibold text-muted uppercase tracking-[1.5px]">Eagle Eye · Live scan</span>
            </div>
            <p className="text-[13px] font-mono text-cyan min-h-[20px]">
              ▸ {displayed}<span className="animate-pulse">▌</span>
            </p>
          </div>

          {/* CTA */}
          <button
            onClick={connectGitHub}
            disabled={loading}
            className="relative flex items-center gap-3 px-8 py-4 bg-text text-bg text-[15px] font-bold rounded-xl hover:bg-white transition-all hover:shadow-[0_0_40px_rgba(0,212,255,0.2)] disabled:opacity-80 disabled:cursor-not-allowed overflow-hidden"
          >
            {loading && (
              <span className="absolute bottom-0 left-0 h-[3px] bg-cyan/60 rounded-full"
                style={{ animation: "oauth-progress 2.5s ease-in-out infinite" }} />
            )}
            {loading
              ? <span className="w-5 h-5 border-2 border-bg/30 border-t-bg rounded-full animate-spin" />
              : <Github className="w-5 h-5" />
            }
            {loading ? "Redirecting to GitHub..." : "Connect GitHub — it's free"}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>

          {authError && (
            <p className="text-[12px] text-red mt-3">{authError}</p>
          )}

          <p className="text-[11px] text-muted mt-4">
            Read-only access · No code stored · Disconnect anytime
          </p>
        </div>
      </section>

      {/* ── PAIN POINTS ── */}
      <section className="py-24 px-6 border-t border-border/40">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[11px] font-semibold text-cyan uppercase tracking-[2px] mb-4">The problem</p>
            <h2 className="text-[36px] font-bold leading-tight">
              Your infra is silently breaking.<br />
              <span className="text-muted font-normal">You just don&apos;t know it yet.</span>
            </h2>
          </div>
          <div className="grid grid-cols-3 gap-6">
            {PAIN_POINTS.map(({ emoji, title, desc }) => (
              <div key={title} className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-3">
                <span className="text-3xl">{emoji}</span>
                <h3 className="text-[15px] font-bold text-text">{title}</h3>
                <p className="text-[13px] text-muted leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-24 px-6 border-t border-border/40 bg-surface/30">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[11px] font-semibold text-cyan uppercase tracking-[2px] mb-4">How it works</p>
            <h2 className="text-[36px] font-bold">Up and running in 2 minutes</h2>
          </div>
          <div className="flex flex-col gap-6">
            {[
              {
                step: "01",
                title: "Connect GitHub",
                desc: "Sign in with GitHub OAuth. Eagle Eye gets read-only access to your repos — no code is stored, no webhooks installed.",
              },
              {
                step: "02",
                title: "Add your tools",
                desc: "Paste in API keys for OpenAI, Stripe, Vercel, Supabase, Twilio, Resend — any combination. Eagle Eye encrypts and stores them securely.",
              },
              {
                step: "03",
                title: "Get your report",
                desc: "Eagle Eye scans everything, runs Claude AI analysis across all signals, and surfaces prioritised recommendations — sorted by what needs immediate action.",
              },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex items-start gap-6 bg-surface border border-border rounded-2xl p-6">
                <div className="text-[28px] font-bold font-mono text-cyan/30 flex-shrink-0 w-12">{step}</div>
                <div>
                  <h3 className="text-[16px] font-bold text-text mb-1">{title}</h3>
                  <p className="text-[13px] text-muted leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── MOCK RECOMMENDATIONS ── */}
      <section className="py-24 px-6 border-t border-border/40">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[11px] font-semibold text-cyan uppercase tracking-[2px] mb-4">What you get</p>
            <h2 className="text-[36px] font-bold leading-tight">
              Not dashboards.<br />
              <span className="text-transparent bg-clip-text"
                style={{ backgroundImage: "linear-gradient(90deg, #00D4FF, #7B61FF)" }}>
                Verdicts.
              </span>
            </h2>
            <p className="text-[14px] text-muted mt-4 max-w-lg mx-auto">
              Eagle Eye doesn&apos;t show you charts. It tells you what to do, ranked by urgency, with the exact action to take.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {MOCK_RECS.map(rec => (
              <div key={rec.title} className="bg-surface border border-border rounded-2xl p-5 flex gap-4">
                <span className="text-2xl flex-shrink-0 mt-0.5">{rec.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="text-[14px] font-semibold text-text">{rec.title}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-[1px] px-2 py-0.5 rounded-full border ${rec.badgeColor}`}>
                      {rec.badge}
                    </span>
                  </div>
                  <p className="text-[12px] text-muted leading-relaxed">{rec.desc}</p>
                  <p className="text-[12px] font-semibold text-text mt-2">→ {rec.action}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="py-24 px-6 border-t border-border/40 bg-surface/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[11px] font-semibold text-cyan uppercase tracking-[2px] mb-4">Features</p>
            <h2 className="text-[36px] font-bold">Everything in one scan</h2>
          </div>
          <div className="grid grid-cols-3 gap-5">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-surface border border-border rounded-2xl p-5 flex flex-col gap-3">
                <div className="w-9 h-9 rounded-xl bg-cyan/10 border border-cyan/20 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-cyan" />
                </div>
                <h3 className="text-[14px] font-bold text-text">{title}</h3>
                <p className="text-[12px] text-muted leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── INTEGRATIONS ── */}
      <section className="py-20 px-6 border-t border-border/40">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-[11px] font-semibold text-cyan uppercase tracking-[2px] mb-4">Integrations</p>
          <h2 className="text-[28px] font-bold mb-10">Connects to the tools you already use</h2>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {INTEGRATIONS.map(({ emoji, name }) => (
              <div key={name} className="flex items-center gap-2.5 px-4 py-2.5 bg-surface border border-border rounded-xl text-[13px] font-semibold text-text">
                <span>{emoji}</span>
                {name}
              </div>
            ))}
            <div className="flex items-center gap-2.5 px-4 py-2.5 bg-surface border border-border/50 rounded-xl text-[13px] font-medium text-muted">
              + custom integrations
            </div>
          </div>
        </div>
      </section>

      {/* ── EARLY ACCESS ── */}
      <section className="py-24 px-6 border-t border-border/40 bg-surface/30">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-[11px] font-semibold text-cyan uppercase tracking-[2px] mb-4">Open beta</p>
          <h2 className="text-[36px] font-bold mb-4">
            Free while we&apos;re in beta
          </h2>
          <p className="text-[15px] text-muted mb-10 max-w-md mx-auto">
            No credit card. No limits. Just connect GitHub and your tools — Eagle Eye does the rest.
          </p>

          <div className="flex flex-col items-center gap-5">
            <button
              onClick={connectGitHub}
              disabled={loading}
              className="flex items-center gap-3 px-8 py-4 bg-cyan text-bg text-[15px] font-bold rounded-xl hover:bg-cyan/90 transition-all hover:shadow-[0_0_40px_rgba(0,212,255,0.25)] disabled:opacity-60"
            >
              <Github className="w-5 h-5" />
              {loading ? "Redirecting..." : "Get started with GitHub"}
            </button>

            <div className="w-full max-w-sm">
              <div className="flex items-center gap-3 my-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[11px] text-muted">or join the waitlist</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {emailSubmitted ? (
                <div className="flex items-center justify-center gap-2 px-4 py-3 bg-green/10 border border-green/20 rounded-xl text-[13px] font-semibold text-green">
                  <Check className="w-4 h-4" />
                  You&apos;re on the list — we&apos;ll be in touch
                </div>
              ) : (
                <form onSubmit={submitEmail} className="flex gap-2">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="flex-1 bg-surface border border-border rounded-lg px-4 py-2.5 text-[13px] text-text placeholder:text-muted outline-none focus:border-cyan/40 transition-colors"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-surface border border-border rounded-lg text-[13px] font-semibold text-text hover:border-cyan/40 hover:text-cyan transition-colors"
                  >
                    Notify me
                  </button>
                </form>
              )}
            </div>

            <div className="flex items-center gap-6 text-[12px] text-muted mt-2">
              {["Read-only GitHub access", "No code stored", "Disconnect anytime"].map(t => (
                <span key={t} className="flex items-center gap-1.5">
                  <Check className="w-3 h-3 text-green" />
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-border/40 px-8 py-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-cyan" />
            <span className="text-[13px] font-bold text-text">Eagle Eye</span>
            <span className="text-[12px] text-muted ml-2">AI Infrastructure Intelligence</span>
          </div>
          <div className="flex items-center gap-6 text-[12px] text-muted">
            <a href="https://github.com/noderme/eagleeye" target="_blank" rel="noopener noreferrer"
              className="hover:text-text transition-colors flex items-center gap-1.5">
              <Github className="w-3.5 h-3.5" />
              GitHub
            </a>
            <a href="mailto:hello@eagleeye.dev" className="hover:text-text transition-colors">
              Contact
            </a>
          </div>
        </div>
      </footer>

      <style jsx>{`
        @keyframes ping {
          0%   { transform: scale(0.8); opacity: 0.5; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
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
