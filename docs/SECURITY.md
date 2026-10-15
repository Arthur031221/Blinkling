# Security and privacy

Blinkling collects no telemetry. The bridge does not log page content, capture bytes or pairing tokens.

## Data flow

Blink asks Claude Code on the same computer, signed in with your own account. A question sends the pick you made (an image and, when the helper is connected, the text inside the picked element) through that Claude Code session. Pixel captures can contain information a text filter cannot identify. Review what is on screen before asking, or turn Blink off.

The browser helper only talks to the bridge on `127.0.0.1`, through a WebSocket that checks the local host, the extension origin and a one-use setup code or a 64-hex token. Password and other secure fields are reported as secure with no text and no value; input values are never read. A full-length capture is refused on a page that has a password field. Page content is untrusted input.

Print mode keeps restricted mode and safe mode enabled, disabling user and project customizations, including hooks, and configures no MCP servers. Managed CLI policies still apply. Image requests expose only the Read tool, add only that request's private temporary directory with `--add-dir`, and preapprove the exact screenshot path using an absolute Read rule. Text-only requests enable no tools or additional directories. This preapproval is not a deny rule: Read can still access files in the session's working directories under the CLI's normal read permissions.

Auto explain starts off. When it is on, Blink adds at most two bubbles for a large screen change, never draws marks and pauses while you type. These controls do not detect every sensitive image; turn it off before showing private content.

## Storage

| Location                 | Data                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Browser session storage  | The helper's bridge token and URL. Cleared when the browser session ends.                                                |
| Bridge memory            | Pairing state, active requests and the in-memory capture history. Tokens expire after twelve hours; restart clears them. |
| Host CLI storage         | Persistent conversation transcripts owned by Claude Code, following its normal persistence behavior.                     |
| Temporary host directory | Request image for print mode, removed when the request ends.                                                             |

The bridge uses an operating system assigned loopback port. Setup codes expire after ten minutes and work once. Payloads and requests have limits. Disconnecting aborts the active request.

## Controls

Capture begins only when the user asks. Browser permissions govern page access and restricted pages; the helper needs the one-time "Allow on all sites" for full-length capture and page structure, and says so in its popup. A model response is not a security boundary. Review it before acting. No remote code is loaded. Guide element IDs and translation node IDs are checked before changes are applied.
