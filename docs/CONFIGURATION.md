# Configuration

The plugin requires Node.js 22 or newer and the Claude Code CLI signed in on the same computer. Blink starts that CLI without a shell and asks it questions about what the user picked. The model, effort and pin choices live in Blink's composer.

Blink's settings cover the pick key, the global hotkey, starting Blink with Claude Code, the welcome replay, the companion guide and About. Blink and the companion follow the system language in nine locales: English, Traditional Chinese, Simplified Chinese, Japanese, Korean, Spanish, French, German and Brazilian Portuguese.

The companion keeps two values in the browser's extension storage: the trust secret and the bridge port. It has no other settings. The bridge keeps the same secret in `helper.json` in its runtime directory (`~/.blinkling/runtime`, or `BLINKLING_RUNTIME_DIR`), readable by the user only. Delete the file to revoke every companion; the next setup page issues a new secret.

| Variable                         | Effect                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| `BLINKLING_PORT`                 | First port the bridge tries for the companion; the default is 43827 and it scans ten ports. |
| `BLINKLING_RUNTIME_DIR`          | Where the endpoint file and `helper.json` live.                                             |
| `BLINKLING_BROWSER`              | Set to `msedge` to open the setup page in Edge.                                             |
| `BLINKLING_DISABLE_BROWSER_OPEN` | Set to `1` to print the setup link without opening it.                                      |

The MCP screen watch samples at an interval from 5 to 60 seconds, keeps changed images only, and makes no model calls.

## Remote Control switch (desktop)

`BLINKLING_REMOTE=0` makes Blink's own Claude Code session skip the Remote
Control request, so it never appears in claude.ai/code or the Claude app. Unset
keeps the default: every turn syncs to a session named "Blinkling".
`BLINKLING_REMOTE=test` is for automated checks only: one disposable session
named "Blinkling test" that Claude Code removes on exit.
