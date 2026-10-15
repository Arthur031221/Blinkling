# Store listing copy

Use this copy for Chrome Web Store and Microsoft Edge Add-ons. Neither listing has been published.

## Shared listing fields

**Name:** Blinkling

**Short description:** A quiet helper for Blink, the desktop companion: page structure, full-length capture, in-place translation and a PDF reader.

**Category:** Productivity

**Language:** English

**Website:** https://arthur031221.github.io/Glimpselet/

**Privacy policy:** https://arthur031221.github.io/Glimpselet/privacy.html

**Support:** https://github.com/Arthur031221/Glimpselet/issues

**Single purpose:** Tell the Blink desktop companion what is on the page the user points at, and offer page tools to it: full-length capture, in-place translation and a PDF reader.

## Description

Blink is a small companion in the corner of your screen. Hold Ctrl and click something to ask Claude Code about it. This extension is Blink's optional helper in the browser. It has no chat of its own.

With the helper, Blink knows what each element under your pointer is, so it can point at the right thing. It takes a full-length capture of a long page, translates a page in place and back, and opens PDFs in a reader when the browser's own viewer gives Blink no text. Password fields are reported as secure, with no text and no value.

Click the toolbar button to see the status in one line each: connected, and what is missing. **Wake Blink** opens the companion. **Allow on all sites** grants the one-time site access that full-length capture and page structure need. The popup follows the browser language in nine languages. Pairing is automatic: the install guide connects the helper to Blink without any code to type.

Blinkling has no telemetry or publisher-operated answer service. The helper talks only to the Blinkling bridge on 127.0.0.1 of the same computer, and Blink asks the Claude Code you are signed in to on that computer. The helper answers a request only after you point at something.

Desktop Chromium browsers are required. Settings, extension stores and protected pages block page tools; Blink then works from the screenshot alone.

## Chrome submission notes

Upload `blinkling-extension.zip` from the Chrome submission kit. Use the screenshots, `promo.png` at 440×280, and `icons/blink-128.png` from the extension for the store icon. Paste the permission and privacy explanations from [`STORE.md`](STORE.md) into the dashboard. No remote code is used.

## Edge submission notes

Upload `blinkling-extension.zip` from the Edge submission kit. Use the same screenshots, tile and icon. In Partner Center, the manifest initially supplies the name and short description. Use the long description above for the listing.

**Search terms:** Blink, Claude Code, page structure, full page capture, translation, PDF reader

## Reviewer instructions

1. Install the ZIP in a current desktop Chrome or Edge, and install the Claude Code plugin with the two commands in the README. Run `/blinkling:blinkling` to wake Blink and `/blinkling:install` to open the install guide. The extension needs Blink and a signed-in Claude Code on the same computer to do anything; no publisher credentials are embedded or required.
2. The guide connects the helper by itself. Click the toolbar button: the popup should show the link and Blink as connected. Press **Wake Blink** and check that Blink appears.
3. Open an ordinary HTTPS page and press **Allow on all sites**. Hold Ctrl in Blink and click an element: Blink points at it. Choose full-length capture in Blink's menu on a long page, then translate the page and restore it. Open a PDF through the bundled reader.
4. A page with a password field must be reported without that field's text or value.

The account holder must arrange temporary reviewer access if the store requests it. Do not put an account password or token in the public listing or submission archive.
