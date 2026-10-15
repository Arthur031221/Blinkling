# Store listing copy

Use this copy for Chrome Web Store and Microsoft Edge Add-ons. Neither listing has been published.

## Shared listing fields

**Name:** Blinkling

**Short description:** The companion for Blink, the small desktop helper: it shows Blink what is on the page you point at.

**Category:** Productivity

**Language:** English

**Website:** https://arthur031221.github.io/Blinkling/

**Privacy policy:** https://arthur031221.github.io/Blinkling/privacy.html

**Support:** https://github.com/Arthur031221/Blinkling/issues

**Single purpose:** Give the Blinkling desktop app the structure, full-length capture, translation and PDF text of the browser page the user points at.

## Description

Blink is a small character on your desktop. Hold Ctrl and click anything on your screen to ask Claude Code about it. This extension is Blink's optional companion for Chrome and Edge. It does nothing on its own.

With it, Blink knows what is on the page under the pointer: the paragraph, the table cell, the button, with the page's own text and names instead of guesses from pixels. It can capture a whole page from top to bottom, translate the page in place and restore it, and open a PDF in a bundled reader when the browser's viewer hides its text.

The toolbar button opens a small popup that says whether the companion is connected, what is missing, and has a Wake Blink button.

The companion talks only to the Blinkling app on your own computer. It has no servers, no telemetry and no account. Password and payment fields are never read. It works in nine languages and follows your browser's language.

Blinkling needs the desktop app and the Claude Code plugin; install them first, then run `/blinkling:install` in Claude Code to connect the extension. Setup is automatic. Nobody types a code. Desktop Chrome and Edge only. Settings, extension stores and the browser's own PDF viewer are protected pages that browsers do not let any extension read.

## Chrome submission notes

Upload `blinkling-extension.zip` from the Chrome submission kit. Paste the permission and privacy explanations from [`STORE.md`](STORE.md) into the dashboard. No remote code is used.

## Edge submission notes

Upload `blinkling-extension.zip` from the Edge submission kit. In Partner Center, the manifest initially supplies the name and short description. Use the long description above for the listing.

**Search terms:** Blink, Claude Code, page structure, screen capture, translation, PDF reader

## Reviewer instructions

1. Install the ZIP in a current desktop Chrome or Edge. The toolbar button opens the status popup, which reads **not connected** at first.
2. Install the Claude Code plugin with the two commands in the README and run `/blinkling:install`. The setup page connects the extension automatically; the popup then reads **connected**. No publisher credentials are embedded or required, and Blink needs the reviewer's own signed-in Claude Code for answers.
3. Hold Ctrl and click a paragraph of an ordinary HTTPS page: Blink answers about that paragraph. Pick the 整頁 chip in the composer to capture the whole page. Ask Blink to translate a page and then to restore the original. Point at a PDF in the browser's viewer: Blink opens it in the extension's bundled reader.
4. Open a page with a password field, point at it and ask: the field carries no text.

The account holder must arrange temporary reviewer access if the store requests it. Do not put an account password or key in the public listing or submission archive.
