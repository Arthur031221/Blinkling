# Changelog

## 3.2.6 - unreleased

- A Mac without Node.js now gets a working install. Every plugin command starts through `bin/blinkling-run` (a shell script, with a small `blinkling-run.exe` stub and a `.cmd` file for the Windows MCP server), which finds Node.js 22 or newer (PATH, Homebrew, Volta, asdf, mise, nvm, fnm) or fetches a private, SHA-256 checked copy into `~/.blinkling/runtime/node`. Hooks exit quietly without Node.js and say so once. A test runs every hook command and the MCP handshake with a PATH that has no node.
- The README no longer says Node.js is not required on Windows. Windows needs Node.js 22 or newer from nodejs.org, while macOS and Linux fetch a private copy. `.mcp.json` names the extensionless `bin/blinkling-run`: macOS and Linux run the shell script, and Windows resolves the same name to `bin/blinkling-run.exe`, a stub built in CI. CI spawns that exact command without a shell and then installs the plugin into Claude Code 2.1.302 on Windows, where `claude mcp list` reports the server connected. The same check passes on Linux with a PATH that has no Node.js (the launcher fetched its private copy).
- Every README and the install doc list Node.js 22 or newer as a Windows prerequisite before step 1, and the open command tells a Windows user whose MCP server is down to install it and run `/mcp`, instead of waiting for a download that only macOS and Linux do.
- A card, its tail and a dropped Blink are measured from Blink's real window frame, so they stay together where the frame starts below the display's corner.
- One question has one answer: the first reply is final. A later reply is told it came late and changes nothing.
- On macOS a click away from Blinkling is heard before Input Monitoring is allowed, by a second helper mode that only reads the mouse buttons and stops once the key tap is up.
- A click inside Settings or the welcome no longer closes the card, and the next click on the background still ends it.
- The translate demo is recorded with the app pinned to English, its answer text is kept with the recording, and a test reads that the answer is in the language its caption names.
- Desktop tests pass on Node 22 as well as 24, because a request that waits keeps the event loop alive. The conversation spec expects Haiku 5.5.
- What is and is not isolated between chats: a card follows its own session's chat and its history, but an answer to a capture, Auto explain or a dropped question comes from Blink's own shared session, whose model, effort and context every chat uses.

## 3.2.5 - 2026-10-18

- The chat card can be resized by dragging its edges and corners, within limits, and it keeps its size. A card beside a low Blink reaches the bottom of the work area.
- The chat list shows live sessions only, with one chat per live session. Every live chat has the model and effort pickers and the quick chips. A capture goes to the newest session, and Auto explain and a dropped question are answered inside the session's own chat.
- Answers are drawn like a chat answer: headings, nested lists, tables with alignment, quotes, inline code and highlighted fenced code in monospace. The history stays at the newest message when the layout grows.
- Under every answer there are copy, ask again, read aloud and its time. Under every message there are its time, a delivered mark, copy and edit. Every copy goes through the system clipboard, so the code copy button works.
- The Guide ignores clicks on its own marks, labels, panel and buttons, and a click on the background ends it at every phase. Step 1 comes first with its place in the tour, and a closed guide can be shown again without a new run. On macOS and Windows the card and Blink are raised over the guide's marks, so no frame crosses the card.
- Auto explain stays inside Blink and is stopped there, and its answer opens the card. A draft that sits idle no longer holds it back, turning it on asks even with a draft in the card, and End tour frees Blink's session.
- Each model has its own transformation scene and leaves one signature piece on Blink, and each effort level has its own one-off show with props. A Settings switch turns the costume effects off, and the choice is kept across restarts. The piece stays on while Blink peeks at an edge, and it is mirrored at the right edge like the left.
- Models are labelled Opus 5.5, Sonnet 5.5, Haiku 5.5 and Fable 5.1 everywhere.
- The card opens when Blink's renderer reports that the swallow is done, with the timer only as an upper bound, and a failed flight still waits for the swallow before the card opens.
- The permission bubble closes with Esc, with its own close button and with a click on the background. A card that opened without focus closes with Esc.
- On X11 the screen is read after four settle frames instead of eight, so Blink is out of sight about 60 ms less.
- On Windows the window shape Blink is clipped to follows what a model leaves on Blink, including the props, the guide stick and the pose of a worn piece, and the hit check reads that shape. A long press on any part of the drawn Blink picks it up, and one outside falls through.
- When a question from Blink arrives while a typed prompt is still being answered, the terminal's own answer is no longer swallowed. It is read from the transcript and shown in the chat first, and Blink answers once after it if the terminal ignored the question.
- A very long page is cut at the tile limit and still gives a full page chip, so a paired browser no longer falls back to the visible part.
- Smaller: a picked paragraph or text file reaches the terminal as its text, an unset quit key says so in Settings, the first start notice never blocks, a press on a resize handle no longer snaps the card, and the docs no longer describe the small composer.

## 3.2.4 - 2026-10-18

- The card's paper is solid where the message list starts, so an answer's text never mixes with the page behind the card, and the four demos are recorded again with it.

## 3.2.3 - 2026-10-17

- A capture lands in Blink's mouth, and the card opens only after the swallow, on every edge and at every display scale. The picture is aimed from the same transform that draws Blink.
- A quick chip sends exactly the words on the button, with no added line about length or brevity, in Blink's own session and through the channel to the terminal session.
- There is one dialog box. The small quick window is gone, a capture goes into the big card's own box, and clicking Blink while the card is open never makes a second surface.
- The Guide is the first version again: the parts of the page are framed and named, the card has Back, Done, All steps and End tour, and Blink holds the guide stick and points at the framed part as the steps change.
- Auto explain takes the whole screen and asks what it is. The card shows only the picture and the answer, never the prompt, and it stays until you close it. It asks again only when the screen has changed enough.
- The full page button shows a progress bubble, the page flies into Blink's mouth like any capture, and then the card opens with one full page chip and its thumbnail.
- The idle grumble stays at the edge: Blink does not come out, and the bubble shows beside the peeking head.
- A Claude Code session that Blink has not met starts a brand new chat. The card follows it as soon as it links and starts empty, nothing of an earlier session is replayed into it, and the older chats stay in the switcher.
- A click on the desktop background closes the menu bubbles, the progress bubble, speech bubbles and the card in one go, and Blink goes back to its edge. A pinned card stays, and the idle grumble bubble is left alone.
- A quit key ends Blink within about a second from any state, even when a window is hung, and tells the linked terminal sessions that Blink was closed. It is Ctrl+Alt+Shift+B on Windows and Linux and Ctrl+Option+Command+B on macOS, and it can be changed in Settings.
- Changing the model or the effort dresses Blink for a few seconds: a crown and cape for Opus, glasses and a notebook for Sonnet, a scarf and a paper plane for Haiku, a storyteller's hat for Fable. The effort picks the move, from a small nod to a spin with sparkles. Nothing plays at start up or when the same value is picked again.
- The model list has Opus, Sonnet, Haiku and Fable, and every model is shown with its version, such as Opus 5.5 or Fable 5.1, in the list and on the selected value. A stored alias shows the version it stands for now.
- Pointing at a part of Blink triggers that part's reaction where the part is drawn. The hit zones and the drawing share one transform, with tests at scale 1 and 2, work area offsets and every edge. Setting BLINKLING_DEBUG_HIT=1 draws the zones.
- The capture progress bubble and the idle grumble bubble draw on Windows too. Blink is hidden from the capture itself on macOS and Windows, and on Linux it hides for as short a time as it can.
- Smaller: a new capture clears the old pointing marks, the card title sits on solid paper, and a terminal session started with the channel flag whose events are dropped is told about the quit through the notice hook like any other session. The open command says nothing about the start command when there is no Sync line.
- Pressing Esc to close the card no longer sends Blink to its edge as if you had clicked away: the blur that follows is only the hidden card giving up the keyboard. The guide stick is kept out of the screen watch like Blink itself, and a capture waits long enough for a hidden surface to be gone before the screen is read. The guide's screen watch skips a frame taken just after Blink's own windows moved, so moving the card to the next step cannot end the tour by itself.
- The four demos are recorded again from this build at twice the pixels and 30 frames a second. The READMEs show animated WebP files 1280 px wide, and the site plays H.264 MP4 and WebM video at 1920 px with a sharp poster, at its natural size.

## 3.2.2 - 2026-10-17

- Start Claude Code with `claude --dangerously-load-development-channels plugin:blinkling@blinkling`, then type `/blinkling:blinkling`. The flag lets Blink's chat reach this session. Claude Code asks you to confirm it once. Without it Blink still works and answers from its own session.
- The card follows Blink on every pointer event of a drag, so its tail stays on the mouth in every frame, also near the screen edges, instead of catching up when the drag stops.
- A slow capture shows its progress in a bubble beside Blink. The card opens only after the picture has been eaten, with no frame where both Blink and the card vanish.
- A click on the desktop closes the card on macOS and Windows too, through the global mouse hook, even when the card opened by itself without focus. On macOS this needs the Accessibility permission. Linux behaves as before.
- The Guide stick is longer and is aimed at the current step from every edge. The Step n of N header sits on solid paper outside the card's top fade, so it reads clearly.
- The welcome shows the start command and its one line of explanation on a connect page, and drops the permission page where nothing is asked. The plugin command no longer says that no launch flag is needed.
- Terminal chats no longer show the paste markers a terminal session adds, such as [Image #1] or [Pasted text #2]. A question that the linked terminal session never takes is answered by Blink after ten seconds, once, with one line that says so, and a late answer from the terminal is dropped.
- The provider prompt no longer limits the length of an answer, so a chip gets the answer to exactly its words. The Guide keeps its one sentence per step, because it is a tour.
- The tiles of a full page capture show as one page chip in the composer, and removing the chip removes every tile.
- The pointing instructions now tell the model to keep an element's name in the sentence and put the numbered mark right after it, and never a mark in place of a name. This is checked on the instructions, not on a live model answer.
- The Settings and welcome panels move off the chat card when either one opens, so the two never overlap, whichever opens first.
- The four README recordings are made again from this build.

## 3.2.1 - 2026-10-17

- Start Claude Code with `claude --dangerously-load-development-channels plugin:blinkling@blinkling`, then type `/blinkling:blinkling`. The flag lets Blink's chat reach this session. Claude Code asks you to confirm it once. Without it Blink still works and answers from its own session. Every README, the install guide, the site, the demo page, the installers and Settings say the same line. The plain `--channels` flag was tried and Claude Code 2.1.301 refuses it for this plugin as "not on the approved channels allowlist", so the development flag stays.
- One terminal session is one chat in Blink. What you type in the terminal appears in Blink on the right, Claude's answer on the left, and what you type in Blink is answered in the terminal by the same session through the channel and the reply tool, with no raw markup and no double answers. A session that goes away with a question open answers it as closed instead of leaving the card waiting.
- The card and Blink behave as one. The card follows Blink while it is carried and its tail stays on the mouth. A click on the background hides the card and sends Blink back at once, also while an answer streams, and the answer goes into the history. Leaving Blink with no card open sends it back after a short corridor grace. An empty card is short and grows from Blink's mouth, and it fades softly toward its top. The menu and the card never share the screen. Blink also stays out beside Settings and the welcome while they are open.
- Touching Blink reacts where it is drawn. Hover zones follow Blink's real shape in every pose and edge, and the peeking head answers where it is drawn even when the system keeps the window off the menu bar or the Dock. The idle grumble shows again after a failed action.
- The Guide is a short tour again: at most ten steps and only the regions they point at, a Step n of N header, an All steps list, and Blink points at the current step with a stick. The full page button always answers, with a line that it has begun, a retry on failure and a note when it is busy. Auto explain looks at the whole screen, asks at once when you turn it on, then asks again only when the screen changed enough.
- One composer. A capture goes into the card's own box, Enter on an empty box sends the highlighted chip, and the quick window is gone. The eat is faster and aims at the mouth on every edge, and the card opens only after it. No prompt Blink sends limits the length of the answer.
- The language changes in place: every window, the menu and the card take the new words at once with no reload and no restart. Dragging or double clicking a Settings or welcome header no longer selects its title. After the image viewer closes, the card is back on the newest answer, and it stays there when the composer grows.
- Starting is quicker: typing /blinkling starts Blink from the prompt hook straight away, without waiting for the model's turn before the open call, which took about 9 seconds.
- Picking text in a Linux browser now takes what you point at. A paragraph that holds links reads with the words of the links instead of blank marks, and pointing at a comma or a space between two links picks the paragraph instead of that one mark. A paragraph from an accessibility tree is read like other text: the sentence under the pointer first, then the paragraph.
- A Guide on a photo-heavy page is no longer closed a second after it appears. The picture the model saw and the live screen are now shrunk the same way before they are compared, so photos and fine text no longer read as the page having changed.
- The Guide shows its own controls. Start, Back and Next sit under the step text, and the card that opens while the screen is read is faded out of the picture like Blink and the menu, so the guide marks sit on the page and not on a half faded card.
- Privacy guard on every capture path. The one click Screenshot bubble, the largest visible area, the pick and the full screen all hide Blink's own windows before the picture is taken, including a window that appears during the first fade.
- The README shows three demos side by side, recorded again from this build: a paper (pick a paragraph, it flies into Blink's mouth, the answer streams), an Arabic Wikipedia article (the Translate chip), and a page that is hard to operate (the step by step Guide). Each is about 20 seconds and under 4 MB.

## 3.2.0 - 2026-10-16

- The chat card is the one place answers appear. It points at Blink's mouth, sits close to its body, follows it, and can be dragged a short way by its header, with the spot remembered for each edge. It shows the thinking dots with a changing word, keeps messages tight with your side tinted green, fades at the top, and opens at the newest message. An answer opens it by itself.
- Blink stays out while you read, scroll or type, and goes back to its edge only after a short quiet time. The old answer deck is gone, and every surface that could be left behind now closes by time, Esc, a click outside or leaving it.
- A picture in the card opens in a viewer with wheel and pinch zoom from fit to 800 percent, drag to pan, a double click between fit and 100 percent, and Esc or a click on the backdrop to close. Settings, welcome and the quick box can be moved a short way by their header.
- Capture is whole. The screenshot bubble and the full screen bubble take the picture, Blink eats it and the question opens with it. The picture flies into Blink's mouth above Blink the whole way and is cut at the mouth, so it visibly goes in. A whole page from the browser extension arrives as every tile. When the page cannot be scrolled, or no extension is connected, you get what is on the screen and one line says why.
- A picked rectangle gets an exact rounded frame in Blink green with a light and a dark hairline, and one calm light runs round it clockwise at a steady speed.
- Blink looks and moves better. The right edge matches the left, the bottom edge shows the eyes, cheeks and both hands, the legs stay whole when it turns upright, and its click area is its drawn shape plus a small margin. It now plays the missing motions: appear, leave, turn, walk, pick, catching a file, celebrate, shrug, whirl and dizzy.
- Guide and Auto explain run to the end without holding the app. Whole screen pictures are compressed on a worker thread, and a measured pass at 100 and 200 percent shows no frame over 50 ms and no long task.
- Starting is faster. An installed build is trusted by its fingerprint and Blink no longer waits for the archive check: 824 ms instead of 2168 ms.
- The terminal session and Blink's chat follow each other. A prompt and a finished answer typed in the session that opened Blink appear in Blink's chat, and Blink's chat reaches a session started with the development channel flag. Lines are never sent back to where they came from.
- Answers are no longer cut short by a length rule in the system prompt. All nine tools carry a title and the read only, destructive, idempotent and open world hints. Every README links the newest release notes.
- The release job commits the pinned builds as Arthur031221 with the private noreply address, so the history no longer shows github-actions[bot] for new releases.

## 3.1.0 - 2026-10-16

- The Screenshot bubble takes the largest area you can see in one click. With a browser in front and the companion connected it captures the whole page, including the parts above and below the scroll. Otherwise, or if the page grab fails, it captures the whole screen. The hotkey still opens the selection overlay.
- Typed messages now get an answer or a visible reason. The version check accepts command line tool builds 2.1.296 and later in the 2.1 line instead of one exact build. The command is found in the usual install folders and through a login shell, because an app opened from the Dock gets a minimal PATH. When a session cannot start, Blink says why in a bubble and the log records it. A message typed in the linked web or phone session shows up in Blink, and a fake 2.1.300 child proves the two way flow in the tests.
- macOS: the pick key no longer shares Blink's main thread. The old in-process key hook handed every key to the main thread and deadlocked with input methods such as Zhuyin, which froze Blink and then blocked quitting. Keys now come from a small separate helper that only listens and never waits for the app, and it ends when Blink does. It tries a listen only tap first and falls back to the default tap that the Accessibility switch already allows.
- Close joins the menu as a fifth bubble and always quits. If shutdown stalls, the app exits by itself within four seconds, even when the app is stuck inside a system call. A display too short for the fifth bubble keeps the four that matter.
- Opening Blinkling again while it runs brings the running one forward, and replaces one that no longer answers. Blink quits when the session that started it ends.
- Language picker. Settings has a Language row with the system default and all nine languages, each in its own words. Choosing one restarts Blink so every window speaks it, and it ranks above the system language. The install page has the same picker, saved in the browser, with the page text, the copy buttons and the animation labels in all nine languages.
- The quick box and the chat card now share one toolbar: a plus button that attaches files and images, and lists for model, effort and permission. Permission offers Ask first and Plan, since Blink runs without tools. The choice is checked with the session, and a refused switch shows a short notice instead of failing silently.
- The quick box and the chat card are anchored to Blink's mouth. Each rises from just under the mouth, beside Blink on the side with room, and goes with Blink when it is carried, dropped or moved to another display. Before, the quick box was placed once when it opened and stayed behind. It still moves to the other side of Blink, never away from it, to keep off what was picked.
- Blink is smaller, and it has more to do. A held Blink no longer turns into a tall box: it trembles, its eyes go wide, a sweat drop slides down and its legs dangle. Swing it round in two full circles and it gets dizzy, with spiral eyes, stars and a sway that settles in a couple of seconds. Touching its head, cheeks, belly, hands or feet each gets a different reaction, and moving away ends it. After a quiet minute Blink thinks out loud in a cloud bubble, one of eight short lines in your language, never the same one twice in a row. It stays quiet while it is busy or you are using it, and the bubble never takes a click.
- The Ctrl pick is smoother and keeps going. Auto detect and dragging keep working after a capture while the key stays held, and captures pile up. The auto box morphs into the dragged rectangle instead of staying behind, text is marked with a highlighter stroke just under the baseline, and a bright spot runs clockwise round a rectangle capture's border. On release the captures are sucked into Blink's mouth like a macOS genie, Blink chews more, and its eyes follow the cursor while you pick. The quick box keeps every capture from the hold, and clicking a thumbnail opens the full image. A one time hint says that holding the key takes several captures, in all nine languages.
- Every picture of Blink is the new one: the logo, the browser helper icons, the app icon, the permission page, the demo recordings, the store images and the social card. The pick hint now stays on screen when the pointer is next to the right edge of the display.

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
