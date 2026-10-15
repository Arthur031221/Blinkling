# Security and privacy

Blinkling collects no telemetry. The bridge does not log page content, capture bytes, pairing tokens or API keys. The prerecorded interactive chat uses a fixture image and recorded answers, without provider requests. The README and showcase GIFs record the real extension on public sites with Claude Code replies.

## Data flow

After consent, bounded page text may be sent to generate suggested questions. Context excludes hidden, editable, private and password fields and does not collect form values. Questions and optional Auto explain summaries can send relevant page text and images. Pixel captures can contain information the text filter cannot identify. Review the source before asking.

Bridge mode uses an origin bound, paired loopback WebSocket. Dedicated threads and parallel continuations run the user's CLI. An image is placed in a private temporary directory and removed after completion, timeout or cancellation. Recent sessions are listed through the official SDK. A parallel continuation resumes the exact selected UUID and writes to that conversation. Avoid running it concurrently with terminal work on the same transcript.

Print mode keeps restricted mode and safe mode enabled, disabling user and project customizations, including hooks, and configures no MCP servers. Managed CLI policies still apply. Image requests expose only the Read tool, add only that request's private temporary directory with `--add-dir`, and preapprove the exact screenshot path using an absolute Read rule. Text-only requests enable no tools or additional directories. This preapproval is not a deny rule: Read can still access files in the session's working directories under the CLI's normal read permissions.

With an enabled live channel, requests are pushed into the running terminal conversation. Its model, permissions and tools apply. The plugin returns images and scoped reply chunks through MCP tools. Only bubble request replies are mirrored. Stop ends the bubble's wait. It does not stop terminal execution. Press Esc there when necessary.

Direct API mode sends requests and optional images to Anthropic using the user's key. The key is not sent to the local bridge. Provider retention and account policies apply to all provider requests.

Auto explain starts off. Once enabled with consent and site access, page changes can trigger summaries without screen sharing. Shared browser video requires a Capture Handle matching the inspected HTTP or HTTPS tab before and after its privacy check. Password fields, blocklisted hosts and loading or inaccessible embedded pages pause automatic page requests. Open shadow roots and accessible embedded pages are checked; closed shadow roots cannot be inspected.

Shared monitors and native app windows can trigger image explanations only after separate consent for that share. Consent is bound to the stream and track, and ends when sharing stops or the source changes. These pixels cannot be checked for password fields or blocked websites. Unknown capture sources remain paused. Monitor frames mask the floating bubble before comparison and transmission; stable changes are debounced and summaries are capped at six per rolling minute. These controls do not detect every sensitive image. Hide private content or pause Auto explain before sharing it. Manual captures and questions remain available.

## Desktop app: what is never captured, and what is kept

Blinkling's desktop app looks at the screen only when you ask (a screenshot, a region, a guide) or while Auto explain is on. Blink checks what has focus first. All of these block capture and sending, and Blink shows a lock face instead:

- A password or other secure text field.
- A password manager window: 1Password, Bitwarden, KeePassXC, LastPass, Dashlane, Keeper, Proton Pass and Apple Passwords.
- A private window: Chrome Incognito, Edge InPrivate, Firefox and Safari private windows, and a Blinkling companion tab that reports itself as incognito.

A blocked capture is never taken: pixels are not read, not sampled for Auto explain, and nothing is sent. If the desktop cannot tell what has focus, Auto explain stays locked and only a capture you ask for goes ahead. The lock lifts by itself a moment after the field is left. The check cannot see inside a window it does not know is private, so hide sensitive content before asking.

Nothing is kept after sending. Blinkling holds a capture in memory only until it has been handed to Claude Code, then drops it. No image, picked text, or answer is written to the app's data folder or the temporary folder, and the saved session state holds only turn and message ids, so a turn waiting offline keeps its typed text and nothing else. Chat history shown after a restart is read back from Claude Code's own transcript, which Claude Code owns and Blinkling does not copy.

When Claude's usage limit is reached, Blinkling says so once with the reset time, pauses Auto explain, and resumes it after the reset. A missing Claude Code is one install hint, not an error.

## Storage

| Location                 | Data                                                                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser local storage    | Consent, language, backend, model, effort, target language, passive and Shift preferences, host blocklist and observed PiP dimensions.                         |
| Browser session storage  | Bridge token, URL, mode and direct API key. Cleared when the browser session ends.                                                                             |
| Bubble memory            | Captures, latest shared video frame, chat replies and translation originals. Frames are not written to browser storage. Closing the opener clears this memory. |
| Bridge memory            | Pairing state, active requests, short follow up context and temporary session metadata. Tokens expire after twelve hours. Restart clears memory.               |
| Host CLI storage         | Persistent conversation transcripts owned by the CLI. Dedicated and selected sessions follow its normal persistence behavior.                                  |
| Temporary host directory | Request image for print mode, removed when the request ends.                                                                                                   |

The bridge uses an operating system assigned loopback port. Pairing checks the local host, extension origin and one use code or token. Codes expire after ten minutes. Payloads and requests have limits. Disconnecting aborts the active print request. It ends waiting for a live channel reply without cancelling the terminal's work.

## Cost and controls

The preceding hour's cost uses reported CLI usage when available. Direct API mode estimates input and output token cost at the bundled model rates. Live channel replies have no authoritative usage report. The total is an estimate, not a spending cap. Check provider billing for actual charges.

Sharing begins only after the user chooses a browser source. Closing the floating window stops its stream. Auto explain can be paused or disabled with Alt+P or its control. Ending the browser session clears the API key. Browser permissions govern page access and restricted pages. The bubble cannot make its native frame transparent or click through, and native apps cannot receive DOM guides.

Page content is untrusted input. Guide element IDs and translation node IDs are checked before changes are applied. No remote code is loaded. A model response is not a security boundary. Review it before acting.
