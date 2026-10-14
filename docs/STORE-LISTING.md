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

Capture whole screen or pick an area. Hold Shift and drag on a supported page or in the bubble, then press Enter to confirm or Esc to cancel. The floating bubble clears itself during shared-screen capture and returns afterwards. Use browser and global crop shortcuts, and remap them in your browser.

Ask follow-up questions with streamed replies. Choose Opus, Sonnet or Haiku, copy or pin answers, and stop a request. Auto explain suggests up to three questions and summarizes changes. It starts off and can be paused with Alt+P.

Guide this page gives an overview and a Next/Back tour of reading regions, sections and controls. Select a passage to ask, explain or translate. Translate page text in place and restore it, or open a paper in the bundled PDF reader.

Connect to the Claude Code plugin using your own signed-in account. A three-step welcome guide in nine languages installs the extension, connects automatically and opens the bubble. On a local desktop, try a separate Chromium profile without installing into your regular browser. Remote hosts provide an SSH command for the browser computer. A verified opt-in channel sends questions into the running terminal conversation. Otherwise, Glimpselet continues the latest saved project conversation in a separate process. Avoid simultaneous terminal work on that transcript. Direct Anthropic API mode with your own key is also available.

Glimpselet has no telemetry or publisher-operated answer service. Chosen context and captures go to your backend; provider usage and retention terms apply. Pairing tokens and API keys use browser session storage. After consent and site access, Auto explain can summarize page changes without screen sharing. Password fields, blocked hosts and inaccessible embedded pages pause automatic page requests. Shared browser tabs must remain bound to the inspected tab. Shared monitors and apps need separate consent for each share because their pixels cannot be checked for passwords or blocked websites. Unknown sources remain paused. Hide private content before sharing.

Desktop Chromium browsers are required. Settings, extension stores and protected pages block page tools. Native apps provide captures and chat; guides and in-place translation need a web page. PDFs use the bundled reader. Native windows cannot pass clicks through, and browser rules limit opacity and placement.

## Chrome submission notes

Upload `glimpselet-extension.zip` from the Chrome submission kit. Use the four 1280×800 screenshots, `promo.png` at 440×280, and `icons/blink-128.png` from the extension for the store icon. Paste the permission and privacy explanations from [`STORE.md`](STORE.md) into the dashboard. No remote code is used.

## Edge submission notes

Upload `glimpselet-extension.zip` from the Edge submission kit. Use the same four screenshots, tile and icon. In Partner Center, the manifest initially supplies the name and short description. Use the long description above for the listing.

**Search terms:** floating chat, Claude Code, screen capture, page guide, translation, PDF reader

## Reviewer instructions

1. Install the ZIP in a current desktop Chrome or Edge. Use the toolbar button or Alt+Shift+G to open Glimpselet. Choose **Open floating panel**.
2. For real answers, either install the Claude Code plugin with the two commands in the README and run `/glimpselet:glimpse`, or choose direct API mode with your own Anthropic key. The extension cannot provide live answers without a user-supplied backend. No publisher credentials are embedded or required.
3. Connect automatically using the three-step welcome guide. Open an ordinary HTTPS page and grant site access when requested. Enable **Auto explain** and test a suggested question, a follow-up and a selected-area crop. Use **Guide this page**, **Translate page**, **Restore**, and the text selection popover. Open a PDF through the bundled reader.
4. In the floating window, choose **Capture whole screen**, pick a source, and use **Pick an area** or Shift. Verify the full screen selector, resize handles, Enter and Esc. Stop sharing afterwards. Auto explain is optional. Verify its separate image-consent prompt for a monitor or app and stop sharing afterwards.
5. To inspect the appearance without an answer backend, visit the website's prerecorded chat. It is labelled and makes no provider calls. Store screenshots also use local example replies and guide steps with the real extension UI.

The account holder must arrange temporary reviewer backend access if the store requests it. Do not put an account password, API key or pairing token in the public listing or submission archive.

For version 2.1.0, also verify the overview and reading-region tour, the minimized Blink control, remembered placement, and the separate image-consent prompt when Auto explain is enabled for a monitor or app. With Auto explain off, these sources must not trigger automatic requests.
