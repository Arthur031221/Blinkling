#!/usr/bin/env python3
"""Evidence recordings for the walk rows no screen can show (a unit test, a
file check, a mac or windows path). Each gets <id>-324.gif: the requirement, how
it is proven, then the result the walk produced, one frame each.

  python3 scripts/walk-evidence.py <walk-check --json output> [checklist.md] [out dir]
"""
import json, re, subprocess, sys, textwrap, time
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

rows = json.load(open(sys.argv[1]))
R3 = Path("/home/levi/oss-engine/reports/glimpse-v3/r3")
checklist = Path(sys.argv[2] if len(sys.argv) > 2 else R3 / "checklist-324.md")
out = Path(sys.argv[3] if len(sys.argv) > 3 else R3)
mac_lines = (R3 / "mac-checks.md").read_text().splitlines()

cells = {}
for line in checklist.read_text().splitlines():
    m = re.match(r"^\| ([a-z0-9_]+) \|", line)
    if m and m[1] != "id":
        cols = [c.strip() for c in line.strip().strip("|").split("|")]
        cells[cols[0]] = {"requirement": cols[2], "proof": cols[3]}

font = ImageFont.truetype("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", 17)
bold = ImageFont.truetype("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", 19)
W, H = 1100, 620


def frame(title, body, tag):
    img = Image.new("RGB", (W, H), (22, 27, 34))
    d = ImageDraw.Draw(img)
    d.text((24, 18), title, font=bold, fill=(120, 220, 150))
    d.text((W - 24, 18), tag, font=font, fill=(150, 160, 175), anchor="ra")
    y = 62
    for para in body:
        for ln in textwrap.wrap(para, 70) or [""]:
            if y > H - 30:
                break
            d.text((24, y), ln, font=font, fill=(225, 230, 238))
            y += 24
        y += 10
    return img


stamp = time.strftime("%Y-%m-%d %H:%M")
for r in rows:
    if r["recs"] or r["klass"] == "GATE":
        continue
    c = cells.get(r["id"], {"requirement": "", "proof": ""})
    mac = [l for l in mac_lines if re.match(rf"^- \[.\] {r['id']}\b", l)]
    result = [f"Result: {r['result']}"]
    if r["sp"]:
        result.append("Acceptance specs passed in the walk: " + ", ".join(r["sp"]))
    result.append("Code checks of this row ran in the same walk (unit tests, file and pattern checks).")
    if mac:
        result.append("mac-checks.md: " + mac[0])
    if r["note"]:
        result.append("Note: " + r["note"])
    if r["why"]:
        result += ["Problem: " + w for w in r["why"]]
    tag = f"{r['platform']}  {stamp}"
    frames = [
        frame(f"{r['id']}  requirement", [c["requirement"]], tag),
        frame(f"{r['id']}  how it is proven", [c["proof"]], tag),
        frame(f"{r['id']}  walk result", result, tag),
        frame(f"{r['id']}  walk result", result + [""], tag + " "),
        frame(f"{r['id']}", [f"{r['result']} at {stamp}"], tag),
    ]
    target = out / f"{r['id']}-324.gif"
    frames[0].save(target, save_all=True, append_images=frames[1:], duration=1800, loop=0)
    print(target)
