# Desktop conversation surfaces

`mountConversation()` composes the message store, composer controller, rounded
card and answer deck. It consumes the existing `SessionBridge` contract from
`desktop/shared/contracts.ts`; it neither starts Claude nor owns a session.
All AI producers must share the main process's one bridge. The controller
serializes local selection and turn admission; the bridge must also serialize
across windows, remote input and other producers, and perform durable recovery.

The shell supplies separate focusable card and non-focusable bubble windows.
Set `webPreferences.backgroundThrottling: false` for visible conversation
surfaces: Electron otherwise throttles the unfocused answer window's animation
frames. Hide/destroy inactive surfaces through the shell's visibility policy.
Load `composer/index.html` in each isolated, sandboxed renderer, with `surface`
set to `card` or `bubbles`. Keep navigation/new windows denied. This entry point
uses only local modules and has a restrictive CSP. The existing scaffold main
and preload are intentionally outside this bucket's ownership; they still need
to mount these surfaces when the shell/session buckets are integrated.

The narrow preload adapter in `renderer.mjs` expects:

| Method                                       | Behavior                                                                                                                                              |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `configuration()`                            | Confirmed `selection`, `surface`, optional supported `models`/`efforts` (`{id,label}` arrays), optional `quietMs`. Do not invent available model IDs. |
| `sendTurn(turn)`                             | Validate sender and payload, admit through the one `SessionBridge`, acknowledge admission. UUID, actual base64 attachments and source are preserved.  |
| `select(selection)`                          | Call the bridge between turns; resolve **confirmed applied** `{model,effort}`. Reject unsupported values without changing the confirmed selection.    |
| `stop()`                                     | Bridge interrupt; `done` releases the busy state.                                                                                                     |
| `onEvent(listener)`                          | Subscribe to normalized `SessionEvent`; return unsubscribe. Replay history in order when rebuilding a surface.                                        |
| `onCapture(listener)`                        | Forward the `Capture` object or its image attachment after capture confirmation; optional `text: Attachment` adds the removable window-text chip.     |
| `onSurface(listener)`                        | `{type:'hover',value}`, `{type:'open',messageId?,seed?}`, or `{type:'close'}`. Hover from Blink revives the answer deck.                              |
| `activity({visible,speaking})`               | Drive Blink's mouth and native answer visibility/peek policy; choose the active surface in the shell.                                                 |
| `pin(boolean)`, `close()`, `typing(boolean)` | Shell pin/return-to-peek, native card close/focus restoration, and auto-explain typing pause.                                                         |
| `hold({chips,dialog,pointer?})`              | Tell the shell a pending attachment chip or an open file dialog must keep the card open when the pointer leaves.                                      |
| `openChat(messageId)`                        | Open the focusable full card at the selected answer.                                                                                                  |
| `openLink(url)`                              | Validate the URL in main before opening it externally.                                                                                                |

Methods other than the first five are optional when mounting a single DOM host
directly. `mountConversation` also accepts explicit callbacks for all shell
behaviors, plus clipboard/link adapters. Call `dispose()` before destroying a
surface; subscriptions, hover holds, timers and event listeners are released.
Pass capture errors to the shell, not to the assistant transcript. Connection
events affect only the small status dot. Shell geometry/hit regions must keep
the card/deck within the target display's DIP work area, leave transparent space
click-through, and hide both surfaces during native capture.

## The card

- **Keyboard.** `openComposer({ focus = true, seed } = {})` in the shell gives
  the card the keyboard and keeps asking for a short settle period
  (`claimFocus` in `main/card-hold.mjs`), because a window manager may hand it
  back to the window that was active. Esc, X and an unpinned send return it to
  the previous application. A click elsewhere after the settle period wins.
- **Seed.** `seed = { conversationId, draft, attachments }` is a draft
  and chips (picked regions are attachments). The shell checks
  it with `validSeed`; the card applies it with `composer.seed`, replacing the
  draft and chips in one step.
- **What keeps it open.** Focus, a draft, a pending chip, an open file dialog
  and the pointer on the card all hold it against a leave. Unpinning never
  closes it directly; the shell decides with the same rule.
- **Esc** closes the topmost thing: an open model or effort list, then the
  card.
- **Strings** are in `strings.mjs` (nine locales, English fallback) and follow
  the system language; errors carry codes that the card translates. Model names
  come from one function, `modelLabel` in `models.mjs`; efforts are low,
  medium, high, xhigh and max.
- **The dot** is shown only while the connection is retrying, blocked or
  disconnected.
- **Chips** are tiles at least 48 px tall that wrap onto at most two rows at the
  narrowest card; there is no inner scroll.

`attachmentContent()` is the main/session-side encoder: PNG/JPEG/WebP/GIF become
image blocks with actual base64; PDF becomes a base64 document; UTF-8 TXT/MD/CSV/
JSON becomes a text document. Limits are eight attachments, 20 MiB each, 32 MiB
total, and 200,000 characters per decoded text document. Unsupported formats,
invalid base64/PDF headers and invalid UTF-8 reject without clearing the draft.
The scaffold's image-only `session/protocol.mjs` must use this encoder during
session integration; otherwise non-image files will correctly reject there.
The real Claude canary demonstrates both content encodings at that boundary.

The K1 capture payload can add `text?: Attachment` (`text/plain`, UTF-8 base64,
for example `視窗文字.txt`) beside `image`. The composer attaches both atomically,
shows separate removable chips, and sends only those retained by the user.
Image-only captures work unchanged. Accessibility extraction, secure-field
exclusion and its text cap belong to the capture service; the shell owner should
add this optional field to the shared `Capture` contract when integrating K1.
No shared contract was edited by this bucket.

## Verification

From the repository root, with Node 24 in PATH:

```sh
export BLINKLING_REPORT_DIR=/home/levi/oss-engine/reports/glimpse-v3/build-2
npm run desktop:test
xvfb-run -a -s '-screen 0 1920x1440x24 +extension Composite' \
  dbus-run-session -- bash -c 'xfwm4 --compositor=on >/tmp/blinkling-conversation-wm.log 2>&1 & wm=$!; trap "kill $wm" EXIT; sleep 2; npx playwright test -c desktop/composer/e2e/playwright.config.mjs'
```

The display must be at least 1600x1000: at 200% a smaller one leaves a card too
short for two rows of chip tiles, and the chip layout test says so by failing.
The suite also needs a compositing window manager; without one the transparent
corner checks fail.

The normal suite has zero retries and needs no Claude account. It loads the
production renderer in actual transparent Electron windows, with a deterministic
main-process bridge boundary. It checks native clipboard/file selection,
keyboard behavior, streaming, picker acknowledgements/rejection, hover and wheel
history, bounds at three widths/scales/themes and compositor frame intervals.

For the explicit logged-in CLI 2.1.296 canary, replace the configuration path with
`desktop/composer/e2e/live.config.mjs`. It creates one isolated owned Remote
Control session, confirms controls, sends two one-word prompts (image and text
file), and terminates its child. It is separate so normal unit/CI runs never
silently consume the user's Claude quota. No API key or credential access.
Screenshots/evidence use `BLINKLING_REPORT_DIR`, defaulting to the ignored
`test-results/conversation-artifacts/` directory for portable local/CI runs.
