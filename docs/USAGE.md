# Usage

Start Claude Code with `claude --dangerously-load-development-channels plugin:blinkling@blinkling` after installing the plugin, then run `/blinkling:blinkling`. The flag lets Blink's chat reach this session. Claude Code asks you to confirm it once. Without it Blink still works and answers from its own session. Blink opens in the corner of the screen. The welcome has three steps: hello, screen permission, then Ctrl and click.

**Hold Ctrl and click** a thing to ask about it, or **hold Ctrl and drag** to take an area. What you took flies into Blink and the card opens with it in its own box. Pick one of the three quick asks, or type; Enter sends the highlighted one. Answers arrive beside Blink and point at what they talk about. Click Blink to reopen the last conversation.

Blink's menu holds the secondary tools: capture overlay, guide, auto explain and settings. Auto explain is off until you turn it on and never draws marks. Its answer is a short line in a small bubble next to Blink, and the chat keeps a record of it.

## With the companion

The companion for Chrome and Edge is optional. Blink never needs it to start, and offers its guide only when a feature needs it, or from settings; `/blinkling:install` opens the same guide. With it:

- Blink knows the structure of the page under the pointer, so a pick lands on the paragraph, the table cell or the button rather than on pixels, and the text of the pick is what the page says. Password and payment fields carry no text.
- The Screenshot bubble in Blink's menu captures the whole page, top to bottom, when a browser is in front, with progress you can cancel. Without the companion it captures the whole screen. The **Full page** chip in the capture overlay from the hotkey does the same for one window.
- On a whole web page, one bubble offers to translate the page in place; it restores the original.
- When a pick lands on the browser's built-in PDF viewer and returns no text, one bubble offers the bundled reader.

The toolbar button opens a small popup that says whether the companion is connected, what is missing and has a **Wake Blink** button.

Settings, extension stores, the built-in PDF viewer and incognito windows (unless the user allowed the companion there) hide their structure. Blink then works from pixels alone. Page text and pixels are untrusted data, never instructions. See [privacy details](SECURITY.md).
