# Changelog

## Unreleased

- Typed messages now get an answer or a visible reason. The version check accepts command line tool builds 2.1.296 and later in the 2.1 line instead of one exact build. The command is found in the usual install folders and through a login shell, because an app opened from the Dock gets a minimal PATH. When a session cannot start, Blink says why in a bubble and the log records it.
- macOS: Blink no longer hangs on quit when an input method such as Zhuyin is active. The native key hook is left for the exit to release.
- Close joins the menu as a fifth bubble and always quits. If shutdown stalls, the app exits after three seconds. A display too short for the fifth bubble keeps the four that matter.
- Opening Blinkling again while it runs brings the running one forward, and replaces one that no longer answers. Blink quits when the session that started it ends.
- Language picker. Settings has a Language row with the system default and all nine languages, each in its own words. Choosing one restarts Blink so every window speaks it, and it ranks above the system language. The install page has the same picker, saved in the browser, with the page text, the copy buttons and the animation labels in all nine languages.
- The quick box and the chat card now share one toolbar: a plus button that attaches files and images, and lists for model, effort and permission. Permission offers Ask first and Plan, since Blink runs without tools. The choice is checked with the session, and a refused switch shows a short notice instead of failing silently.
- The quick box and the chat card are anchored to Blink's mouth. Each rises from just under the mouth, beside Blink on the side with room, and goes with Blink when it is carried, dropped or moved to another display. Before, the quick box was placed once when it opened and stayed behind. It still moves to the other side of Blink, never away from it, to keep off what was picked.

## 3.0.1 - 2026-10-15

- macOS: the Ctrl pick key needs the Accessibility permission, which the first run never asked for, so on a Mac the pick could silently do nothing. Blinkling now raises the system prompt once and starts listening for the key as soon as you allow it, with no restart. The README, the install guide and docs/INSTALL.md say so.
- Guide mode failure and closing bubbles follow the system language in all nine languages. They were fixed Traditional Chinese for everyone.
- The Full page chip falls back to the visible part of the window when the page grab fails, and the attachment is now named Visible part so it is not mistaken for the whole page. The docs name the chip the way the app shows it.

## 3.0.0 - 2026-10-15

Blink is now a desktop companion: a small character in the corner of your screen. Hold Ctrl and click a thing, or hold Ctrl and drag an area, and ask Claude Code about it. This release also makes it easy to install.

- The whole product is one gesture. Ctrl and click picks a thing, Ctrl and drag takes an area, and what you took flies into a mini composer with three quick asks. Answers arrive in bubbles beside Blink, and clicking Blink reopens the last conversation. The welcome has three steps.
- The menu keeps the capture overlay, guide, auto explain (off until you turn it on) and settings. The Chrome and Edge companion stays optional.
- Removed from v2: the Picture-in-Picture chat window, the passive summary card, suggested questions, the select-to-ask popover, SSH remote mode, pairing codes, API key mode, the zero-install browser window, "Try without installing", the hands-on tour and the browser panel. Blink uses the Claude Code already signed in on the same computer. `docs/FEATURES.md` lists every feature and its tier.
- The nine READMEs, the install guide and the demo page are rewritten for 3.0. Their recordings (`assets/pick.gif`, `assets/ask.gif`) and store images show the real desktop app on a web page, made by `assets/record/record.sh` and checked by `check-release.py`.

- Release builds: `Blinkling-<version>-mac-arm64.zip`, `mac-x64.zip`, `win-x64.exe` and `linux-x64.AppImage`, with `SHA256SUMS`. The workflow publishes them and pins them, by digest and size, in `plugin/desktop/manifest.json`. A dry run builds and installs every build on its own system without publishing.
- The launcher accepts the Blinkling and the old Glimpselet repository addresses, follows GitHub's redirects only to GitHub hosts, and checks the downloaded size as well as the SHA-256.
- Linux: the Chromium sandbox is chosen from what the kernel offers. On Ubuntu 24.04 with restricted user namespaces Blink starts without the sandbox instead of aborting.
- Windows installs remove any `Zone.Identifier` stream from the extracted program.
- `startWithClaudeCode=false` now keeps `start.mjs --background` from opening Blink.
- The plugin and packages report 3.0.0, and both install scripts read one default repository.

Glimpselet is now called Blinkling. The mascot is still Blink.

- Switch from the old plugin with `/plugin uninstall glimpselet@glimpselet` and `/plugin marketplace remove glimpselet`, then add the marketplace again and install `blinkling@blinkling`. The main command is now `/blinkling:blinkling`. The other commands keep their names.
- The plugin, packages, binaries, app bundle and release assets use the new name. Environment switches are now `BLINKLING_*`, and the old `GLIMPSELET_*` names are still read as a fallback for this release.
- On first start, settings, saved guides, the extension folder and cached builds move quietly from the old Glimpselet folders to the Blinkling ones, once. Nothing the new version already wrote is overwritten.
- The repository address is now github.com/Arthur031221/Blinkling. The launcher also accepts the old address, which GitHub redirects.

## 2.1.0 - 2026-10-14

The floating bubble, capture flow, page guides and welcome guide now follow the account holder's hands-on feedback.

- Keep the bubble quiet with idle, hover and active opacity, a compact Blink control, edge placement and remembered window position.
- Put Capture whole screen, Pick an area and Guide this page first. Auto explain combines automatic questions and page summaries, with at most three suggested questions and shorter structured answers.
- Request capture access where it is needed. Clear and restore the native floating window during screen capture, keep crop gestures working across displays, and remove the manual reopen step.
- Guide the whole page through reading regions and paragraphs, with an annotated overview and a Next/Back tour. Background guide redraws preserve the user's focus.
- Use a three-step welcome guide in all nine languages, a visible `~/Glimpselet-extension` folder and automatic browser connection. Reuse the latest project conversation unless a live channel is available.
- Support automatic explanations of shared monitors and apps after separate consent for each share. Mask the bubble in monitor frames and ignore unchanged frames. Keep password, blocked-site and embedded-page checks for browser pages.
- Use shorter headings, lists and paragraphs for Chinese, Japanese and Korean answers. Remove the second consent screen and practice exercises from the welcome flow.
- Rewrite all nine READMEs with three-step installation and real Google Flights and arXiv recordings. Keep the plugin, extension, bridge and packages at version 2.1.0.

Native window opacity, click-through and focus remain subject to browser and operating system limits. Unknown sharing sources remain paused. Automatic screen and app explanations require per-share consent because page privacy checks cannot inspect those pixels. If Escape prevents the native bubble from reopening, the preserved chat opens in a companion popup with a button to restore floating mode. Live terminal delivery requires the opt-in Claude Code channel; session continuation cannot inject messages into a terminal that is already running.

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
