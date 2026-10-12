# Usage

Run `/glimpselet:glimpse` from your coding session. Choose **Float panel**, then use the browser picker to share a display, app window or tab. Sharing begins only after you choose a surface. Freeze a frame to inspect it, crop to a region, draw opaque masks over details you do not want sent.

Type a question or choose a quick action. Press Ctrl+Enter or Command+Enter to send it. The panel sends the prepared image and question to the configured backend and streams the answer. The still image sent with a question is labeled **Last sent frame**. **Show live preview** returns to the shared screen without sending another question and preserves the crop and masks. Choose the `sonnet`, `opus` or `haiku` alias in Settings. Follow-up questions can include recent, bounded session context. Answers can be copied or pinned.

With the screen preview focused, S selects an area, E asks for an explanation, T translates it, and P toggles passive notes. The corresponding buttons remain keyboard accessible.

## Passive notes

Panel passive mode samples the selected browser surface every two seconds. It compares frames locally and requests a short note only when the image changes. The bridge enforces a rolling maximum of six passive requests per minute by default. A lower cap can be selected. Six per minute is a rate limit, not a statement about monetary cost. Frames and generated notes remain in a local timeline for up to ten minutes. Ask for a timeline summary or export the notes as Markdown. Pause passive mode to stop sampling and its requests. **Pause passive notes** cancels the current streaming note and stops future notes until you resume.

The separate `screen_watch_start` MCP tool is different: it captures serially at an interval from 5 to 60 seconds, retains changed images, and does not call a model. It can use an explicitly shared browser surface or the native adapter when no browser share is active. It does not run the panel's two-second narration loop.

## Backend and settings

The installed restricted CLI is the default answer route. An optional API backend sends the question through the local bridge. Its key is kept in bridge memory for the 30-minute session and is cleared by **Clear** or process exit. Language and theme preferences are stored in the panel tab's session storage, the one-use launch token is not stored there.

The panel opens in a browser-controlled floating surface. With a user gesture, Chrome and Edge 116 or newer may offer Document Picture-in-Picture. Other cases use a regular popup, which may be blocked or may not stay above other windows. Compact and expanded panel sizes are remembered. The browser controls window placement.

## Clear and stop

Pause passive mode before leaving the panel. **Clear** removes local jobs, captures, notes, answer history and the in-memory API key, and aborts active jobs. Closing the panel ends its browser share. The bridge session expires after 30 minutes.

## Limits

The browser picker and OS permissions determine what can be shared. When an MCP capture is requested during an active browser share, Glimpselet uses that share. If it fails or disconnects, the capture fails closed. It will not substitute a native image that could bypass masks. Native fallback is used only without an active browser share. The native targets depend on platform and installed capture tools:

| Platform      | Native targets                                            |
| ------------- | --------------------------------------------------------- |
| macOS         | Screen, window, region                                    |
| Windows       | Screen                                                    |
| Linux Wayland | Screen, region when `slurp` is installed alongside `grim` |
| Linux X11     | Screen and region when `maim` or `scrot` is installed     |

Native capture availability also depends on OS permissions. Glimpselet cannot reliably read external cursor coordinates, window titles or password fields from pixels. Opaque masks are applied to the outgoing image. Always review the outgoing frame.

The [static demo](https://arthur031221.github.io/Glimpselet/) shows a fixture image and prerecorded answer. It does not request any provider response.

Changing the provider, model or API key pauses passive notes. Resume them after reviewing the new settings. Summaries send only saved passive note text and work after you stop sharing. If the browser refuses the floating window, choose **Open popup** to try a popup with a fresh click.
