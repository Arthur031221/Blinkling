# Security and privacy

Glimpselet listens on loopback at an operating-system assigned port. Its launch fragment is a one-use token that expires after 60 seconds. The bridge keeps the resulting session in memory for 30 minutes. HTTP and WebSocket routes check the expected Host, exact local Origin and session. Requests and captures have size limits. Capture endpoints enforce a rolling rate limit. The bridge does not log session tokens, API keys or image bytes.

The panel sends prepared images when you ask a question or enable passive notes. MCP screen tools return captures to the coding session when explicitly called. Asking sends the prepared image and question to the configured backend. Passive notes send changed frames for descriptions through the selected backend. The six-per-minute rolling default is a request cap, not a dollar-cost estimate. The separate MCP watch captures changed frames at a 5 to 60 second interval and does not call a model.

Opaque masks are applied to the outgoing PNG before it reaches the bridge. Crop and mask the frame, then review it before sending. Pixel inspection cannot guarantee detection of passwords or other sensitive text, and cursor coordinates or window titles are not reliably available.

The local CLI route writes a normalized PNG to a private temporary directory and grants the child read access only to that image. It starts without a shell, configured MCP servers, other tools or saved conversation. The bridge removes the temporary directory after completion, timeout or cancellation. The optional API route sends the image and question from the local bridge to the configured API service. Its key stays in bridge memory for the session. **Clear** or process exit removes it. It is not stored in panel local storage or a file.

**Clear** aborts active jobs and removes local frames, notes, answer history and the in-memory API key. Closing the browser panel ends its browser share. The bridge session also expires after 30 minutes.

An active browser share is authoritative for MCP capture. If the shared browser surface disconnects or cannot provide a frame, capture fails closed and never substitutes a native capture. A disconnected browser share stays authoritative until you explicitly stop it, clear local data, or the session expires. The native adapter is available only after that sharing intent ends. It still depends on OS permissions and installed platform tools. Review outgoing images before asking, do not treat automatic visual inspection as a security boundary.

Restricted execution still loads managed policy. Organization configured hooks are trusted and can run outside this request. The installed CLI is not an OS sandbox. The [provider implementation](../bridge/src/provider-cli.ts) records the flags used for each request.
