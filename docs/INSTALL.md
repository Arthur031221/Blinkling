# Install Blinkling

Install the Blinkling plugin with these two commands in Claude Code:

```text
/plugin marketplace add Arthur031221/Glimpselet
/plugin install blinkling@blinkling
```

Run `/blinkling:blinkling` to start Blink on your desktop. Blink works on any window by itself. The browser helper is optional: it adds the page's own structure, full-length page capture, page translation and the paper reader in Chrome or Edge. To add it, run `/blinkling:install`. The helper is copied to the stable `~/Blinkling-extension` directory and a setup page opens in your browser.

## Upgrade to 2.1.0

Update both the marketplace and the installed plugin:

```sh
claude plugin marketplace update blinkling
claude plugin update blinkling@blinkling
claude plugin list
```

Run `/reload-plugins` in Claude Code, or restart it, then run `/blinkling:blinkling` again. Confirm the plugin list and the browser's extension card both show **2.1.0**. Reload the unpacked extension after `/blinkling:install` refreshes `~/Blinkling-extension`.

## Advanced: run a source checkout

To run Blinkling from source, install Node.js 22 or newer, npm, and Claude Code on the computer that will run the bridge. Clone the repository, or skip the first two commands if your terminal is already at the root of an existing checkout:

```sh
git clone https://github.com/Arthur031221/Glimpselet.git
cd Blinkling
npm ci
npm run build:plugin
claude plugin validate .
node -p "require('./.claude-plugin/plugin.json').version"
node -p "require('./dist-extension/manifest.json').version"
claude --plugin-dir "$PWD" plugin list
claude --plugin-dir "$PWD" plugin details blinkling
node -p "require('./bin/extension/manifest.json').version"
claude --plugin-dir "$PWD"
```

For this checkout, all three version checks should print `2.1.0`. The plugin list should show `blinkling@inline`, version `2.1.0`, enabled for the session. In the Claude Code session opened by the last command, run `/blinkling:blinkling`. This loads the checkout for that session only; use `--plugin-dir` each time you want to run it. The published marketplace installation above remains the usual install path. This [session-local loading method](https://code.claude.com/docs/en/plugins/cli-reference#flags-that-load-a-plugin-for-one-session) is documented by Claude Code.

The plugin details must also report **blinkling 2.1.0**, include the `blinkling` and `install` skills and the `blinkling` MCP server. The packaged extension is at `bin/extension`; its version check must also print **2.1.0**.

For the browser extension, **Load unpacked** can use the checkout's `dist-extension` folder after the build, or the stable `~/Blinkling-extension` folder copied by `/blinkling:blinkling`. Check version `2.1.0` on its card at `chrome://extensions` or `edge://extensions`.

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
