<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br />Blinkling</h1>

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

3. Turn on **Developer mode** at `chrome://extensions` (or `edge://extensions`). Choose **Load unpacked** and select the folder shown by **Show in Files / Finder**. The welcome page connects automatically. Open the bubble.

> [!NOTE]
> Local desktop: **Try without installing** opens a separate Chromium profile. Remote host: run the printed SSH command on the browser computer. [Install and upgrade details](docs/INSTALL.md).

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

- **Capture whole screen** or **Pick an area**. Hold Shift and drag on a supported page or in the bubble. Enter confirms, Esc cancels. The bubble clears itself during shared-screen capture and returns afterwards.
- **Guide this page** gives a page overview and a Next/Back tour of reading regions and controls.
- Select text to **Ask**, **Explain** or **Translate**. Translate a page in place and restore it, or open a PDF in the bundled reader.
- **Auto explain** suggests up to three questions and summarizes changes. Alt+P pauses it. Choose Opus, Sonnet or Haiku for chat.

![arXiv: select an abstract, ask about it, then translate it into Traditional Chinese.](assets/arxiv.gif)

_arXiv: select an abstract, ask about it, then translate it into Traditional Chinese._

Recorded with the real extension on live sites and Claude Code replies. Waiting time is shortened. No page content or answers are staged.

## Shortcuts

| Shortcut     | Action                |
| ------------ | --------------------- |
| Alt+Shift+G  | Open the bubble       |
| Ctrl+Shift+S | Crop in the browser   |
| Ctrl+Shift+7 | Crop from another app |

macOS uses Cmd instead of Ctrl. Remap at `chrome://extensions/shortcuts`. Shift works only on supported pages and in the bubble.

## Sessions and privacy

Blinkling uses a verified live Claude Code channel when available. Otherwise it continues the latest saved project conversation in a separate process. Avoid using that same transcript in the terminal concurrently. [Channel setup and limits](docs/DESIGN.md#the-running-claude-code-conversation).

> [!IMPORTANT]
> Auto explain can summarize page changes **without screen sharing** after consent and site access. Password fields and your blocklist pause automatic page summaries and suggestions. Screen summaries use a shared browser tab bound to the same inspected tab and the same checks. A shared monitor or app needs **separate consent for each share**. Its pixels cannot be checked for password fields or blocked sites. Unknown sources remain paused.
> Loading or inaccessible embedded pages also pause automatic page requests.

No telemetry or publisher-operated answer service. Chosen context and captures go to your backend. Provider terms and usage charges apply. Native apps provide pixels only. Browser settings, extension stores and protected pages block page tools. Native window opacity and click-through have browser limits. [Privacy](docs/SECURITY.md) | [Usage](docs/USAGE.md) | [Release notes](docs/releases/v2.1.0.md)

Assisted by Claude/Codex.
