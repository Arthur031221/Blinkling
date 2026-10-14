# Install Glimpselet

Install the Glimpselet plugin with these two commands in Claude Code:

```text
/plugin marketplace add Arthur031221/Glimpselet
/plugin install glimpselet@glimpselet
```

Run `/glimpselet:glimpse` to connect and start. The welcome page has exactly three steps: install the extension, connect automatically, and open the bubble. The extension is copied to the stable `~/Glimpselet-extension` directory. If a desktop browser is available on the same computer, the installer opens the browser's extension page and reveals the folder.

## Upgrade to 2.1.0

Update both the marketplace and the installed plugin:

```sh
claude plugin marketplace update glimpselet
claude plugin update glimpselet@glimpselet
claude plugin list
```

Run `/reload-plugins` in Claude Code, or restart it, then run `/glimpselet:glimpse` again. Confirm the plugin list and the browser's extension card both show **2.1.0**. Reload the unpacked extension after the command refreshes `~/Glimpselet-extension`. On a remote host, download the new ZIP through the guide and replace the extracted files before reloading. Close the old bubble before updating.

## Advanced: run a source checkout

To run Glimpselet from source, install Node.js 22 or newer, npm, and Claude Code on the computer that will run the bridge. Clone the repository, or skip the first two commands if your terminal is already at the root of an existing checkout:

```sh
git clone https://github.com/Arthur031221/Glimpselet.git
cd Glimpselet
npm ci
npm run build:plugin
claude plugin validate .
node -p "require('./.claude-plugin/plugin.json').version"
node -p "require('./dist-extension/manifest.json').version"
claude --plugin-dir "$PWD" plugin list
claude --plugin-dir "$PWD" plugin details glimpselet
node -p "require('./bin/extension/manifest.json').version"
claude --plugin-dir "$PWD"
```

For this v2 checkout, all three version checks should print `2.1.0`. The plugin list should show `glimpselet@inline`, version `2.1.0`, enabled for the session. In the Claude Code session opened by the last command, run `/glimpselet:glimpse`. This loads the checkout for that session only; use `--plugin-dir` each time you want to run it. The published marketplace installation above remains the usual install path. This [session-local loading method](https://code.claude.com/docs/en/plugins/cli-reference#flags-that-load-a-plugin-for-one-session) is documented by Claude Code.

The plugin details must also report **glimpselet 2.1.0**, include the `glimpse` and `install` skills and the `glimpselet` MCP server. The packaged extension is at `bin/extension`; its version check must also print **2.1.0**.

For the browser extension, **Load unpacked** can use the checkout's `dist-extension` folder after the build, or the stable `~/Glimpselet-extension` folder copied by `/glimpselet:glimpse`. Check version `2.1.0` on its card at `chrome://extensions` or `edge://extensions`. If the checkout is on a remote host, download and extract its extension ZIP on the browser computer using the tunnel flow below.

## Load the unpacked extension

Choose `~/Glimpselet-extension` in desktop Chrome or Edge:

1. Open `chrome://extensions` or `edge://extensions` and turn on **Developer mode**.
2. Choose **Load unpacked**.
3. Select `~/Glimpselet-extension`.

Browsers require a user to confirm an unpacked extension this way. Silent installation is available only through managed enterprise policy. The Developer mode banner remains visible, and updates require running the install command again and reloading the extension until a store listing is available.

If an older card loads `~/.glimpselet/extension` or another source folder, remove that card and load `~/Glimpselet-extension` once. Browser cards keep their original source path; Reload cannot move an installation. Later updates refresh the visible folder and need only Reload.

`config/distribution.json` selects the install flow. Leave both URLs empty to show the three-step unpacked instructions. After store approval, fill `chromeWebStoreUrl` and/or `edgeAddonsUrl` with the approved listing URL. The guide then shows the matching one-click store link in the install step. `GLIMPSELET_DISTRIBUTION_CONFIG` can point to the JSON file when Glimpselet runs outside the repository checkout. The installer accepts only HTTPS listing URL patterns for the named stores.

## Zero-install desktop mode

Choose **Try without installing** in the welcome page to launch a separate browser with the extension already loaded and connected. You can also run `npm run build:extension`, then `node scripts/launch-browser.mjs`. The launcher works from the shipped `bin` directory without `node_modules`: when it cannot import Playwright, it installs pinned Playwright 1.64.0 under `~/.glimpselet/runtime`, then installs Chromium there on first use. It loads the extension into a separate persistent profile at `~/.glimpselet/chromium-profile`. Set `GLIMPSELET_TRIAL_URL` to open a page after launch. Close the Chromium window, or send the launcher SIGTERM, to stop it. This mode requires a graphical desktop on the same computer as Claude Code. A remote SSH host cannot open the browser window. Use the remote tunnel flow below.

## Connect the browser and host

On one computer, the extension connects to the loopback bridge automatically when it detects the welcome page. No port or pairing code is shown or entered. When the page says **Connected to your Claude Code**, choose **Open the bubble**. Chrome still requires a click in the companion window to open its floating window. The connection label is **已連到你的 Claude Code** in Traditional Chinese.

When Claude Code runs on a remote host, run the SSH local-forward command printed by `/glimpselet:glimpse` on the computer with the browser. The SSH command stays in the terminal instructions; the welcome page keeps its three steps. It has this form:

```sh
ssh -N -L 37115:127.0.0.1:37115 user@remote-host
```

The tunnel forwards the browser's local loopback connection to the host's loopback bridge. On the welcome page, **Download extension** downloads the extension files packaged with that installed plugin directly from its loopback bridge. The download requires the page's short-lived setup code and includes only regular files from the packaged extension directory. Extract it into a visible folder such as `Downloads/Glimpselet-extension` on the browser computer, then use **Load unpacked** in Chrome or Edge. Do not expose the bridge port publicly. The dedicated zero-install browser mode is unavailable on a remote host because it has no local desktop.

Your paired remote Claude Code login works through the SSH tunnel. You do not need to install Claude Code on the browser computer, and you do not need an Anthropic API key: no local Claude Code installation on the browser computer and no API key are required. Keep the SSH tunnel running on the browser computer and the bridge running on the remote host while using the extension.

Use direct API mode only if there is no usable Claude Code host, or if you choose it explicitly. Select it in extension settings and enter your own Anthropic API key. The key is held in `chrome.storage.session` and is not sent to the bridge.

## Browser and page limits

Use desktop Chrome, Edge, or another Chromium browser. Firefox and Safari are unsupported. Browser extensions cannot run on browser settings, the extension store, some built-in pages, or pages blocked by browser or organization policy. The built-in PDF viewer cannot be inspected as an ordinary page. Use **Open in Glimpselet reader** for PDF interaction. Non-browser apps can be screen-shared through the browser picker, but page overlays and page controls are only available on accessible web pages.

The welcome page and bubble support the same nine languages: English, 繁體中文, 简体中文, 日本語, 한국어, Español, Français, Deutsch and Português (Brasil). Blink appears above the three steps. The install step shows three browser clicks and a **Show in Finder** or **Show in Files** button for the visible extension folder. There are no practice exercises or replay tour.

The page carries a short-lived capability in its URL fragment, keeping it out of HTTP request logs and visible page text. Its bundled content script automatically completes an authenticated WebSocket handshake through the extension service worker and saves the token in `chrome.storage.session`. The worker does not open a bubble during connection. A separate click opens the companion window and preserves any supported language preference; otherwise it adopts the selected welcome language. Status is checked at `GET /install/status?code=...`. **Try without installing** sends a same-origin `POST /install/try?code=...&locale=...`; folder reveal sends `POST /install/reveal?code=...`. Both require a valid capability and exact origin. Reveal opens only Glimpselet's fixed local extension folder. Remote pages offer a ZIP instead of revealing a host folder and explain that the trial browser needs a local desktop.

The bridge prefers a verified channel into the current interactive Claude Code session. When channels are unavailable, the first bubble request automatically continues the most recently modified saved session in the current project through the Agent SDK and `claude --resume ID -p`. It excludes other worktrees. Later replies stay in that same conversation. If the project has no saved conversation, Glimpselet creates one. The advanced conversation picker remains available; selecting a conversation or starting a new one overrides automatic selection. See [channel setup and session limits](DESIGN.md#the-running-claude-code-conversation).
