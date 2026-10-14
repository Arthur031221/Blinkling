#!/usr/bin/env python3
"""Draws the animated README wordmark with the letters as outlines.

Run with fontTools available (for example in a throwaway virtualenv):
    python3 scripts/render-wordmark.py
It reads public/assets/Fraunces.ttf and writes assets/wordmark-light.svg and
assets/wordmark-dark.svg: Blink green letters with a soft band of white light
that sweeps every few seconds, and three tiny four-point stars. Under
prefers-reduced-motion the picture holds one still frame.
"""
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
NAME = "Blinkling"
SIZE = 96  # letter height in px, before scaling by the image width
PAD_X, ASCENT, DESCENT = 24, 86, 34
CYCLE = 5.5

font = instantiateVariableFont(
    TTFont(ROOT / "public/assets/Fraunces.ttf"),
    {"opsz": 72, "wght": 600, "SOFT": 60, "WONK": 0},
)
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
scale = SIZE / font["head"].unitsPerEm

paths, origins, x = [], [], float(PAD_X)
for char in NAME:
    name = cmap[ord(char)]
    pen = SVGPathPen(glyphs, ntos=lambda v: ("%.2f" % v).rstrip("0").rstrip("."))
    glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, ASCENT)))
    paths.append(pen.getCommands())
    origins.append(x)
    x += glyphs[name].width * scale
WIDTH = round(x + PAD_X)
HEIGHT = ASCENT + DESCENT
outline = " ".join(paths)

# Where the small stars sit: the tops of the first l, the k and the last letter.
stars = [
    (origins[1] + 19, 13, 10, 1.0),
    (origins[4] + 33, 16, 8, 1.9),
    (origins[8] + 53, 38, 7, 2.8),
]


def star(cx, cy, r, delay, index):
    return (
        f'<g transform="translate({cx:.1f} {cy:.1f})">'
        f'<path class="star s{index}" style="animation-delay:{delay}s" '
        f'd="M0 -{r} C{r * .12:.2f} -{r * .3:.2f} {r * .3:.2f} -{r * .12:.2f} {r} 0 '
        f"C{r * .3:.2f} {r * .12:.2f} {r * .12:.2f} {r * .3:.2f} 0 {r} "
        f"C-{r * .12:.2f} {r * .3:.2f} -{r * .3:.2f} {r * .12:.2f} -{r} 0 "
        f'C-{r * .3:.2f} -{r * .12:.2f} -{r * .12:.2f} -{r * .3:.2f} 0 -{r}Z" '
        'fill="url(#glint)"/></g>'
    )


def render(ink, hi):
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" width="{WIDTH}" height="{HEIGHT}" role="img" aria-labelledby="t">
<title id="t">{NAME}</title>
<defs>
<clipPath id="letters"><path d="{outline}"/></clipPath>
<linearGradient id="band" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<linearGradient id="ink" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="{hi}"/><stop offset="1" stop-color="{ink}"/></linearGradient>
<radialGradient id="glint"><stop offset="0" stop-color="#fff"/><stop offset=".25" stop-color="#fff"/><stop offset=".8" stop-color="#3ddc97"/></radialGradient>
</defs>
<style>
.sweep{{transform:translateX(-80px);animation:sweep {CYCLE}s ease-in-out infinite}}
.star{{transform-box:fill-box;transform-origin:center;opacity:0;transform:scale(.2) rotate(0deg);animation:twinkle {CYCLE}s ease-in-out infinite}}
@keyframes sweep{{0%{{transform:translateX(-80px)}}32%,100%{{transform:translateX({WIDTH + 20}px)}}}}
@keyframes twinkle{{0%,22%,100%{{opacity:0;transform:scale(.2) rotate(0deg)}}10%{{opacity:1;transform:scale(1) rotate(45deg)}}}}
@media (prefers-reduced-motion:reduce){{
.sweep{{animation:none;transform:translateX({round(WIDTH * .62 - 30)}px)}}
.star{{animation:none;opacity:.9;transform:scale(.85)}}
.s2{{opacity:0}}
}}
</style>
<path d="{outline}" fill="url(#ink)"/>
<g clip-path="url(#letters)"><g transform="skewX(-18)"><rect class="sweep" x="0" y="0" width="60" height="{HEIGHT}" fill="url(#band)"/></g></g>
{"".join(star(cx, cy, r, d, i) for i, (cx, cy, r, d) in enumerate(stars))}
</svg>
"""


for variant, ink, hi in (("light", "#168454", "#1f9e68"), ("dark", "#3ddc97", "#8ff0c4")):
    (ROOT / f"assets/wordmark-{variant}.svg").write_text(render(ink, hi))
    print(variant, WIDTH, HEIGHT)
