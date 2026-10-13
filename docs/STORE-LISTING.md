# Store listing copy

Use this copy for Chrome Web Store and Microsoft Edge Add-ons. Neither listing has been published.

## Shared listing fields

**Name:** Glimpselet

**Short description:** Ask Claude Code about a page or shared screen from a floating chat. Capture, translate and follow on-page guides.

**Category:** Productivity

**Language:** English

**Website:** https://arthur031221.github.io/Glimpselet/

**Privacy policy:** https://arthur031221.github.io/Glimpselet/privacy.html

**Support:** https://github.com/Arthur031221/Glimpselet/issues

**Single purpose:** Help users understand the page or screen they choose to share, through a floating chat, captures and reading tools.

## Description

Keep a small chat beside what you're reading. Glimpselet floats above your tabs and apps, so you can ask about a page or screen without switching back to a chat tab.

Capture a visible tab, a full page, one element or an area you select. For another app, start screen sharing inside the bubble and crop the frozen screen in full screen. Hold Shift to crop on a supported page or in the bubble. Shortcuts can be remapped in your browser.

Ask follow-up questions with streamed replies. Choose Opus, Sonnet or Haiku, copy or pin an answer, and stop a request. Suggested questions use page text after consent. Optional passive summaries can be paused at any time.

Guide mode draws circles and notes around real page controls. Translate page text in place and restore the original. Select text to explain, translate or ask about it. Open papers in the bundled PDF reader to select and discuss passages.

Connect to the Glimpselet Claude Code plugin using your own signed-in account. Run Claude Code remotely? The welcome guide gives you an SSH tunnel command for the computer with your browser. An opt-in channel preview sends bubble questions into a running terminal conversation. Without the channel, use a dedicated conversation or a clearly labelled parallel continuation. Direct Anthropic API mode with your own key is also available.

The Chinese and English welcome guide walks you through pairing and a practice page. On a local desktop you can also try a dedicated Chromium profile without installing into your regular browser.

Glimpselet has no telemetry or publisher-operated answer service. Page context and chosen captures go to your selected backend for chat and reading features. Pairing tokens and API keys use browser session storage. Your provider's usage and retention terms apply.

Desktop Chromium browsers are required. Browser settings, extension stores and some managed pages block page tools. Native apps support screen captures and chat. Guides and in-place translation need a web page. PDFs use the Glimpselet reader. The floating window cannot pass clicks through.

## Chrome submission notes

Upload `glimpselet-extension.zip` from the Chrome submission kit. Use the four 1280×800 screenshots, `promo.png` at 440×280, and `icons/blink-128.png` from the extension for the store icon. Paste the permission and privacy explanations from [`STORE.md`](STORE.md) into the dashboard. No remote code is used.

## Edge submission notes

Upload `glimpselet-extension.zip` from the Edge submission kit. Use the same four screenshots, tile and icon. In Partner Center, the manifest initially supplies the name and short description. Use the long description above for the listing.

**Search terms:** floating chat, Claude Code, screen capture, page guide, translation, PDF reader

## Reviewer instructions

1. Install the ZIP in a current desktop Chrome or Edge. Use the toolbar button or Alt+Shift+G to open Glimpselet. Read the consent screen and choose **Open floating chat**. Use **Float** if the browser requires another gesture.
2. For real answers, either install the Claude Code plugin with the two commands in the README and run `/glimpselet:glimpse`, or choose direct API mode with your own Anthropic key. The extension cannot provide live answers without a user-supplied backend. No publisher credentials are embedded or required.
3. Pair using the welcome guide. Open an ordinary HTTPS page and grant site access when requested. Test a suggested question, a follow-up and a selected-area crop. Use **Guide this page**, **Translate page**, **Restore**, and the text selection popover. Open a PDF through the bundled reader.
4. In the floating window, choose **Share a screen**, pick a source, and use Crop or Shift. Verify the full screen selector, resize handles, Enter and Esc. Stop sharing afterwards. Passive summaries are optional and pause for sources that cannot be inspected as a browser tab.
5. To inspect the appearance without an answer backend, visit the website's prerecorded chat. It is labelled and makes no provider calls. Store screenshots also use local example replies and guide steps with the real extension UI.

The account holder must arrange temporary reviewer backend access if the store requests it. Do not put an account password, API key or pairing token in the public listing or submission archive.
