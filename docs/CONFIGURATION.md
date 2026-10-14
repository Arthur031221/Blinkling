# Configuration

The plugin requires Node.js 22 or newer and a working installed coding-assistant CLI. The default backend starts that CLI without a shell in a private temporary directory. It receives the current PNG through one allowed read path, with no other tools, an empty strict MCP configuration and no saved conversation. The temporary directory is removed when the answer finishes or is cancelled. Responses stream into the panel.

Select one of the `sonnet`, `opus` or `haiku` aliases. The installed CLI resolves the alias according to its own configuration.

The optional API backend sends requests from the local bridge. Enter its API key in panel Settings. The key remains in bridge process memory for the session, is sent only to the selected API backend, and is not written to panel storage or a file. **Clear** removes it and aborts active jobs. The session expires after 30 minutes, stopping the plugin process also removes the key.

The panel offers nine interface locales: English, Traditional Chinese, Simplified Chinese, Japanese, Korean, Spanish, French, German and Brazilian Portuguese. Language, theme, model, size and translation target preferences are stored in the panel tab's session storage. Launch and session tokens are held in memory and are not written there.

Compact and expanded dimensions are saved separately. A local file and browser cache also retain popup position and window frame dimensions when the bridge restarts on a new port. The browser controls Picture in Picture placement. Saving is best effort when either storage location is unavailable.

Only geometry is saved. The file contains no questions, images, keys, session tokens or answer history.

Popup positions are clamped to the screen available to the opener. A popup last used on another monitor may reopen on the opener's screen.

| Platform | Preference file                                                                                                        |
| -------- | ---------------------------------------------------------------------------------------------------------------------- |
| Linux    | `$XDG_CONFIG_HOME/blinkling/floating-geometry-v1.json`, or `~/.config/blinkling/floating-geometry-v1.json` when unset  |
| macOS    | `~/Library/Application Support/blinkling/floating-geometry-v1.json`                                                    |
| Windows  | `%APPDATA%/blinkling/floating-geometry-v1.json`, or `~/AppData/Roaming/blinkling/floating-geometry-v1.json` when unset |

Passive-note requests are capped at six per rolling minute by default. Settings allow a lower cap. This is a request-rate limit. It does not predict API or account cost. The separate MCP screen watch samples at a selected interval from 5 to 60 seconds, retains changed images only, and makes no model calls.

## Remote Control switch (desktop)

`BLINKLING_REMOTE=0` makes Blink's own Claude Code session skip the Remote
Control request, so it never appears in claude.ai/code or the Claude app. Unset
keeps the default: every turn syncs to a session named "Blinkling".
`BLINKLING_REMOTE=test` is for automated checks only: one disposable session
named "Blinkling test" that Claude Code removes on exit.
