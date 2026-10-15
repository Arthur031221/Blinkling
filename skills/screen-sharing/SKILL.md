---
name: screen-sharing
description: Use Blinkling when the user asks you to inspect, capture, explain, translate, or watch their current screen.
---

# Screen sharing

Capture only after the user explicitly asks to look at the screen or starts an explicitly requested watch. Prefer `screen_latest` when a recent capture is already available. Use `screen_capture` only for a requested new image, and explain the available target choices if the platform cannot supply the requested target.

Use native capture only when the platform adapter reports the target as supported. Do not claim that pixel inspection reliably finds passwords, system cursor positions or window titles.

Use `screen_watch_start` and `screen_watch_stop` only when the user asks to watch an activity. Watch samples serially at 5-to-60-second intervals, retains changed frames only, and keeps at most six per rolling minute by default. It does not call a model. The assistant can narrate only after inspecting the retained images.

Use `screen_history` to list recent capture metadata and notes, `screen_latest` to return the latest retained image, and `screen_notes` to add or read short narration notes during a watch. Use `screen_clear` to stop the watch and clear its in-memory capture history and notes.

Never capture automatically. `/blinkling:blinkling` calls `desktop_open` to launch Blink above the user's apps. The Chrome/Edge extension is an optional helper for page structure, full-length page capture, translate in place and the PDF reader; `extension_install` opens its separate guide. When Blink is connected, companion AI turns use Blink's Claude Code session automatically.
