# Security and privacy

Glimpselet collects no telemetry. The bridge does not log page content, capture bytes, pairing tokens or API keys. The public demo uses a fixture image and recorded answers, without provider requests.

## Data flow

After consent, bounded page text may be sent to generate suggested questions. Context excludes hidden, editable, private and password fields and does not collect form values. Questions and optional passive summaries can send relevant page text and images. Pixel captures can contain information the text filter cannot identify. Review the source before asking.

Bridge mode uses an origin bound, paired loopback WebSocket. Dedicated threads and parallel continuations run the user's CLI. An image is placed in a private temporary directory and removed after completion, timeout or cancellation. Recent sessions are listed through the official SDK. A parallel continuation resumes the exact selected UUID and writes to that conversation. Avoid running it concurrently with terminal work on the same transcript.

Print mode keeps restricted mode and safe mode enabled, disabling user and project customizations, including hooks, and configures no MCP servers. Managed CLI policies still apply. Image requests expose only the Read tool, add only that request's private temporary directory with `--add-dir`, and preapprove the exact screenshot path using an absolute Read rule. Text-only requests enable no tools or additional directories. This preapproval is not a deny rule: Read can still access files in the session's working directories under the CLI's normal read permissions.

With an enabled live channel, requests are pushed into the running terminal conversation. Its model, permissions and tools apply. The plugin returns images and scoped reply chunks through MCP tools. Only bubble request replies are mirrored. Stop ends the bubble's wait. It does not stop terminal execution. Press Esc there when necessary.

Direct API mode sends requests and optional images to Anthropic using the user's key. The key is not sent to the local bridge. Provider retention and account policies apply to all provider requests.

Passive mode starts off. Once enabled, changed pages can trigger summaries. Shared video requires a browser tab whose Capture Handle matches the inspected HTTP or HTTPS page before and after its privacy check. A monitor, native app, unknown capture source or unsupported page cannot trigger automatic screen requests. These sources still support manual capture and questions. Password pages and blocklisted hosts are excluded, page updates are debounced, and summaries are capped at six per rolling minute. Sensitive text is not always detectable, especially in native apps. Pause before sharing sensitive material.

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

Sharing begins only after the user chooses a browser source. Closing the floating window stops its stream. Passive mode can be paused or disabled. Ending the browser session clears the API key. Browser permissions govern page access and restricted pages. The bubble cannot make its native frame transparent or click through, and native apps cannot receive DOM guides.

Page content is untrusted input. Guide element IDs and translation node IDs are checked before changes are applied. No remote code is loaded. A model response is not a security boundary. Review it before acting.
