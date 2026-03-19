// Shared GitHub helpers — used by dashboard (client) and background scan job (server)
import { detectProviders } from "./detect";

const RISKY_PATTERNS = [
  /^\.env(\.|$)/i,
  /\.pem$/i,
  /id_rsa$/i,
  /\.key$/i,
  /secrets\.json$/i,
  /credentials\.json$/i,
  /\.p12$/i,
  /\.pfx$/i,
];

export function isRiskyFile(path: string): boolean {
  return RISKY_PATTERNS.some(p => p.test(path.split("/").pop() ?? ""));
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

async function ghFetch(path: string, token: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`https://api.github.com${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface RepoSummary {
  id: number;
  full_name: string;
  name: string;
  private: boolean;
  language: string | null;
  description: string | null;
}

export interface RepoInsight {
  repo: {
    full_name: string;
    name: string;
    private: boolean;
    language: string | null;
    pushed_at: string;
    open_issues_count: number;
    default_branch: string;
  };
  commits: { sha: string; message: string; author: string; date: string }[];
  ciRuns: { id: number; name: string; conclusion: string | null; status: string; created_at: string }[];
  riskyFiles: string[];
  openPRs: number;
  detectedProviders: string[];
}

export async function fetchRepoInsight(repo: RepoSummary, token: string): Promise<RepoInsight | null> {
  const [repoData, commits, ciRuns, tree, prs] = await Promise.all([
    ghFetch(`/repos/${repo.full_name}`, token),
    ghFetch(`/repos/${repo.full_name}/commits?per_page=5`, token),
    ghFetch(`/repos/${repo.full_name}/actions/runs?per_page=5`, token),
    ghFetch(`/repos/${repo.full_name}/git/trees/HEAD?recursive=1`, token),
    ghFetch(`/repos/${repo.full_name}/pulls?state=open&per_page=100`, token),
  ]);

  if (!repoData) return null;

  const treeFiles = (tree?.tree ?? []).filter((f: any) => f.type === "blob");
  const riskyFiles: string[] = treeFiles
    .filter((f: any) => isRiskyFile(f.path))
    .map((f: any) => f.path);

  const detectedProviders = await detectProviders(repo.full_name, treeFiles, token);

  return {
    repo: {
      full_name: repoData.full_name,
      name: repoData.name,
      private: repoData.private,
      language: repoData.language,
      pushed_at: repoData.pushed_at,
      open_issues_count: repoData.open_issues_count,
      default_branch: repoData.default_branch,
    },
    commits: (commits ?? []).map((c: any) => ({
      sha: c.sha,
      message: c.commit.message.split("\n")[0],
      author: c.commit.author.name,
      date: c.commit.author.date,
    })),
    ciRuns: (ciRuns?.workflow_runs ?? []).slice(0, 5).map((r: any) => ({
      id: r.id,
      name: r.name,
      conclusion: r.conclusion,
      status: r.status,
      created_at: r.created_at,
    })),
    riskyFiles,
    openPRs: Array.isArray(prs) ? prs.length : 0,
    detectedProviders,
  };
}

export async function fetchAllRepoInsights(repos: RepoSummary[], token: string): Promise<RepoInsight[]> {
  // Cap at 10 repos to keep scan time under control
  const capped = repos.slice(0, 10);
  const results = await Promise.all(capped.map(r => fetchRepoInsight(r, token)));
  return results.filter(Boolean) as RepoInsight[];
}
