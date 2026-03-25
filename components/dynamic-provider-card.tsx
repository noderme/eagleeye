"use client";
/**
 * Eagle Eye — Dynamic Provider Card
 *
 * Displays LLM-summarized provider data in a clean grouped format.
 * Shows Health / Usage / Billing / Limits / Warnings sections.
 * No raw JSON — only human-readable extracted information.
 */
import React from "react";
import clsx from "clsx";
import type { ProviderSummary, ProviderSummaryGroup } from "@/lib/discovery-engine";

// Category metadata
const CATEGORY_META: Record<string, { icon: string; label: string; color: string }> = {
  health:   { icon: "🏥", label: "Health",   color: "var(--green)"  },
  usage:    { icon: "📊", label: "Usage",    color: "var(--cyan)"   },
  billing:  { icon: "💳", label: "Billing",  color: "var(--purple)" },
  limits:   { icon: "⚡", label: "Limits",   color: "var(--amber)"  },
  warnings: { icon: "⚠️", label: "Warnings", color: "var(--red)"    },
  info:     { icon: "ℹ️", label: "Info",     color: "var(--muted)"  },
};

const STATUS_COLORS: Record<string, string> = {
  good:             "var(--green)",
  warn:             "var(--amber)",
  critical:         "var(--red)",
  credential_error: "var(--red)",
};

const STATUS_DOTS: Record<string, string> = {
  good:             "bg-green",
  warn:             "bg-amber pulse-amber",
  critical:         "bg-red pulse-red",
  credential_error: "bg-red pulse-red",
};

// Provider emoji map
const PROVIDER_EMOJIS: Record<string, string> = {
  planetscale: "🪐", neon: "⚡", railway: "🚂", render: "🎨", fly: "✈️",
  cloudflare: "☁️", aws: "🟠", gcp: "🔵", azure: "🔷", mongodb: "🍃",
  redis: "🔴", sendgrid: "📨", mailgun: "📪", datadog: "🐕", sentry: "🔍",
  linear: "📐", notion: "📝", airtable: "📊", hubspot: "🧡", salesforce: "☁️",
  pagerduty: "🚨", statuspage: "📡", grafana: "📈", prometheus: "🔥",
  algolia: "🔍", elastic: "🔎", pinecone: "🌲", weaviate: "🕸️",
};

interface DynamicProviderCardProps {
  summary: ProviderSummary;
  className?: string;
}

export function DynamicProviderCard({ summary, className }: DynamicProviderCardProps) {
  const emoji = PROVIDER_EMOJIS[summary.serviceId] ?? "🔌";
  const statusColor = STATUS_COLORS[summary.status] ?? "var(--text)";
  const statusDot = STATUS_DOTS[summary.status] ?? "bg-green";
  const label = summary.serviceName || (summary.serviceId.charAt(0).toUpperCase() + summary.serviceId.slice(1));

  return (
    <div
      className={clsx("bg-surface border border-border rounded-2xl overflow-hidden", className)}
      style={{ borderColor: summary.status === "critical" || summary.status === "credential_error" ? "rgba(255,80,80,0.3)" : undefined }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-base">{emoji}</span>
          <h3 className="text-[13px] font-semibold text-text">{label}</h3>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={clsx("w-2 h-2 rounded-full flex-shrink-0", statusDot)}
          />
          <span className="text-[11px] font-medium capitalize" style={{ color: statusColor }}>
            {summary.status === "credential_error" ? "Key Error" : summary.status}
          </span>
        </div>
      </div>

      {/* Credential error state */}
      {summary.status === "credential_error" && summary.credentialError && (
        <div className="px-5 py-4">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red/10 border border-red/20">
            <span className="text-sm flex-shrink-0 mt-0.5">🔑</span>
            <div>
              <p className="text-[12px] font-semibold text-red mb-0.5">Authentication Failed</p>
              <p className="text-[11px] text-muted leading-relaxed">{summary.credentialError}</p>
              <p className="text-[11px] text-muted mt-1">Update your API key in <span className="text-cyan">Integrations</span>.</p>
            </div>
          </div>
        </div>
      )}

      {/* Grouped data */}
      {summary.groups.length > 0 && (
        <div className="divide-y divide-border/50">
          {summary.groups.map((group) => (
            <GroupSection key={group.category} group={group} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {summary.groups.length === 0 && summary.status !== "credential_error" && (
        <div className="px-5 py-6 text-center">
          <p className="text-[12px] text-muted">No data returned from this service.</p>
          <p className="text-[11px] text-muted/70 mt-1">Check your API key permissions.</p>
        </div>
      )}

      {/* Footer timestamp */}
      <div className="px-5 py-2 border-t border-border/50">
        <span className="text-[10px] text-muted/60 font-mono">
          Updated {new Date(summary.lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}

function GroupSection({ group }: { group: ProviderSummaryGroup }) {
  const meta = CATEGORY_META[group.category] ?? CATEGORY_META.info;

  return (
    <div className="px-5 py-3">
      {/* Group label */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[11px]">{meta.icon}</span>
        <span
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: meta.color }}
        >
          {group.label}
        </span>
      </div>

      {/* Items */}
      <div className="flex flex-col gap-1.5">
        {group.items.map((item, i) => (
          <div key={i} className="flex items-start justify-between gap-3">
            <span className="text-[12px] text-muted flex-shrink-0">{item.key}</span>
            <span
              className={clsx(
                "text-[12px] font-medium text-right leading-relaxed",
                item.alert === "critical" ? "text-red" :
                item.alert === "warn" ? "text-amber" :
                "text-text"
              )}
            >
              {item.value}
              {item.alert && (
                <span className="ml-1 text-[9px] font-bold uppercase tracking-wide opacity-70">
                  {item.alert === "critical" ? "!" : "↑"}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
