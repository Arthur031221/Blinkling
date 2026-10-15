# v3 validation

This records the local candidate tested on Linux on 15 October 2026. It does not claim that the candidate has been published or tested on a Mac. This file covers the browser helper and the pruned feature set; the desktop companion has its own tests.

## Automated checks

Run the project checks from the repository root:

```sh
npm ci
npm run check
npm run test:features
```

`npm run check` runs the name guard, lint, formatting, the vitest suites (the bridge, the extension, the install and distribution docs), the plugin bundle build, the plugin integration tests, the plugin validator and the extension browser tests.

The final local run passed 203 vitest tests, 25 plugin and host tests, and 9 extension browser tests. `npm run validate:plugin` passed. Remote Control stayed off in every run (`BLINKLING_REMOTE=0`).

`scripts/features.test.mjs` checks `docs/FEATURES.md` against the code: every main and secondary entry point exists, and the symbols and strings of every removed feature are gone from all tracked files except the changelog.

## Checks with the real extension and the desktop companion

`e2e-extension/desktop-companion.spec.ts` starts the Electron companion and a real Chrome with the unpacked extension, joined by the real bridge on a fixture server:

- Without the helper connected, `host.fullPage()` reports `companionRequired` and `host.elements()` returns `null`.
- The install guide pairs the helper on its own. Nobody types a code. The popup then shows the link and Blink as connected, the sparkle in its header, and **Wake Blink** wakes the companion.
- `host.elements()` returns the page structure for the fixture page. The password input is marked secure, with no text, no name and no content, and its value never appears in the response.
- A full-length capture arrives as tiles at full width, with a fixed header and a sticky navigation bar counted once, and leaves the page's scroll position and styles unchanged. A page with a password field is not captured.
- Translate in place toggles back to the original text.

`e2e-extension/install-welcome.spec.ts` checks the install guide: the copyable extensions address, the configured store link without unpacked controls, the sparkle on the title in every language, and three steps that fit every locale at compact widths in light and dark.

## Visual assets

The screenshots from these runs are written to the report folder. The store images in `assets/store` still show the removed v2 chat; see [STORE.md](STORE.md).

## Remaining platform and publication checks

Native Mac window behavior requires a Mac. The browser still owns native permission dialogs. The extension has not been approved by either store. The store packages are prepared for the account holder to submit. Main CI, the public demo and the GitHub release must be checked after publication.
