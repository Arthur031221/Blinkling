# Install

Glimpselet is a bundled plugin for the coding assistant. The [README](../README.md) has a terminal installer for each host. From an interactive coding session, these commands install the same plugin:

```text
/plugin marketplace add Arthur031221/Glimpselet
/plugin install glimpselet@glimpselet
```

The CLI must be version 2.1.248 or newer for restricted execution. Node.js 22 or newer must be available to run the bundled local bridge. The installed plugin does not need a checkout or a separate package install. Run `/glimpselet:glimpse` to open the panel. It starts a bridge bound to loopback on a random port and opens the browser. If automatic browser opening fails, use the one-time link returned by the command. It expires after 60 seconds and can be exchanged once.

The plugin contains its bridge and static panel. There is no browser extension. The bridge session lasts 30 minutes. To use the optional API backend, add a key in panel Settings. The key stays in bridge process memory and is not written to browser storage or a file.

## Browser support

Screen sharing uses the browser's display media picker and requires a user choice and browser/OS permission. Document Picture-in-Picture requires a user gesture and is used where available, including Chrome and Edge 116 or newer. Otherwise the panel opens in a regular popup. Popup behavior and floating-window placement depend on the browser and operating system.

## Build from a checkout

Install Node.js 22 or newer, run `npm ci`, then `npm run build` and `npm run build:plugin`. To validate the generated bundle locally, run `npm run validate:plugin`. See [contributing](../CONTRIBUTING.md) for development checks.

## Native capture prerequisites

Browser sharing does not need native screenshot tools. The native MCP capture path is separate and is used only without an active browser share.

<details>
<summary>macOS</summary>

Use the plugin commands above. Allow screen recording for the terminal or application that runs the bridge in System Settings. Native capture uses the system screenshot utility.

</details>

<details>
<summary>Windows</summary>

Use the plugin commands above with Node.js 22 or newer on PATH. Native screen capture uses Windows PowerShell and the system drawing APIs. Browser sharing is the route for selecting one app window or tab.

</details>

<details>
<summary>Linux</summary>

Use the plugin commands above with Node.js 22 or newer on PATH. For native capture on Wayland, install `grim`, with `slurp` for interactive regions. On X11, install `maim` or `scrot`. If those tools are absent, the floating panel and browser sharing still work.

</details>

The release was checked with Chromium on Linux. The macOS and Windows native paths were not exercised on this host.
