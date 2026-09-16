/**
 * Lightweight assertion-based tests for the Kaltura parser (embed-code only scope).
 * Run with:  npm test   (the `pretest` step compiles the TS sources to ./test-build first.)
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {parseKalturaInput, isParseError, buildPlayerUrl, buildThumbnailUrl} = require('../test-build/kalturaparser.js');
const {parseMetadataResponse, stripHtml} = require('../test-build/kalturametadata.js');

const config = {
    partnerId: '5171622',
    defaultPlayerId: '52042012',
    playerDomain: 'cdnapisec.kaltura.com',
};

let passed = 0;
function check(name, fn) {
    try {
        fn();
        passed++;
        console.log('  ok  - ' + name);
    } catch (e) {
        console.error('  FAIL - ' + name + '\n        ' + e.message);
        process.exitCode = 1;
    }
}

const EXPECTED_ENTRY = '1_sogy18r0';

// --- Full <iframe> embed code (self-contained) -----------------------------
check('embed code: extracts self-contained src and preserves the provider widget', () => {
    const embed =
        '<iframe id="kaltura_player" type="text/javascript" ' +
        "src='https://cdnapisec.kaltura.com/p/5171622/embedPlaykitJs/uiconf_id/52042012?iframeembed=true&entry_id=1_sogy18r0&config[provider]={\"widgetId\":\"1_arpsev0h\"}' " +
        'style="width: 608px;height: 402px;border: 0;" allowfullscreen title="Test Video"></iframe>';
    const r = parseKalturaInput(embed, config);
    assert.ok(!isParseError(r), 'should not error');
    assert.strictEqual(r.entryId, EXPECTED_ENTRY);
    assert.strictEqual(r.partnerId, '5171622');
    assert.strictEqual(r.playerId, '52042012');
    assert.strictEqual(r.title, 'Test Video');
    assert.ok(r.iframeUrl.indexOf('iframeembed=true') !== -1, 'keeps iframeembed flag');
    assert.ok(r.iframeUrl.indexOf('entry_id=1_sogy18r0') !== -1);
    // The provider widgetId from config[provider] must be preserved, URL-encoded.
    assert.strictEqual(r.widgetId, '1_arpsev0h', 'captures widgetId from embed');
    assert.ok(
        r.iframeUrl.indexOf(encodeURIComponent('config[provider]')) !== -1,
        'config[provider] key is URL-encoded',
    );
    assert.ok(
        r.iframeUrl.indexOf(encodeURIComponent('{"widgetId":"1_arpsev0h"}')) !== -1,
        'provider JSON value is URL-encoded',
    );
    // No literal unencoded quotes/braces that would break Lucid re-unfurl round-trips.
    assert.ok(r.iframeUrl.indexOf('{"') === -1, 'no literal { in emitted url');
    // A public thumbnail URL is provided for the card preview.
    assert.strictEqual(
        r.thumbnailUrl,
        buildThumbnailUrl('5171622', '1_sogy18r0', 'cdnapisec.kaltura.com'),
    );
    assert.ok(r.thumbnailUrl.indexOf('/thumbnail/entry_id/1_sogy18r0') !== -1);
});

// Regression: a real MediaSpace embed uses a single-quoted src whose value contains double
// quotes (config[provider]={"widgetId":"..."}). The src extractor must not truncate at the
// first inner quote. Uses the verbatim embed fixture, read from disk (no JS escaping).
check('real single-quoted embed with inner double quotes keeps the widgetId', () => {
    const embed = fs.readFileSync(path.join(__dirname, '_embed.txt'), 'utf8');
    const r = parseKalturaInput(embed, config);
    assert.ok(!isParseError(r), 'should not error');
    assert.strictEqual(r.entryId, '1_sogy18r0');
    assert.strictEqual(r.widgetId, '1_arpsev0h', 'widgetId survives src extraction');
    assert.ok(
        r.iframeUrl.indexOf(encodeURIComponent('{"widgetId":"1_arpsev0h"}')) !== -1,
        'emitted url carries encoded provider',
    );
});

// A bare player URL (the src alone, no <iframe> wrapper) is also accepted.
check('bare player URL is accepted', () => {
    const url =
        'https://cdnapisec.kaltura.com/p/5171622/embedPlaykitJs/uiconf_id/52042012?iframeembed=true&entry_id=1_sogy18r0';
    const r = parseKalturaInput(url, config);
    assert.ok(!isParseError(r), 'should not error');
    assert.strictEqual(r.entryId, EXPECTED_ENTRY);
    assert.strictEqual(r.playerId, '52042012');
});

check('emitted url round-trips through the parser unchanged', () => {
    const embed =
        "<iframe src='https://cdnapisec.kaltura.com/p/5171622/embedPlaykitJs/uiconf_id/52042012?iframeembed=true&entry_id=1_sogy18r0&config[provider]={\"widgetId\":\"1_arpsev0h\"}' title='Test Video'></iframe>";
    const first = parseKalturaInput(embed, config);
    assert.ok(!isParseError(first));
    // Feed the emitted URL back in, as Lucid's importLinks re-unfurl does.
    const second = parseKalturaInput(first.iframeUrl, config);
    assert.ok(!isParseError(second), 'round-trip should not error');
    assert.strictEqual(second.iframeUrl, first.iframeUrl, 'url stable across round-trip');
    assert.strictEqual(second.widgetId, '1_arpsev0h');
});

// --- Bare links are intentionally NOT supported yet (embed-only scope) ------
check('oembed link is rejected (not supported yet)', () => {
    const url =
        'https://benssandbox.mediaspace.kaltura.com/id/1_sogy18r0?width=608&height=402&playerId=52042012';
    const r = parseKalturaInput(url, config);
    assert.ok(isParseError(r), 'should error');
});

check('media page link is rejected (not supported yet)', () => {
    const url = 'https://benssandbox.mediaspace.kaltura.com/media/Test+Video/1_sogy18r0';
    const r = parseKalturaInput(url, config);
    assert.ok(isParseError(r), 'should error');
});

// --- Config-gap handling ----------------------------------------------------
check('embed code missing player, no default configured: reports missing playerId', () => {
    // A src with partner + entry but no uiconf_id, and config supplies no default player.
    const url = 'https://cdnapisec.kaltura.com/p/5171622/embedPlaykitJs?iframeembed=true&entry_id=1_sogy18r0';
    const r = parseKalturaInput(url, {partnerId: '5171622'});
    assert.ok(isParseError(r), 'should error');
    assert.strictEqual(r.missing, 'playerId');
});

// --- Non-matching input -----------------------------------------------------
check('random url: rejected', () => {
    const r = parseKalturaInput('https://example.com/video/123', config);
    assert.ok(isParseError(r), 'should error');
});

check('empty input: rejected', () => {
    const r = parseKalturaInput('   ', config);
    assert.ok(isParseError(r), 'should error');
});

// --- Player domain precedence -----------------------------------------------
check('a trusted host carried by the embed wins over the configured player domain', () => {
    // The embed is self-contained and already points at a known-good kaltura.com host, so we
    // honor it rather than rewriting it to the configured fallback domain.
    const url =
        'https://cdnapisec.kaltura.com/p/999/embedPlaykitJs/uiconf_id/111?iframeembed=true&entry_id=1_abcde123';
    const r = parseKalturaInput(url, {
        partnerId: '5171622',
        defaultPlayerId: '52042012',
        playerDomain: 'mycdn.kaltura.com',
    });
    assert.ok(!isParseError(r));
    assert.ok(r.iframeUrl.indexOf('https://cdnapisec.kaltura.com/p/999/') === 0, r.iframeUrl);
});

// --- Host handling (custom MediaSpace CDN + untrusted-host rejection) --------
check('custom kaltura.com subdomain host in the embed is preserved', () => {
    const url =
        'https://mycompany.kaltura.com/p/5171622/embedPlaykitJs/uiconf_id/52042012?iframeembed=true&entry_id=1_sogy18r0';
    const r = parseKalturaInput(url, config);
    assert.ok(!isParseError(r));
    assert.ok(r.iframeUrl.indexOf('https://mycompany.kaltura.com/p/') === 0, r.iframeUrl);
});

check('a configured custom (non-kaltura.com) player domain host is preserved', () => {
    const url =
        'https://video.acme.com/p/5171622/embedPlaykitJs/uiconf_id/52042012?iframeembed=true&entry_id=1_sogy18r0';
    const r = parseKalturaInput(url, {...config, playerDomain: 'video.acme.com'});
    assert.ok(!isParseError(r));
    assert.ok(r.iframeUrl.indexOf('https://video.acme.com/p/') === 0, r.iframeUrl);
});

check('an untrusted host is dropped in favor of the configured player domain', () => {
    // A player-shaped URL pointing at an attacker host must NOT be embedded from that host.
    const url =
        'https://evil.example.com/p/5171622/embedPlaykitJs/uiconf_id/52042012?iframeembed=true&entry_id=1_sogy18r0';
    const r = parseKalturaInput(url, config);
    assert.ok(!isParseError(r));
    assert.ok(r.iframeUrl.indexOf('https://cdnapisec.kaltura.com/p/') === 0, r.iframeUrl);
    assert.strictEqual(r.iframeUrl.indexOf('evil.example.com'), -1);
});

check('a look-alike host (notkaltura.com) is not trusted', () => {
    const url =
        'https://notkaltura.com/p/5171622/embedPlaykitJs/uiconf_id/52042012?iframeembed=true&entry_id=1_sogy18r0';
    const r = parseKalturaInput(url, config);
    assert.ok(!isParseError(r));
    assert.strictEqual(r.iframeUrl.indexOf('notkaltura.com'), -1, r.iframeUrl);
});

// --- ID validation (no injection through crafted IDs) -----------------------
check('a non-numeric partner id from config is rejected', () => {
    const url = 'https://cdnapisec.kaltura.com/embedPlaykitJs?iframeembed=true&entry_id=1_sogy18r0';
    const r = parseKalturaInput(url, {partnerId: '5171622/../evil', defaultPlayerId: '52042012'});
    assert.ok(isParseError(r), 'should reject a malformed partner id');
});

// --- Metadata response parsing (kalturametadata.ts) -------------------------
check('metadata: extracts name and description from a successful multirequest', () => {
    const text = JSON.stringify([
        {ks: 'abc', objectType: 'KalturaStartWidgetSessionResponse'},
        {name: 'Test Video', description: 'A short clip', objectType: 'KalturaMediaEntry'},
    ]);
    const m = parseMetadataResponse(text);
    assert.ok(m, 'should return metadata');
    assert.strictEqual(m.title, 'Test Video');
    assert.strictEqual(m.description, 'A short clip');
});

check('metadata: empty description is omitted, title still returned', () => {
    const text = JSON.stringify([
        {ks: 'abc', objectType: 'KalturaStartWidgetSessionResponse'},
        {name: 'Test Video', description: '', objectType: 'KalturaMediaEntry'},
    ]);
    const m = parseMetadataResponse(text);
    assert.ok(m);
    assert.strictEqual(m.title, 'Test Video');
    assert.strictEqual(m.description, undefined);
});

check('metadata: API exception (entry not resolvable) returns undefined', () => {
    const text = JSON.stringify([
        {ks: 'abc', objectType: 'KalturaStartWidgetSessionResponse'},
        {code: 'ENTRY_ID_NOT_FOUND', message: 'not found', objectType: 'KalturaAPIException'},
    ]);
    assert.strictEqual(parseMetadataResponse(text), undefined);
});

check('metadata: malformed JSON returns undefined', () => {
    assert.strictEqual(parseMetadataResponse('<html>error</html>'), undefined);
});

// --- HTML stripping (the <div> issue from the canvas screenshot) ------------
check('stripHtml: removes tags from a description', () => {
    assert.strictEqual(stripHtml('<div>This is a video of a concept car</div>'), 'This is a video of a concept car');
});

check('stripHtml: decodes entities and collapses whitespace', () => {
    assert.strictEqual(stripHtml('<p>Cars &amp;   trucks</p>\n<p>2024</p>'), 'Cars & trucks 2024');
});

check('stripHtml: decodes hex numeric entities', () => {
    assert.strictEqual(stripHtml('caf&#xe9; &#x2014; open'), 'café — open');
});

check('stripHtml: does not double-decode an escaped entity', () => {
    // "&amp;#39;" should become "&#39;", not "'".
    assert.strictEqual(stripHtml('Tom &amp;#39;s clip'), "Tom &#39;s clip");
});

check('stripHtml: an out-of-range numeric entity is left intact (no throw)', () => {
    assert.strictEqual(stripHtml('bad &#1114112; ref'), 'bad &#1114112; ref');
});

check('stripHtml: strips control chars, incl. ones decoded from entities', () => {
    // Literal NUL, a zero-width space, and a NUL smuggled in as a numeric entity all removed.
    assert.strictEqual(stripHtml('a b​c&#0;d'), 'abcd');
});

check('stripHtml: caps runaway length', () => {
    const out = stripHtml('x'.repeat(5000));
    assert.ok(out.length <= 2000, 'length capped at 2000, got ' + out.length);
});

check('title: control chars stripped and length capped', () => {
    const longTitle = 'Title ' + 'y'.repeat(1000);
    const embed =
        "<iframe src='https://cdnapisec.kaltura.com/p/5171622/embedPlaykitJs/uiconf_id/52042012?iframeembed=true&entry_id=1_sogy18r0' title='" +
        longTitle +
        "'></iframe>";
    const r = parseKalturaInput(embed, config);
    assert.ok(!isParseError(r));
    assert.ok(r.title.length <= 300, 'title capped, got ' + r.title.length);
    assert.strictEqual(r.title.indexOf(''), -1, 'control char removed');
});

check('metadata: description HTML is stripped end-to-end', () => {
    const text = JSON.stringify([
        {ks: 'abc', objectType: 'KalturaStartWidgetSessionResponse'},
        {
            name: 'Concept car video',
            description: '<div>This is a video of a concept car</div>',
            objectType: 'KalturaMediaEntry',
        },
    ]);
    const m = parseMetadataResponse(text);
    assert.ok(m);
    assert.strictEqual(m.title, 'Concept car video');
    assert.strictEqual(m.description, 'This is a video of a concept car');
});

console.log('\n' + passed + ' checks passed.');
