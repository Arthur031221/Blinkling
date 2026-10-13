# v2 validation

This records the local candidate tested on Linux on 13 October 2026. It does not claim that the candidate has been published or tested on a Mac.

## Automated checks

Run the project checks from the repository root:

```sh
npm ci
npm run check
npm run test:e2e
npm run test:screen
npm run test:launcher
npm run validate:plugin:claude
```

The final local run passed 351 unit tests, 138 extension browser tests and 69 web panel tests. Plugin integration, native screen capture, strict plugin validation and the dedicated browser launcher also passed. Real-site smoke checks loaded BBC News, GitHub, a Japanese page and the arXiv paper in the bundled reader. The extension tests load the unpacked extension in persistent Chromium. Most answer tests use a local provider so failures are reproducible. The screen check uses the real browser capture API and checks the delivered PNG and stopped video tracks. The launcher check downloads Chromium, loads the extension in its own profile, and checks shutdown after both a stop signal and a failed welcome page load.

## Checks with the real plugin and Claude Code

These checks used isolated browser profiles and the production MCP server. Questions used the account's logged-in Claude Code, with short answers and restricted tools.

- The welcome page paired the browser. Its Try buttons opened the bundled practice page. The welcome guide's load-unpacked instructions and extension bundle were checked. The native Developer mode switch, Load unpacked button and operating system folder picker installed version 2.0.0. The dedicated Chromium launcher verified its loaded extension worker and shutdown.
- A floating chat captured the public TypeScript repository on GitHub, answered a question and a follow-up, and returned a guide with valid page targets.
- Native screen sharing produced a readable frame. Fullscreen mouse crop and a held Shift crop used that real stream, and closing sharing stopped its tracks.
- The practice page's Japanese paragraph translated to English and restored to the original text. Automatic questions and a real passive summary appeared. Moving to another tab after stopping its tab share produced a new summary, and pausing prevented a new card after reloading.
- The bundled reader opened the live arXiv PDF for Attention Is All You Need, accepted Chromium's site permission, reported 15 pages and rendered the first and second pages, answered a page question and answered a question about selected text.
- A running interactive Claude Code session received a real channel message and streamed its reply through the bridge. A separate dedicated conversation also retained context across an exact session follow-up.
- A disposable SSH server and local forwarding command carried the welcome page and authenticated extension download through a real tunnel.

Four independent tester personas started from the README: a Japanese shopping reader, an arXiv student, a web app developer and a remote host power user. Their checks used separate browser profiles and the real plugin. The shopping report exposed an onboarding focus race: pairing opened a duplicate practice tab, and translation affected that tab while the tester inspected its sibling. A replay with an identified target confirmed the translated text and restoration. Pairing now leaves practice tabs to explicit Try actions. The student report also exposed a floating window covering a native permission prompt. The reader now closes the floating window and minimizes its extension popup before asking for missing site access. The extension action reopens the chat afterward. Fresh tests confirmed selected-passage questions and summaries on the real arXiv paper after granting native site permission. Hidden login fields on the public DAISO shop intentionally pause whole-page access. Explicitly sending a selected passage remains available. The remote persona found a custom SSH port command hidden in the welcome page. The command validator now accepts that documented port option. The final remote replay downloaded the extension and paired a floating bubble through a real SSH tunnel. Reloading the bubble now preserves its source tab and recovers Restore from a translated source document. Selected Explain now cancels pending background suggestions before asking and uses the interface language. Translation accounts for changing or removed source text separately from invalid model results, keeping stable translations available to restore.

Temporary credentials, sessions, profiles and processes were removed after these checks. No application service or application API key was used.

## Visual assets

The README recording uses the public TypeScript GitHub page. Its answers are supplied by a local recording fixture, as described in [STORE.md](STORE.md). It illustrates the UI and is separate from the real answer checks above.

```sh
GLIMPSELET_RECORD_PUBLIC=1 npm run record-demo
npm run package:stores
```

## Remaining platform and publication checks

Native Mac window behavior requires a Mac. Chromium on Linux exercised the floating window, but that cannot establish behavior across Mac applications. The browser still owns the sharing picker, native permission dialogs and window placement.

The extension has not been approved by either store. The store packages are prepared for the account holder to submit. Main CI, the public demo and the GitHub release must be checked after publication. The engine's repository eligibility policy currently prevents submitting this candidate to the personal repository.
