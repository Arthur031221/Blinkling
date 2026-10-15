import io, sys, math
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import DecomposingRecordingPen

import os, json as _j
FONT = os.environ.get("WM_FONT", os.path.join(os.path.dirname(os.path.abspath(__file__)), "DynaPuff[wdth,wght].ttf"))
AXES = _j.loads(os.environ.get("WM_AXES", '{"wdth":100,"wght":700}'))
SIZE = 120.0
BOUNCE = _j.loads(os.environ.get("WM_BOUNCE", "[[0,-2],[0,2],[0,0],[0,-3],[0,2],[0,-2],[0,0],[0,3],[0,-2]]"))
f = instantiateVariableFont(TTFont(FONT), AXES, inplace=False) if AXES else TTFont(FONT)
buf = io.BytesIO(); f.save(buf)
font = hb.Font(hb.Face(buf.getvalue()))
gs = f.getGlyphSet(); order = f.getGlyphOrder(); upm = f["head"].unitsPerEm; s = SIZE / upm
cmap = f.getBestCmap()
text = "Blinkling"
shape_text = text.replace("i", "ı")
b = hb.Buffer(); b.add_str(shape_text); b.guess_segment_properties()
hb.shape(font, b, {"kern": True, "liga": False})
fmt = lambda v: ("%.2f" % v).rstrip("0").rstrip(".")
x = 0; glyphs = []; gtrans = {}
for info, pos in zip(b.glyph_infos, b.glyph_positions):
    name = order[info.codepoint]
    pen = SVGPathPen(gs, ntos=fmt)
    k = len(glyphs); dy, rot = (BOUNCE[k] if k < len(BOUNCE) else (0, 0))
    adv = pos.x_advance * s
    gw = adv; cx0 = x + gw / 2; ca, sa = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    # rotate around glyph centre on the baseline, then lift by dy
    t0 = (s, 0, 0, -s, x + pos.x_offset * s, 0)
    from fontTools.misc.transform import Transform
    T = Transform(1,0,0,1,0,dy).translate(cx0,0).rotate(math.radians(rot)).translate(-cx0,0)
    tt = Transform(*t0)
    t = tuple(T.transform(tt))
    gs[name].draw(TransformPen(pen, t))
    bp = BoundsPen(gs); gs[name].draw(TransformPen(bp, t))
    gtrans[x] = t; glyphs.append((name, pen.getCommands(), bp.bounds, x)); x += pos.x_advance * s
# the dot of the original i, to size and place ours
rp = DecomposingRecordingPen(gs); gs[cmap[ord("i")]].draw(rp)
conts = []; cur = []
for op, args in rp.value:
    cur.append((op, args))
    if op in ("closePath", "endPath"): conts.append(cur); cur = []
def cbounds(c):
    bp = BoundsPen(gs); 
    from fontTools.pens.recordingPen import RecordingPen
    r = RecordingPen(); r.value = c; r.replay(bp); return bp.bounds
dot = min(conts, key=lambda c: (cbounds(c)[3]-cbounds(c)[1]))
db = cbounds(dot); dot_r = (db[2]-db[0]) / 2 * s; dot_cy = -(db[1]+db[3]) / 2 * s
idots = []
for name, d, bnds, gx in glyphs:
    if name == cmap[0x131]:
        from fontTools.pens.recordingPen import RecordingPen
        _rp = RecordingPen(); gs[name].draw(TransformPen(_rp, gtrans[gx]))
        xy = [p for op, args in _rp.value for p in args if p]
        top = [p for p in xy if p[1] <= bnds[1] + (bnds[3] - bnds[1]) * 0.18]
        cx = sum(p[0] for p in top) / len(top) if len(top) >= 2 else (bnds[0] + bnds[2]) / 2
        idots.append((cx, dot_cy))
xs = [g[2][0] for g in glyphs if g[2]]; xe = [g[2][2] for g in glyphs if g[2]]
ys = [g[2][1] for g in glyphs if g[2]]; ye = [g[2][3] for g in glyphs if g[2]]
bbox = (min(xs), min(ys), max(xe), max(ye))
LETTERS = [(g[0], g[1], g[2]) for g in glyphs]
if __name__ == "__main__":
    print(bbox, idots, dot_r, dot_cy, [g[0] for g in glyphs])
