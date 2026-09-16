# Publishing to the Lucid Marketplace

How to get this extension from your local machine into Lucid's Marketplace. Everything happens
through your **Lucid Developer Portal login** — no API key.

> ⏱️ **Plan for the timeline:** Lucid reviews every submitted version and the review **can take up
> to 6 weeks**. Each new version you submit is reviewed again.

## Two distribution options — pick first

| | **Marketplace (public)** | **Private publishing** |
|---|---|---|
| Who can install | Every Lucid user | Only users on **your** Lucid account |
| Lucid review | Yes (up to 6 weeks) | **None** |
| Who publishes | App owner submits | Account **Admin/Owner** publishes |
| Good for | Distributing to other Kaltura customers | Internal Kaltura use / testing before going public |

> ⚠️ A published app **can't switch** between public and private later — decide up front. Since the
> goal is to share with **other Kaltura customers**, that means **Marketplace (public)**.
>
> A middle path while you wait or test: add specific people as **Tester** collaborators, or share
> the package with a customer to **"Install for my account"** privately, without a full public listing.

---

## Step 1 — Create the app & get its real package ID

1. Go to the **Lucid Developer Portal**: <https://lucid.app/developer#/packages>
2. Create/open your application. Its URL looks like
   `https://lucid.app/developer#/packages/<UUID>`.
3. Copy that **UUID** and paste it into the `id` field of [manifest.json](manifest.json),
   replacing the all-zeros placeholder.

## Step 2 — Bump the version

In [manifest.json](manifest.json), set `version` (e.g. `1.0.0`). **Every uploaded version must be
unique** — you can't re-upload the same version string.

## Step 3 — Bundle the package

From the **repo root** (where `manifest.json` lives):

```bash
npx lucid-package@latest bundle
```

This type-checks, compiles `bin/extension.js`, and produces **`package.zip`** ready for upload.
(It runs the release build for you; you don't need to run webpack separately.)

## Step 4 — Upload the version

1. In the Developer Portal, open your app → **Packages** tab.
2. Click **+ New Version**, upload the `package.zip` from Step 3.
3. The version appears in the packages table, ready to publish.

## Step 5 — Complete the Marketplace listing

App page → **Marketplace listing**. Fill in name, description, images/screenshots, and **support
information**. The **Publish** button stays disabled until required listing fields are done (hover
it to see what's missing). Content from [INSTALL.md](INSTALL.md) is a good basis for the
description.

## Step 6 — Open the review ticket (public only)

Create a Zendesk review ticket using Lucid's form:
<https://lucidchart.zendesk.com/hc/en-us/requests/new?ticket_form_id=13656325495060>
**Record the ticket ID** — you enter it during submission.

## Step 7 — Submit for review

1. App page → **Publishing** section → **Publish application**.
   - You need the **App owner** collaborator role for a first-time publish. (After the first
     publish, **Code editor** role can submit updates.)
2. Choose **publicly**, pick the package **version** from Step 4, enter the **Zendesk ticket ID**.
3. Submit. Track state in the **Publishing** section / apps table.

When Lucid approves, the app is released to the Marketplace automatically. Publishing a new
version later auto-transitions connected users to it (and you can instantly revert to any
previously approved version if something breaks).

---

## Requirements checklist (before you submit)

- [ ] Built on the Extension API (this app is ✓ — it has an extension package)
- [ ] Real package `id` from the portal in `manifest.json` (Step 1)
- [ ] Unique `version` in `manifest.json` (Step 2)
- [ ] `package.zip` uploaded as a version (Steps 3–4)
- [ ] Completed Marketplace listing with support info (Step 5)
- [ ] Zendesk review ticket created, ID in hand (Step 6 — public only)
- [ ] Requesting **minimum scopes** only — this app uses `READ`, `WRITE`, `SHOW_MODAL`. Reviewers
      check that requested scopes match what the code needs; don't add unused ones.

## Per-customer setup after they install

Because this ships to many customers, remember the install-time step: each customer's **Lucid
admin enters their own Kaltura Partner ID** in the extension's package settings. That's covered in
[INSTALL.md](INSTALL.md) — link it from your Marketplace listing's support section so customers
know to do it.

## Updating later

1. Change code → bump `version` in `manifest.json`.
2. `npx lucid-package@latest bundle` → upload as **+ New Version**.
3. Submit that version for review (Code editors can, once first publish is done).
4. On approval, connected users auto-update.
