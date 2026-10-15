# Architecture

Blinkling has two parts: the desktop app that draws Blink and does the looking, and the optional browser companion. Claude Code, signed in on the same computer, does the answering. The design record with the spike evidence is in [V3-ARCHITECTURE.md](V3-ARCHITECTURE.md).

## Desktop app

The plugin's `/blinkling:blinkling` command runs the launcher in `plugin/desktop/`. The launcher picks the build for the platform, checks it against the pinned SHA-256 digest in `plugin/desktop/manifest.json`, installs it atomically and starts it. A build whose digest does not match is never installed.

`desktop/main/` is the Electron shell. It owns the windows and wires the services together:

| Folder                             | Job                                                                                            |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| `renderer/`, `character/`, `menu/` | Blink in the corner, its state faces, the menu and the three-step welcome.                     |
| `pick/`, `capture/`                | Ctrl and click, Ctrl and drag, the capture overlay, the global hotkey and full-page capture.   |
| `composer/`, `mini/`               | The mini composer with the three quick asks, and the full composer with model, effort and pin. |
| `messages/`, `overlay/`            | Answer bubbles, scroll back, and the marks drawn on the screen for answers and guides.         |
| `autowatch/`                       | Auto explain: low-rate change detection, off until the user turns it on.                       |
| `privacy/`                         | Refuses capture while a secure field, a password manager or a private window has focus.        |
| `session/`                         | One durable conversation with Claude Code: send, stop, retry, resume and Remote Control.       |
| `distribution/`                    | The native packages built for macOS (arm64 and x64), Windows and Linux.                        |

A capture is a screenshot, a region or a picked element. Every capture, quick ask, typed message, guide and auto explain turn goes through the same session, so there is one conversation and one history. The session runs the signed-in `claude` command without a shell and reads the answer as a stream of events. Blink shows the sentences as they arrive.

Answers can carry marks in screen coordinates. The overlay draws them over the captured display and checks that the screen has not moved before it does. The model returns data, never HTML or script.

A capture is held in memory until it has been handed to Claude Code and is then dropped. Nothing about it is written to the app's data folder.

## Browser companion

The companion is an extension for Chrome and Edge. It is optional: Blink starts and works without it. It adds the structure of the page under the pointer, full-length page capture, translating a page in place and the bundled PDF reader.

It talks to the local bridge, `bin/blinkling.cjs`, which the plugin's `.mcp.json` starts. The bridge listens on a loopback port (43827 by default, scanning ten) and checks the local host and lets a companion in only when it proves it holds the trust secret stored in `helper.json`. The bridge forwards companion turns to the desktop session when Blink is running. Page text and pixels are untrusted data.

## Claude Code tools

The same bridge is the MCP server for Claude Code. Its tools let Claude Code look at the screen when the user asks, set up the companion and watch the screen. `screen_watch_start` samples at a serial interval of 5 to 60 seconds, keeps changed images only and makes no model calls. It is separate from Auto explain.

## Boundaries

- The user's CLI is not an operating system sandbox. Managed policy and hooks still apply to it. The provider flags for each request are in [bridge/src/provider-cli.ts](../bridge/src/provider-cli.ts).
- Markdown in answers is sanitized before display.
- Data kept on disk is listed in [SECURITY.md](SECURITY.md).
