# Store submission preparation

The account holder submits Blinkling to the Chrome Web Store and Microsoft Edge Add-ons. These are preparation files, not approved listings. Leave both URLs in [`config/distribution.json`](../config/distribution.json) empty until approval.

## Build and upload

```sh
npm ci
npm run package:stores
python3 .github/workflows/check-release.py
```

The output is in `release/`:

| File                         | Use                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `blinkling-extension.zip`    | Upload this extension package to either store. Its manifest is at the archive root. Users can also extract it and load the folder unpacked.      |
| `blinkling-chrome-store.zip` | Chrome submission kit: extension ZIP, listing copy, permission explanations, privacy policy and images. Extract it before filling the dashboard. |
| `blinkling-edge-store.zip`   | Edge submission kit with the same code and assets. Extract it before filling Partner Center.                                                     |
| `SHA256SUMS`                 | SHA-256 checksums of all three ZIPs. Run `sha256sum -c SHA256SUMS` from `release/`.                                                              |

Upload the inner `blinkling-extension.zip`, not the whole submission kit. The automated release check verifies versions, archive structure, bundled script paths, absence of source maps and development files, image dimensions and checksums. CI runs it on Node 22 and 24 and keeps the kits as workflow artifacts. The release workflow requires successful push CI for the exact main commit before publishing.

## Listing and images

Use [`STORE-LISTING.md`](STORE-LISTING.md) for listing text and reviewer instructions. Category: Productivity. Support: [issue tracker](https://github.com/Arthur031221/Glimpselet/issues). Website: [demo](https://arthur031221.github.io/Glimpselet/). Privacy: [policy](https://arthur031221.github.io/Glimpselet/privacy.html).

The helper has a small surface: a toolbar popup. The store screenshots must show that popup connected to Blink, a translated page and the PDF reader, not a chat.

| Asset                           | Dimensions | Status                                                                                          |
| ------------------------------- | ---------- | ----------------------------------------------------------------------------------------------- |
| `assets/store/*.png` (four)     | 1280×800   | Still show the removed v2 chat. Replace them with popup and page screenshots before submission. |
| `assets/store/promo.png`        | 440×280    | Small promotional tile. Replace with the Blink artwork before submission.                       |
| `extension/icons/blink-128.png` | 128×128    | Store icon, also included in the extension ZIP.                                                 |

The release check still expects the four 1280×800 names and the promo tile, so the file names stay. Capture the new images from the real extension, using `e2e-extension/desktop-companion.spec.ts` as the starting point. Edge can reuse them, but still needs a browser-specific smoke test before submission.

The sizes follow the official [Chrome image guidance](https://developer.chrome.com/docs/webstore/images) and [Edge publishing guide](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension). Chrome accepts up to five screenshots. Edge accepts up to six.

## Single purpose and permissions

**Single purpose:** Tell the Blink desktop companion what is on the page the user points at, and offer page tools to it: full-length capture, in-place translation and a PDF reader.

These explanations match [`extension/manifest.json`](../extension/manifest.json). Broad website access is optional, not requested at install.

| Permission or origin                       | Review justification                                                                                                                                                                                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`                                | Temporary access to the tab the user clicks the toolbar button on, for page structure and capture.                                                                                                                                                                   |
| `scripting`                                | Inject the bundled collector and translation code into the page Blink asks about. All injected code is bundled.                                                                                                                                                      |
| `storage`                                  | Keep the bridge token and URL in session storage, cleared when the browser session ends. Nothing else is stored.                                                                                                                                                     |
| `tabs`                                     | Find the tab under the pointer, read its URL and title, and open the PDF reader. No browsing-history log is stored or sent to the publisher.                                                                                                                         |
| `http://127.0.0.1/*`, `http://localhost/*` | Connect to the Blinkling bridge on the same computer, and pair from the local install page.                                                                                                                                                                          |
| Optional `<all_urls>`                      | Read page structure, take full-length captures, translate in place and fetch a user-selected PDF without a toolbar click each time. The popup offers **Allow on all sites**, requested once from a user gesture. Revocable through the browser's extension settings. |

No remote executable code is loaded. The PDF.js reader, worker and all scripts are bundled. Normal consumer browsers cannot silently install an extension. Enterprise policy is a separate managed-browser option.

## Privacy dashboard disclosures

Use the following when completing each store's privacy form. A lack of publisher telemetry does not mean no data is transmitted.

- **Website content:** page structure (element roles, names and visible text), selected-page text for translation and PDF text are sent only to the Blinkling bridge on the same computer, and from there to the Claude Code the user is signed in to when they ask. Password and other secure fields are reported without text or value.
- **Web history / website context:** the active tab's URL and title are used to describe the page. Blinkling does not keep a browsing-history log. Disclose this access where the dashboard asks about visited URLs.
- **Authentication information:** a bridge token is kept in browser session storage and is sent only to the local bridge.
- Relevant page content can contain personal information. There is no separate profile, payment, location or health-data collector.
- Data is used for the visible Blink features. It is not sold, used for advertising, or used by the publisher for unrelated purposes. There is no publisher-operated backend. Provider retention terms still apply.

The helper does nothing on its own: it answers requests that Blink sends after the user points at something. Full details are in [`public/privacy.html`](../public/privacy.html).

The policy includes an affirmative Limited Use statement. Check that the hosted policy is reachable and matches the packaged extension before submitting. The store disclosures must agree with the implementation and policy, as explained in [Chrome's user-data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) and [Limited Use policy](https://developer.chrome.com/docs/webstore/program-policies/limited-use).

## After approval

Fill `chromeWebStoreUrl` and/or `edgeAddonsUrl` in [`config/distribution.json`](../config/distribution.json) with the approved HTTPS listing URLs, then rebuild the plugin and demo site. That is the only distribution setting to change. The install guide, `/blinkling:install`, all nine README install sections and the demo switch to store links. Unpacked instructions remain under Advanced. Empty URLs keep the load-unpacked flow.

Before submission, complete the real Chrome and Edge smoke tests, verify the live privacy URL, and supply reviewer access to a Claude Code setup if requested. This preparation branch does not submit, publish, deploy or push anything.
