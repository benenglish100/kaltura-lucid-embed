# First install — screen-by-screen

> **Disclaimer:** This integration is **not an official Kaltura application**. It is provided **as-is** and comes with **no guarantee, warranty, or official Kaltura support**.

A short walkthrough of what people see the first time. There are two roles:

- **Admin** (installs the extension and enters the Kaltura Partner ID) — done once per account.
- **End user** (adds videos to boards) — done any time after install.

---

## Part 1 — Admin: install & configure (once per account)

**Screen 1 — Install the extension**
The admin opens the extension from the Lucid Marketplace (or dev-loads it from the developer
account) and clicks **Install / Add to account**.

**Screen 2 — "Configure Kaltura Video" settings prompt**
Immediately after install, Lucid shows the package-settings form. Three fields:

```
┌─ Kaltura Video — settings ───────────────────────────────┐
│                                                           │
│  Kaltura Partner ID            [ 5171622            ]     │
│  Your Kaltura account (Partner) ID. Find it in the KMC    │
│  under Settings ▸ Integration Settings.                   │
│                                                           │
│  Default Player ID (uiConf ID) [ 52042012           ]     │
│  Used when a pasted link doesn't specify a player.        │
│                                                           │
│  Player CDN Domain (optional)  [ cdnapisec.kaltura.com ]  │
│                                                           │
│                              [ Cancel ]   [ Save ]        │
└───────────────────────────────────────────────────────────┘
```

- **Partner ID** is a fallback, used only for a pasted player URL that omits its partner ID.
- **Default Player ID** is a fallback, used only for a player URL that omits its player ID.
- **Player CDN Domain** is pre-filled — leave it unless Kaltura told you otherwise.

> Full embed codes carry all of this themselves, so these fields are optional for the normal
> embed-code workflow. They only matter for bare player URLs.

The admin clicks **Save**. These values are shared with **everyone on the account** — no one
else needs to configure anything.

> To change these later: **account settings ▸ Extensions / Integrations ▸ Kaltura Video ▸
> Settings**. Only account admins can edit them.

---

## Part 2 — End user: add a video to a board

**Screen 3 — Find the Kaltura button**
On any Lucidspark board, the **Kaltura Video** icon (teal play button) appears in the
**content dock** — the toolbar on the left edge of the canvas.

```
 ┌──┐
 │▷ │  ← Kaltura Video
 └──┘
```

**Screen 4 — Paste your video**
Clicking it opens the dialog:

```
┌─ Add a Kaltura video ────────────────────────────────────┐
│  Paste your Kaltura embed code                            │
│  Paste the <iframe> embed code from Share ▸ Embed. The    │
│  video will appear on your board and play in place.       │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ <iframe … src='https://cdnapisec.kaltura.com/p/…'>   │ │
│  │                                                       │ │
│  └─────────────────────────────────────────────────────┘ │
│                              [ Cancel ]  [ Add video ]    │
└───────────────────────────────────────────────────────────┘
```

Paste the full **`<iframe>` embed code** (MediaSpace → Share → Embed), or the **player URL** it
contains. Click **Add video** (or press ⌘/Ctrl + Enter).

**Screen 5 — The video is on the board**
A video block appears on the canvas. The user clicks it to **expand and play in place** at
16:9 — no new tab, no leaving the board. The block can be moved and resized like any other.

**Shortcut (no button):** pasting a Kaltura **player URL** straight onto the canvas also works —
Lucid recognizes the link and drops the same video block automatically. (The full `<iframe>`
snippet isn't a plain URL, so use the button for embed codes. Bare MediaSpace/oEmbed page links
aren't supported yet — use the embed code.)

---

## What users see if the account isn't configured yet

If someone pastes a bare **player URL** that's missing its partner or player ID before an admin
has set the fallback values:

- **If they're an admin** → they're taken straight to the settings form (Screen 2) to fill it in,
  then the video is added.
- **If they're not an admin** → a short message: *"Ask your Lucid admin to set the Kaltura
  Partner ID in the extension settings."*

**Embed codes work regardless** — they're self-contained, so they don't depend on the account
settings at all.
