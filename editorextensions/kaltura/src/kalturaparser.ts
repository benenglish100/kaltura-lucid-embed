/**
 * Parses a Kaltura **embed code** (or an already-complete Kaltura player URL) and returns the
 * player iframe URL for Lucid to embed.
 *
 * Scope (current): embed-code only. We rely on the input being self-contained — the src carries
 * partner, player, entry, and (for MediaSpace/KMS content) the config[provider] widgetId that the
 * entry needs to resolve. We do NOT construct player URLs from bare oEmbed / MediaSpace links,
 * because the required widgetId is minted per-instance by MediaSpace and is only obtainable by
 * calling its oEmbed endpoint — that may be added later as a separate, network-based path.
 *
 * Two accepted inputs:
 *   1. Full <iframe> Embed code            - src carries everything.
 *   2. A Kaltura player URL (the src alone) - e.g. https://cdnapisec.kaltura.com/p/.../embedPlaykitJs/...
 *
 * Encoding note: we always emit a fully URL-encoded config[provider] value. Lucid re-unfurls the
 * URL we hand to importLinks by running it back through this parser, so the emitted URL must be
 * safe to round-trip; literal `{"..."}` quotes are not.
 */

export interface KalturaConfig {
    /** Account-wide Kaltura partner ID (from package settings). Used only as a fallback. */
    partnerId?: string;
    /** Default player / uiConf ID used when the input does not specify one. */
    defaultPlayerId?: string;
    /** Player CDN host, e.g. cdnapisec.kaltura.com. */
    playerDomain?: string;
}

export interface ParseResult {
    /** The player iframe URL, ready to hand to Lucid's unfurl iframe. */
    iframeUrl: string;
    /** Best-effort human readable title (used as the block title). */
    title?: string;
    entryId: string;
    partnerId: string;
    playerId: string;
    /** The provider widget ID carried by the embed, if any. */
    widgetId?: string;
    /** Public thumbnail URL for the entry, used as the unfurl preview image. */
    thumbnailUrl: string;
}

export interface ParseError {
    error: string;
    /** Which required piece was missing, when the failure is a config gap. */
    missing?: 'partnerId' | 'playerId';
}

export type ParseOutcome = ParseResult | ParseError;

export function isParseError(o: ParseOutcome): o is ParseError {
    return (o as ParseError).error !== undefined;
}

const DEFAULT_PLAYER_DOMAIN = 'cdnapisec.kaltura.com';

// Kaltura entry / widget IDs look like: 1_sogy18r0  (a digit, underscore, alphanumerics)
const KALTURA_ID = '[0-9]_[a-zA-Z0-9]+';
const ENTRY_ID = KALTURA_ID;

// Anchored validators for values we splice into the emitted player/thumbnail URLs. Partner and
// player (uiConf) IDs are always numeric; entry IDs follow the Kaltura ID shape. We reject
// anything else so a crafted paste cannot inject extra path segments or query parameters.
const NUMERIC_ID = /^\d+$/;
const ENTRY_ID_RE = new RegExp('^' + ENTRY_ID + '$');

/** Normalize a host or player-domain string to a bare lower-case host (no scheme, no trailing /). */
function normalizeHost(value: string): string {
    return value.replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
}

/** Extract the bare host from an absolute URL, if it has one. */
function extractHost(url: string): string | undefined {
    const m = /^https?:\/\/([^/?#]+)/i.exec(url);
    return m ? m[1].toLowerCase() : undefined;
}

/**
 * Decide whether a host parsed from the input may be carried through to the emitted iframe URL.
 * We only ever embed from Kaltura (`*.kaltura.com`) or from the exact player domain the account
 * admin configured (which covers custom-CNAME MediaSpace deployments). Any other host is dropped
 * and replaced with the configured/default domain, so a pasted URL can never make us embed an
 * arbitrary third-party site.
 */
function hostAllowed(host: string, configDomain?: string): boolean {
    if (/(^|\.)kaltura\.com$/i.test(host)) {
        return true;
    }
    if (configDomain) {
        const cfg = normalizeHost(configDomain);
        if (cfg && host === cfg) {
            return true;
        }
    }
    return false;
}

/**
 * Build the canonical Kaltura iframe-embed player URL from resolved parts.
 * When a widgetId is present, appends a URL-encoded config[provider] so access-controlled
 * (MediaSpace) entries resolve.
 */
export function buildPlayerUrl(
    partnerId: string,
    playerId: string,
    entryId: string,
    playerDomain: string = DEFAULT_PLAYER_DOMAIN,
    widgetId?: string,
): string {
    const domain = (playerDomain || DEFAULT_PLAYER_DOMAIN).replace(/^https?:\/\//, '').replace(/\/+$/, '');
    let url =
        `https://${domain}/p/${partnerId}/embedPlaykitJs/uiconf_id/${playerId}` +
        `?iframeembed=true&entry_id=${entryId}`;
    if (widgetId) {
        // config[provider]={"widgetId":"<id>"} — every reserved character encoded.
        const providerJson = `{"widgetId":"${widgetId}"}`;
        url += '&' + encodeURIComponent('config[provider]') + '=' + encodeURIComponent(providerJson);
    }
    return url;
}

/**
 * Build the public thumbnail URL for an entry. Kaltura serves this without a widget/session,
 * at a fixed size, so it's safe to use as the unfurl preview image. 16:9 to match the player.
 */
export function buildThumbnailUrl(
    partnerId: string,
    entryId: string,
    playerDomain: string = DEFAULT_PLAYER_DOMAIN,
    width = 640,
    height = 360,
): string {
    const domain = (playerDomain || DEFAULT_PLAYER_DOMAIN).replace(/^https?:\/\//, '').replace(/\/+$/, '');
    return `https://${domain}/p/${partnerId}/thumbnail/entry_id/${entryId}/width/${width}/height/${height}`;
}

/**
 * Extract the player src from a full <iframe ...> HTML string.
 * Returns undefined if the text is not an iframe snippet.
 */
function extractSrcFromIframe(input: string): string | undefined {
    if (!/<iframe/i.test(input)) {
        return undefined;
    }
    // Match the opening quote, then capture up to the MATCHING closing quote. A naive
    // [^'"]+ breaks on Kaltura src values, which embed config[provider]={"widgetId":"..."} —
    // i.e. double quotes inside a single-quoted src (or vice versa).
    const match = /\bsrc\s*=\s*("([^"]*)"|'([^']*)')/i.exec(input);
    return match ? (match[2] ?? match[3]) : undefined;
}

/** Pull a query parameter value out of a URL string without needing a full URL parse. */
function getQueryParam(url: string, name: string): string | undefined {
    const re = new RegExp('[?&]' + name.replace(/[[\]]/g, '\\$&') + '=([^&#]*)', 'i');
    const m = re.exec(url);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : undefined;
}

/**
 * Extract a provider widget ID from anywhere it might appear in the input — whether the
 * config[provider] value is URL-encoded or left as literal `{"widgetId":"..."}`. We decode the
 * whole string first so both forms reduce to the same literal JSON before matching.
 */
function extractWidgetId(input: string): string | undefined {
    let decoded = input;
    try {
        decoded = decodeURIComponent(input);
    } catch {
        // Malformed percent-encoding — fall back to the raw string.
    }
    return new RegExp('"widgetId"\\s*:\\s*"(' + KALTURA_ID + ')"').exec(decoded)?.[1];
}

/**
 * Parse a Kaltura player URL (the src of an Embed code, or a URL that already points at
 * embedPlaykitJs) and pull out partner / player / entry / widget.
 */
function parsePlayerUrl(
    url: string,
): {host?: string; partnerId?: string; playerId?: string; entryId?: string; widgetId?: string} {
    const host = extractHost(url);
    const partnerId = /\/p\/(\d+)\//.exec(url)?.[1];
    const playerId = /\/uiconf_id\/(\d+)/i.exec(url)?.[1] ?? getQueryParam(url, 'uiconf_id');
    const entryId = getQueryParam(url, 'entry_id') ?? new RegExp('/entry_id/(' + ENTRY_ID + ')').exec(url)?.[1];
    const widgetId = extractWidgetId(url);
    return {host, partnerId, playerId, entryId, widgetId};
}

const EMBED_ONLY_HINT =
    'Paste the full Kaltura embed code (the <iframe> … </iframe> snippet from Share ▸ Embed), ' +
    'or the player URL it contains. Plain MediaSpace links are not supported yet.';

/**
 * Main entry point. Given an embed code or player URL, return either a ready-to-embed
 * ParseResult or a ParseError. Bare oEmbed / MediaSpace links are intentionally rejected.
 */
export function parseKalturaInput(rawInput: string, config: KalturaConfig): ParseOutcome {
    const input = (rawInput || '').trim();
    if (!input) {
        return {error: 'Nothing was pasted. ' + EMBED_ONLY_HINT};
    }

    const playerDomain = config.playerDomain || DEFAULT_PLAYER_DOMAIN;

    // Case 1: a full <iframe> embed code — pull out its src and parse that.
    // Case 2: the input is already a player URL.
    const iframeSrc = extractSrcFromIframe(input);
    const candidateUrl = iframeSrc ?? input;

    const isPlayerUrl = /embedPlaykitJs/i.test(candidateUrl) || /[?&]entry_id=/i.test(candidateUrl);
    if (!isPlayerUrl) {
        return {error: 'Unrecognized input. ' + EMBED_ONLY_HINT};
    }

    const parts = parsePlayerUrl(candidateUrl);
    if (!parts.entryId) {
        return {error: 'Could not find an entry ID in that embed code. ' + EMBED_ONLY_HINT};
    }

    const partnerId = parts.partnerId ?? config.partnerId;
    const playerId = parts.playerId ?? config.defaultPlayerId;
    const missing = requireConfig(partnerId, playerId);
    if (missing) {
        return missing;
    }

    // Validate every value we are about to splice into a URL. These come from arbitrary pasted
    // text, so anything that isn't a well-formed Kaltura ID is rejected rather than embedded —
    // this keeps a crafted paste from injecting extra path segments or query parameters.
    if (!NUMERIC_ID.test(partnerId!) || !NUMERIC_ID.test(playerId!) || !ENTRY_ID_RE.test(parts.entryId)) {
        return {error: 'That embed code contains an unexpected ID format. ' + EMBED_ONLY_HINT};
    }

    // Prefer the host the embed actually points at (so a customer's custom MediaSpace CDN keeps
    // working), but only if it's a host we trust; otherwise fall back to the configured/default
    // player domain. This prevents a pasted URL from making us embed an arbitrary origin.
    const resolvedDomain =
        parts.host && hostAllowed(parts.host, config.playerDomain) ? parts.host : playerDomain;

    // Rebuild canonically (properly encoded) rather than passing the raw src through — the raw
    // src often carries literal unencoded config[provider] quotes, which break when Lucid
    // re-unfurls the URL. The widgetId (if any) is preserved from the embed.
    return {
        iframeUrl: buildPlayerUrl(partnerId!, playerId!, parts.entryId, resolvedDomain, parts.widgetId),
        title: iframeSrc ? extractTitleFromIframe(input) : undefined,
        entryId: parts.entryId,
        partnerId: partnerId!,
        playerId: playerId!,
        widgetId: parts.widgetId,
        thumbnailUrl: buildThumbnailUrl(partnerId!, parts.entryId, resolvedDomain),
    };
}

/** Returns a ParseError if a required piece of account config is missing, else undefined. */
function requireConfig(partnerId?: string, playerId?: string): ParseError | undefined {
    if (!partnerId) {
        return {
            error:
                'No Partner ID found in the embed code, and none is configured for this account. ' +
                'Paste a full embed code, or ask an admin to set the Kaltura Partner ID in the extension settings.',
            missing: 'partnerId',
        };
    }
    if (!playerId) {
        return {
            error:
                'No player ID found in the embed code, and no Default Player ID is configured. ' +
                'Paste a full embed code, or ask an admin to set a Default Player ID in the extension settings.',
            missing: 'playerId',
        };
    }
    return undefined;
}

/** Upper bound on the pasted title we carry into the block, so an oversized attribute can't bloat it. */
const MAX_TITLE_LENGTH = 300;

// Matches C0/C1 control characters. Built from a string so no literal control byte appears in
// source; \x00-\x1f and \x7f-\x9f are interpreted by the RegExp engine at construction.
const CONTROL_CHARS = new RegExp('[\\x00-\\x1f\\x7f-\\x9f]', 'g');

/** Best-effort title extraction from an iframe snippet's title="" attribute. */
function extractTitleFromIframe(input: string): string | undefined {
    const raw = /\btitle\s*=\s*['"]([^'"]+)['"]/i.exec(input)?.[1];
    if (raw === undefined) {
        return undefined;
    }
    // Strip control characters and cap length; the title comes from arbitrary pasted text.
    const cleaned = raw.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
    if (!cleaned) {
        return undefined;
    }
    return cleaned.length > MAX_TITLE_LENGTH ? cleaned.slice(0, MAX_TITLE_LENGTH).trim() : cleaned;
}
