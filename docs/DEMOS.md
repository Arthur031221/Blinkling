# Demo recordings

`assets/demo.gif` and `assets/arxiv.gif` were recorded for v2, when the extension carried a floating chat. That chat is gone, so the READMEs no longer show them and the recorder scripts were removed with it. The files stay only because the release check and the demo site still read them. `assets/recordings.json` is their ledger.

A new recording should show the current product: Blink in the corner, a Ctrl+click pick, the mini composer and an answer bubble that points. Record it from a real desktop session with the real Claude Code, and keep waiting time as the only edit. When the new GIFs replace the old ones, update `assets/recordings.json` and the release check together.

The extension itself is covered by `e2e-extension/desktop-companion.spec.ts`, which runs real Chrome with the unpacked extension against the Electron companion and writes its screenshots to the report folder.
