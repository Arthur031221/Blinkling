# Changelog

## 2.1.0 - 2026-10-14

The floating bubble, capture flow, page guides and welcome guide now follow the account holder's hands-on feedback.

- Keep the bubble quiet with idle, hover and active opacity, a compact Blink control, edge placement and remembered window position.
- Put Capture whole screen, Pick an area and Guide this page first. Auto explain combines automatic questions and page summaries, with at most three suggested questions and shorter structured answers.
- Request capture access where it is needed. Clear and restore the native floating window during screen capture, keep crop gestures working across displays, and remove the manual reopen step.
- Guide the whole page through reading regions and paragraphs, with an annotated overview and a Next/Back tour. Background guide redraws preserve the user's focus.
- Use a three-step welcome guide in all nine languages, a visible `~/Glimpselet-extension` folder and automatic browser connection. Reuse the latest project conversation unless a live channel is available.
- Keep the plugin, extension, bridge, installation instructions and packaged assets at version 2.1.0.

Native window opacity, click-through and focus remain subject to browser and operating system limits. Automatic screen summaries still pause for whole monitors, native windows and unknown sharing sources. Live terminal delivery requires the opt-in Claude Code channel; session continuation cannot inject messages into a terminal that is already running.

See the [release notes](docs/releases/v2.1.0.md) and [install guide](docs/INSTALL.md).

## 2.0.0 - 2026-10-13

Glimpselet moves into a Chrome and Edge extension. Its Document Picture-in-Picture chat stays above other tabs and apps. Float is the first action, and screen sharing starts inside the bubble.

- Crop a frozen shared screen in a full screen selector with resize handles, pixel dimensions, Enter to confirm and Esc to cancel. Hold Shift to select on a supported page or in the bubble. Browser and global crop shortcuts are remappable.
- Ask follow-up questions with streamed replies, model and effort choices, copy, pin and Stop. Capture a visible tab, full page, region, element or shared screen.
- Send questions to a running Claude Code conversation through the opt-in channel preview. A selected recent session can also run as a labelled parallel continuation. A dedicated conversation is the default.
- Get suggested questions, opt-in passive summaries with pause and usage estimates, guides drawn over page controls, reversible translation and selection actions.
- Read PDFs in the bundled PDF.js reader and ask about selected passages.
- Follow a Chinese or English welcome tour. Load the extension in your browser, or try a dedicated Chromium profile on a local desktop. Remote hosts get an SSH forwarding command for the computer running the browser.
- Request page access when needed. Pairing tokens and optional API keys stay in browser session storage. Captures stay in memory. Glimpselet has no telemetry or publisher-operated answer service.
- Include the extension ZIP, Chrome and Edge submission kits, checksums, store copy, privacy policy and browser recordings. Store submission is handled by the account holder.

Desktop Chromium browsers are required. Unpacked installs show a developer banner and need manual updates. Restricted browser pages cannot be scripted. Native apps support screen captures and chat, while page guides require a web page. Automatic summaries pause for whole monitors, native windows and unknown sharing sources. The floating window cannot pass clicks through, and browser rules limit automatic opening and placement.

See the [release notes](docs/releases/v2.0.0.md), [install guide](docs/INSTALL.md) and [store preparation](docs/STORE.md).
