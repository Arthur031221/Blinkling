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

For your own desktop browser, the extension is kept in the stable folder `~/.glimpselet/extension`. In Chrome or Edge, open `chrome://extensions` or `edge://extensions`, turn on **Developer mode**, choose **Load unpacked**, and select that folder. The developer banner stays visible, and you must update the extension manually when a new version is available.

## Upgrading from v1

If Glimpselet is already installed, refresh the marketplace and update the plugin from your terminal:

```sh
claude plugin marketplace update glimpselet
claude plugin update glimpselet@glimpselet
claude plugin list
```

Restart Claude Code, or run `/reload-plugins` in the open session. Check that `claude plugin list` shows Glimpselet **2.0.0**, then run `/glimpselet:glimpse` again. It should open the welcome and pairing guide. If the installed version is still 1.x, v2 may not be published at the marketplace source yet; repeating Install does not upgrade a cached plugin.

For an unpacked extension, the guide copies the new files to `~/.glimpselet/extension`. Reload Glimpselet in `chrome://extensions` or `edge://extensions` and check its version is **2.0.0**. With SSH, download the new ZIP through the guide on the browser computer, extract it into the folder you previously loaded, then reload. The remote host cannot open the zero-install browser on your computer.

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

On macOS, Cmd+Shift+5 opens the system screenshot tool. Shift in a webpage works only on Glimpselet pages. It cannot listen in other apps.

Float is the first action. The extension asks for page access when you use a feature that needs it. No provider API key is needed when you use your own logged-in Claude Code session. Direct API mode is optional and requires your own API key.

## Claude Code sessions

For the channel preview command and setup details, see [Claude Code sessions](docs/DESIGN.md#the-running-claude-code-conversation). Without the channel, Glimpselet can continue a selected session in a separate process. This is a parallel continuation. Do not use that session in the terminal at the same time because concurrent access can conflict.

## Limits and privacy

Glimpselet works in desktop Chrome, Edge, and other Chromium browsers. The developer banner remains until store distribution is available, and updates are manual. Some browser pages block access, including settings, extension stores, and restricted pages. Chrome's built-in PDF viewer is not accessible, so use the Glimpselet reader. Native apps provide pixels only, with no page text or overlays. Shift works only in Glimpselet's own browser surfaces, not in another app. The floating window cannot pass clicks through.

Automatic suggested questions use page context only with your consent. Passive summaries are opt-in and require a shared, inspected browser tab. If the shared source is a window, screen, native app, unknown, or otherwise inaccessible, automatic summaries pause. Manual questions and captures remain available.

[Install guide](docs/INSTALL.md) | [Usage](docs/USAGE.md) | [Design](docs/DESIGN.md) | [Privacy details](docs/SECURITY.md)

Assisted by Claude/Codex.
