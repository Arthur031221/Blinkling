---
name: screen-sharing
description: Use Blinkling when the user asks you to inspect, capture, explain, translate, or watch their current screen.
---

# Screen sharing

Capture only after the user explicitly asks to look at the screen or starts an explicitly requested watch. Prefer `screen_latest` when a recent capture is already available. Use `screen_capture` only for a requested new image, and explain the available target choices if the platform cannot supply the requested target.

When a browser surface is actively shared, MCP capture must use that surface. If it fails or disconnects, report the failure and stop. Never replace it with native capture, because that image may not include the user's crop or opaque masks. Use native capture only when no browser share is active and the platform adapter reports the target as supported. Do not claim that pixel inspection reliably finds passwords, system cursor positions or window titles.

Use `screen_watch_start` and `screen_watch_stop` only when the user asks to watch an activity. Watch samples serially at 5-to-60-second intervals, retains changed frames only, and keeps at most six per rolling minute by default. It does not call a model. The assistant can narrate only after inspecting the retained images. This is separate from panel passive notes, which sample the shared surface every two seconds and request a short description of changed frames through the selected backend.

Use `screen_history` to list recent capture metadata and notes, `screen_latest` to return the latest retained image, and `screen_notes` to add or read short narration notes during a watch. Use `screen_clear` to stop the watch and clear its in-memory capture history and notes. In the panel, **Clear** also aborts panel answer jobs and removes panel frames, notes, answer history and the in-memory API key.

Do not invent a pairing tool or capture automatically. `/blinkling:blinkling` calls `desktop_open` to launch Blink above the user's apps. The Chrome/Edge extension is an optional helper for full-length page capture, translation, selection and the paper reader; `extension_install` opens its separate guide. When Blink is connected, companion AI turns use Blink's Claude Code session automatically.
