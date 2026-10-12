# Glimpselet

Glimpselet is a small chat that stays above other windows and connects to an existing Claude Code session. It can read and translate accessible web pages, draw guides on the real page, and capture page areas or shared-screen frames for questions.

![Glimpselet's floating chat](assets/demo.gif)

![Guide circles drawn on the real page](assets/screenshots/guide.png)

[Open the static demo](https://arthur031221.github.io/Glimpselet/). It uses a sample image and a recorded answer. It does not contact a provider.

## Install

Install the Glimpselet plugin in Claude Code:

```text
/plugin marketplace add Arthur031221/Glimpselet
/plugin install glimpselet@glimpselet
```

Run `/glimpse` and follow its setup guide. The guide is the source of truth for installation and pairing.

If Claude Code runs on another computer, the guide provides an SSH forwarding command to run on the computer with your browser. If the browser computer has no Claude Code CLI, choose direct API mode and provide your own API key.

### Advanced: load from source

To load the unpacked extension from a source checkout:

1. Open `chrome://extensions` in Chrome or Edge and turn on **Developer mode**.
2. Choose **Load unpacked**.
3. Select the extension folder produced by the setup guide.

> **Developer mode:** Glimpselet is still distributed in developer mode. Until a store listing is available, updates must be installed manually.

## Capture and shortcuts

Hold Shift in the floating bubble or on an accessible web page to start a crop. Shift works only in the bubble and accessible web pages. It cannot listen for a key press in other apps. A web-page selection draws over the live page. For a shared screen, the frame freezes before cropping. Press Enter to confirm or Esc to cancel.

The browser crop shortcut is Ctrl+Shift+S, or Cmd+Shift+S on Mac. It starts crop mode in the browser. The separate global shortcut defaults to Ctrl+Shift+7 because Chrome requires a numeric key in global shortcuts. You can remap it at `chrome://extensions/shortcuts`, including to S.

## Claude Code sessions

Documented MCP channel support can deliver messages to an existing running Claude Code session. Glimpselet mirrors replies from the channel's reply-tool chunks. The session in the terminal controls its model and permissions. To add Glimpselet's custom channel, restart the session with the development channel enabled, then run `/glimpse`:

```sh
claude --resume SESSION_ID --dangerously-load-development-channels plugin:glimpselet@glimpselet
```

Without the channel, Glimpselet can continue the same session in a separate print-mode process with `claude --resume SESSION_ID -p`. This is a parallel continuation. Do not run it while the terminal is using that session. Concurrent access can conflict.

## Limits

- Chrome, Edge, and other Chromium browsers only.
- Browser-internal pages such as `chrome://`, the extension store, and some managed pages block extension access.
- Glimpselet cannot draw on native apps. Share a screen to ask about an app image. Page overlays and text actions are unavailable there.
- Use the bundled Glimpselet reader for PDFs. Chrome's built-in PDF viewer is not an accessible page.
- The browser's Document Picture-in-Picture API does not support click-through, so the floating window cannot pass clicks through to another app. The browser may not guarantee a floating window or automatic pop-out. Keep the extension page open while using the floating window.

## Privacy

There's no telemetry. With consent, page text may be sent to create suggested questions. Questions and opt-in passive summaries can send relevant text and images. Shared-screen frames stay in memory and are sent to the bridge only for capture or question requests. In bridge mode, the CLI runs on the host and stores its session transcripts there. Direct API mode sends requests from the extension. API keys and bridge tokens stay in browser session storage. Preferences use browser local storage. See [security and privacy](docs/SECURITY.md) for data flows and passive cost notes.

## More

[Install](docs/INSTALL.md) | [Usage](docs/USAGE.md) | [Design and integration](docs/DESIGN.md) | [Store preparation](docs/STORE.md) | [Release notes](docs/releases/v2.0.0.md)

## Disclosure

Assisted by Claude/Codex.
