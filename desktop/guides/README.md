# Saving a guide

`saveGuide(guide, { documents, reveal, now })` turns a finished guide into plain
files in the user's Documents and reveals the folder. It is the whole of K4 as
narrowed by N2.4: no in-app replay, no list of saved guides, no replay data,
no network. The Markdown and the annotated screenshots are the lasting part.

```js
import { saveGuide } from "./guides/save.mjs";
import { guideStrings } from "./guides/strings.mjs";

guideStrings([locale])("save"); // the quiet end-of-guide bubble: 儲存導覽, ...
const { folder, markdown, revealed } = await saveGuide({
  title, // becomes the folder name and the first heading
  explanation, // what the page or app is for
  language, // BCP 47 tag; picks the headings, English when unknown
  steps: [{ n, title, text }],
  screenshots: [{ data, width, height, step }], // base64 PNG, already annotated
});
```

`documents` defaults to Electron's `app.getPath("documents")` and `reveal` to
`shell.showItemInFolder`; both are loaded only when not passed, so the module
runs under plain Node in tests.

## What is written

```
Documents/Blinkling Guides/2026-10-15 09.05 Set up the printer/
  guide.md        title, page explanation, screens, numbered steps
  step-1.png      a screenshot whose `step` matches a step (first one wins)
  screen-2.png    every other screenshot, numbered by its place in the list
```

Image links in `guide.md` are relative, so the folder can be moved or shared.

- The folder name is `YYYY-MM-DD HH.mm <title>` in local time. The title loses
  path separators, `:*?"<>|`, control characters, dot-only words and trailing
  dots, is cut to 60 characters and 200 bytes on whole characters, and a
  reserved Windows name is prefixed with `_`.
- A second save in the same minute gets ` (2)`, ` (3)`; the folder is claimed
  with a non-recursive `mkdir`, so two saves at once never share one.
- Screenshots are validated before anything is created. A write that fails
  removes the half-written folder; `guide.md` is written last.
- A reveal that fails leaves the saved guide in place and returns
  `revealed: false`.

## The offer

`createGuideOffer({ send, languages })` in `offer.mjs` is the bubble. The
pointing layer calls `offerSave(result)` once when a guide ends, with
`{ title, steps, explanation, shots }`; that shows one 儲存導覽 bubble (a
`blink-offer` event with id `guide-save`) and writes nothing. The click runs
the `save-guide` action, which calls `save()`: it writes the guide, reveals the
folder and turns the same bubble into the confirmation. A failed save keeps the
guide and relabels the bubble so the user can retry; a double click saves once.
Offering again replaces the pending guide, so there is never more than one
bubble. There is no replay and no list of saved guides (N3.9).

Label, confirmation and error text come from `strings.mjs` (nine locales). The
end-to-end check is `e2e/run.sh` (temp HOME, `BLINKLING_REMOTE=0`).
