<p align="center"><img src="assets/logo.svg" width="72" alt="Blink, the Glimpselet companion"><br><strong>Glimpselet</strong><br><em>Blink waits. You point. It answers.</em></p>

<p align="center"><a href="README.zh-TW.md">Traditional Chinese</a>  |  <a href="README.zh-CN.md">Simplified Chinese</a>  |  <a href="README.ja.md">Japanese</a>  |  <a href="README.ko.md">Korean</a>  |  <a href="README.es.md">Spanish</a>  |  <a href="README.fr.md">French</a>  |  <a href="README.de.md">German</a>  |  <a href="README.pt-BR.md">Brazilian Portuguese</a></p>

> Ask your coding assistant about the screen you share, in a small floating window.

**20/20 local screen fixtures checked.** The bundled plugin answered twenty rendered screenshots using the installed Haiku backend. Every answer passed its fixture check. Median time was 2.61 seconds. [Method and all results](assets/benchmark.json). This small sequential fixture run doesn't measure general accuracy or speed.

| Before                   | After                                                |
| ------------------------ | ---------------------------------------------------- |
| A screen full of details | Freeze a frame, crop or mask it, then ask a question |

Install from a terminal on macOS or Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/Arthur031221/Glimpselet/main/install.sh | sh
```

Then open `/glimpselet:glimpse`. You'll need Node.js 22 or newer and the installed coding assistant.

<p align="center"><img src="assets/demo.gif" width="800" alt="Glimpselet panel using a labeled fixture image and prerecorded answer, no provider request is made"></p>

<p align="center"><a href="https://arthur031221.github.io/Glimpselet/">Open the static demo</a>  |  prerecorded sample, no provider requests</p>

<details>
<summary>Light and dark panels at 360, 420 and 520 px</summary>

<p><img src="assets/screenshots/light-360.png" width="140" alt="Light panel at 360 px"><img src="assets/screenshots/light-420.png" width="140" alt="Light panel at 420 px"><img src="assets/screenshots/light-520.png" width="140" alt="Light panel at 520 px"></p>
<p><img src="assets/screenshots/dark-360.png" width="140" alt="Dark panel at 360 px"><img src="assets/screenshots/dark-420.png" width="140" alt="Dark panel at 420 px"><img src="assets/screenshots/dark-520.png" width="140" alt="Dark panel at 520 px"></p>

</details>

## A normal look

```text
/glimpselet:glimpse
Choose a screen, window, or tab in the browser picker.
Freeze a frame, crop it, and add opaque masks over private details.
Ask what you want to know, read the streamed answer and follow up.
Copy or pin the answer, then clear the session when finished.
```

The panel sends a frame to the provider when you ask or enable passive notes. MCP screen tools return images to the coding session when called. Opaque masks change the outgoing image. Passive notes sample every two seconds and send changed frames for short descriptions, capped at six requests per rolling minute (up to 360 per hour). The cap limits requests. It doesn't estimate dollar cost. You can lower it.

**The screen is yours to share. Nothing starts watching on its own.**

## Details

<details>
<summary>Install from an interactive coding session</summary>

Install the same bundled plugin from your coding assistant with these slash commands:

```text
/plugin marketplace add Arthur031221/Glimpselet
/plugin install glimpselet@glimpselet
```

Both commands work on macOS, Windows and Linux with the installed coding assistant and Node.js 22 or newer. Browser sharing uses the browser picker. Native capture also needs OS permission and, on Linux, the tools listed in [installation](docs/INSTALL.md). Run `/glimpselet:glimpse` to open a local panel on a random port. The link works once, within 60 seconds. The in-memory panel session lasts 30 minutes. The browser picker asks you to choose a display, app window, or tab.

</details>

<details>
<summary>macOS</summary>

Use the terminal command above, then run `/glimpselet:glimpse` in your coding session. Browser sharing uses its permission picker. Native capture also needs screen recording permission in System Settings.

</details>

<details>
<summary>Windows</summary>

With Node.js 22 or newer and the coding assistant on PATH, run this in PowerShell:

```powershell
irm https://raw.githubusercontent.com/Arthur031221/Glimpselet/main/install.ps1 | iex
```

Then run `/glimpselet:glimpse` in your coding session.

</details>

<details>
<summary>Linux</summary>

Use the terminal command above. Browser sharing works without native screenshot utilities. For optional native capture, use `grim` and `slurp` on Wayland, or `maim` or `scrot` on X11. See [installation](docs/INSTALL.md).

</details>

<details>
<summary>Ask, follow up, and review</summary>

Choose the `sonnet`, `opus`, or `haiku` model alias. Questions stream through the installed restricted CLI, or through an optional API request from the local bridge. Follow-up questions can use a limited amount of recent context. You'll need to trust the installed CLI and any policy hooks your organization has configured. The panel offers crop, freeze, opaque masks, copy, pin, a ten-minute notes timeline, summary and Markdown export. Clear aborts active jobs and removes local frames, notes, history and the in-memory API key.

</details>

<details>
<summary>Floating window and browser support</summary>

Opening the floating panel requires a user gesture. Chrome and Edge 116 or newer can use Document Picture-in-Picture when available. Unsupported browsers use a regular popup. If the floating window request fails, click **Open popup** to try a popup. A popup may not stay above other windows. The browser controls placement and can reuse its previous floating window position. This tab remembers your compact and expanded size choices. Capture permissions and available pickers vary by browser and operating system.

</details>

<details>
<summary>Develop from source</summary>

Use Node.js 22 or newer, then run `npm ci`, `npm run build`, and `npm run build:plugin`. See [contributing](CONTRIBUTING.md) for all checks. The static demo uses a fixture image and prerecorded text. It never requests a provider answer.

</details>

## Limits

With an active browser share, MCP capture uses that shared surface and fails closed if it disconnects or can't answer. It never substitutes an unmasked native capture. Disconnected sharing intent lasts until you stop sharing, clear local data or the session expires. Native fallback is available only after that intent ends and depends on platform tools and OS permissions. macOS supports screen, window and region. Windows supports screen. Linux support depends on Wayland or X11 tools. A popup isn't guaranteed to stay on top. The app can't reliably identify passwords, cursor positions or window titles. Review every frame before sending it.

The separate `screen_watch_start` MCP tool samples native or explicitly shared capture at a chosen 5 to 60 second interval, keeps only changed frames, and makes no model calls. Panel passive notes work separately. They sample every two seconds and request short descriptions from the selected backend.

More detail: [usage](docs/USAGE.md), [installation](docs/INSTALL.md), [configuration](docs/CONFIGURATION.md), [architecture](docs/ARCHITECTURE.md), [security](docs/SECURITY.md), [plugin layout](docs/PLUGIN.md), [contributing](CONTRIBUTING.md), [MIT license](LICENSE).

## Disclosure

Assisted by Claude/Codex.
