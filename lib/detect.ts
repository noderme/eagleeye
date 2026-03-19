// Detect which providers a repo uses by scanning its file tree + key files
// Provider list is data-driven — add entries to PROVIDER_SIGNALS to support new providers.

interface TreeFile {
  path: string;
  type: string;
}

interface ProviderSignals {
  paths?: RegExp[];    // match file paths
  envKeys?: RegExp[];  // match .env.example / env keys
  packages?: string[]; // match package.json / requirements.txt / go.mod / Gemfile / pyproject.toml
  imports?: RegExp[];  // match import statements in source files
}

// Add a new entry here to detect any new provider — no types to update anywhere else.
const PROVIDER_SIGNALS: Record<string, ProviderSignals> = {
  openai: {
    packages: ["openai", "langchain", "litellm"],
    envKeys: [/OPENAI_API_KEY/i, /OPENAI_ORG/i],
    imports: [/from ['"]openai['"]/i, /require\(['"]openai['"]\)/i],
  },
  anthropic: {
    packages: ["@anthropic-ai/sdk", "anthropic"],
    envKeys: [/ANTHROPIC_API_KEY/i],
    imports: [/from ['"]@anthropic-ai\/sdk['"]/i, /require\(['"]@anthropic-ai\/sdk['"]\)/i, /from ['"]anthropic['"]/i],
  },
  supabase: {
    packages: ["@supabase/supabase-js", "@supabase/ssr", "@supabase/auth-helpers-nextjs", "@supabase/auth-helpers-react"],
    envKeys: [/SUPABASE_URL/i, /SUPABASE_ANON_KEY/i, /SUPABASE_SERVICE_ROLE/i, /NEXT_PUBLIC_SUPABASE/i],
    imports: [/from ['"]@supabase\/supabase-js['"]/i, /from ['"]@supabase\/ssr['"]/i],
  },
  stripe: {
    packages: ["stripe", "@stripe/stripe-js", "@stripe/react-stripe-js"],
    envKeys: [/STRIPE_SECRET_KEY/i, /STRIPE_PUBLISHABLE_KEY/i, /STRIPE_WEBHOOK/i, /NEXT_PUBLIC_STRIPE/i],
    imports: [/from ['"]stripe['"]/i, /require\(['"]stripe['"]\)/i],
  },
  vercel: {
    packages: ["@vercel/analytics", "@vercel/og", "@vercel/speed-insights", "vercel"],
    envKeys: [/VERCEL_TOKEN/i, /VERCEL_API_TOKEN/i],
    paths: [/vercel\.json$/, /\.vercel\//],
  },
  resend: {
    packages: ["resend", "@react-email"],
    envKeys: [/RESEND_API_KEY/i],
    imports: [/from ['"]resend['"]/i, /require\(['"]resend['"]\)/i],
  },
  twilio: {
    packages: ["twilio"],
    envKeys: [/TWILIO_ACCOUNT_SID/i, /TWILIO_AUTH_TOKEN/i, /TWILIO_PHONE/i],
    imports: [/from ['"]twilio['"]/i, /require\(['"]twilio['"]\)/i],
  },
  // Add more providers here — no other files need changing
};

// Fetch a file's text content from GitHub
async function fetchFileContent(fullName: string, path: string, token: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${fullName}/contents/${encodeURIComponent(path)}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.raw+json" } }
    );
    return res.ok ? await res.text() : "";
  } catch {
    return "";
  }
}

export async function detectProviders(
  fullName: string,
  tree: TreeFile[],
  token: string
): Promise<string[]> {
  const filePaths = tree.map(f => f.path);
  const detected = new Set<string>();

  // Key files to fetch and scan for content signals
  const KEY_FILES = [
    ".env.example", ".env.sample", ".env.local.example",
    "package.json",
    "requirements.txt", "go.mod", "Gemfile",
    "pyproject.toml", "Pipfile",
  ];

  const presentKeyFiles = KEY_FILES.filter(f => filePaths.includes(f));
  const contents = await Promise.all(
    presentKeyFiles.map(f => fetchFileContent(fullName, f, token))
  );
  const allContent = contents.join("\n");

  for (const [provider, signals] of Object.entries(PROVIDER_SIGNALS)) {
    // 1. File path match
    if (signals.paths?.some(p => filePaths.some(f => p.test(f)))) {
      detected.add(provider);
      continue;
    }

    // 2. Package name match in dependency files
    if (signals.packages?.some(pkg => {
      if (allContent.includes(`"${pkg}"`) || allContent.includes(`'${pkg}'`)) return true;
      // For non-JSON dependency files (requirements.txt, Gemfile, go.mod) — match whole word only
      const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$|==|>=|~>|,|\\r|\\n)`, "m").test(allContent);
    })) {
      detected.add(provider);
      continue;
    }

    // 3. Env key match in .env.example etc
    if (signals.envKeys?.some(r => r.test(allContent))) {
      detected.add(provider);
      continue;
    }

    // 4. Import statement match — scan source files (sample: first 20 .ts/.js/.py/.rb files)
    if (signals.imports) {
      const sourceFiles = filePaths
        .filter(f => /\.(ts|tsx|js|jsx|py|rb)$/.test(f) && !f.includes("node_modules"))
        .slice(0, 50);

      for (const file of sourceFiles) {
        const content = await fetchFileContent(fullName, file, token);
        if (signals.imports.some(r => r.test(content))) {
          detected.add(provider);
          break;
        }
      }
    }
  }

  // ── Broad env-var detection ──────────────────────────────────────────────
  // Any service exposes itself via XYZ_API_KEY / XYZ_SECRET_KEY / XYZ_TOKEN.
  // Extract the prefix as the service id for anything not already detected.
  const GENERIC_PREFIXES = new Set([
    "NEXT", "NEXT_PUBLIC", "NODE", "DATABASE", "DB", "POSTGRES", "MYSQL",
    "REDIS", "JWT", "SESSION", "APP", "BASE", "API", "WEB", "AUTH", "SITE",
    "URL", "PORT", "HOST", "PUBLIC", "PRIVATE", "SECRET", "KEY", "CI",
  ]);

  const ENV_SERVICE_RE = /(?:^|[\n\r])(?:NEXT_PUBLIC_)?([A-Z][A-Z0-9]+)_(?:API_KEY|SECRET_KEY|ACCESS_TOKEN|AUTH_TOKEN|WEBHOOK_SECRET)\b/gm;
  let m: RegExpExecArray | null;
  while ((m = ENV_SERVICE_RE.exec(allContent)) !== null) {
    const prefix = m[1];
    const serviceId = prefix.toLowerCase();
    if (!detected.has(serviceId) && !GENERIC_PREFIXES.has(prefix)) {
      detected.add(serviceId);
    }
  }

  return Array.from(detected);
}
