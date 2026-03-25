/**
 * Eagle Eye — API Documentation Fetcher
 *
 * Fetches REAL API documentation from the web so the discovery engine
 * never relies on LLM training knowledge.
 *
 * Flow:
 * 1. Search DuckDuckGo for "{service} REST API documentation"
 * 2. Pick the most likely official docs URL from results
 * 3. Fetch the docs page and strip HTML → clean readable text
 * 4. Follow relevant sub-links (e.g. /reference, /api, /endpoints) up to maxPages
 * 5. Return a consolidated text corpus for the LLM to read
 */

export interface DocFetchResult {
  /** The primary docs URL we found */
  docsUrl: string;
  /** Consolidated clean text from all fetched pages */
  text: string;
  /** All URLs we successfully fetched */
  fetchedUrls: string[];
  /** Whether we found real docs or fell back to guessing */
  fromSearch: boolean;
}

// ── HTML → readable text stripper ────────────────────────────────────────────

/**
 * Strips HTML to clean readable text.
 * Removes: scripts, styles, nav, header, footer, aside, ads, SVGs
 * Keeps: headings, paragraphs, code blocks, lists, table cells
 */
export function htmlToText(html: string): string {
  // Remove entire script/style/nav/header/footer/aside/svg blocks
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  // Preserve code blocks content with markers
  text = text
    .replace(/<pre[\s\S]*?>([\s\S]*?)<\/pre>/gi, "\n```\n$1\n```\n")
    .replace(/<code>([\s\S]*?)<\/code>/gi, "`$1`");

  // Convert headings to markdown-style
  text = text
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n")
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n")
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n")
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n#### $1\n");

  // List items
  text = text
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1")
    .replace(/<\/ul>/gi, "\n")
    .replace(/<\/ol>/gi, "\n");

  // Paragraphs and line breaks
  text = text
    .replace(/<\/p>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, " | ")
    .replace(/<\/th>/gi, " | ");

  // Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));

  // Collapse excessive whitespace but preserve paragraph breaks
  text = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();

  return text;
}

// ── Extract relevant sub-links from a docs page ───────────────────────────────

/**
 * Extracts links from HTML that look like API reference / endpoint pages.
 * Only follows links within the same domain.
 */
function extractDocLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const links: string[] = [];

  // Match all href attributes
  const hrefRegex = /href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;

  const relevantPatterns = [
    /\/api\b/i,
    /\/reference\b/i,
    /\/endpoints?\b/i,
    /\/rest\b/i,
    /\/v\d+\//i,
    /\/usage\b/i,
    /\/billing\b/i,
    /\/quota/i,
    /\/rate.?limit/i,
    /\/account/i,
    /\/resources?\b/i,
    /\/methods?\b/i,
  ];

  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1];
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("javascript:")) continue;

    try {
      const url = new URL(href, baseUrl);
      // Only follow links on the same domain
      if (url.hostname !== base.hostname) continue;
      // Skip non-HTML resources
      if (/\.(png|jpg|gif|svg|ico|css|js|pdf|zip|woff|ttf)$/i.test(url.pathname)) continue;
      // Only include if path matches relevant patterns
      const isRelevant = relevantPatterns.some(p => p.test(url.pathname));
      if (isRelevant) {
        links.push(url.toString().split("#")[0]); // strip fragment
      }
    } catch {
      // Invalid URL, skip
    }
  }

  // Deduplicate
  return [...new Set(links)];
}

// ── DuckDuckGo search for docs URL ───────────────────────────────────────────

/**
 * Searches DuckDuckGo for the official API documentation URL.
 * Uses the DuckDuckGo HTML search (no API key required).
 * Returns the most likely official docs URL.
 */
async function searchForDocsUrl(serviceId: string): Promise<string | null> {
  const query = encodeURIComponent(`${serviceId} REST API documentation reference`);
  const searchUrl = `https://html.duckduckgo.com/html/?q=${query}`;

  try {
    const res = await fetchWithTimeout(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; EagleEye/1.0; API monitoring bot)",
        "Accept": "text/html",
      },
    }, 10_000);

    if (!res.ok) return null;
    const html = await res.text();

    // Extract result URLs from DuckDuckGo HTML
    const resultRegex = /class="result__url[^"]*"[^>]*>([^<]+)</gi;
    const linkRegex = /href="\/\/duckduckgo\.com\/l\/\?uddg=([^"&]+)/gi;
    const urls: string[] = [];

    let m: RegExpExecArray | null;
    while ((m = linkRegex.exec(html)) !== null) {
      try {
        const decoded = decodeURIComponent(m[1]);
        if (decoded.startsWith("http")) urls.push(decoded);
      } catch { /* skip */ }
    }

    // Also try direct result URLs
    const directRegex = /result__a[^>]+href="(https?:\/\/[^"]+)"/gi;
    while ((m = directRegex.exec(html)) !== null) {
      urls.push(m[1]);
    }

    if (urls.length === 0) return null;

    // Score URLs: prefer official docs domains
    const docsKeywords = ["docs.", "developer.", "developers.", "api.", "reference.", "/docs/", "/api/", "/reference/"];
    const officialDomains = [serviceId.toLowerCase().replace(/[^a-z0-9]/g, "")];

    const scored = urls.map(url => {
      let score = 0;
      const lower = url.toLowerCase();
      if (docsKeywords.some(k => lower.includes(k))) score += 2;
      if (officialDomains.some(d => lower.includes(d))) score += 3;
      if (lower.includes("github.com")) score -= 2; // Prefer official over GitHub
      if (lower.includes("stackoverflow.com")) score -= 5;
      if (lower.includes("reddit.com")) score -= 5;
      return { url, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.url ?? null;
  } catch (e) {
    console.warn(`[DocFetcher] Search failed for ${serviceId}:`, e);
    return null;
  }
}

// ── Guess common docs URL patterns ───────────────────────────────────────────

/**
 * Returns a list of common API documentation URL patterns to try
 * when search fails or returns no results.
 */
function guessDocsUrls(serviceId: string): string[] {
  const id = serviceId.toLowerCase().replace(/[^a-z0-9-]/g, "");
  return [
    `https://docs.${id}.com/api`,
    `https://docs.${id}.com/api/reference`,
    `https://docs.${id}.com/reference`,
    `https://developers.${id}.com/docs`,
    `https://developer.${id}.com/docs`,
    `https://api.${id}.com/docs`,
    `https://${id}.com/docs/api`,
    `https://${id}.com/docs/rest-api`,
    `https://${id}.com/docs/reference`,
    `https://docs.${id}.com`,
  ];
}

// ── HTTP fetch with timeout ───────────────────────────────────────────────────

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 10_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Main: fetch API docs for a service ───────────────────────────────────────

/**
 * Main entry point. Given a service ID (e.g. "vercel", "stripe", "openai"),
 * fetches real API documentation and returns clean readable text.
 *
 * @param serviceId - The service identifier (e.g. "vercel", "stripe")
 * @param maxPages - Maximum number of doc pages to crawl (default: 4)
 * @param maxCharsPerPage - Max characters to extract per page (default: 8000)
 */
export async function fetchApiDocs(
  serviceId: string,
  maxPages = 4,
  maxCharsPerPage = 8_000
): Promise<DocFetchResult> {
  console.log(`[DocFetcher] Searching for API docs: ${serviceId}`);

  // Step 1: Search for the real docs URL
  let primaryUrl: string | null = await searchForDocsUrl(serviceId);
  let fromSearch = true;

  if (!primaryUrl) {
    console.log(`[DocFetcher] Search returned no results for ${serviceId}, trying common patterns`);
    fromSearch = false;
    // Try common patterns until one works
    const candidates = guessDocsUrls(serviceId);
    for (const candidate of candidates) {
      try {
        const res = await fetchWithTimeout(candidate, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; EagleEye/1.0)" },
        }, 6_000);
        if (res.ok) {
          primaryUrl = candidate;
          console.log(`[DocFetcher] Found docs at: ${primaryUrl}`);
          break;
        }
      } catch { /* try next */ }
    }
  }

  if (!primaryUrl) {
    console.warn(`[DocFetcher] Could not find docs for ${serviceId}`);
    return {
      docsUrl: `https://docs.${serviceId}.com`,
      text: `No documentation found for "${serviceId}". The LLM will use general knowledge about this service's API.`,
      fetchedUrls: [],
      fromSearch: false,
    };
  }

  // Step 2: Fetch and crawl doc pages
  const fetchedUrls: string[] = [];
  const textParts: string[] = [];
  const visited = new Set<string>();
  const queue: string[] = [primaryUrl];

  while (queue.length > 0 && fetchedUrls.length < maxPages) {
    const url = queue.shift()!;
    const normalizedUrl = url.split("#")[0];
    if (visited.has(normalizedUrl)) continue;
    visited.add(normalizedUrl);

    try {
      console.log(`[DocFetcher] Fetching: ${url}`);
      const res = await fetchWithTimeout(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; EagleEye/1.0; API monitoring bot)",
          "Accept": "text/html,application/xhtml+xml",
        },
      }, 10_000);

      if (!res.ok) {
        console.warn(`[DocFetcher] ${url} returned ${res.status}`);
        continue;
      }

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
        // Try to read as text anyway (some docs serve markdown as text/plain)
        if (!contentType.includes("text")) continue;
      }

      const html = await res.text();
      const cleanText = htmlToText(html);

      // Only keep pages with substantial content (avoid redirect pages, 404 pages)
      if (cleanText.length < 200) continue;

      fetchedUrls.push(url);
      textParts.push(`\n\n=== SOURCE: ${url} ===\n${cleanText.slice(0, maxCharsPerPage)}`);

      // Extract sub-links to crawl (only if we haven't hit the limit)
      if (fetchedUrls.length < maxPages) {
        const subLinks = extractDocLinks(html, url);
        for (const link of subLinks) {
          if (!visited.has(link)) queue.push(link);
        }
      }
    } catch (e) {
      console.warn(`[DocFetcher] Failed to fetch ${url}:`, String(e));
    }
  }

  if (fetchedUrls.length === 0) {
    return {
      docsUrl: primaryUrl,
      text: `Documentation URL found (${primaryUrl}) but could not be fetched. The LLM will use general knowledge.`,
      fetchedUrls: [],
      fromSearch,
    };
  }

  const consolidatedText = textParts.join("\n\n");
  console.log(`[DocFetcher] Fetched ${fetchedUrls.length} pages, ${consolidatedText.length} chars total for ${serviceId}`);

  return {
    docsUrl: primaryUrl,
    text: consolidatedText,
    fetchedUrls,
    fromSearch,
  };
}
