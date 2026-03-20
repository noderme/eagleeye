"use client";

import clsx from "clsx";
import { Plus, ArrowLeftRight } from "lucide-react";
import Link from "next/link";

interface TopbarProps {
  title: string;
  alerts?: number;
  lastScan?: string;
  onConnect?: () => void;
}

export function Topbar({ title, alerts = 0, lastScan = "4 min ago", onConnect }: TopbarProps) {
  const hasAlerts = alerts > 0;

  return (
    <header className="h-14 flex items-center gap-4 px-7 border-b border-border bg-bg/95 backdrop-blur-sm flex-shrink-0">
      <h1 className="text-[15px] font-semibold text-text flex-1">{title}</h1>

      {hasAlerts && (
        <div className={clsx(
          "flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold border",
          "bg-red/8 border-red/20 text-red"
        )}>
          <span className="w-1.5 h-1.5 rounded-full bg-red pulse-red" />
          {alerts} critical alert{alerts !== 1 ? "s" : ""}
        </div>
      )}

      {!hasAlerts && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold border bg-green/8 border-green/20 text-green">
          <span className="w-1.5 h-1.5 rounded-full bg-green pulse-green" />
          All systems nominal
        </div>
      )}

      <span className="text-[11px] text-muted font-mono">Last scan: {lastScan}</span>

      <Link
        href="/onboarding"
        title="Switch project — selecting new repos creates a new dashboard"
        className="flex items-center gap-1.5 px-3 py-1.5 text-muted text-[12px] font-medium rounded-lg border border-border hover:border-cyan/40 hover:text-cyan transition-colors"
      >
        <ArrowLeftRight className="w-3.5 h-3.5" />
        Switch Project
      </Link>

      {onConnect && (
        <button
          onClick={onConnect}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-cyan text-bg text-[12px] font-bold rounded-lg hover:bg-cyan/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Connect Integration
        </button>
      )}
    </header>
  );
}
