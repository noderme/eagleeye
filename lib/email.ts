import { Resend } from "resend";
import type { AnalysisResult } from "./analyze";

const FROM_ADDRESS = "Eagle Eye <noreply@eagleeye.app>";

function buildScanEmail(
  analysis: AnalysisResult,
  dashboardUrl: string
): { subject: string; html: string } {
  const criticals = analysis.recommendations.filter(r => r.severity === "critical").length;
  const warnings = analysis.recommendations.filter(r => r.severity === "warning").length;
  const expiryRecs = analysis.recommendations.filter(r => r.category === "expiry").length;
  const savings = analysis.potentialMonthlySavingsUsd;

  const subjectParts: string[] = [];
  if (criticals > 0) subjectParts.push(`${criticals} critical issue${criticals > 1 ? "s" : ""}`);
  if (warnings > 0) subjectParts.push(`${warnings} warning${warnings > 1 ? "s" : ""}`);
  if (savings && savings > 0) subjectParts.push(`$${savings.toFixed(0)}/mo saveable`);
  const subject =
    subjectParts.length > 0
      ? `Eagle Eye scan: ${subjectParts.join(" · ")}`
      : "Eagle Eye scan complete — infrastructure healthy";

  const rows = [
    criticals > 0 ? `<tr><td style="padding:8px 0;font-size:14px;">🔴 <strong>${criticals} critical risk${criticals > 1 ? "s" : ""}</strong></td></tr>` : "",
    warnings > 0 ? `<tr><td style="padding:8px 0;font-size:14px;">⚠️ <strong>${warnings} warning${warnings > 1 ? "s" : ""}</strong></td></tr>` : "",
    expiryRecs > 0 ? `<tr><td style="padding:8px 0;font-size:14px;">⏰ ${expiryRecs} expiry alert${expiryRecs > 1 ? "s" : ""}</td></tr>` : "",
    savings && savings > 0 ? `<tr><td style="padding:8px 0;font-size:14px;">💸 $${savings.toFixed(0)}/mo potential savings</td></tr>` : "",
    analysis.summary ? `<tr><td style="padding:12px 0;font-size:13px;color:#888;">${analysis.summary}</td></tr>` : "",
  ].filter(Boolean).join("\n");

  const allClear = criticals === 0 && warnings === 0 && expiryRecs === 0;

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0d0d10;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d10;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#141416;border:1px solid #2a2a30;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:28px 32px;border-bottom:1px solid #2a2a30;">
            <span style="font-size:18px;font-weight:700;color:#e8e8f0;">🦅 Eagle Eye</span>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">
            <p style="margin:0 0 20px;font-size:20px;font-weight:600;color:#e8e8f0;">
              ${allClear ? "Infrastructure scan complete ✅" : "Your scan found issues that need attention"}
            </p>
            ${allClear
              ? `<p style="font-size:14px;color:#888;margin:0 0 24px;">Everything looks healthy — no critical issues detected.</p>`
              : `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">${rows}</table>`
            }
            <a href="${dashboardUrl}" style="display:inline-block;padding:12px 24px;background:#06b6d4;color:#000;font-weight:700;font-size:14px;border-radius:8px;text-decoration:none;">
              View Dashboard →
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #2a2a30;">
            <p style="margin:0;font-size:11px;color:#555;">
              You're receiving this because you ran a scan in Eagle Eye.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

export async function sendScanCompleteEmail(
  toEmail: string,
  analysis: AnalysisResult,
  appUrl: string
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return; // silently skip if not configured

  // Only send if there's something worth reporting
  const hasIssues =
    analysis.recommendations.some(r => r.severity === "critical" || r.severity === "warning") ||
    (analysis.potentialMonthlySavingsUsd ?? 0) > 0;
  if (!hasIssues) return;

  const { subject, html } = buildScanEmail(analysis, `${appUrl}/dashboard/recommendations`);

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: FROM_ADDRESS,
    to: toEmail,
    subject,
    html,
  });
}