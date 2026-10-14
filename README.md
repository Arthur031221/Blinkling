<h1 align="center"><img src="assets/logo.svg" width="72" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/wordmark-dark.svg" /><img src="assets/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>Keep the answer beside the page.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Blinkling/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Blinkling" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Blinkling" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Formerly Glimpselet. Coming from the old plugin? Run `/plugin uninstall glimpselet@glimpselet` and `/plugin marketplace remove glimpselet`, then install Blinkling below.

A small floating Claude Code chat. Ask about a page, capture an area, follow a guide, or translate a passage.

> [!TIP]
> Use your own signed-in Claude Code account and desktop Chrome or Edge. No API key is needed for Claude Code.

![Google Flights: a page guide, then a question about booking a round trip.](assets/demo.gif)

_Google Flights: a page guide, then a question about booking a round trip._

## Install

You need Claude Code, signed in. Then:

1. Paste this line into a terminal and press Enter:

   ```sh
   claude plugin marketplace add Arthur031221/Blinkling && claude plugin install blinkling@blinkling
   ```

2. In Claude Code, run:

   ```text
   /blinkling:blinkling
   ```

3. On a Mac, allow **Screen Recording** for Blinkling once: System Settings, Privacy & Security.

> [!NOTE]
> In Windows PowerShell 5, use `;` instead of `&&`. Animated steps for your computer: [install guide](https://arthur031221.github.io/Blinkling/install/). Other ways to install, updates and the Linux sandbox: [docs/INSTALL.md](docs/INSTALL.md).

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
