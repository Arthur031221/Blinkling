# V3: Blink on the desktop

Architecture spike and integration, 2026-10-14. Branch `v3`, based on v2.1.0 `main`.
The controlling brief is **V3, BLINK ON THE DESKTOP**, including the five
**I2** install additions, in the account holder's Blinkling focus file.
The six builder branches are integrated. This is not a claim that every V3
release requirement is finished. The extension remains usable. Section K was
added after the builders started; integration preserves existing implementations
and inventories them in the report without building the remaining K features.

## Integrated runtime

`desktop/main/shell.mjs` composes the canonical shell, house Blink animation,
spring menu, separate conversation card and answer bubbles, capture/guide/auto
explain services, durable `SessionBridge`, and authenticated browser companion.
Both shell builders' behavioral tests remain; the alternate pure shell helpers
are retained for their baseline coverage.

The composer loads `composer/index.html` in its own sandboxed window. A renderer
readiness handshake gates the first captured attachment. Captures, composer
turns, quick asks, guides, auto explain and browser companion turns use the same
owned session. Session persistence, locking, outbox reconciliation, automatic
retry, remote reattachment and event normalization now live in `desktop/session/`.
The low-level transport remains version-specific; its compatibility check and
live canary must pass before supporting another Claude Code release.

On Linux the stacking fallback raises only nonfocusable windows. Raising the
managed composer client repeatedly makes xfwm4 reclaim focus and violates A5;
its own always-on-top state is handled by the window manager. Rounded composer
input regions apply to both client and managed frame, leaving per-pixel alpha
intact. Guide staleness and auto explain mask visible character/menu/bubble
regions rather than the full-display transparent Blink window.

Packaging copies hoisted runtime dependencies and the companion host into the
app, and excludes test harnesses. Electron tests use private user-data/runtime
directories and fixture Claude children; they cannot replace the production
companion descriptor. The integration acceptance test also runs the extracted
Linux archive with the host's real logged-in Claude, two tiny Haiku/low turns,
native menu/area capture, visible answers and exact-image Remote Control proof.
The observer is an external report-only test client; application code does not
read OAuth credentials or call private service endpoints. Human phone/browser
UI interaction remains a separate manual gate.

Integration evidence and the full requirement audit are in
`/home/levi/oss-engine/reports/glimpse-v3/integrate.md`. Release blockers still
include the native three-step animated welcome, OS-specific install guides and
fresh-machine action counts, signed/native macOS and Windows validation, pinned
published binaries (the manifest is empty), the desktop guide's browser-text
hook, and all nine V3 READMEs/GIFs with synchronized release versions. No release
or push is performed by integration.

## Decisions

Use Electron 44.7.2 and Node 24. Electron supplies transparent frameless windows,
OS screen capture, global shortcuts, isolated preload IPC, and Playwright testing
on all three target operating systems. The existing web stack can stay in use.
A browser PiP window cannot provide the required cutout. A different native shell
would require new capture, hit-testing and automation integrations without
removing macOS permission or Wayland restrictions.

The main process owns windows, displays, input regions, capture, shortcuts, the
Claude child, and authenticated companion transport. Renderers are sandboxed,
context-isolated, without Node or network access. Preload exposes only validated
actions, hit regions and event subscription. File/network/child-process access
must not be added to renderer IPC. Navigation and new windows are denied.

Blink and the noninteractive drawing overlay never take focus. The composer is
a separate focusable rounded transparent window, opened only by user intent;
closing it restores the previous application. Pin changes visibility, not focus
policy. Character hit regions must follow the visible animated silhouette,
including limbs and menu bubbles, rather than its rectangular bounding box.
Electron forwards ignored mouse movement on macOS/Windows; on Linux use global
cursor sampling and silhouette scanlines. On X11 the cursor is read with
XQueryPointer, because Electron's cached cursor point goes stale over other
clients and left hover stuck on; Electron's value is only the fallback. On X11, non-focusable windows are
override-redirect; a small native-XID stacking adapter raises them on root
window events (with a 250 ms fallback), without requesting focus. This fixes
coverage by windows opened after Blink. The order is overlay, guides, answer
deck, Blink; the deck sits under Blink so bubbles never cover menu pills.
The card stays open while it has focus, a non-empty draft, a pending chip or
an open file dialog; Esc and the close button always close it, and a refused
leave closes it as soon as nothing holds it. A capture re-claims the keyboard
for the card for 500 ms, because the closing selector hands it back to the
previous window. On macOS alone, use the Spaces API
for all-workspace/fullscreen visibility. Ordinary drawing overlays ignore all
mouse input. Region selection is a separate temporary interactive window.

All screen geometry is DIP, with explicit captured pixel dimensions and a frozen
display/region snapshot. A model rectangle maps from capture pixels into that
snapshot before becoming display-local overlay geometry. Never multiply by the
current display scale twice. Discard/re-capture a guide after display changes or
content moves; a stale overlay must not point at a different control.

## Linux spike and reproducible evidence

Reports live at `/home/levi/oss-engine/reports/glimpse-v3/`. Throwaway code was
executed first, before the scaffold: `spike/main.cjs`, `probe.mjs`, `run.sh`.
`spike/desktop-proof.json` and three PNGs record a real 1280×800 Xvfb X11 screen
with xfwm4 compositing. Assertions read desktopCapturer pixels, not a DOM mock:

- A fully transparent corner over blue `[32,64,128]` remains exactly blue.
- The 40% green body becomes `[43,126,137]`, within rounding tolerance of the
  alpha blend `[44,126,137]`; the desktop really shows through.
- XTest native clicks outside the shape reach the underlying window. A click
  inside reaches Blink. The underlying application retains keyboard focus and
  Blink reports always-on-top.
- Hiding owned windows before capture restores the same background pixel in the
  screenshot; Blink is absent.
- A full-display transparent overlay draws around the captured red target at
  `(400,200,100,80)`; its border is green, its interior stays red, and a native
  click passes through to the underlying target.

The repository tests repeat these properties against the actual scaffold,
including opening the underlying window after Blink. Both tests also pass
against the packaged Linux executable (`packaged-e2e.log`), proving production
dependencies were bundled despite npm workspace hoisting. Run:

```sh
export PATH="$HOME/.local/node24/bin:$PATH"
npm ci
npm run desktop:check
xvfb-run -a -s '-screen 0 1280x800x24 +extension Composite' \
  dbus-run-session -- bash desktop/e2e/linux.sh
npm run desktop:build
```

Dependencies on Linux: Xvfb, xfwm4, dbus-x11, libXtst, Python 3, Electron's normal
shared libraries. Pixel evidence requires a compositor, not Xvfb alone. This
proves X11 on this host, not native Wayland, macOS Spaces, Windows exclusive
fullscreen, or a physical mixed-DPI monitor arrangement. Those are release gates.

## Claude Code 2.1.296: actual Remote Control path

The host's logged-in `claude` was used with tiny Haiku/low prompts, no separate
API key. Saved CLI help is in `spike/claude-help.txt` and
`spike/remote-control-help.txt`. Findings:

| Path                                                              | Result and decision                                                                                                                                                                                                          |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing interactive session and plugin MCP                       | Ordinary MCP tools cannot push unsolicited user turns. Channels need startup authorization/flags for a custom channel; the plugin cannot silently retroactively grant that to the session where the slash command was typed. |
| `--resume <origin>` from another process                          | Resuming a live origin creates competing writers; it is not safe live injection and does not by itself enable Remote Control. Do not do it.                                                                                  |
| `claude remote-control --name Blinkling --spawn session`          | Connected successfully, but owns its own interactive/session launch lifecycle rather than the required persistent stream-json input.                                                                                         |
| `claude -p --remote-control Blinkling ...`                        | A local turn completed, but this headless flag combination did not enable a remote bridge. A successful local answer is insufficient evidence of F.                                                                          |
| Persistent `-p`, stream-json in/out, SDK `remote_control` request | **Chosen and proved**. Creates a remotely visible named owned session, forwards images, accepts remote input, resumes the same remote session, and permits live model/effort controls.                                       |

The plugin therefore automatically starts a **Blinkling-owned session**. Prefer
the origin only if a future documented, already authorized live transport is
actually available; never request a user flag or fork the active origin behind
their back. The fallback is expressly allowed by F3.

Start the owned child with `-p --input-format stream-json --output-format
stream-json --verbose --include-partial-messages --replay-user-messages --name
Blinkling --model <selected> --effort <selected>`. The scaffold disables tools
and inherited MCP configuration; screen understanding does not require arbitrary
shell execution. Clear any inherited nested-Claude marker only in the owned
child's environment when integrating the launcher, not globally.

After `initialize`, send this newline-delimited control request:

```json
{
  "type": "control_request",
  "request_id": "unique-id",
  "request": {
    "subtype": "remote_control",
    "enabled": true,
    "name": "Blinkling",
    "keep_session_on_exit": true
  }
}
```

Wait for success containing `session_url` and `bridge_session_id`, plus bridge
status. Send every producer's turn through this same child, with a stable UUID
and content blocks containing the **actual image base64**, not a local pathname.
The CLI handles the authenticated remote transport. The application must not
read OAuth credentials or use the private REST endpoints used for this spike.

Observed local session: `0655f9be-8755-4166-9425-f7fe9cb078dc`.
Observed remote session: `cse_01WdPooY8VrSHfCyzYHUL9de`.
Remote URL: <https://claude.ai/code/session_01WdPooY8VrSHfCyzYHUL9de>.

Evidence in the report (`session-evidence.json` indexes exact JSONL line numbers):

- `session-metadata.json`: the remote service returns this ID with title
  **Blinkling** and status **active** after the owned process has exited.
- `scaffold-session.json`: the repository transport itself reattached to that
  same session and confirmed applied Haiku/low, then disposed its child.

- `enabled.stdout.jsonl`: remote-control success, connected bridge state, PNG
  user turn asking the color, assistant answer **Red.**
- `remote-events.json`: server-side remote transcript includes the PNG's image
  block and **Red.**, not merely a local transcript.
- `roundtrip.stdout.jsonl`: process restart with `--resume` local ID and
  `reattach_session_id` remote ID returned the same URL/identity.
- `remote-post.json`, `remote-roundtrip-events.json`: a remote-endpoint message
  **Reply PONG.** reached the resumed stream and produced **PONG.**, present in
  both the local stream and remote event store. The remote event was sent by a
  protocol test client, not by manually clicking the phone/browser UI. Claude
  classified its sender as another session. UI rendering and human-origin
  phone/browser messaging remain explicit manual acceptance checks.
- `roundtrip.stdout.jsonl`: `set_model` to `sonnet`, then
  `apply_flag_settings` with `effortLevel: medium`, followed by `get_settings`,
  reported applied model `claude-sonnet-5-5` and effort `medium`. The probe then
  restored Haiku/low. These were session controls, not cosmetic UI state.

Each probe used its own child process group and terminated it in `finally`.
No probe Claude process is intentionally left running. Raw reports are local
research artifacts, not release assets; do not publish local settings/debug logs.

**Compatibility risk:** `remote_control`, `apply_flag_settings` and remote
reattachment are implemented SDK controls in 2.1.296, discovered by inspecting
the installed executable and proved live, but are not a stable documented CLI
contract. The scaffold rejects unverified CLI versions. The session builder
must add a version compatibility table and a live canary before expanding it.
Never silently downgrade to a local-only session: that violates F1.

The picker applies only between turns. Serialize selection with turn admission,
issue `set_model`, then `apply_flag_settings`, read `get_settings.applied`, and
show the effective values only after acknowledgement. On unsupported selection,
retain the previous confirmed values. Launch/resume uses the saved selection.
Do not hard-code the illustrative model labels from the brief as available IDs.

Recovery must persist `{localId, remoteId, url, selection, lastEventId}` atomically
in the OS user-data directory. Maintain one writer with a lock. Resume the local
ID and reattach the remote ID; never create a new session for every screenshot.
Use bounded exponential retry with jitter, a status dot and an outbox keyed by
turn UUID. Reconcile transcript IDs before replay to avoid duplicate paid turns.
Remote user events and assistant deltas feed the same normalized message store
as desktop turns; deduplicate replayed events. Stop sends `interrupt`; exiting
closes streams and terminates only the owned child. The integrated durable
adapter implements this recovery above the low-level transport scaffold.

## Module ownership and interfaces

`desktop/shared/contracts.ts` is the integration contract. Builders should agree
on any change before changing it; the shell bucket owns edits to that file.

| Module                                     | Responsibility / boundary                                                                                                                                               |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `desktop/main/`, `preload/`, `shared/`     | Window lifecycle, geometry, validated IPC, display policy and service composition. No feature logic in preload.                                                         |
| `desktop/renderer/`, `character/`, `menu/` | House Blink rig/state machine, hover/drag/pin, spring menu, animated silhouette input regions.                                                                          |
| `desktop/messages/`, `composer/`           | Normalized conversation store, streamed sentence bubbles, structured rendering, attachments, picker and rounded card.                                                   |
| `desktop/capture/`                         | `CaptureService`: screen, cancellable region, optional full-page companion. Hides all owned surfaces and restores them in `finally`.                                    |
| `desktop/locator/`                         | Element locator: what is under a point, from the companion DOM, then OS accessibility, then pixels; snapping; secure fields never read. See "Element locator (M1, M2)". |
| `desktop/overlay/`, `autowatch/`           | `OverlayService`: capture-coordinate drawings/steps/dismissal; low-rate screen-change policy and typing pause.                                                          |
| `desktop/session/`                         | Durable `SessionBridge`: connect, send, select, stop, subscribe, dispose; normalized events, persistence, locking, retry and remote resume above `OwnedSession`.        |
| `plugin/desktop/`                          | Platform asset selection, pinned digest verification, atomic installation, launcher and companion host. No published V3 binary is assumed.                              |
| `bridge/`, `extension/`, existing `src/`   | Optional browser capabilities and legacy compatibility; route their AI turns through the desktop session when connected.                                                |
| `desktop/distribution/`, `e2e/`            | Native package build and desktop verification.                                                                                                                          |

`Turn` includes a UUID, text, attachments and source (composer, quick-ask, guide,
auto-explain, companion). `Capture` includes an immutable display, DIP region,
pixel dimensions, image and timestamp. `SessionEvent` separates connection
status from user-visible assistant content. The integrated session uses the
composer's bounded conversion path for images, validated PDFs and UTF-8 text,
Markdown, CSV and JSON files. Limits are eight attachments, 20 MB each, 32 MB
combined and 200,000 characters per text file. Unsupported files are rejected
instead of pretending to send them. Guide output needs a validated schema
of regions, steps, labels and arrows, never executable model-generated HTML.

## Element locator (M1, M2)

`desktop/locator/` answers one question for pick, pointing, privacy and the
guide: what is under this point, and how big is it. It is created once by the
shell (`createLocator({ companion, platform, capture })`) and the same object is
handed to `installPick`, `installPrivacy`, capture and pointing as
`shell.locator`. Callers code against the interface below and nothing else.

```ts
type Rect = { x: number; y: number; width: number; height: number }; // screen DIP
type Kind =
  | "paragraph"
  | "sentence"
  | "heading"
  | "section"
  | "text"
  | "image"
  | "figure"
  | "table"
  | "cell"
  | "code"
  | "formula"
  | "chart"
  | "video"
  | "canvas"
  | "link"
  | "button"
  | "control"
  | "input"
  | "window"
  | "page";
type WindowRef = {
  id: string;
  title: string;
  app: string;
  bounds: Rect;
  private: boolean;
  passwordManager: boolean;
};
type DisplayRef = { id: string; scaleFactor: number; bounds: Rect };
type Element = {
  id: string; // '<source>:<windowId>:<n>', source is dom | ax | image
  kind: Kind;
  bounds: Rect;
  role: string;
  name: string;
  text: string; // capped at 4000
  window: WindowRef;
  display: DisplayRef;
  secure?: true; // a bare marker: kind "input", empty name and text, no content
  content?: {
    markdown?: string;
    code?: string;
    language?: string;
    latex?: string;
    mathml?: string;
  };
};
type Locator = {
  locate(point): Promise<Element | null>; // hover answer, 50 ms budget
  elements(window: WindowRef): Promise<Element[]>;
  parent(el: Element): Promise<Element | null>;
  sentenceAt(el: Element, point): Promise<Element | null>;
  selectionAt(point): Promise<Element | null>;
  textIn(rect: Rect): Promise<string>; // capped at 4000, never secure
  focus(): Promise<{ secure: boolean; window: WindowRef | null }>;
  windowAt(point): Promise<WindowRef | null>;
  snap(
    rect: Rect,
    opts?: { kinds?: Kind[] },
  ): Promise<{ rect: Rect; element: Element | null }>;
};
```

**Sources and fall-through.** Each window is read by up to three sources, in
this order, and the first one that has an element under the point answers:

1. **DOM**, from the companion extension (`companion.elements`), for browser
   windows only. The companion's rectangles are viewport CSS pixels and become
   screen DIP as `css * frame.zoom + frame.screenX/Y`. PDF viewers and pages
   the extension cannot read answer `null`, which means "fall through".
2. **OS accessibility**: AT-SPI on Linux, AX on macOS, UI Automation on
   Windows. Each is a small helper in `desktop/locator/native/` that prints one
   JSON tree; the JavaScript side maps roles to kinds, so the three platforms
   share one mapping and one set of tests. An app with no accessibility tree
   answers an empty tree, which means "fall through".
3. **Image**, from a fresh capture of the window: connected non-background
   regions become `image`/`figure`, runs of glyph-sized ink are clustered into
   text lines and lines into `paragraph`s. It reads no characters (no OCR), so
   its `text` is empty and callers send the pixels.

**Speed (M10).** Hover answers within 50 ms because a read is never awaited
past a 30 ms budget. Each source keeps one snapshot per window; a point is hit
tested against the snapshot, which is in memory. A stale snapshot is answered
from and refreshed in the background, a missing one is raced against the
budget and otherwise falls through. An image answer is never given for a window
whose DOM or accessibility read has not finished, because pixels cannot tell a
secure field from text; the hover answers `null` until the read lands.

Snapshots are dropped when the window moves, resizes, is raised or the window
list changes, when browser zoom changes, on scroll (including nested
containers), on a mutation with no input, and on keys that move content
(Enter, Backspace, Delete, paging and arrow keys), not on every key. The
shell calls `locator.invalidate()` for the input it sees.

**Click is fail-closed.** Before a click is taken the picker invalidates and
waits for a fresh read of the window under the pointer. If that read cannot
finish within the budget, the pick locks instead of using the stale answer.

**Secure fields.** Password, card and `data-private` fields are never read. A
secure element is returned only as a bare marker (`secure: true`, empty
`name`, `text` and no `content`; it keeps `id`, `window`, `bounds` and
`kind: "input"`) so a caller can lock. `locate`, `elements` and `parent` all
return that marker; `textIn`, `sentenceAt` and `snap` skip it, and nothing in
this module ever holds its value.
`focus().secure` is true while the focused control is a secure field, and
`focus().window` carries the `private` and `passwordManager` flags the privacy
rules read.

**Snapping (M2).** `snap(rect, { kinds })` moves a model box onto the real
element it points at: the candidate with the greatest overlap with the rect
(by intersection over union, at least 0.3) that has an allowed kind, in screen
DIP so it is the same at scale factor 1, 1.5 and 2 and across displays. With
no such element the rect comes back unchanged and `element` is `null`.

## Distribution without store accounts

Release through GitHub only; the desktop never depends on Chrome/Edge, Apple or
Microsoft store approval. Use architecture-specific artifacts: macOS arm64/x64
ZIPs containing an app bundle, Windows x64/arm64 ZIPs with a portable executable,
and Linux x64/arm64 tar.gz bundles. A Debian package/AppImage may be secondary;
the plugin's primary Linux bundle must not require FUSE or root installation.
Build each OS on its native runner. The scaffold packages the host architecture
only; the release bucket expands the matrix and makes the archives.

macOS: recursively ad-hoc sign on the macOS runner (`identity: '-'`), preserving
helper/entitlement requirements, then verify with `codesign --verify --deep
--strict`. Install at the stable `~/Applications/Blinkling.app` path with bundle
ID `com.blinkling.desktop`; store data separately. No Apple Developer account,
Developer ID signature or notarization is claimed. A plugin HTTPS download and
controlled extraction must not introduce a browser quarantine attribute. Check
only the newly verified owned bundle for quarantine; never run blanket recursive
unblocking over user folders. A browser-downloaded archive can trigger Gatekeeper;
show an accurate animated Open Anyway fallback if the OS requires it. A signature
check and a real fresh-Mac launch are release gates, not inferred from Linux CI.

Screen Recording is OS consent and cannot be silently granted. On first capture,
check authorization, remember the pending intent, open the exact settings pane,
show the correct switch for the OS version and resume/restart once granted.
**Ad-hoc signatures do not guarantee TCC permission persistence across updates**:
keeping the bundle ID and installation path is necessary but not sufficient.
Decision: use ad-hoc signing for the no-account main path, test a two-version
upgrade on each supported macOS release, and preserve a pending capture through
an automatic permission-recovery flow if macOS invalidates consent. Do not claim
“asks once forever.” If D4 is interpreted as forbidding any upgrade re-consent,
that release gate requires a persistent local signing identity or a stable
capture helper proven to retain TCC identity; the spike has not established it.
Do not freeze an insecure capture helper forever just to preserve permission.

Windows: verify hashes before extracting/launching in the per-user application
directory, with no elevation. Unsigned builds can prompt SmartScreen/Defender;
no installer may promise to bypass all machine policy. Avoid introducing a
Mark-of-the-Web on the plugin's own verified download. If the OS still prompts,
show the accurate one-action fallback where supported, with an animation.
Linux: install under XDG data/cache paths, check graphical session availability,
launch without sudo. Native Wayland needs portal consent and does not universally
allow absolute window positioning/global hit-testing; test XWayland compatibility
and native sessions separately before claiming support. Do not silently capture
a remote SSH host when the user means their local desktop.

The launcher contract is a versioned plugin-embedded manifest with OS, arch,
asset URL, SHA-256, archive type and entry point. Pin the manifest to the plugin
release (or verify its signature with an embedded release public key); fetching
an unsigned checksum beside an arbitrary binary is insufficient. The stub
already rejects wrong origins, unsupported targets and corrupt archives.
Download with size/time limits to a temporary file; verify before extraction;
reject traversal/symlinks escaping the staging directory; atomically promote to
a versioned cache. Verify cache contents against the manifest before reuse,
serialize installs, preserve the previous working version, and pass arguments
as arrays. Launch/deduplicate by authenticated local IPC, not process-name kills.
Register the idempotent launcher in plugin SessionStart integration so future
Claude Code sessions reconnect automatically after the initial slash command.
No user pairing codes. No arbitrary port input. `/blinkling:blinkling` now invokes
the verified desktop launcher. The empty embedded release manifest fails closed
until published V3 builds and their pinned hashes are available.

I2 also requires an OS-detected/preselected installation guide showing only that
OS's steps, a short looping animation for **every** action, minimal text and
command-copy buttons. Welcome is exactly three steps inside Blink (hello,
permission, try area capture). Companion installation is separate, reveals a
visible folder selected in Finder/Explorer, shows its full path/copy, and animates
Load unpacked. Measure fresh-machine action counts and time from each localized
README: no more than three user actions after Claude Code is installed. Record
OS prompts honestly; an over-budget result blocks release rather than being
excluded from the count.

## Tests and completion gates

Unit tests cover pixel/DIP transforms at 100/150/200%, negative monitor origins,
control correlation/timeouts/teardown, image content preservation, exact session
resume and launcher integrity rejection. Electron tests inspect sandbox settings,
IPC rejection, real composited alpha, native input/focus, capture exclusion and
overlay alignment. The Linux test has zero retries; failure is not hidden by a
retry. Native macOS/Windows smoke and package jobs are in `desktop.yml`; they
have not run on this host. No existing test is skipped or relaxed.

The spike verification passed 1,021 V2 unit tests, all 261 extension E2E tests
(18.4 minutes), plugin build/test/validation, 10 desktop/launcher unit tests,
and both source and packaged Electron tests. Lint and formatting passed.

The full V2 unit/build/plugin/extension suite remains a regression gate. New
builders add behavioral tests beside their owned modules, and cross-feature
acceptance cases under the release bucket's E2E ownership. Required release
scenarios include hover exit after 1.5 seconds, drag/display persistence, pin,
menu bounds in both themes at all three scales, streaming/bubble history/code,
capture/Enter/Esc/quick chips, fixed-header full-page capture, all AI producers
in one remote image-bearing session, remote human input, reconnect without lost
or duplicated turns, multi-display overlays, typing-paused auto explain, fresh
installs and macOS upgrades. Measure frame timings on real desktops; synthetic
60 Hz timers do not establish 60 fps.

The release bucket updates all nine READMEs with real desktop GIFs, retains the
exact final line `Assisted by Claude/Codex.`, checks translation/PDF/paper/selection
companion flows, and updates all release/plugin/app versions to 3.0.0 together.
Root and extension versions intentionally remain 2.1.0 in this scaffold.

The machine-readable nonoverlapping ownership plan is
`/home/levi/oss-engine/reports/glimpse-v3/build.json`. Every A–J and I2 item is
allocated there. No bucket is acceptance-complete merely because its stub exists.

## Primary references

- [Electron transparent windows and input behavior](https://www.electronjs.org/docs/latest/api/browser-window)
- [Electron desktop capture](https://www.electronjs.org/docs/latest/api/desktop-capturer)
- [Electron system permissions](https://www.electronjs.org/docs/latest/api/system-preferences)
- [Claude Code Remote Control](https://code.claude.com/docs/en/remote-control)
- [Claude Code CLI reference](https://code.claude.com/docs/en/cli-reference)
- [Claude Code channels reference](https://code.claude.com/docs/en/channels-reference)
- [Apple code signing and identity requirements](https://developer.apple.com/library/archive/technotes/tn2206/_index.html)

Documentation establishes supported concepts; the saved live transcript is the
evidence for the version-specific headless controls, not a claim that those
controls are publicly guaranteed APIs.
