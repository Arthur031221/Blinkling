# Install Blinkling

Install the Blinkling plugin with these two commands in Claude Code:

```text
/plugin marketplace add Arthur031221/Glimpselet
/plugin install blinkling@blinkling
```

Blinkling is the Blink desktop companion. It works as soon as the plugin is installed: run `/blinkling:blinkling` to wake Blink. The browser helper is optional. It lets Blink read page structure for the locator, capture a full-length page, translate a page in place and open PDFs in the reader.

## Upgrade to 2.1.0

Update both the marketplace and the installed plugin:

```sh
claude plugin marketplace update blinkling
claude plugin update blinkling@blinkling
claude plugin list
```

Run `/reload-plugins` in Claude Code, or restart it, then run `/blinkling:blinkling` again. Confirm the plugin list and the browser's extension card both show **2.1.0**. Reload the unpacked helper after the command refreshes `~/Blinkling-extension`.

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

For this v2 checkout, all three version checks should print `2.1.0`. The plugin list should show `blinkling@inline`, version `2.1.0`, enabled for the session. In the Claude Code session opened by the last command, run `/blinkling:blinkling`. This loads the checkout for that session only; use `--plugin-dir` each time you want to run it. The published marketplace installation above remains the usual install path. This [session-local loading method](https://code.claude.com/docs/en/plugins/cli-reference#flags-that-load-a-plugin-for-one-session) is documented by Claude Code.

The plugin details must also report **blinkling 2.1.0**, include the `blinkling` and `install` skills and the `blinkling` MCP server. The packaged extension is at `bin/extension`; its version check must also print **2.1.0**.

For the browser extension, **Load unpacked** can use the checkout's `dist-extension` folder after the build, or the stable `~/Blinkling-extension` folder copied by `/blinkling:blinkling`. Check version `2.1.0` on its card at `chrome://extensions` or `edge://extensions`.

## Load the browser helper

Run `/blinkling:install` in Claude Code. It copies the helper to `~/Blinkling-extension`, opens the browser's extension page and a short guide. Then choose `~/Blinkling-extension` in desktop Chrome or Edge:

1. Open `chrome://extensions` or `edge://extensions` and turn on **Developer mode**.
2. Choose **Load unpacked**.
3. Select `~/Blinkling-extension`.

Browsers require a user to confirm an unpacked extension this way. Silent installation is available only through managed enterprise policy. The Developer mode banner stays visible, and updates need `/blinkling:install` again and a reload of the extension until a store listing is available.

If an older card loads `~/.blinkling/extension` or another source folder, remove that card and load `~/Blinkling-extension` once. Browser cards keep their original source path; Reload cannot move an installation. Later updates refresh the visible folder and need only Reload.

`config/distribution.json` selects the install flow. Leave both URLs empty to show the three-step unpacked instructions. After store approval, fill `chromeWebStoreUrl` and/or `edgeAddonsUrl` with the approved listing URL. The guide then shows the matching one-click store link in the install step. `BLINKLING_DISTRIBUTION_CONFIG` can point to the JSON file when Blinkling runs outside the repository checkout. The installer accepts only HTTPS listing URL patterns for the named stores.

## How the helper connects

The helper pairs with Blinkling on its own. The guide page carries a short-lived setup link in its URL fragment, which keeps it out of request logs and page text, and the helper completes the handshake and keeps the resulting token in `chrome.storage.session`. Nobody sees or types a code. After the browser or the bridge restarts, run `/blinkling:install` once more.

Click the helper's toolbar button to see its status in one line each: connected, and what is missing (the link to Claude Code, Blink being awake, access to the current site). **Wake Blink** opens the companion. **Allow on all sites** grants the one-time site access that full-length capture and page structure need. The popup and the guide follow the browser language in the nine supported languages: English, 繁體中文, 简体中文, 日本語, 한국어, Español, Français, Deutsch and Português (Brasil).

The helper only talks to the Blinkling bridge on `127.0.0.1` of the same computer. Do not expose the bridge port.

## Browser and page limits

Use desktop Chrome or Edge, or another Chromium browser. Firefox and Safari are unsupported. Extensions cannot run on browser settings, the extension store, some built-in pages, or pages blocked by browser or organization policy; Blink then locates with the screenshot only. Password and other secure fields are reported without any text. The built-in PDF viewer cannot be inspected as an ordinary page; the helper opens such files in its own reader.
