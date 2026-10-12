# Contributing

Install Node.js 22 or newer, then run `npm ci`. The plugin bundles its bridge and panel, so source changes should keep the generated plugin build in sync.

Before sharing a change, run the checks that cover it:

- `npm run lint` and `npm run format:check`
- `npm test` and `npm run build`
- `npm run build:plugin`, `npm run test:plugin` and `npm run validate:plugin`
- `npm run test:e2e` for changes to panel and bridge integration
- `npm run test:screen` for real browser sharing and floating window integration on Linux with Xvfb
- `npm run demo` and `npm run record-demo` for the published fixture media

Keep screen sharing explicit. An active browser share must fail closed if a capture cannot be returned. Do not add a native fallback that could bypass an opaque mask. Opaque masks belong in the outgoing image. Keep image and session data out of logs, and preserve request Origin, token and session checks.

Use fixture images for demos and tests. The published static demo uses a fixture and prerecorded answer without making a provider request. Never include real keys or private screen captures in screenshots, fixtures or test output. Describe the behavior changed and the checks you ran in your contribution.
