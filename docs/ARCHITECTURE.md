# Architecture

The plugin manifest starts one bundled local MCP server through Node.js. The bundle contains its runtime dependencies, so use does not depend on a repository checkout or a runtime package install. The installed plugin includes slash commands and MCP tools. `desktop_open` launches Blink, the desktop companion that asks Claude Code on the same computer.

The optional browser helper reaches the bridge through an origin-bound, authenticated loopback WebSocket. `extension_install` serves a short setup page on a random loopback port; the helper pairs from that page's URL fragment without anyone typing a code. The bridge relays four requests from Blink to the helper: page structure, full-length capture, translate in place and the PDF reader. See [the v3 design](V3-ARCHITECTURE.md) for the desktop side and [the helper design](DESIGN.md) for the browser side.

Capture is native and happens only when the user asks. The MCP tools `screen_capture`, `screen_latest`, `screen_history` and `screen_notes` hold images and notes in memory for up to ten minutes. `screen_watch_start` samples at a serial interval of 5 to 60 seconds, keeps changed images only and makes no model calls. Clear removes entries, frames and notes.

Markdown is sanitized before answers are displayed. Restricted execution still loads managed policy: organization-configured hooks are trusted and can run outside a request, and the installed CLI is not an OS sandbox.
