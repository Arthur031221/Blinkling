# Store submission preparation

This document prepares Chrome Web Store and Microsoft Edge Add-ons copy, permission explanations, and package guidance. No submission was made and neither store is represented as having approved Glimpselet.

## Listing copy

**Name:** Glimpselet

**Short description:** Ask about a page or screen you choose to share from a compact floating chat.

**Description:** Glimpselet is a browser companion for understanding a page or screen. Capture a visible tab, full page, selected region or element, or a screen chosen in the browser picker. Ask questions in a compact chat and receive streamed answers. Page tools can explain selected text, translate eligible page text, and show a short guide over page elements. Optional passive summaries are off until enabled. Connect to a local command-line assistant through a loopback bridge and an SSH tunnel when browser and assistant are on different computers, or choose direct API-key mode. Page context and captures are sent only for the selected action or enabled feature.

**Category:** Productivity  
**Support:** `https://github.com/Arthur031221/Glimpselet/issues`  
**Privacy:** `https://arthur031221.github.io/Glimpselet/privacy.html`

## Permission explanations

| Permission or origin                       | Review justification                                                                                                                                                                                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`                                | After the user invokes Glimpselet, grant temporary access to the current tab for the requested capture or page action. It avoids asking for access to every site at install.                                                                                                    |
| `scripting`                                | Inject the page selection, guide, and translation controls into the active tab after the user invokes a page action.                                                                                                                                                            |
| `storage`                                  | Save language, consent, and feature preferences. Session storage holds pairing details, the user entered API key only for the browser session. Captures and video frames stay in bubble memory.                                                                                 |
| `tabs`                                     | Identify the active tab for capture, detect tab changes during capture, and open the bundled PDF reader.                                                                                                                                                                        |
| `http://127.0.0.1/*`, `http://localhost/*` | Connect only to the Glimpselet companion process on the user's own computer, or to its loopback endpoint forwarded through an SSH tunnel. The bridge is not a public service.                                                                                                   |
| Optional `https://api.anthropic.com/*`     | In direct API mode, send the user's question and selected page context to the API after the user chooses the mode and supplies their key.                                                                                                                                       |
| Optional `<all_urls>`                      | Request access when a page-specific action needs it, including reading a page, inserting the guide/translation overlay, or opening a remote PDF. The user can grant access for the current site through browser controls. Do not claim "all sites" access is needed at install. |

These justifications describe the current manifest. Optional page origins are declared in `optional_host_permissions`. Browser prompts are shown when an action needs access to a site. The extension does not fetch executable code from a server. The bundled PDF reader and worker are local package files.

The welcome tour opens the bundled article or PDF fixture in a separate local tab/window. Its same-origin `glimpselet:tutorial-action` message includes a version, action name, step number, and optional pairing code. The article accepts messages only from its same-origin opener, checks the action against the eight supported tutorial actions, displays the prompt, and dispatches a `glimpselet:tutorial-action` DOM `CustomEvent` on `window`. The extension content script should listen for that event and relay its `detail` to the extension runtime using this shape: `{ type: "glimpselet:tutorial-action", version: 1, action, step, code }`. This page event is a local bridge for the practice tour. It does not grant permissions or send page contents to the bridge by itself.

## Package and listing assets

Build a clean release package with `npm run package:extension`. It creates `release/glimpselet-extension.zip` with extension files at the archive root. Inspect the unpacked build and test both Chromium browsers before uploading the same code package to each store. The submitted package must not include source maps, development credentials, or unrelated files.

The listing assets in `assets/store/` include 1280×800 screenshots of the floating chat, guide, translation and crop, plus a 440×280 promotional tile. They show the real extension on the bundled practice page using a mock provider. Edge Add-ons can reuse them. `npm run package:stores` creates separate submission packages for both stores, including the listing, privacy policy and permission justifications. The account holder submits them.

## Store rollout

The only rollout change is to fill `chromeWebStoreUrl` and/or `edgeAddonsUrl` in [`config/distribution.json`](../config/distribution.json) with the approved HTTPS listing URLs, then rebuild. The build adds localized store links to all nine READMEs and removes the outdated developer mode warning. Source loading stays under Advanced. Empty URLs leave the current README files untouched. No store submission or listing publication is performed by the build.

## Data handling summary

There is no telemetry. Preferences live in browser local storage. Pairing state and a direct API key use browser session storage. Captures and video frames remain in bubble memory. Page text may be sent after consent for suggested questions. Questions, captures, page actions, and opt-in passive summaries send relevant page text or images to the selected backend. Bridge mode sends requests to the local host bridge, which invokes the user's CLI or pushes into its enabled live channel. Direct API mode sends requests from the browser to the configured API provider. The CLI may persist its conversation transcript. See the [privacy policy](../public/privacy.html) for storage and processing details.
