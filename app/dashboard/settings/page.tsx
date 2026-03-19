"use client";

import { useEffect, useState } from "react";
import { Topbar } from "@/components/topbar";
import { LogOut, Trash2 } from "lucide-react";

interface UserProfile {
  email: string;
  name: string;
  avatarUrl: string | null;
  provider: string;
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    fetch("/api/auth/profile")
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setProfile(data); })
      .finally(() => setLoading(false));
  }, []);

  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    window.location.href = "/";
  }

  async function revokeAllKeys() {
    if (!confirm("This will disconnect all integrations. Are you sure?")) return;
    setRevoking(true);
    try {
      await fetch("/api/keys/revoke-all", { method: "POST" });
      window.location.href = "/dashboard/integrations";
    } finally {
      setRevoking(false);
    }
  }

  return (
    <>
      <Topbar title="Settings" />
      <main className="flex-1 overflow-y-auto p-7 flex flex-col gap-6 max-w-2xl">

        {/* Account */}
        <section className="flex flex-col gap-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-muted">Account</h2>
          <div className="bg-surface border border-border rounded-2xl p-5 flex items-center gap-4">
            {profile?.avatarUrl ? (
              <img src={profile.avatarUrl} alt={profile.name} className="w-12 h-12 rounded-full border border-border flex-shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple to-cyan flex items-center justify-center text-[16px] font-bold text-white flex-shrink-0">
                {profile?.name?.[0]?.toUpperCase() ?? "?"}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-semibold text-text">{loading ? "Loading..." : profile?.name ?? "Unknown"}</div>
              <div className="text-[12px] text-muted mt-0.5">{profile?.email ?? ""}</div>
              {profile?.provider && (
                <div className="text-[10px] text-muted/60 mt-0.5 font-mono">Signed in via {profile.provider}</div>
              )}
            </div>
            <button
              onClick={signOut}
              className="flex items-center gap-2 px-4 py-2 text-[12px] text-muted border border-border rounded-lg hover:bg-dim hover:text-text transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        </section>

        {/* About Eagle Eye */}
        <section className="flex flex-col gap-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-muted">About</h2>
          <div className="bg-surface border border-border rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-text">Eagle Eye</span>
              <span className="text-[9px] font-semibold uppercase tracking-[1.5px] text-cyan px-1.5 py-0.5 rounded bg-cyan/10 border border-cyan/20">
                AI Infrastructure Monitor
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[12px]">
              {[
                ["Scan engine",   "Claude Opus 4.6 (Adaptive Thinking)"],
                ["Scheduling",    "Upstash QStash (intelligent intervals)"],
                ["Auth",          "GitHub OAuth via Supabase"],
                ["Storage",       "Supabase + AES-256-GCM encryption"],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="text-[10px] text-muted uppercase tracking-wide mb-0.5">{label}</div>
                  <div className="text-[12px] text-text font-mono">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Danger zone */}
        <section className="flex flex-col gap-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[1.5px] text-red">Danger Zone</h2>
          <div className="bg-surface border border-red/20 rounded-2xl p-5 flex items-center justify-between gap-4">
            <div>
              <div className="text-[13px] font-semibold text-text">Revoke all integrations</div>
              <div className="text-[11px] text-muted mt-0.5">Remove all stored API keys from Eagle Eye. This cannot be undone.</div>
            </div>
            <button
              onClick={revokeAllKeys}
              disabled={revoking}
              className="flex items-center gap-2 px-4 py-2 text-[12px] text-red border border-red/20 rounded-lg hover:bg-red/5 transition-colors disabled:opacity-50 flex-shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {revoking ? "Revoking..." : "Revoke all"}
            </button>
          </div>
        </section>

      </main>
    </>
  );
}
