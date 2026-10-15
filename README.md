<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg" /><img src="assets/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>Keep the answer beside the page.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Glimpselet/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Glimpselet/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Glimpselet" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Glimpselet" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet. Coming from the old plugin? Run `/plugin uninstall glimpselet@glimpselet` and `/plugin marketplace remove glimpselet`, then install Blinkling below.

Blink is a small companion in the corner of your screen. Hold Ctrl and click something to ask Claude Code about it.

> [!TIP]
> Blink uses the Claude Code you are already signed in to, on the same computer.

## Install

1. In Claude Code, install the plugin:

   ```text
   /plugin marketplace add Arthur031221/Glimpselet
   /plugin install blinkling@blinkling
   ```

2. Wake Blink. A three-step welcome appears the first time:

   ```text
   /blinkling:blinkling
   ```

3. Optional, for page structure, full-length capture, translation in place and the PDF reader: run `/blinkling:install`, turn on **Developer mode** at `chrome://extensions` (or `edge://extensions`), choose **Load unpacked** and select `~/Blinkling-extension`.

> [!NOTE]
> The helper is optional: Blink works without it. [Install and upgrade details](docs/INSTALL.md).

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

The plugin details must also list the `blinkling` and `install` skills and the `blinkling` MCP server. The packaged extension is in `bin/extension`. Its version must also be **2.1.0**.

The browser helper is optional. Run `/blinkling:install` to copy the built extension to the stable folder `~/Blinkling-extension`. In Chrome or Edge, open `chrome://extensions` or `edge://extensions`, turn on **Developer mode**, choose **Load unpacked**, and select that folder. The developer banner stays visible, and you must update the extension manually when a new version is available.

After upgrading the unpacked extension, run `/blinkling:install` again to refresh the stable folder, then click Reload on its card in the extensions page. When moving to `~/Blinkling-extension`, remove the old extension card and load this folder once.

For an installed plugin, run these commands, then `/reload-plugins` and `/blinkling:blinkling` in Claude Code. Check version **2.1.0** in the plugin list and extension card.

```sh
claude plugin marketplace update blinkling
claude plugin update blinkling@blinkling
claude plugin list
```

</details>

## While you read

- **Ask about what is under the pointer.** Hold Ctrl and click something, or drag to take an area. It flies into Blink and the mini composer opens. Enter sends.
- **Talk to Blink.** Click Blink to continue the last conversation in the mini composer. A long message or Shift+Enter opens the full composer.
- **Answers as bubbles.** They point at what they talk about. Scroll the wheel over Blink to read earlier ones.
- **The menu.** Hover Blink to open it: capture, guide, auto explain and settings. A guide numbers its steps on the page and can be saved as Markdown. Auto explain is off by default, adds at most two bubbles and never draws marks.
- **Browser helper (optional).** Its toolbar popup shows what is connected and has a **Wake Blink** button. It lets Blink read page structure, capture a full-length page, translate a page in place and open PDFs in a reader.

Capture also has a global hotkey, Ctrl+Shift+S (Cmd on macOS), which you can change in settings.

## Privacy

Blink asks the Claude Code you are signed in to on this computer, and nothing is captured until you ask. No telemetry or publisher-operated answer service. Chosen context and captures go to Claude Code and its provider; provider terms and usage charges apply. The helper talks only to the bridge on `127.0.0.1`, and password fields and input values are never read. Auto explain stays off until you turn it on.

[Privacy details](docs/SECURITY.md) | [Usage](docs/USAGE.md) | [Features](docs/FEATURES.md) | [Release notes](docs/releases/v2.1.0.md)

Assisted by Claude/Codex.
