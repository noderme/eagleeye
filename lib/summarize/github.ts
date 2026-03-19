import type { RepoInsight } from "@/lib/github";

export function summarizeGitHub(insights: RepoInsight[]): string {
  if (!insights || insights.length === 0) return "";

  const failingCI = insights.filter(i => i.ciRuns[0]?.conclusion === "failure").length;
  const noCI = insights.filter(i => i.ciRuns.length === 0).length;
  const riskyRepos = insights.filter(i => i.riskyFiles.length > 0).length;

  const lines = insights.map(i => {
    const ci = i.ciRuns[0];
    const ciStatus = ci ? (ci.conclusion ?? ci.status) : "no-ci";
    const daysSince = Math.floor((Date.now() - new Date(i.repo.pushed_at).getTime()) / 86400000);
    const risky = i.riskyFiles.length > 0 ? `, ${i.riskyFiles.length} risky file(s): ${i.riskyFiles.slice(0, 3).join(", ")}` : "";
    return `  ${i.repo.full_name}: CI=${ciStatus}, ${i.openPRs} open PRs, last push ${daysSince}d ago${risky}`;
  });

  return [
    `GitHub: ${insights.length} repo(s) monitored — ${failingCI} failing CI, ${noCI} with no CI, ${riskyRepos} with risky files`,
    ...lines,
  ].join("\n");
}
