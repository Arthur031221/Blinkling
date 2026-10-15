# Configuration

Blinkling needs Node.js 22 or newer for the plugin bridge and Claude Code, signed in, on the computer that shows Blink. Blink asks Claude Code there; nothing else is configured and no separate account is used. If Claude Code is missing on that computer, one bubble says how to install it.

Pick a model and effort in the full composer. The mini composer silently uses the last choice. The installed Claude Code resolves the model aliases `sonnet`, `opus` and `haiku` according to its own configuration.

The settings are few: the pick key on macOS (Control or Option), the global capture hotkey, starting Blinkling with Claude Code, and under Help the welcome replay, the browser helper guide and About. The language follows the system.

The browser helper has no settings. Its popup and setup guide follow the browser language in nine locales: English, Traditional Chinese, Simplified Chinese, Japanese, Korean, Spanish, French, German and Brazilian Portuguese. It keeps one pairing token for the current browser session in `chrome.storage.session`; nothing is written to disk.

The separate MCP screen watch samples at a selected interval from 5 to 60 seconds, retains changed images only, and makes no model calls.

## Remote Control switch (desktop)

`BLINKLING_REMOTE=0` makes Blink's own Claude Code session skip the Remote
Control request, so it never appears in claude.ai/code or the Claude app. Unset
keeps the default: every turn syncs to a session named "Blinkling".
`BLINKLING_REMOTE=test` is for automated checks only: one disposable session
named "Blinkling test" that Claude Code removes on exit.
