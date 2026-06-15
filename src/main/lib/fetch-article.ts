import { Defuddle } from 'defuddle/node';

/** A desktop browser UA — some sites refuse the default Node fetch agent. */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const FETCH_TIMEOUT_MS = 30_000;

/**
 * Fetch a web page and extract its readable article as Markdown via Defuddle.
 * Runs in the main process, so there is no CORS restriction. A plain server
 * fetch won't get JS-rendered or paywalled pages.
 */
export async function fetchArticle(
  rawUrl: string
): Promise<{ markdown: string; title: string }> {
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let html: string;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,*/*',
      },
    });
    if (!res.ok) {
      throw new Error(`The page returned HTTP ${res.status}.`);
    }
    html = await res.text();
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('The page took too long to load.');
    }
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    clearTimeout(timeoutId);
  }

  const result = await Defuddle(html, url, { markdown: true });
  let markdown = (result.contentMarkdown || result.content || '').trim();

  // Defuddle prefixes a failed markdown conversion with this marker and dumps
  // raw HTML (e.g. ancient table/font layouts). Fall back to cleaned plain text.
  if (!markdown || /^Partial conversion completed with errors/i.test(markdown) || looksLikeRawHtml(markdown)) {
    const cleaned = await Defuddle(html, url);
    const text = htmlToText(cleaned.content || '');
    if (text) markdown = text;
  }

  if (!markdown || /^Partial conversion completed with errors/i.test(markdown)) {
    throw new Error(
      "Couldn't extract article text — the page may be JavaScript-rendered or blocked. Try pasting the text instead."
    );
  }
  return { markdown, title: result.title || '' };
}

/**
 * True when a "markdown" string is really a raw-HTML dump (Defuddle's failed
 * conversion). Keyed on a density of real HTML *element* tags — markdown
 * autolinks like `<https://…>` or `<a@b.com>` are not element tags and do not
 * match, so a clean article that merely contains a link won't false-positive.
 */
function looksLikeRawHtml(markdown: string): boolean {
  const tags = markdown.match(
    /<\/?(div|p|table|tbody|thead|tr|td|th|span|font|center|ul|ol|li|h[1-6]|section|article|header|footer|nav|img|figure|blockquote|br)[\s/>]/gi
  );
  return (tags?.length ?? 0) >= 5;
}

/** Minimal HTML → plain text for the markdown-conversion fallback. */
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
