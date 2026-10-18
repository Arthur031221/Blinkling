# Install Blinkling

You need Claude Code on the computer you are using, signed in. Blinkling runs on that computer and uses that Claude Code.

There is an [install guide with animated steps](https://arthur031221.github.io/Blinkling/install/) that picks your computer for you. The same three actions in text:

1. Paste this line into a terminal and press Enter:

   ```sh
   claude plugin marketplace add Arthur031221/Blinkling && claude plugin install blinkling@blinkling
   ```

   In Windows PowerShell 5, use `;` instead of `&&`.

2. In a terminal, start Claude Code with the Blink channel:

   ```text
   claude --dangerously-load-development-channels plugin:blinkling@blinkling
   ```

   The flag lets Blink's chat reach this session. Claude Code asks you to confirm it once. Without it Blink still works and answers from its own session.

   Then, in that session, run:

   ```text
   /blinkling:blinkling
   ```

3. On a Mac, allow **Screen Recording** for Blinkling once: System Settings, Privacy & Security. macOS also asks for **Accessibility** once, so the Ctrl key can start a pick. Allow it in the same place. Blinkling starts listening for the key as soon as you allow it, with no restart.

The first run downloads the desktop app for your computer from this repository's GitHub release, checks it against the SHA-256 hash pinned in the plugin, and starts it. Nothing else is asked. After that, Blinkling starts with Claude Code unless you turn that off in its settings.

## Gatekeeper and SmartScreen

Blinkling is not notarized by Apple and has no paid Windows certificate, so the installer handles what it can. It removes the quarantine flag from its own download on macOS, signs the app ad hoc and verifies the signature, and clears the Zone.Identifier stream on Windows. If macOS still says it cannot open Blinkling, open System Settings, Privacy & Security and choose **Open Anyway**. If Windows says it protected your PC, choose **More info**, then **Run anyway**. The install guide shows both with a short animation.

## Linux

Blinkling needs a desktop session (X11 or Wayland). Ubuntu 24.04 and later restrict unprivileged user namespaces, which Chromium's sandbox needs. Blinkling checks this itself and starts without the sandbox only when no working one exists; you do nothing.

## Upgrade

```sh
claude plugin marketplace update blinkling
claude plugin update blinkling@blinkling
```

Then run `/reload-plugins`. To let Blink's chat reach the session, restart Claude Code with `claude --dangerously-load-development-channels plugin:blinkling@blinkling` and run `/blinkling:blinkling`. The new plugin pins the new desktop build; the launcher installs it and keeps the previous one until the new one answers.

## Run a source checkout

Install Node.js 22 or newer and a recent Claude Code. In a terminal:

```sh
git clone https://github.com/Arthur031221/Blinkling.git
cd Blinkling
npm ci
npm run build:plugin
claude plugin validate .
node -p "require('./.claude-plugin/plugin.json').version"
claude --plugin-dir "$PWD"
```

The version check must print **3.2.5**. In the session that the last command opens, run `/blinkling:blinkling`. The `--plugin-dir` flag loads your checkout for that session, so use it each time you start Claude Code from source, and restart the session after rebuilding.

A checkout has no pinned release until the release workflow commits one. Until then `plugin/desktop/manifest.json` lists no builds, and `/blinkling:blinkling` says so instead of downloading anything.

## Limits

Blinkling works with desktop Claude Code on macOS, Windows and Linux. It does not run on a computer without a screen. If Claude Code is missing on the computer, Blinkling tells you how to install it. Browser settings pages, other apps' secure fields and password managers are never read.

## The browser helper (optional)

Start Claude Code with `claude --dangerously-load-development-channels plugin:blinkling@blinkling`, then run `/blinkling:blinkling` to start Blink on your desktop. The flag lets Blink's chat reach this session. Claude Code asks you to confirm it once. Without it Blink still works and answers from its own session. Blink works on any window by itself. The browser helper is optional: it adds the page's own structure, full-length page capture, page translation and the paper reader in Chrome or Edge. To add it, run `/blinkling:install`. The helper is copied to the stable `~/Blinkling-extension` directory and a setup page opens in your browser.

## Load the unpacked extension

Choose `~/Blinkling-extension` in desktop Chrome or Edge:

1. Open `chrome://extensions` or `edge://extensions` and turn on **Developer mode**.
2. Choose **Load unpacked**.
3. Select `~/Blinkling-extension`.

Browsers require a user to confirm an unpacked extension this way. Silent installation is available only through managed enterprise policy. The Developer mode banner remains visible, and updates require running the install command again and reloading the extension until a store listing is available.

If an older card loads another source folder, remove that card and load `~/Blinkling-extension` once. Browser cards keep their original source path; Reload cannot move an installation. Later updates refresh the visible folder and need only Reload.

`config/distribution.json` selects the install flow. Leave both URLs empty to show the unpacked instructions. After store approval, fill `chromeWebStoreUrl` and/or `edgeAddonsUrl` with the approved listing URL. The guide then shows the matching one-click store link in the install step. `BLINKLING_DISTRIBUTION_CONFIG` can point to the JSON file when Blinkling runs outside the repository checkout. The installer accepts only HTTPS listing URL patterns for the named stores.

## Connect the browser and host

The helper connects to Blink on the same computer by itself. Nobody types or sees a code or a port. When the setup page says it is connected, you are done. The toolbar button opens a small popup that says whether the helper is connected, what is missing, and has a **Wake Blink** button that starts the desktop app.

The setup page carries a one-time link code in its URL fragment, which keeps it out of HTTP request logs and visible page text. The helper's content script hands it to the extension, which trades it for a local secret held in `chrome.storage.local`. After that, the helper and the bridge prove to each other that they hold the secret before any page data moves. The bridge listens on `127.0.0.1` only. Status is checked at `GET /install/status?code=...`.

Blinkling and the helper run on the same computer. Claude Code on a remote host is not supported.

## Browser and page limits

Use desktop Chrome or Edge. Firefox and Safari are unsupported. Browser extensions cannot run on browser settings, the extension store, some built-in pages, or pages blocked by browser or organization policy. Blink still answers about those windows from the screen alone. The built-in PDF viewer cannot be inspected as an ordinary page; when you point at it, Blink opens the paper in the helper's own reader. Cross-origin frames inside a page are skipped. Password and payment fields are blanked before anything leaves the page.

The setup page and the helper's popup follow the browser's language in nine languages: English, 繁體中文, 简体中文, 日本語, 한국어, Español, Français, Deutsch and Português (Brasil).
