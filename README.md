<h1 align="center"><img src="assets/blink-wave.gif" width="80" alt="" /><br /><picture><source media="(prefers-color-scheme: dark)" srcset="assets/brand/wordmark-dark.svg" /><img src="assets/brand/wordmark-light.svg" width="260" alt="Blinkling" /></picture></h1>

<p align="center"><strong>Blink lives in the corner of your screen. Hold Ctrl, click anything, get the answer.</strong></p>

<p align="center">
  <a href="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml"><img src="https://github.com/Arthur031221/Blinkling/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/Arthur031221/Blinkling/releases"><img src="https://img.shields.io/github/v/release/Arthur031221/Blinkling" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arthur031221/Blinkling" alt="License" /></a>
</p>

[English](README.md) | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Español](README.es.md) | [Français](README.fr.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

Blinkling puts Blink, a small green companion, in the corner of your screen, above every app. Hold Ctrl (Control on macOS) and click anything you want to ask about, or drag to take an area. The pick flies into Blink, you type your question, and the answer opens in a chat card beside Blink.

Blinkling only looks and explains. It never clicks or types in your apps.

It uses the Claude Code you are already signed in to on this computer.

<p align="center">
<img src="assets/pick.webp" alt="Ctrl and click a paragraph on an arXiv page. Its snapshot flies into Blink's mouth, the chat card opens and the answer streams in."><br>
Paper: Ctrl and click a paragraph, then read the answer.
</p>

<p align="center">
<img src="assets/translate.webp" alt="On an Arabic Wikipedia page, a picked passage goes into Blink, the Translate chip is pressed and the answer explains the passage in English."><br>
Translate: an Arabic passage, explained in English.
</p>

<p align="center">
<img src="assets/tour.webp" alt="On a dense public web page, Guide marks the parts of the page. Blink holds a pointer stick at the current step while Next moves through the steps."><br>
Guide: a hard page, one step at a time.
</p>

## Install

You need Claude Code, signed in on this computer. On Windows you also need Node.js 22 or newer from nodejs.org, which Blinkling does not download for you. macOS and Linux need nothing else.

Once you have installed anything, close the terminal and open a new one, so it can find the new program.

1. Paste this line into a terminal and press Enter:

   ```sh
   claude plugin marketplace add Arthur031221/Blinkling && claude plugin install blinkling@blinkling
   ```

2. Start Claude Code with Blink's channel:

   ```text
   claude --dangerously-load-development-channels plugin:blinkling@blinkling
   ```

   The flag lets Blink's chat and this terminal session see each other. Claude Code asks you to confirm it once. Without the flag Blink still works and answers from its own session.

   Then run this in that session:

   ```text
   /blinkling:blinkling
   ```

3. On a Mac, allow Screen Recording for Blinkling once, in System Settings under Privacy & Security. macOS asks for Accessibility once as well, so the Ctrl key can start a pick. Allow it in the same place.

If a Mac or Linux computer has no Node.js, Blinkling fetches its own private copy the first time it starts. That is about 45 MB, checked against a pinned SHA-256. If Claude Code says the Blinkling connection failed on that first start, wait a minute and run `/mcp`.

> [!NOTE]
> In Windows PowerShell 5, run the two commands one after the other instead of joining them with `&&`. Animated steps for your computer are in the [install guide](https://arthur031221.github.io/Blinkling/install/). Other ways to install, updates and the Linux sandbox are in [docs/INSTALL.md](docs/INSTALL.md).

## While you read

- Hold Ctrl and click a paragraph, a button or a picture, and Blink takes it.
- Hold Ctrl and drag to take an area.
- The chat card opens beside Blink with your pick, three quick asks and the model, effort and permission pickers. Enter sends the highlighted ask.
- Click Blink at any time to talk. The card opens with your conversation.

![Click Blink, type a question, and the answer streams into the chat card.](assets/ask.webp)

- Blink's menu has capture, guide, auto explain and settings. Auto explain stays off until you turn it on.
- The optional browser helper for Chrome or Edge gives Blink the structure of the page, so it knows which paragraph or button you pointed at. It also adds full page capture, in place translation and a PDF reader. Its toolbar button shows whether it is connected and wakes Blink. Without it Blink still works on every window.

## Shortcuts

| Shortcut               | Action                                            |
| ---------------------- | ------------------------------------------------- |
| Ctrl + click           | Ask about what is under the pointer               |
| Ctrl + drag            | Take an area                                      |
| Hotkey in Settings     | Open the capture overlay                          |
| Ctrl + Alt + Shift + B | Quit Blink (Ctrl + Option + Command + B on a Mac) |

You can change the keys in Settings.

## Sessions and privacy

Blink sends what you picked to your own signed-in Claude Code and shows the answer in the chat card. Anything you type in the terminal session that started Blink, and the answer to it, also shows up in Blink's chat.

The other direction, Blink's chat showing up in the terminal, goes through Claude Code's experimental channels. Those load only when Claude Code starts, so start it with `claude --dangerously-load-development-channels plugin:blinkling@blinkling`. `/blinkling:blinkling` prints the same command.

> [!IMPORTANT]
> The browser helper reads a page only when you point at it. It never reads password or payment fields, and it talks only to Blinkling on your own computer. Auto explain stays off until you turn it on.

Blinkling has no telemetry and no answer service of its own. What you pick goes to your Claude Code, and the provider's terms and usage charges apply. Browser settings, extension stores and the browser's own PDF viewer are protected pages, so Blink answers from the screen there. [Privacy](docs/SECURITY.md) | [Usage](docs/USAGE.md) | [Release notes](docs/releases/v3.2.7.md)

Assisted by Claude/Codex.
