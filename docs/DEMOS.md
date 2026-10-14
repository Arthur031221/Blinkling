# Recording the README demos

`assets/demo.gif` shows Google Flights with a page guide and a booking question. `assets/arxiv.gif` shows an arXiv abstract selected for a question and a Traditional Chinese translation. Both use the built extension and the signed-in Claude Code CLI. The recorder does not replace site content, guide steps or provider replies. It removes most waiting time between interactions.

On a Linux desktop with Node.js 24, Claude Code signed in, Playwright Chromium, FFmpeg, Xvfb, xfwm4 and D-Bus installed:

```sh
npm ci
npx playwright install chromium
npm run build:plugin
npm run build --workspace bridge
npm run record:real-demos
```

The recorder uses a temporary browser profile and an isolated project conversation. It grants site access through Chrome's real permission dialog and opens the native floating window. The capture includes the real browser and extension surfaces. The normal browser profile and existing project transcripts are not used. CLI usage applies to these requests.

Raw desktop recordings, screenshots, segment boundaries and provider replies are written under the ignored `test-results/real-demos` directory. `GLIMPSELET_RECORD_EVIDENCE` selects another output directory. `GLIMPSELET_RECORD_BROWSER=chrome` uses installed Chrome instead of bundled Chromium. Review the GIFs before committing them; a site redesign can require adjusting the recorder.

`assets/recordings.json` records the extension version, public URLs, segment boundaries and checksums. It includes a hash of each raw request log, rather than publishing the log. Release checks verify both GIFs against this ledger.

CI uses `npm run record-demo` with local example replies and an offline page fixture to test browser recording without provider access. CI saves and restores committed assets around that check. The interactive prerecorded chat is separately labelled and makes no provider calls.
