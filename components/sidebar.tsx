"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard, Zap, KeyRound, Puzzle, Lightbulb,
  TrendingUp, ShieldCheck, Settings, Eye, Home,
} from "lucide-react";
import clsx from "clsx";

const badgeStyles: Record<string, string> = {
  red:   "bg-red/15 text-red border border-red/30",
  amber: "bg-amber/15 text-amber border border-amber/30",
  green: "bg-green/15 text-green border border-green/30",
};

interface Badges {
  alerts: number;
  keyHygiene: number;
  integrations: number;
}

export function Sidebar() {
  const path = usePathname();
  const [userName, setUserName] = useState<string>("");
  const [userInitials, setUserInitials] = useState<string>("—");
  const [badges, setBadges] = useState<Badges>({ alerts: 0, keyHygiene: 0, integrations: 0 });

  const loadBadges = useCallback(async () => {
    const [statusRes, scanRes] = await Promise.all([
      fetch("/api/keys/status"),
      fetch("/api/scan/results"),
    ]);

    const status = statusRes.ok ? await statusRes.json() : {};
    const scan = scanRes.ok ? await scanRes.json() : {};

    const integrations = (status.integrations ?? []).length + (status.githubConnected ? 1 : 0);

    const now = Date.now();
    const keyHygiene = (status.integrations ?? []).filter((i: any) => {
      const exp = i.extra_config?.keyExpiresAt;
      if (!exp) return false;
      return (new Date(exp).getTime() - now) / 86400000 <= 30;
    }).length;

    const insights: any[] = scan.result?.github_data ?? [];
    const scanDomains: any[] = scan.result?.domain_data ?? [];
    const failingCI = insights.filter((i: any) => i.ciRuns?.[0]?.conclusion === "failure").length;
    const riskyFiles = insights.reduce((acc: number, i: any) => acc + (i.riskyFiles?.length ?? 0), 0);
    const urgentDomains = scanDomains.filter((d: any) => d.daysLeft !== null && d.daysLeft <= 30).length;

    setBadges({ alerts: failingCI + riskyFiles + urgentDomains, keyHygiene, integrations });
  }, []);

  useEffect(() => {
    async function loadUser() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const name = user.user_metadata?.full_name ?? user.user_metadata?.user_name ?? user.email ?? "";
        setUserName(name);
        const parts = name.split(" ");
        setUserInitials(parts.length >= 2
          ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
          : name.slice(0, 2).toUpperCase()
        );
      }
    }
    loadUser();
    loadBadges();
  }, [loadBadges]);

  useEffect(() => {
    window.addEventListener("eagleeye:scan-complete", loadBadges);
    return () => window.removeEventListener("eagleeye:scan-complete", loadBadges);
  }, [loadBadges]);

  const nav = [
    {
      section: "Monitor",
      items: [
        { label: "Overview",     href: "/dashboard",              icon: LayoutDashboard },
        { label: "Alerts",       href: "/dashboard/alerts",       icon: Zap,      badge: badges.alerts,      badgeColor: "red"   },
        { label: "Key Hygiene",  href: "/dashboard/keys",         icon: KeyRound, badge: badges.keyHygiene,  badgeColor: "amber" },
        { label: "Integrations", href: "/dashboard/integrations", icon: Puzzle,   badge: badges.integrations, badgeColor: "green" },
      ],
    },
    {
      section: "Intelligence",
      items: [
        { label: "Recommendations", href: "/dashboard/recommendations", icon: Lightbulb },
        { label: "Usage Trends",    href: "/dashboard/usage",           icon: TrendingUp },
        { label: "Plan Fit",        href: "/dashboard/plan-fit",        icon: ShieldCheck },
      ],
    },
    {
      section: "Settings",
      items: [
        { label: "Settings",  href: "/dashboard/settings", icon: Settings },
        { label: "Main page", href: "/",                   icon: Home },
      ],
    },
  ];

  return (
    <aside className="w-[220px] h-full flex flex-col flex-shrink-0 bg-surface border-r border-border">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6 border-b border-border flex-shrink-0">
        <div className="w-8 h-8 flex items-center justify-center">
          <Eye className="w-7 h-7 text-cyan drop-shadow-[0_0_6px_#00D4FF]" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-bold text-text tracking-wide">Eagle Eye</span>
          <span className="text-[9px] font-semibold text-cyan tracking-[1px]">Prevent outages &amp; overspending in your APIs</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 py-4 flex flex-col gap-0.5 overflow-y-auto">
        {nav.map(({ section, items }) => (
          <div key={section}>
            <div className="text-[9px] font-semibold text-muted uppercase tracking-[1.5px] px-2.5 py-3 mt-1">
              {section}
            </div>
            {items.map(({ label, href, icon: Icon, badge, badgeColor }) => {
              const active = path === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={clsx(
                    "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-all relative",
                    active ? "bg-cyan/8 text-cyan" : "text-muted hover:bg-dim hover:text-text"
                  )}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] bg-cyan rounded-r-full" />
                  )}
                  <Icon className="w-[15px] h-[15px] flex-shrink-0" />
                  <span className="flex-1">{label}</span>
                  {badge !== undefined && badge > 0 && (
                    <span className={clsx("text-[9px] font-bold px-1.5 py-0.5 rounded-full", badgeStyles[badgeColor ?? "red"])}>
                      {badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-border flex-shrink-0">
        <div className="flex items-center gap-2.5 px-2.5 py-2 bg-dim rounded-lg">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-purple to-cyan flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
            {userInitials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-semibold text-text truncate">{userName || "—"}</div>
            <div className="text-[10px] text-muted">{badges.integrations} integration{badges.integrations !== 1 ? "s" : ""}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
