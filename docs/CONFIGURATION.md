# Configuration

The plugin requires Node.js 22 or newer and a working installed coding-assistant CLI. The default backend starts that CLI without a shell in a private temporary directory. It receives the current PNG through one allowed read path, with no other tools, an empty strict MCP configuration and no saved conversation. The temporary directory is removed when the answer finishes or is cancelled. Responses stream into the panel.

Select one of the `sonnet`, `opus` or `haiku` aliases. The installed CLI resolves the alias according to its own configuration.

The optional API backend sends requests from the local bridge. Enter its API key in panel Settings. The key remains in bridge process memory for the session, is sent only to the selected API backend, and is not written to panel storage or a file. **Clear** removes it and aborts active jobs. The session expires after 30 minutes, stopping the plugin process also removes the key.

The panel offers nine interface locales: English, Traditional Chinese, Simplified Chinese, Japanese, Korean, Spanish, French, German and Brazilian Portuguese. Language, theme, model, size and translation target preferences are stored in the panel tab's session storage. Launch and session tokens are held in memory and are not written there.

Passive-note requests are capped at six per rolling minute by default. Settings allow a lower cap. This is a request-rate limit. It does not predict API or account cost. The separate MCP screen watch samples at a selected interval from 5 to 60 seconds, retains changed images only, and makes no model calls.
