# Validation

This file records how the companion, the bridge and the plugin are checked, and what remains for a person to do.

## Automated checks

From the repository root, with `BLINKLING_REMOTE=0` in the environment:

```sh
npm ci
npm run check
npm run test:features
npm run test:extension
npm run validate:plugin:claude
```

- `npm test` runs the unit tests for the bridge, the companion and the repository scripts, including `scripts/features.test.mjs`, which checks `docs/FEATURES.md` against the code.
- `npm run test:plugin` starts the bundled plugin over stdio from outside the repository, completes the local trust hand-off and the mutual challenge, and calls the screen tools.
- `npm run desktop:test` runs the desktop app and host tests, including `elements`, `translatePage`, `openPdfReader` and `fullPage` against a scripted companion.
- `npm run test:extension` loads the built extension in Chrome under a virtual display and checks it end to end: the popup, the structure of a fixture page (a password input comes back marked secure with no text), full-page capture, translation and restore, the PDF viewer returning nothing, an incognito window, and a page at 125% zoom.

Questions to a model are never asked in these tests; the host and the bridge are driven directly. Nothing in them reaches the account's Remote Control list: `BLINKLING_REMOTE=0` is set for every run. Each job may enable it once, as `BLINKLING_REMOTE=test`, for one disposable session.

## What a person still has to do

- Run `/blinkling:install` in a real Chrome and Edge and check the popup reads connected.
- Try the companion on macOS and Windows; the checks here ran on Linux.
- Check the store images and website recordings against the released build.
- Have the account holder submit the extension to the stores; neither store has approved it.
