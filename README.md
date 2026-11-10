# DONELines homepage mockups: client review site

Three homepage directions for DONELines, shared with the client on free GitHub Pages behind a password. Clients can pin comments to any part of a page.

- **Password gate.** Each page is encrypted with AES-256-GCM. The key comes from the password (PBKDF2-SHA256, 600k iterations). The browser decrypts the page after the password is entered, so the public repo only ever holds ciphertext.
- **Pinned comments.** Comments are anchored to the element clicked, so they stay put at any screen size. Each comment has a reaction: 👍 like, 👎 don't like, or 💬 note. They are stored in a Google Sheet through a free Apps Script web app.

## Folder layout

| Path | What it is | In the public repo? |
|---|---|---|
| `design-source/` | The Claude Design canvas files (`*.dc.html`) | **No** (gitignored) |
| `mockups/` | Plain standalone pages: `index.html`, `a-calm.html`, `b-bold.html`, `c-warm.html` | **No** (gitignored) |
| `feedback.config.json` | Comments endpoint URL + shared token | **No** (gitignored) |
| `docs/` | Built, encrypted site, which GitHub Pages serves | Yes |
| `feedback/feedback.js` | Comment layer, built into every mockup page | Yes |
| `gate/unlock.html` | Password page wrapped around each encrypted page | Yes |
| `gate/salt.json` | Key salt (not secret). Keeping it fixed means "Remember me" survives rebuilds | Yes |
| `apps-script/Code.gs` | Google Sheets backend for comments | Yes |
| `tools/` | `export-dc.mjs`, `build.mjs`, `serve.mjs` | Yes |

The unencrypted pages exist only on this machine. Back them up somewhere private. A **private** GitHub repo is free; only Pages on a private repo costs money.

Requires Node 20+.

## One-time setup

### 1. Comments backend (about 5 min)

1. Create a new Google Sheet, for example "DONELines mockup feedback".
2. Open **Extensions → Apps Script**, delete the sample code, and paste in `apps-script/Code.gs`.
3. Set `TOKEN` in that file to the `token` value in `feedback.config.json`.
4. Optionally, set `NOTIFY_EMAIL` to get an email for each new comment.
5. Save, then go to **Deploy → New deployment → Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Approve the permission prompt. Google warns that the app is unverified because it's your own script. Choose **Advanced → Go to (project)**.
7. Copy the **Web app URL**, which ends in `/exec`, into `"endpoint"` in `feedback.config.json`.

> If you change `Code.gs` later, use **Deploy → Manage deployments → Edit → New version** so the URL stays the same.

### 2. GitHub Pages

1. Create a **public** repo on GitHub, for example `donelines-preview`. Any name works, but nothing in it can be read without the password anyway.
2. Build the site. This step is in the next section.
3. Commit and push. Double-check that `git status` doesn't list `mockups/`, `design-source/` or `feedback.config.json`.
4. In the repo, go to **Settings → Pages → Build and deployment → Deploy from a branch**. Pick `main` and the **`/docs`** folder.
5. The site appears at `https://<your-user>.github.io/<repo>/` within a minute or two.

## Build and publish

```bash
node tools/build.mjs
```

The script asks for the password twice. Use at least 10 characters; three or four random words work well. To skip the prompt, set `DONELINES_PASSWORD`. The script then:

1. adds the comment layer to each page;
2. encrypts every page into `docs/`;
3. refuses to finish if any readable mockup text, the endpoint or the token shows up in the output.

Commit `docs/` and push to publish.

After changing the mockups in Claude Design, copy the new `*.dc.html` files into `design-source/`, then run:

```bash
node tools/export-dc.mjs && node tools/build.mjs
```

If you change the password, everyone, including people who ticked "Remember on this device", must enter the new one.

## Sending it to the client

- Send the link and the password **separately**, for example the link by email and the password by text.
- The landing page explains how to comment. In short: open a direction, click **+ Comment**, click part of the page, pick a reaction, and post.

## Reading feedback

- **On the pages.** Use **Comments** in the bottom bar to see the list for that page. **Resolve** hides a comment; tick **Show resolved** to see it again.
- **In the Sheet.** One row per comment, with the page, author, reaction, text and the element it's on. Setting `resolved` to `TRUE` in the Sheet also hides the pin.
- **Polling.** Pages check for new comments every 60 seconds, so you and the client see each other's notes without reloading.

## Local testing

```bash
node tools/build.mjs --out .preview --endpoint http://localhost:8787/api
```

```bash
node tools/serve.mjs .preview 8787
```

Then open http://localhost:8787. The local server includes an in-memory stand-in for the Sheet API. With no endpoint configured, comments are kept only in that browser ("local preview mode").

## What the gate does and doesn't do

- **Protects:** the page content. Without the password the files are unreadable, even to someone browsing the repo.
- **Protects:** the comments endpoint and token. They are inside the encrypted pages, so only people with the password can read or post comments.
- **Shared password.** There is one password for everyone, and anyone you give it to can pass it on. To cut off access, rebuild with a new password.
- **Strength.** It is only as strong as the password. Avoid short or guessable ones.
- **Not searchable.** Pages carry `noindex`, and `robots.txt` blocks crawlers. The repo itself is still public, but it holds only ciphertext.
