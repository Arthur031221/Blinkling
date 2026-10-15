# Usage

Run `/blinkling:blinkling` after installing the plugin. Blink appears in a corner of your screen.

**Ask about something.** Hold Ctrl (Control on macOS, Option if you switch it in settings) and click a thing to ask about it. Hold Ctrl and drag past a few pixels to take an area instead. Ctrl+click on an empty area or a title bar takes the whole window. What was taken flies into Blink and the mini composer opens; the highlighted chip is what Enter sends. The answer comes as message bubbles from Blink, which point at what they talk about.

**Talk to Blink.** Click Blink to open the mini composer with the last conversation. A long message or Shift+Enter grows it into the full composer, which keeps the model and effort pickers and the pin.

**Quiet extras.** Hover Blink and rest the pointer for a moment to fan out the menu: capture (the same overlay as Ctrl and drag, for mouse-only use and the global hotkey), guide, auto explain and settings. Guide draws numbered marks that match the bubbles; the arrow keys or a click on a bubble focus one step, and Esc ends it. A finished guide can be saved as Markdown with its annotated screenshots to Documents/Blinkling Guides. Auto explain is off by default, adds at most two bubbles, never draws marks, and pauses while you type.

**Browser helper (optional).** Run `/blinkling:install` once to add the helper to Chrome or Edge. It adds no chat of its own. Its toolbar popup shows what is connected or missing and has a Wake Blink button. With it, Blink knows what each element on a page is (password fields are never read), takes a full-length page capture, translates a whole page in place with a toggle back, and opens PDFs in a reader when the browser's own viewer gives no text.

Settings, extension stores and protected pages block page tools; Blink then works from the screenshot alone. See [privacy details](SECURITY.md).
