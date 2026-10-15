# Saving a guide (K4, N2.4)

`saveGuide(guide, { documents, reveal, now })` writes one folder and reveals it.
It is the whole feature: no replay data, no list of saved guides, no network.

```
Documents/Blinkling Guides/2026-10-15 14.05 Booking a flight/
  guide.md
  screen-1.png      whole-screen overview, annotated by the pointing engine
  step-2.png        optional, a screenshot that belongs to step 2
```

Input: `{ title, explanation, language, steps: [{ n, title, text }],
screenshots: [{ data, width, height, step? }] }`. `data` is a base64 PNG (a
`data:image/png;base64,` prefix is accepted). A screenshot with a `step` that
matches a step is written as `step-<n>.png` and linked under that step, every
other one is `screen-<i>.png` and linked before the steps. All links are
relative, so the folder can be moved or zipped.

Returns `{ folder, markdown, revealed }`. `revealed` is false when the file
manager could not be opened; the guide is saved either way.

- The folder name is `<YYYY-MM-DD HH.mm> <title>` in local time. The title loses
  path separators, characters Windows refuses, control characters, edge dots
  and spaces, and reserved device names (`CON`, `NUL`, `COM1`...), and is cut to
  60 whole characters. A second save in the same minute gets ` (2)`, ` (3)`...;
  an existing folder is never reused or overwritten.
- Every image is checked before anything is written, and a failed write removes
  the folder this call created.
- Headings and image descriptions follow `guide.language` (`strings.mjs`, nine
  locales). `strings.mjs` also holds the 儲存導覽 bubble label (`saveBubble`)
  for the pointing bucket.
- Without `documents` and `reveal` the Electron defaults are used
  (`app.getPath("documents")`, `shell.showItemInFolder`), so only the main
  process can call it that way.
