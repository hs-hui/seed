import type { SunlightSource } from '../ai/provider.js';

/** Best-effort public search used only when the user opts into `--web`. */
export async function webSources(query: string): Promise<SunlightSource[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, { headers: { 'user-agent': 'Seed/0.1 (+https://github.com/hs-hui/seed)' }, signal: controller.signal });
    if (!response.ok) return [];
    const html = await response.text();
    const sources: SunlightSource[] = [];
    const pattern = /result__a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    for (const match of html.matchAll(pattern)) {
      const source = normalizeSource(decodeHtml(match[1] ?? '').trim());
      const title = decodeHtml((match[2] ?? '').replace(/<[^>]+>/g, '')).trim();
      if (!source || !title || sources.some((item) => item.source === source)) continue;
      sources.push({ source, title, snippet: 'Public search result; verify before treating as fact.' });
      if (sources.length >= 5) break;
    }
    return sources;
  } catch { return []; }
  finally { clearTimeout(timer); }
}

function decodeHtml(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function normalizeSource(value: string): string {
  try {
    const url = new URL(value.startsWith('//') ? `https:${value}` : value);
    return url.searchParams.get('uddg') ?? url.toString();
  } catch { return value; }
}
