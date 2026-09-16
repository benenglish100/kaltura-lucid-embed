import {EditorClient} from 'lucid-extension-sdk';

/**
 * Fetches entry metadata (title, description) from Kaltura's OVP API so the unfurl card can show
 * the real video name instead of a generic label.
 *
 * We use the API (not MediaSpace oEmbed) because it works from what an embed code actually carries
 * — partner, entry, and provider widget — without needing the customer's MediaSpace domain, which
 * embed codes do not include. The call is a single unauthenticated `multirequest`:
 *   1. session.startWidgetSession(widgetId)  -> anonymous ks
 *   2. baseEntry.get(entryId) using {1:result:ks}
 *
 * When no widget is available we fall back to the default partner widget "_<partnerId>". Access-
 * controlled entries won't resolve that way, so metadata is simply omitted and the card keeps its
 * generic label — playback (which carries the widget in the player URL) is unaffected.
 *
 * Requires the NETWORK scope. All failures are swallowed: metadata is a nice-to-have, never a
 * reason to block embedding.
 */

export interface KalturaMetadata {
    title?: string;
    description?: string;
}

export async function fetchEntryMetadata(
    client: EditorClient,
    opts: {partnerId: string; entryId: string; widgetId?: string; playerDomain: string},
): Promise<KalturaMetadata | undefined> {
    const {partnerId, entryId, widgetId, playerDomain} = opts;
    const widget = widgetId ?? `_${partnerId}`;
    const domain = (playerDomain || 'cdnapisec.kaltura.com')
        .replace(/^https?:\/\//, '')
        .replace(/\/+$/, '');

    // Defense in depth against SSRF: the domain comes from admin package settings (not the paster),
    // but we still only ever contact a plain, well-formed hostname. This rejects paths, ports,
    // credentials, query strings, or anything non-hostname-shaped before it reaches the network.
    if (!/^[a-z0-9.-]+$/i.test(domain)) {
        return undefined;
    }

    const body = {
        '1': {service: 'session', action: 'startWidgetSession', widgetId: widget},
        '2': {
            service: 'baseEntry',
            action: 'get',
            ks: '{1:result:ks}',
            entryId: entryId,
        },
        apiVersion: '3.3.0',
        format: 1, // JSON
    };

    try {
        const response = await client.xhr({
            url: `https://${domain}/api_v3/service/multirequest`,
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            data: JSON.stringify(body),
            responseFormat: 'utf8',
            timeoutMs: 8000,
        });

        if (response.status < 200 || response.status >= 300) {
            return undefined;
        }
        return parseMetadataResponse(response.responseText);
    } catch {
        // Network failure, timeout, or non-2xx — metadata is optional, so give up quietly.
        return undefined;
    }
}

/**
 * Parse the multirequest JSON. The response is an array: [startWidgetSessionResponse, entry].
 * The entry (index 1) is either a KalturaMediaEntry or a KalturaAPIException (e.g. the widget
 * couldn't resolve the entry) — in the latter case we return nothing.
 */
export function parseMetadataResponse(text: string): KalturaMetadata | undefined {
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch {
        return undefined;
    }

    // Errors can also come back as a top-level object with objectType KalturaAPIException.
    const entry = Array.isArray(json) ? json[1] : json;
    if (!entry || typeof entry !== 'object') {
        return undefined;
    }
    const obj = entry as {[key: string]: unknown};
    if (obj['objectType'] === 'KalturaAPIException' || obj['code']) {
        return undefined;
    }

    const title = typeof obj['name'] === 'string' ? stripHtml(obj['name']) : undefined;
    const description = typeof obj['description'] === 'string' ? stripHtml(obj['description']) : undefined;

    if (!title && !description) {
        return undefined;
    }
    return {
        title: title || undefined,
        description: description || undefined,
    };
}

/**
 * Upper bound on the length of any single sanitized metadata string we set on a block. The remote
 * API text is untrusted and length-unbounded; capping it bounds what we write into the document
 * model and prevents a pathological entry from bloating the page.
 */
export const MAX_METADATA_LENGTH = 2000;

/**
 * Kaltura stores name/description as HTML (e.g. "<div>This is a video</div>"). The unfurl card
 * shows plain text, so strip tags, decode the common named/numeric entities, remove control and
 * invisible-format characters, collapse whitespace, trim, and cap length. All input here is
 * untrusted remote text. Runs in the sandboxed extension iframe, so we can't rely on a DOM parser.
 */
export function stripHtml(input: string): string {
    const decoded = removeControlChars(
        input
            .replace(/<[^>]*>/g, ' ') // drop tags
            .replace(/&nbsp;/gi, ' ')
            .replace(/&#x([0-9a-f]+);/gi, (m, n) => codePoint(parseInt(n, 16), m))
            .replace(/&#(\d+);/g, (m, n) => codePoint(parseInt(n, 10), m))
            .replace(/&quot;/gi, '"')
            .replace(/&#39;|&apos;/gi, "'")
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&amp;/gi, '&'), // decode last so we don't double-decode "&amp;#39;"
    )
        .replace(/\s+/g, ' ')
        .trim();
    return decoded.length > MAX_METADATA_LENGTH ? decoded.slice(0, MAX_METADATA_LENGTH).trim() : decoded;
}

/**
 * Remove C0/C1 control characters and zero-width / bidi / BOM format characters, keeping ordinary
 * whitespace (space, tab, newline) which the caller collapses afterwards. Done by code point rather
 * than a regex literal so no literal control byte ever appears in the source. This also catches
 * control characters that were smuggled in as numeric entities and decoded above.
 */
function removeControlChars(s: string): string {
    let out = '';
    for (const ch of s) {
        const c = ch.codePointAt(0)!;
        const isC0 = c <= 0x1f && c !== 0x09 && c !== 0x0a && c !== 0x0d; // keep tab / LF / CR
        const isC1 = c >= 0x7f && c <= 0x9f;
        const isFormat =
            (c >= 0x200b && c <= 0x200f) || // zero-width chars + LRM/RLM
            c === 0x2028 || // line separator
            c === 0x2029 || // paragraph separator
            (c >= 0x202a && c <= 0x202e) || // bidi embedding / override
            c === 0xfeff; // BOM / zero-width no-break space
        if (!isC0 && !isC1 && !isFormat) {
            out += ch;
        }
    }
    return out;
}

/**
 * Turn a numeric character reference into its character. Rejects out-of-range or invalid code
 * points (which would make String.fromCodePoint throw) and leaves the original entity in place.
 */
function codePoint(n: number, original: string): string {
    if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) {
        return original;
    }
    try {
        return String.fromCodePoint(n);
    } catch {
        return original;
    }
}
