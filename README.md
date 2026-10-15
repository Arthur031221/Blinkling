<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg" /><img src="assets/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>Keep the answer beside the page.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Glimpselet/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Glimpselet" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Glimpselet" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet. Coming from the old plugin? Run `/plugin uninstall glimpselet@glimpselet` and `/plugin marketplace remove glimpselet`, then install Blinkling below.

A small floating Claude Code chat. Ask about a page, capture an area, follow a guide, or translate a passage.

> [!TIP]
> Use your own signed-in Claude Code account and desktop Chrome or Edge. No API key is needed for Claude Code.

![Google Flights: a page guide, then a question about booking a round trip.](assets/demo.gif)

_Google Flights: a page guide, then a question about booking a round trip._

## Install

1. In Claude Code, install the plugin:

   ```text
   /plugin marketplace add Arthur031221/Glimpselet
   /plugin install blinkling@blinkling
   ```

2. Open the welcome guide:

   ```text
   /blinkling:blinkling
   ```

3. Turn on **Developer mode** at `chrome://extensions` (or `edge://extensions`). Choose **Load unpacked** and select the folder shown by **Show in Files / Finder**. The welcome page connects automatically. Then click the Blink button in the toolbar to see that it is connected.

> [!NOTE]
> The browser helper is optional: Blink works on any window without it. For Chrome or Edge, run `/blinkling:install`, then load `~/Blinkling-extension` as in step 3. [Install and upgrade details](docs/INSTALL.md).

### Advanced: load from source

<details>
<summary>Source checkout and manual updates</summary>

To run a checkout, install Node.js 22 or newer and a recent Claude Code on the computer that runs Claude Code. In a terminal, skip the first two commands if you are already at the root of your checkout:

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

Both version checks must print **2.1.0**, and the plugin list must show `blinkling@inline` at **2.1.0**, enabled for this session. In the Claude Code session opened by the last command, run `/blinkling:blinkling`. The `--plugin-dir` flag loads your checkout for that session. Use it each time you launch Claude Code from source, and restart that session after rebuilding. The built extension is in `dist-extension` inside the checkout.

The plugin details must also list the `blinkling` and `install` skills and the `blinkling` MCP server. The packaged extension is in `bin/extension`. Its version must also be **2.1.0**. If Claude Code is remote, use the guide's SSH command, download its extension ZIP on the browser computer, and load the extracted folder there.

If your browser and Claude Code run on the same computer, the welcome guide copies the built extension to the stable folder `~/Blinkling-extension`. In Chrome or Edge, open `chrome://extensions` or `edge://extensions`, turn on **Developer mode**, choose **Load unpacked**, and select that folder. The developer banner stays visible, and you must update the extension manually when a new version is available.

After upgrading an unpacked extension, close the old bubble and rerun `/blinkling:blinkling` to refresh the stable folder. Click Reload on its card in the extensions page. If Claude Code is remote, download the new ZIP through the welcome guide, replace the extracted files on the browser computer, then reload its extension card. When moving to `~/Blinkling-extension`, remove the old extension card and load this folder once.

For an installed plugin, run these commands, then `/reload-plugins` and `/blinkling:blinkling` in Claude Code. Check version **2.1.0** in the plugin list and extension card before reopening the bubble.

```sh
claude plugin marketplace update blinkling
claude plugin update blinkling@blinkling
claude plugin list
```

</details>

## While you read

- **Hold Ctrl and click** a paragraph, button or picture on your screen: Blink takes it and asks Claude Code about it. **Hold Ctrl and drag** to take an area instead.
- A small composer opens with three quick asks. Enter sends the highlighted one. Click Blink any time to pick the conversation up again.
- Answers arrive as bubbles that point at what they talk about. Blink's menu has capture, guide, auto explain (off until you turn it on) and settings.
- The optional browser helper for Chrome or Edge adds the page's own structure, so Blink knows which paragraph or button you pointed at, plus full-length page capture, translating the page in place and a reader for PDFs. Its toolbar button shows whether it is connected and wakes Blink. Without it Blink still works on every window.

## Shortcuts

| Shortcut           | Action                              |
| ------------------ | ----------------------------------- |
| Ctrl + click       | Ask about what is under the pointer |
| Ctrl + drag        | Take an area                        |
| Hotkey in Settings | Open the capture overlay            |

Pick the keys in Settings.

## Sessions and privacy

Blink sends what you picked to your own signed-in Claude Code and shows the answer beside the thing it is about. Avoid using the same conversation in a terminal at the same time.

> [!IMPORTANT]
> The browser helper reads a page only when you point at it. Password and payment fields are never read, and it talks only to Blinkling on your own computer. Auto explain is off until you turn it on.

No telemetry or publisher-operated answer service. What you pick goes to your Claude Code; provider terms and usage charges apply. Browser settings, extension stores and the browser's own PDF viewer are protected pages: Blink answers from the screen there. [Privacy](docs/SECURITY.md) | [Usage](docs/USAGE.md) | [Release notes](docs/releases/v2.1.0.md)

Assisted by Claude/Codex.
