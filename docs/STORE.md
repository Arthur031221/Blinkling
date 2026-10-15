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

The v2 screenshots showed the floating chat panel and were deleted. `assets/store/promo.png` is the only image in the repository; the screenshots are a ship step and the kit carries whichever of them exist. Chrome accepts up to five screenshots at 1280×800 and Edge up to six; the small promotional tile is 440×280 and the store icon is `extension/icons/blink-128.png`. The sizes follow the official [Chrome image guidance](https://developer.chrome.com/docs/webstore/images) and [Edge publishing guide](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension).

## Screenshots to capture

Capture each from the running desktop app on a real display, 1280×800, with Blink in its corner and a harmless page or window behind it. `.github/workflows/check-release.py` checks the size of each file once it exists.

| File                          | Shows                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| `assets/store/blink.png`      | Blink resting in the corner of a desktop.                                            |
| `assets/store/ctrl-click.png` | A thing under the pointer outlined, with the mini composer and its three quick asks. |
| `assets/store/ctrl-drag.png`  | An area being taken with Ctrl and drag.                                              |
| `assets/store/answer.png`     | An answer bubble pointing at what it talks about.                                    |
| `assets/store/menu.png`       | The four menu bubbles open beside Blink.                                             |

For Edge, add the companion status popup as a sixth image, `assets/store/popup.png`.

## Single purpose and permissions

**Single purpose:** Give the Blinkling desktop app the structure, full-length capture, translation and PDF text of the browser page the user points at.

These explanations match [`extension/manifest.json`](../extension/manifest.json). The extension has no pages of its own except a status popup and the PDF reader.

| Permission or origin | Review justification                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<all_urls>`         | Blink can point at any web page, so the page script must be injectable wherever the user points. It is injected only when the desktop app asks about the page under the pointer, and it reads structure and text, and nothing is read in the background. Password and payment fields are never read. Cross-origin frames are skipped. |
| `scripting`          | Inject that bundled page script and read the visible structure of the page on request.                                                                                                                                                                                                                                                |
| `storage`            | Keep the local trust secret and the loopback port of the bridge.                                                                                                                                                                                                                                                                      |
| `alarms`             | Keep the service worker connected to the local bridge so the status popup is correct.                                                                                                                                                                                                                                                 |
| `127.0.0.1` pages    | A content script runs only on the bridge's own setup page (`http://127.0.0.1/install*`, `http://localhost/install*`) to receive the trust secret from it.                                                                                                                                                                             |

The extension connects only to the bridge on `127.0.0.1`. It has no remote servers, loads no remote code and sends nothing to the publisher. The PDF.js reader, its worker and all scripts are bundled. Normal consumer browsers cannot silently install an extension. Enterprise policy is a separate managed-browser option.

## Privacy dashboard disclosures

Use the following when completing each store's privacy form. A lack of publisher telemetry does not mean no data is transmitted.

- **Website content:** when the user points at a page, its visible text, element labels, positions, the page address and title, and screenshots of the visible page or of the whole page go to the desktop app on the same computer, which can send what the user asked about to Claude Code. Password and payment fields are blanked before anything leaves the page.
- **Web history / website context:** the address and title of the page the user points at are used to answer. Blinkling keeps no browsing-history log.
- **Authentication information:** the extension stores a random local trust secret. It is not a credential for any account and is never sent over the network.
- Relevant page content can contain personal information. There is no separate profile, payment, location or health-data collector.
- Data is used only for the visible features. It is not sold, used for advertising, or used by the publisher for unrelated purposes. There is no publisher-operated backend. Provider retention terms apply to what the user sends to Claude Code.

Full details are in [`public/privacy.html`](../public/privacy.html). The policy includes an affirmative Limited Use statement. Check that the hosted policy is reachable and matches the packaged extension before submitting. The store disclosures must agree with the implementation and policy, as explained in [Chrome's user-data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) and [Limited Use policy](https://developer.chrome.com/docs/webstore/program-policies/limited-use).

## After approval

Fill `chromeWebStoreUrl` and/or `edgeAddonsUrl` in [`config/distribution.json`](../config/distribution.json) with the approved HTTPS listing URLs, then rebuild the plugin and demo site. That is the only distribution setting to change. The setup page, `/blinkling:install` and the demo switch to store links. Unpacked instructions remain under Advanced. Empty URLs keep the load-unpacked flow.

Before submission, complete the real Chrome and Edge smoke tests, verify the live privacy URL, and supply reviewer access if requested. This preparation does not submit, publish, deploy or push anything.
