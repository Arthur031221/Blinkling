# Browser helper design

The helper is a quiet Manifest V3 extension for Chrome and Edge. It has no chat of its own: Blink on the desktop is the product. The helper lets Blink see more of a browser page than pixels can show. This page records why it is built the way it is.

## What it does

- **Page structure for the locator.** `host.elements` returns the elements of the page under a screen point: kind, rectangle in viewport CSS pixels, role, name, text, parent and, for headings, code and math, a content block. Password and other secure fields are returned `secure: true` with no text and no value, and input values are never read. Same-origin iframes, cross-origin frames and shadow DOM are not collected.
- **Full-length capture.** `host.fullPage` scrolls the page, takes the visible area at each stop and returns tiles at the page's full width. Fixed and sticky headers are shown once. It is refused on a page with a password field.
- **Translate in place.** `host.translatePage` replaces the text of the live page and restores it on toggle. Blink's own Claude Code session translates in batches that keep every text id.
- **PDF reader.** `host.openPdfReader` opens the file in the helper's reader when the browser's viewer exposes no text.
- **Status popup.** The toolbar button opens a popup with one line each for the link to Claude Code, Blink being awake and site access, and a **Wake Blink** button. It is localized in nine languages following the browser language, and the sparkle in its header holds one still frame under reduced motion.

## How it connects

`extension_install` opens a local page on a random loopback port. The page carries a short-lived setup code in its URL fragment, so the code never reaches a request log or the page text. The helper's content script hands the code to the service worker, which opens a WebSocket to the bridge and exchanges the code for a 64-hex token, kept in `chrome.storage.session`. Nobody sees or types a code. The bridge checks the host header, the `chrome-extension://` origin and the one-use code or token. A replayed code is refused.

The bridge registers with the desktop host over an authenticated local RPC. Blink asks the host, the host asks the bridge, and the bridge sends one `request` per ask down the WebSocket: `elements`, `full-page`, `translate` and `pdf-reader`. A request is answered by exactly one `result` and can be cancelled. Without a connected helper, a restricted page or no Chrome or Edge window under the point, the answer is simply "not available" and Blink locates with the screenshot alone.

## Page access

Reading page structure and capturing the visible tab need `activeTab` or the optional `<all_urls>` grant; host permission for `127.0.0.1` alone is not enough. The popup's **Allow on all sites** requests the optional grant from a user gesture, once. Protected pages (browser settings, the extension store, policy-blocked sites) cannot be injected, and Blink works from the screenshot there.

## Translation on changing pages

A translation answer must keep every text id it was given. The content script reports writes separately from text that disappeared, changed on the site or became ineligible while the answer was running, and never applies an old translation to replaced text. Restore reverses only what the helper wrote.

## Upgrades

Existing installations need a marketplace refresh and a plugin update:

```sh
claude plugin marketplace update blinkling
claude plugin update blinkling@blinkling
claude plugin list
```

The last command must show `blinkling@blinkling` at version **2.1.0** in the intended scope. If several scopes are installed, use `--scope user`, `--scope project` or `--scope local` on the update command. In a running conversation, run `/reload-plugins` or restart Claude Code. See Anthropic's [plugin update and reload instructions](https://code.claude.com/docs/en/discover-plugins#keep-plugins-updated) and [marketplace commands](https://code.claude.com/docs/en/plugins-reference).

An unpacked extension needs its own reload. Rerun `/blinkling:install` to copy the packaged helper to the stable `~/Blinkling-extension` folder, then reload its card on `chrome://extensions` or `edge://extensions` and check version **2.1.0**.

After `npm run build:plugin`, run `node scripts/plugin-upgrade-test.mjs` to exercise the real CLI in two temporary Claude configuration directories. It stages the reporter's v1.1.1 package, installs it, refreshes and updates against the staged artifacts, and also installs in a fresh profile. Public release verification is a separate gate: check the actual public marketplace commit and a fresh install and upgrade before declaring a release complete.
