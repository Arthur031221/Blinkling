# Architecture

The plugin manifest starts one bundled local MCP server through Node.js. The bundle contains its runtime dependencies and serves the static panel beside itself, so use does not depend on a repository checkout or a runtime package install. The installed plugin includes slash commands and MCP tools. No browser extension is part of the capture path.

Opening the panel starts an HTTP server on loopback at a random port and creates a one-use URL fragment token. The token expires after 60 seconds and is exchanged once for a session held in bridge memory. The session expires after 30 minutes. Mutating HTTP requests and the capture WebSocket validate the expected Host, exact Origin and session.

The panel owns browser display capture, crop, opaque masks, freeze, passive sampling and answer display. A user starts capture through the browser picker. When MCP requests a capture while browser sharing is active, the bridge asks the panel for its current shared frame. If that capture fails or sharing disconnects, it returns an error. It never falls through to an unmasked native image. Sharing intent lasts until an explicit stop, Clear or session expiry. After that intent ends, the native adapter is available according to platform, installed tools and OS permissions.

For a question, the bridge normalizes the submitted PNG and starts the selected provider. The default local CLI runs without a shell in a private temporary directory. It can read only the single PNG path, has no other tools or configured MCP servers, and does not retain a CLI session. The image file is removed when the child exits or is cancelled. The optional API provider is called by the bridge, not directly by the panel. Both routes stream text deltas back to the panel.

Answer context is bounded. Follow-up questions can include recent question and answer text. The panel passive mode samples every two seconds, compares frame signatures, and sends changed frames for short notes. The bridge enforces the rolling request limit. Timeline entries and MCP capture history are held in memory for up to ten minutes. Summary requests send only passive note text from that window and do not need a new screenshot. Clear aborts jobs and removes session entries, frames, notes and the in-memory key.

The separate `screen_watch_start` MCP tool uses a serial interval of 5 to 60 seconds, keeps changed images only and makes no model calls. It is not the panel's passive narration feature.

Markdown is sanitized before answers are displayed.

Restricted execution still loads managed policy. Organization configured hooks are trusted and can run outside this request. The installed CLI is not an OS sandbox. The [provider implementation](../bridge/src/provider-cli.ts) records the flags used for each request.
