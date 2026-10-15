---
description: Explicitly start or stop changed-frame screen watching
---

Start `screen_watch_start` only when the user explicitly asks for a watch. Explain that it samples serially at a chosen 5-to-60-second interval, retains changed images only, and makes no model calls. Use `screen_watch_stop` when asked to stop. Narrate only after reviewing the retained frames, never start automatically.
