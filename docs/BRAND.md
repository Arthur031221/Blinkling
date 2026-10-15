# Blinkling brand kit

The wordmark lives in `assets/brand/`. Do not redraw it, retype it or edit the
files by hand: `wordmark-parts.json` is the source, `kit.py` makes every file
from it, and `scripts/check-brand.mjs` (run in CI) fails when they disagree.

## Which file to use

| File | Use it for |
| --- | --- |
| `wordmark-light.svg` | Light backgrounds where SVG animates: README headers (`<picture>`), the docs site, web pages. |
| `wordmark-dark.svg` | Dark backgrounds, same places. |
| `wordmark-light-static.svg`, `wordmark-dark-static.svg` | Places that do not animate or must hold still: store tiles, slides, email, PDFs, small sizes. |
| `wordmark-light.png`, `wordmark-dark.png` | Where SVG is not accepted: social cards, release banners, app store uploads, chat apps. Transparent, 3x. |
| `wordmark-parts.json` | Anything that draws the name in code. The app's shared Wordmark component and the Blinkling Reels read it; nothing else draws the name. |
| `wm.py`, `build.py`, `kit.py` | The generator. `python kit.py OUTDIR` rebuilds all of the above. Needs `pip install fonttools uharfbuzz cairosvg`. |
| `DynaPuff[wdth,wght].ttf`, `DynaPuff-OFL.txt` | The font and its license, kept next to the generator so it runs from a clean checkout. |

The app, tray and extension icons are Blink, not the wordmark.

## Clear space

Keep an empty margin of **half the cap height** on every side, where the cap
height is the height of the capital B. In the files' own units (the viewBox is
575 x 185) that is about 44 units, roughly 7.6 percent of the wordmark's width.
Nothing else (text, edges, other logos, images) enters that margin. The sparkle
stars at the edges are part of the wordmark and sit inside it.

## Smallest sizes

- **120 px wide or more:** the animated wordmark.
- **Under 120 px:** the static one. The twinkle and the blink are too small to
  read and only add noise.
- **Never under 72 px wide.** Below that, write the plain word "Blinkling" in
  the surrounding text style instead of shrinking the mark.

Animation always stops under `prefers-reduced-motion`: the files carry the
rule, and the shared component holds a still frame.

## Colors

Colors are in `wordmark-parts.json` (`colors.light` and `colors.dark`). Use the
light file on light surfaces and the dark file on dark ones; do not recolor.

## Font credit

The lettering is DynaPuff (SIL Open Font License 1.1), converted to outlines.
The credit and license reference are in the repository `NOTICE`; the license
text is `assets/brand/DynaPuff-OFL.txt`.
