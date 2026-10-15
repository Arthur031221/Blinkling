# Design and integration

Blink is the product: a small character on the desktop that looks at what the user points at and answers beside it. The optional companion for Chrome and Edge adds what only a browser knows. This file describes the companion and how it joins the rest. Section N of the product spec and [V3-ARCHITECTURE.md](V3-ARCHITECTURE.md) describe Blink itself.

## What the companion does

The companion is a small Manifest V3 extension. Without it Blink works on any window. With it Blink gets four things, each behind one call on the host (`plugin/desktop/host.mjs`):

| Call            | What the browser supplies                                                                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `elements`      | The structure of the page under a screen point: kind, role, name, text, box in CSS pixels, parent, whether it is a secure field, and rendered Markdown, code, LaTeX or MathML for the block under it. |
| `fullPage`      | The page captured top to bottom in tiles (at most eight), with progress and cancel.                                                                                                                   |
| `translatePage` | In-place translation of the page text, and restoring the original.                                                                                                                                    |
| `openPdfReader` | Opens the page's PDF in the bundled reader when the browser's own viewer hides its text.                                                                                                              |

`elements` returns `null` with no companion, no browser window under the point, a browser-owned page (settings, extension stores, the built-in PDF viewer) or an incognito window the user has not allowed the companion in. Callers treat `null` as "no structure" and fall back to pixels.

Password and payment fields are marked `secure`. They never carry a name, a label, text or content, in the collector and again in the bridge, so a secret cannot leave the page even if one side is wrong.

## Path of a request

```
Blink ──host.elements──▶ plugin host ──/desktop-companion──▶ bridge ──WebSocket /extension──▶ extension worker ──▶ page script
```

The bridge is the only process the extension talks to. It listens on loopback, on the first free port of 43827 to 43836, and holds the one WebSocket from the extension. A request carries an id; a result with the same id answers it; `<kind>-cancel` stops one. Results for `elements` are cached for 1.5 seconds per 16-pixel bucket and capped at 400 elements.

The page script is injected on demand with `chrome.scripting.executeScript` from the service worker, so no content script runs on pages the user has not pointed at. It reads the DOM and the accessibility roles, skips `display:none` and invisible nodes, and does not read inside cross-origin frames.

## Local trust

The companion and the bridge prove to each other that they share one secret. The secret is never sent over the socket and the user never sees or types it.

1. The bridge creates a 256-bit secret on first use and stores it in `<runtime>/helper.json`, readable by the user only.
2. `extension_install` (or Blink's settings) opens the bridge's `/install` page with a single-use link code in the URL fragment, which is never sent to a server and is not shown.
3. The page posts the code to `/install/trust` on its own origin and receives the secret and the port. It hands both to the extension's content script, which runs only on `/install` of `127.0.0.1` and `localhost`. The content script passes them to the service worker, which checks that the sender is that tab, that its address is the install page and that the port matches before it stores the secret.
4. For every connection the bridge sends a random challenge; the extension answers with a nonce and an HMAC-SHA256 over both; the bridge answers with its own proof. A side that cannot produce its proof is dropped.

Residual risk: a process running as the same user that can read `helper.json`, or that binds a port in the range before the bridge does and then learns the secret, is inside the trust boundary. The companion does not defend against code that already has the user's files.

## Popup

The toolbar popup (`extension/popup.html`) shows whether the companion is connected and, one line each, what is missing: Blink not running, the bridge not found, or the setup page not yet opened. A **Wake Blink** button asks the bridge to open Blink (the `open` call on the host). The popup header shows the shared Wordmark component; under reduced motion it holds a still frame. All strings follow the browser language in nine locales.

## Permissions

`alarms` keeps the worker's connection alive, `scripting` injects the page script, `storage` keeps the secret and port. The host permission is `<all_urls>`, because Blink can point at any page and the page script must be injectable wherever the user points; nothing is read until a request arrives. Store reviewers and the privacy policy are told this plainly.

## Plugin upgrades and release verification

Existing installations need both a marketplace refresh and a plugin update:

```sh
claude plugin marketplace update blinkling
claude plugin update blinkling@blinkling
claude plugin list
```

The last command must show `blinkling@blinkling` at the released version in the intended scope. Use `--scope user`, `--scope project` or `--scope local` to pick one. In a running conversation, run `/reload-plugins` or restart Claude Code. See Anthropic's [plugin update instructions](https://code.claude.com/docs/en/discover-plugins#keep-plugins-updated) and [marketplace commands](https://code.claude.com/docs/en/plugins-reference).

An unpacked companion needs its own reload: run `/blinkling:install` again to refresh the folder `~/Blinkling-extension`, then reload its card on `chrome://extensions` or `edge://extensions`.

After `npm run build:plugin`, `node scripts/plugin-upgrade-test.mjs` drives the real Claude Code CLI in two temporary configuration directories. It installs an older package, refreshes and updates to the staged one, installs the staged one fresh, and checks the manifests, the packaged bundle bytes, the copied extension and the setup page with its automatic trust hand-off. It does not edit the account's installed plugins and does not call a model.

Public release verification remains a separate gate: before declaring a release done, verify the public marketplace commit, its packaged bundle and extension, and a fresh install and upgrade from that public source.
