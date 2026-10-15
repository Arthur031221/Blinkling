"""Blinkling wordmark kit generator. Run: python kit.py OUTDIR  (needs fonttools uharfbuzz cairosvg)."""
import json, sys, os, re
import cairosvg
import build as B
from wm import *
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
for th in ("light", "dark"):
    open(f"{out}/wordmark-{th}.svg", "w").write(B.build(th))
    st = B.build(th, animated=False)
    # held still frame for the static exports: stars at mid twinkle, no band
    st = st.replace('<style>.band{display:none}</style>', '<style>.band{display:none}.twk{opacity:.95}</style>')
    open(f"{out}/wordmark-{th}-static.svg", "w").write(st)
    cairosvg.svg2png(bytestring=st.encode(), write_to=f"{out}/wordmark-{th}.png", scale=3, background_color=None)
parts = {
  "font": f"{os.path.basename(FONT)} {AXES} (SIL OFL 1.1), letters converted to outlines, bounce {BOUNCE}",
  "viewBox": [round(bbox[0]-24), round(bbox[1]-36), round(bbox[2]-bbox[0]+48), round(bbox[3]-bbox[1]+66)],
  "letters": [{"glyph": n, "d": d, "group": "blink" if i < 5 else "ling"} for i, (n, d, bd) in enumerate(LETTERS)],
  "eye": {"cx": idots[0][0], "cy": idots[0][1], "r": round(dot_r * 1.18, 2)},
  "bigStar": {"cx": round(idots[1][0],2), "cy": round(idots[1][1]-2,2), "r": round(dot_r*1.18*B.STAR,2)},
  "smallStars": [{"cx": round(bbox[0]-4,2), "cy": round(bbox[1]-2,2), "r": 8}, {"cx": round(bbox[2]-6,2), "cy": round(bbox[1]-6,2), "r": 8.5}, {"cx": round((bbox[0]+bbox[2])*0.42,2), "cy": round(bbox[1]-14,2), "r": 6.5}],
  "colors": {"light": {"blink": "#0c0e0d", "ling": ["#2fcf8b", "#178a5c"], "band": "#d9fff0"},
             "dark": {"blink": "#f5f5f4", "ling": ["#5ff0b0", "#2cc283"], "band": "#ffffff"}},
  "motion": {"loopSeconds": 5.5, "eyeBlinkAt": [0.90, 0.96], "bandSweepFrom": 0.12, "bandSweepTo": 0.55, "starDelays": [0, 0.9, 2.1, 3.2]},
}
json.dump(parts, open(f"{out}/wordmark-parts.json", "w"), indent=1)
print(os.listdir(out))
