# Security and privacy

Blinkling collects no telemetry. The app and the bridge do not log page content, picked text or capture bytes. The README and showcase GIFs record the real desktop app on a public web page with Claude Code replies.

## Data flow

Blink looks at the screen when the user asks: a Ctrl and click, a Ctrl and drag, a quick ask, a guide, or a typed message with a capture attached. Auto explain looks only while it is on, and it starts off. What is taken goes to the user's own Claude Code on the same computer, and from there to Anthropic under that account's terms. Blinkling has no server of its own and loads no remote code.

Blink runs the signed-in `claude` command without a shell. Its session has no tools and no MCP servers, hooks are disabled, and a system prompt tells it to explain only. Managed policy of the CLI still applies, and the CLI is not an operating system sandbox. Every turn also syncs to a Remote Control session named "Blinkling" unless `BLINKLING_REMOTE=0` is set. Anyone who can open that session in claude.ai/code or the Claude app sees the conversation.

Pixels can contain information that no filter identifies. Hide private content before asking. A model reply is not a security boundary: review it before acting.

The optional companion reads the structure and text of the page under the pointer and sends it to the local bridge over loopback. Password and payment fields carry no text. Settings pages, extension stores, the built-in PDF viewer and incognito windows (unless the user allowed the companion there) hide their structure, so Blink works from pixels alone. Translating a page in place sends that page's text, in batches, through a restricted print-mode run of the CLI: no tools, no MCP servers, no session saved.

Page text and pixels are untrusted data, never instructions. Answers are sanitized before they are shown, and marks drawn on the screen come from validated data, not from model-written HTML.

Auto explain starts off. Once on, a screen change can trigger a short explanation, at most two bubbles. It stays paused while a secure field, a password manager or a private window has focus. Hide private content or turn it off before sharing the screen.

## Desktop app: what is never captured, and what is kept

Blinkling's desktop app looks at the screen only when you ask (a screenshot, a region, a guide) or while Auto explain is on. Blink checks what has focus first. All of these block capture and sending, and Blink shows a lock face instead:

- A password or other secure text field.
- A password manager window: 1Password, Bitwarden, KeePassXC, LastPass, Dashlane, Keeper, Proton Pass and Apple Passwords.
- A private window: Chrome Incognito, Edge InPrivate, Firefox and Safari private windows, and a Blinkling companion tab that reports itself as incognito.

A blocked capture is never taken: pixels are not read, not sampled for Auto explain, and nothing is sent. If the desktop cannot tell what has focus, Auto explain stays locked and only a capture you ask for goes ahead. The lock lifts by itself a moment after the field is left. The check cannot see inside a window it does not know is private, so hide sensitive content before asking.

Nothing is kept after sending. Blinkling holds a capture in memory only until it has been handed to Claude Code, then drops it. No image, picked text, or answer is written to the app's data folder or the temporary folder, and the saved session state holds only turn and message ids, so a turn waiting offline keeps its typed text and nothing else. Chat history shown after a restart is read back from Claude Code's own transcript, which Claude Code owns and Blinkling does not copy.

When Claude's usage limit is reached, Blinkling says so once with the reset time, pauses Auto explain, and resumes it after the reset. A missing Claude Code is one install hint, not an error.

## Storage

| Location                 | Data                                                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| App data folder          | Blink's position on each display, and the settings: pick key, hotkey, start with Claude Code, welcome state. No images, picked text or answers. |
| App session state        | Turn and message ids, and the typed text of a turn waiting offline.                                                                             |
| Memory                   | The capture until it is handed to Claude Code, then dropped.                                                                                    |
| Claude Code's transcript | The conversation, owned by Claude Code. History shown after a restart is read back from it.                                                     |
| Companion extension      | The trust secret and the bridge port, in the browser's extension storage.                                                                       |
| `helper.json`            | The same trust secret, readable by the user only, in the bridge runtime directory. Delete it to revoke every companion.                         |
| Temporary directory      | A print-mode request's private files, removed when the request ends.                                                                            |

The bridge listens on a loopback port only. It checks the local host and the trust secret. Payloads and request rates have limits, and disconnecting aborts the active request.

## Cost and controls

Each turn uses the user's Claude Code plan. When the usage limit is reached, Blinkling says so once with the reset time and pauses Auto explain until then. The MCP screen watch makes no model calls.

Sharing never starts on its own. Quitting Blink ends its looking. Auto explain can be turned off in the menu.
