# Kaltura Video for Lucidspark

A Lucid **editor extension** that embeds Kaltura video **inline on a Lucidspark board** — the
video plays in place, without opening a new page.

Built for distribution to any Kaltura customer: each customer's Lucid admin enters their own
**Partner ID** once at install time (via Lucid Package Settings), and every board on that
account works. No OAuth, no backend — it assumes the Kaltura content is open (no login).

> **New here?** [INSTALL.md](INSTALL.md) is a screen-by-screen first-install walkthrough for
> admins and end users. To ship the tool to other Kaltura customers, see
> [PUBLISHING.md](PUBLISHING.md).

## How an end user adds a video

**Primary — one click (always works):**
1. Click the **Kaltura Video** button in the Lucidspark content dock (left toolbar).
2. Paste the full **`<iframe>` embed code** (from MediaSpace → Share → Embed), or the **player
   URL** it contains.
3. Click **Add video**. The player appears on the board and plays in place (16:9).

**Bonus — zero click:** paste a Kaltura **player URL** (a `*.kaltura.com` link that contains
`embedPlaykitJs` or an `entry_id`) *directly onto the canvas* — it's recognized automatically and
turned into a player block. (A full `<iframe>` snippet is not a bare URL, so use the button for
embed codes.)

> **Not supported yet:** bare MediaSpace links (`…/media/…/{entryId}`) and oEmbed page URLs. These
> don't carry the per-video provider widget ID an access-controlled entry needs, so they'd produce
> a blank player. Resolving them requires a MediaSpace oEmbed lookup, which is a planned follow-up.
> Use the embed code for now — it always works.

## How input maps to the player

Inputs are normalized to Kaltura's standard iframe-embed player URL:

```
https://{playerDomain}/p/{partnerId}/embedPlaykitJs/uiconf_id/{playerId}?iframeembed=true&entry_id={entryId}
```

| Input | partner_id | player (uiConf) | entry_id | host |
|-------|-----------|-----------------|----------|------|
| Embed code / player URL | from the src (self-contained; else settings) | from the src (else default) | from the src | the src's host if it's `*.kaltura.com` or the configured player domain; otherwise the configured/default domain |

Every ID is validated (partner and player numeric; entry a well-formed Kaltura ID) before it is
placed in a URL, and the embed host is only trusted if it is `*.kaltura.com` or the exact player
domain configured in settings. Anything else falls back to the default, so a pasted link can never
cause the tool to embed from an untrusted origin.

## Package settings (configured by the installing admin)

| Setting | Required | Purpose |
|---------|----------|---------|
| `partnerId` | Fallback only | The account's Kaltura Partner ID. Used only when a pasted player URL doesn't already carry one. |
| `defaultPlayerId` | Fallback only | Player / uiConf ID used when a pasted player URL doesn't carry one. |
| `playerDomain` | No | Player CDN host used when the pasted host isn't trusted. Defaults to `cdnapisec.kaltura.com`. |

Full embed codes are self-contained (they carry partner, player, entry, and host), so they work
even before any settings are configured. The settings only matter for a bare player URL that omits
a piece. If a non-admin hits that gap on an unconfigured install, they're told to ask their Lucid
admin; an admin is taken straight to the settings modal.

## Project layout

```
kaltura-lucid-embed/
├── manifest.json                     # package manifest + settings definitions
└── editorextensions/kaltura/
    ├── src/
    │   ├── extension.ts              # entry point
    │   ├── kalturaextension.ts       # unfurl handler + content-dock button + settings
    │   ├── pastemodal.ts             # the "Add a Kaltura video" modal
    │   ├── kalturaparser.ts          # normalizes all 3 input formats -> player URL
    │   └── icon.ts                   # inline SVG icon (data URI)
    ├── resources/
    │   ├── pastemodal.html           # modal UI
    │   └── resource.d.ts
    ├── test/parser.test.js           # parser tests against real sandbox inputs
    ├── package.json / tsconfig.json / webpack.config.js
```

## Build & test

```bash
cd editorextensions/kaltura
npm install
npm run typecheck   # tsc --noEmit
npm test            # compiles to ./test-build and runs parser tests
npm run build       # webpack -> bin/extension.js  (what Lucid loads)
```

## Load into Lucid for testing

The extension is loaded with Lucid's `lucid-package` CLI using **your own Lucid login** — no API
key needed.

```bash
# from the repo root (where manifest.json lives)
npm install -g lucid-package     # or: npx lucid-package ...
lucid-package test-editor-extension kaltura
```

Then in Lucidspark: open the **Developer** tools / **Extensions** dev-loading option (enabled for
Lucid developer accounts) to load the local extension, click the **Kaltura Video** content-dock
button, and paste one of your sandbox samples. See
<https://developer.lucid.co/extension-api/> for the current dev-load steps and for packaging/
publishing to share with other customers.

> Note: `manifest.json` has a placeholder `id` of all zeros. The `lucid-package` tooling will
> assign a real package `id` when you first create/upload the package; paste it back into
> `manifest.json`.

## Notes & limitations

- **Custom-domain MediaSpace** (a customer using a CNAME like `video.acme.com` instead of
  `*.mediaspace.kaltura.com`): the *paste-onto-canvas* path won't auto-fire, but the **embed-code
  button still works** because the player src is always on `*.kaltura.com`.
- The player iframe is rendered by Lucid's unfurl iframe at a 16:9 aspect ratio.
- Single account-wide Partner ID per customer (no per-video partner override).
