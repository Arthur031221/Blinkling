# Store submission preparation

The account holder submits Glimpselet to the Chrome Web Store and Microsoft Edge Add-ons. These are preparation files, not approved listings. Leave both URLs in [`config/distribution.json`](../config/distribution.json) empty until approval.

## Build and upload

```sh
npm ci
npm run package:stores
python3 .github/workflows/check-release.py
```

The output is in `release/`:

| File                          | Use                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `glimpselet-extension.zip`    | Upload this extension package to either store. Its manifest is at the archive root. Users can also extract it and load the folder unpacked.      |
| `glimpselet-chrome-store.zip` | Chrome submission kit: extension ZIP, listing copy, permission explanations, privacy policy and images. Extract it before filling the dashboard. |
| `glimpselet-edge-store.zip`   | Edge submission kit with the same code and assets. Extract it before filling Partner Center.                                                     |
| `SHA256SUMS`                  | SHA-256 checksums of all three ZIPs. Run `sha256sum -c SHA256SUMS` from `release/`.                                                              |

Upload the inner `glimpselet-extension.zip`, not the whole submission kit. The automated release check verifies versions, archive structure, bundled script paths, absence of source maps and development files, image dimensions and checksums. CI runs it on Node 22 and 24 and keeps the kits as workflow artifacts. The release workflow requires successful push CI for the exact main commit before publishing.

## Listing and images

Use [`STORE-LISTING.md`](STORE-LISTING.md) for listing text and reviewer instructions. Category: Productivity. Support: [issue tracker](https://github.com/Arthur031221/Glimpselet/issues). Website: [demo](https://arthur031221.github.io/Glimpselet/). Privacy: [policy](https://arthur031221.github.io/Glimpselet/privacy.html).

| Asset                           | Dimensions | What it shows                                                |
| ------------------------------- | ---------- | ------------------------------------------------------------ |
| `assets/store/floating.png`     | 1280×800   | Real Document PiP chat above GitHub's TypeScript repository. |
| `assets/store/guide.png`        | 1280×800   | A guide circle and note on the real GitHub Code control.     |
| `assets/store/crop.png`         | 1280×800   | A page crop attached in the floating chat.                   |
| `assets/store/translation.png`  | 1280×800   | In-place translation on the bundled practice page.           |
| `assets/store/promo.png`        | 440×280    | Small promotional tile using the browser recording.          |
| `extension/icons/blink-128.png` | 128×128    | Store icon, also included in the extension ZIP.              |

All five listing images are RGB PNGs. Example responses and suggested questions use the local provider fixture. Guide annotations in the recording are deterministic example steps applied through the real content script. These assets show the real browser interface, not a claim of live model testing. The browser recording script can refresh them with `GLIMPSELET_RECORD_PUBLIC=1 npm run record-demo`; it requires Chromium, Xvfb, xfwm4 and ffmpeg. Edge can reuse the images, but still needs a browser-specific smoke test before submission.

The sizes follow the official [Chrome image guidance](https://developer.chrome.com/docs/webstore/images) and [Edge publishing guide](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension). Chrome accepts up to five screenshots. Edge accepts up to six. The supplied four screenshots fit both.

## Single purpose and permissions

**Single purpose:** Help users understand the page or screen they choose to share, through a floating chat, captures and reading tools.

These explanations match [`extension/manifest.json`](../extension/manifest.json). Broad website access is optional, not requested at install.

| Permission or origin                       | Review justification                                                                                                                                                                                                                                                                           |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`                                | Temporary access to the tab the user invokes Glimpselet on, for capture and page actions.                                                                                                                                                                                                      |
| `scripting`                                | Inject the selection, guide and translation controls after the user invokes a page tool. All injected code is bundled.                                                                                                                                                                         |
| `storage`                                  | Save consent, language, model, site blocklist and window size. Pairing tokens and an optional API key use session storage. Captures and chat history remain in memory.                                                                                                                         |
| `tabs`                                     | Keep actions attached to the correct source tab, check URL changes to avoid capturing a different page, refresh suggestions and open the PDF reader. Tab URLs and titles provide this context. No browsing-history log is stored or sent to the publisher.                                     |
| `http://127.0.0.1/*`, `http://localhost/*` | Connect to the user's paired local bridge and support the local welcome tour. Remote Claude Code hosts use an SSH tunnel ending at loopback on the browser computer.                                                                                                                           |
| Optional `https://api.anthropic.com/*`     | Send questions, selected page context and images to Anthropic only when the user chooses direct API mode with their own key.                                                                                                                                                                   |
| Optional `<all_urls>`                      | Read page text, insert guide or translation controls, and fetch a user-selected PDF. The user can grant the current site, or choose **Allow on all sites**. Only HTTP and HTTPS origins are requested by that all-sites control. Access is revocable through the browser's extension settings. |

No remote executable code is loaded. The PDF.js reader, worker and all scripts are bundled. Model replies are data. Screen sharing uses the browser's picker and needs a user gesture. Normal consumer browsers cannot silently install an extension. Enterprise policy is a separate managed-browser option.

## Privacy dashboard disclosures

Use the following when completing each store's privacy form. A lack of publisher telemetry does not mean no data is transmitted.

- **Website content:** page text, element labels, selected passages, PDF text and chosen screenshots can be processed by the selected backend. Page context can also contain a URL and title. User questions are transmitted with it.
- **Web history / website context:** the active source tab's URL and title are used for page actions and suggestions. Glimpselet does not keep a browsing-history log. Disclose this access where the dashboard asks about visited URLs.
- **Authentication information:** pairing tokens and an optional user-entered Anthropic API key are kept in browser session storage. The key is sent to Anthropic to authenticate direct API requests, and is not sent to the bridge or publisher.
- Relevant page content can contain personal information. There is no separate profile, payment, location or health-data collector. Do not promise that chosen screenshots or questions cannot include sensitive data.
- Data is used for the visible chat and reading features. It is not sold, used for advertising, or used by the publisher for unrelated purposes. There is no publisher-operated backend. Provider retention terms still apply.

After consent, suggested questions may send page text automatically. Passive summaries are off until enabled and require an inspected shared browser tab. Whole screens, native windows and unknown sources pause automatic summaries. Browser preferences persist locally. Captures and chat history remain in memory. CLI requests may write conversation transcripts on the host. Images used by CLI requests are written to a private temporary directory and removed when the request ends. Full details are in [`public/privacy.html`](../public/privacy.html).

The policy includes an affirmative Limited Use statement. Check that the hosted policy is reachable and matches the packaged extension before submitting. The store disclosures must agree with the implementation and policy, as explained in [Chrome's user-data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) and [Limited Use policy](https://developer.chrome.com/docs/webstore/program-policies/limited-use).

## After approval

Fill `chromeWebStoreUrl` and/or `edgeAddonsUrl` in [`config/distribution.json`](../config/distribution.json) with the approved HTTPS listing URLs, then rebuild the plugin and demo site. That is the only distribution setting to change. The welcome page, `/glimpselet:glimpse`, all nine README install sections and the demo switch to store links. Unpacked instructions remain under Advanced. Empty URLs keep the load-unpacked flow.

Before submission, complete the real Chrome and Edge smoke tests, verify the live privacy URL, and supply reviewer access to an answer backend if requested. This preparation branch does not submit, publish, deploy or push anything.
