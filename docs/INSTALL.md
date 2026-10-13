# Install Glimpselet

Install the Glimpselet plugin with these two commands in Claude Code:

```text
/plugin marketplace add Arthur031221/Glimpselet
/plugin install glimpselet@glimpselet
```

Run `/glimpselet:glimpse` to pair and start. The extension is copied to the stable `~/.glimpselet/extension` directory. If a desktop browser is available on the same computer, the installer opens the browser's extension page and reveals the folder.

## Load the unpacked extension

Choose `~/.glimpselet/extension` in desktop Chrome or Edge:

1. Open `chrome://extensions` or `edge://extensions` and turn on **Developer mode**.
2. Choose **Load unpacked**.
3. Select `~/.glimpselet/extension`.

Browsers require a user to confirm an unpacked extension this way. Silent installation is available only through managed enterprise policy. The Developer mode banner remains visible, and updates require running the install command again and reloading the extension until a store listing is available.

`config/distribution.json` selects the install flow. Leave both URLs empty to show the three-step unpacked instructions. After store approval, fill `chromeWebStoreUrl` and/or `edgeAddonsUrl` with the approved listing URL. The guide then shows the matching one-click store link and moves source loading under Advanced. `GLIMPSELET_DISTRIBUTION_CONFIG` can point to the JSON file when Glimpselet runs outside the repository checkout. The installer accepts only HTTPS listing URL patterns for the named stores.

## Zero-install desktop mode

Run `npm run build:extension`, then `node scripts/launch-browser.mjs`. The launcher works from the shipped `bin` directory without `node_modules`: when it cannot import Playwright, it installs pinned Playwright 1.64.0 under `~/.glimpselet/runtime`, then installs Chromium there on first use. It loads the extension into a separate persistent profile at `~/.glimpselet/chromium-profile`. Set `GLIMPSELET_TRIAL_URL` to open a page after launch. Close the Chromium window, or send the launcher SIGTERM, to stop it. This mode requires a graphical desktop on the same computer as Claude Code. A remote SSH host cannot open the browser window. Use the remote tunnel flow below.

## Connect the browser and host

On one computer, the extension connects to the loopback bridge directly. `/glimpselet:glimpse` prints a one-use pairing code. Open the extension, enter the bridge port and code, and pair. Confirm the connection in the extension panel.

When Claude Code runs on a remote host, run the SSH local-forward command printed by `/glimpselet:glimpse` on the computer with the browser. The welcome page also shows and can copy the command when `/install/status?code=...` returns a `tunnelCommand` string. It has this form:

```sh
ssh -N -L 37115:127.0.0.1:37115 user@remote-host
```

The tunnel forwards the browser's local loopback connection to the host's loopback bridge. On the welcome page, **Download extension ZIP** downloads the extension files packaged with that installed plugin directly from its loopback bridge. The download requires the page's short-lived setup code and includes only regular files from the packaged extension directory. Extract it on the browser computer, then use **Load unpacked** in Chrome or Edge. Do not expose the bridge port publicly. The dedicated zero-install browser mode is unavailable on a remote host because it has no local desktop.

When the browser computer has no local CLI, choose direct API mode in extension settings and enter an API key. The key is held in `chrome.storage.session` and is not sent to the bridge.

## Browser and page limits

Use desktop Chrome, Edge, or another Chromium browser. Firefox and Safari are unsupported. Browser extensions cannot run on browser settings, the extension store, some built-in pages, or pages blocked by browser or organization policy. The built-in PDF viewer cannot be inspected as an ordinary page. Use **Open in Glimpselet reader** for PDF interaction. Non-browser apps can be screen-shared through the browser picker, but page overlays and page controls are only available on accessible web pages.

The welcome page has an English / 繁體中文 switch and an eight-step practice tour. Progress is saved in that browser and **Replay tour** clears it. Pairing status is checked at `GET /install/status?code=...`. The page moves to the tour when the bridge reports `connected: true` and shows the reported mode. The zero-install button sends `POST /install/try?code=...`. It is hidden when the reported mode is remote. Each **Try** button opens the bundled article or PDF and sends a same-origin `glimpselet:tutorial-action` message with version, action, step, and optional pairing code. The article accepts messages only from its same-origin opener, checks the action against the eight supported steps, then dispatches a `glimpselet:tutorial-action` DOM `CustomEvent` on `window`. The extension content script should listen for this event and relay its `detail` to the extension runtime. The payload shape is `{ type: "glimpselet:tutorial-action", version: 1, action, step, code }`. The article displays the prompt but does not grant permissions or send page contents to the bridge. Pop-up blocking is reported beside the Try button.
