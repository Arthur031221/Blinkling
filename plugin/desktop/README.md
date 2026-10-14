# Desktop launcher and optional browser companion

`/blinkling:blinkling` calls `desktop_open`. The launcher consumes only the release
manifest embedded in this plugin. SessionStart reconnects after the first
successful launch; neither path asks for a port, pairing code, browser extension,
or Claude startup flag.

The release bucket must populate `manifest.json` before publishing V3. The empty
build list intentionally refuses installation: there is no published binary to
trust yet. Each build specifies `platform` (`darwin`, `win32`, `linux`), `arch`
(`arm64`, `x64`), GitHub release `url`, lowercase `sha256`, `archive` (`zip` or
`tar.gz`), and relative executable `entry`. The top level specifies
`schemaVersion: 1` and the exact desktop `version`. Commit the pinned digests in
the plugin release and rebuild the standalone MCP bundle together.

Installation verifies archive bytes and executable CPU before extraction,
rejects unsafe archive paths and links, stages in a private versioned cache,
and verifies the complete extracted inventory on reuse. Corrupted cache files
are repaired from the verified archive. Startup promotes `current.json` only
after authenticated discovery and preserves the earlier release on failure.
macOS uses the stable `~/Applications/Blinkling.app` bundle path, checks the
newly extracted bundle's signature, and limits quarantine handling to that
owned bundle. Native signing, Gatekeeper, SmartScreen and permission behavior
still require native release verification.

The shell starts one bearer-authenticated loopback host and publishes its
private endpoint under the runtime directory. `launch.lock` and Electron's
single-instance lock deduplicate startup. A runtime override also isolates
Electron user data, permitting independent test instances without disabling
the lock. Browser origins and incorrect Host headers are rejected. No Claude
credentials enter the renderer or companion protocol.

The session bucket must call
`globalThis.blinklingCompanion.attachSession(sessionBridge)` with its one durable
public SessionBridge. The companion never spawns or resumes a Claude child.
It subscribes before admitting a UUID turn, preserves image content, applies
model/effort only after acknowledgement, and interrupts only its admitted turn.
Once desktop activation is saved, disconnects produce a reconnecting error
instead of creating an independent browser AI session. Existing V2 behavior
remains available on installations that have never activated the desktop.

The capture bucket calls `globalThis.blinklingCompanion.fullPage(signal)`.
Successful captures include PNG content, dimensions, timestamp and optional
page context; convert them into the CaptureService's display/region snapshot.
`{ companionRequired: true }` means the UI should offer
`openCompanionGuide()` and its existing visible-screen capture fallback. The
guide is served by the already running plugin MCP server and retains the
animated, OS-selected installation and automatic helper connection. Desktop
capture remains independent of Chrome and Edge.

The optional helper's reverse RPC uses a separate random bearer token and
authenticates before registration. Full-page requests use its paired browser
socket, pin the source document, respect existing privacy checks, restore
scroll and inline styles in `finally`, and cancel on disconnect. Fixed content
appears in the first tile; sticky content remains in document flow. Overlapping
last tiles paint only previously uncovered pixels.

Verify with Node 24: `npm test`, `npm run desktop:check`, `npm run build:plugin`,
`npm run test:plugin`, plugin validation, and `npm run test:extension`.
The new `e2e-extension/desktop-companion.spec.ts` runs real Electron and Chrome
under Xvfb and accepts `BLINKLING_TEST_EXECUTABLE` for a packaged app.
