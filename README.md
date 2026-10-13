# Glimpselet

[English](README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt-BR.md)

A small floating chat for asking Claude Code about the page or screen you are viewing. Read and translate web pages, get on-page guides, and capture an area to ask about it.

|           Glimpselet floating chat           |                 On-page guide example                  |
| :------------------------------------------: | :----------------------------------------------------: |
| ![Glimpselet floating chat](assets/demo.gif) | ![On-page guide example](assets/screenshots/guide.png) |

Requirements: recent Claude Code, signed in with your own subscription account, and a desktop Chromium browser such as Chrome or Edge.

Glimpselet starts a dedicated conversation. You can select a recent Claude Code session instead, which continues in a separate process. To send requests into the interactive session already open in your terminal, enable the channel preview. [Channel setup](docs/DESIGN.md#the-running-claude-code-conversation).

## Install

1. In Claude Code, add the marketplace and install the plugin:

   ```text
   /plugin marketplace add Arthur031221/Glimpselet
   /plugin install glimpselet@glimpselet
   ```

2. In your terminal, check `claude plugin list` shows Glimpselet **2.0.0**, then run `/glimpselet:glimpse` in Claude Code.

3. Follow the welcome guide to connect your browser. Choose **Try without installing** on a local desktop, or load and pair the extension in your own browser. For a remote Claude Code host, use the SSH command shown in the guide on the computer with your browser, then download the ZIP there and load and pair the extension. The no-install browser option is unavailable on a remote host. A successful pairing shows the connection mode and project in the Glimpselet panel.

### Advanced: load from source

From the checkout root on the computer running Claude Code, with Node.js 22 or newer, build and load the local plugin:

```sh
npm ci
npm run build:plugin
claude --plugin-dir "$PWD" plugin details glimpselet
node -p "require('./bin/extension/manifest.json').version"
claude --plugin-dir "$PWD"
```

Both version checks must show **2.0.0**, and the plugin details must list `glimpse` and the `glimpselet` MCP server. In the Claude Code session started by the last command, run `/glimpselet:glimpse` to open the welcome guide. This loads the checkout for that session only. Start later sessions with the same `--plugin-dir` command. [Local plugin loading](https://code.claude.com/docs/en/plugins/create#load-a-plugin-for-one-session). If Claude Code is remote, use the guide's SSH command, download its extension ZIP on the browser computer, and load the extracted folder there.

If your browser and Claude Code run on the same computer, the welcome guide copies the built extension to the stable folder `~/.glimpselet/extension`. In Chrome or Edge, open `chrome://extensions` or `edge://extensions`, turn on **Developer mode**, choose **Load unpacked**, and select that folder. The developer banner stays visible, and you must update the extension manually when a new version is available.

After upgrading an unpacked extension, close the old bubble and rerun `/glimpselet:glimpse` to refresh the stable folder. Click Reload on its card in the extensions page. If Claude Code is remote, download the new ZIP through the welcome guide, replace the extracted files on the browser computer, then reload its extension card.

## Already installed Glimpselet?

Run these commands in a terminal on the computer where Claude Code runs. Refreshing the marketplace alone does not guarantee the installed plugin has updated.

```sh
claude plugin marketplace update glimpselet
claude plugin update glimpselet@glimpselet
claude plugin list
```

In your open Claude Code session, run `/reload-plugins` (or restart Claude Code), then `/glimpselet:glimpse`. The list must show `glimpselet@glimpselet` at **2.0.0**, and the command must open the welcome and pairing guide. Check that Glimpselet also shows **2.0.0** on `chrome://extensions` or `edge://extensions` on the computer with your browser. If the plugin still shows 1.1.1, v2 may not yet be available from the public marketplace. An old screen-picker page is not the v2 welcome guide. [Upgrade verification](docs/DESIGN.md#plugin-upgrades-and-release-verification).

## What you can do

- Stream chat replies and ask follow-up questions with Opus, Sonnet, or Haiku.
- Capture a shared screen in the fullscreen view, or crop an area with the page overlay. Hold Shift and drag, then press Enter to capture or Esc to cancel.
- Get suggested questions that refresh as the page changes.
- Turn on optional Passive summaries, pause them with Alt+P, and see their cost per hour.
- Get a guide drawn over the page's actual controls, translate text in place and choose Restore to bring it back.
- Select text to Explain, Translate, or Ask about it, or open a PDF in the bundled reader and ask questions.

![Guide this page](assets/guide.gif)

![Selected area](assets/crop.gif)

| Shortcut                            | Action                                                          |
| ----------------------------------- | --------------------------------------------------------------- |
| Alt+Shift+G                         | Open Glimpselet and choose **Float** to open the floating chat. |
| Ctrl+Shift+S (Cmd+Shift+S on macOS) | Crop the current page or shared screen.                         |
| Ctrl+Shift+7 (Cmd+Shift+7 on macOS) | Crop from any app. Remap in `chrome://extensions/shortcuts`.    |
| Hold Shift                          | Start a crop in a Glimpselet bubble or page.                    |
| Alt+P                               | Pause Passive summaries.                                        |

On macOS, Cmd+Shift+5 opens the system screenshot tool. Shift works on web pages where Glimpselet has page access. A web page cannot listen for it in another app.

Float is the first action. The extension asks for page access when you use a feature that needs it. No provider API key is needed when you use your own logged-in Claude Code session. Direct API mode is optional and requires your own API key.

## Claude Code sessions

For the channel preview command and setup details, see [Claude Code sessions](docs/DESIGN.md#the-running-claude-code-conversation). Without the channel, Glimpselet can continue a selected session in a separate process. This is a parallel continuation. Do not use that session in the terminal at the same time because concurrent access can conflict.

## Limits and privacy

Glimpselet works in desktop Chrome, Edge, and other Chromium browsers. The developer banner remains until store distribution is available, and updates are manual. Some browser pages block access, including settings, extension stores, and restricted pages. Chrome's built-in PDF viewer is not accessible, so use the Glimpselet reader. Native apps provide pixels only, with no page text or overlays. Shift works in the bubble and on pages with site access. In another app, use the global crop shortcut. The floating window cannot pass clicks through.

Automatic suggested questions use page context only with your consent. To get page summaries without screen sharing, open a page, turn on **Passive**, and allow Glimpselet access to that site when prompted. Glimpselet inspects the page text and can summarize changes to its content or URL. Password fields and blocklisted sites pause automatic summaries.

While screen sharing, automatic screen-change summaries require a shared browser tab bound to the same inspected tab, with page access and the same privacy checks. If the shared source is a window, whole screen, native app, unknown, or inaccessible, automatic summaries pause. Manual questions and captures remain available.

[Install guide](docs/INSTALL.md) | [Usage](docs/USAGE.md) | [Design](docs/DESIGN.md) | [Privacy details](docs/SECURITY.md)

Assisted by Claude/Codex.
