import sys, math
from wm import *
def star(cx, cy, r, inner=0.28):
    pts = []
    for i in range(8):
        a = math.pi/2*i/2 - math.pi/2
        rr = r if i % 2 == 0 else r*inner
        pts.append(f"{cx+rr*math.cos(a):.2f},{cy+rr*math.sin(a):.2f}")
    # concave four point star with smooth quad curves
    d = f"M{cx:.2f},{cy-r:.2f}"
    for (qx,qy,ex,ey) in [(cx+r*inner*0.55, cy-r*inner*0.55, cx+r, cy),(cx+r*inner*0.55, cy+r*inner*0.55, cx, cy+r),(cx-r*inner*0.55, cy+r*inner*0.55, cx-r, cy),(cx-r*inner*0.55, cy-r*inner*0.55, cx, cy-r)]:
        d += f"Q{qx:.2f},{qy:.2f} {ex:.2f},{ey:.2f}"
    return d + "Z"

STAR = 1.25
def build(theme, animated=True):
    dark = theme == "dark"
    c_blink = "#f5f5f4" if dark else "#0c0e0d"
    g1, g2 = ("#5ff0b0", "#2cc283") if dark else ("#2fcf8b", "#178a5c")
    spark = "#ffffff"
    letters_a = "".join(f'<path d="{d}"/>' for n, d, bd in LETTERS[:5] if n != "")
    letters_b = "".join(f'<path d="{d}"/>' for n, d, bd in LETTERS[5:])
    all_letters = "".join(f'<path d="{d}"/>' for n, d, bd in LETTERS)
    (x1, y1), (x2, y2) = idots
    r = dot_r * 1.18
    W0, H0 = bbox[0]-24, bbox[1]-36
    VW, VH = round(bbox[2]-bbox[0]+48), round(bbox[3]-bbox[1]+66)
    eye = f'<g class="eye" style="transform-origin:{x1:.2f}px {y1:.2f}px"><circle cx="{x1:.2f}" cy="{y1:.2f}" r="{r:.2f}" fill="url(#gl)"/><circle cx="{x1-r*0.32:.2f}" cy="{y1-r*0.34:.2f}" r="{r*0.3:.2f}" fill="#fff" opacity=".95"/></g>'
    big = f'<g class="twk t0" style="transform-origin:{x2:.2f}px {y2:.2f}px"><path d="{star(x2,y2-2,r*STAR,0.3)}" fill="url(#gl)"/><path d="{star(x2,y2-2,r*STAR*0.43,0.3)}" fill="#fff" opacity=".9"/></g>'
    smalls = [(bbox[0]-4, bbox[1]-2, 8, 1), (bbox[2]-6, bbox[1]-6, 8.5, 2), ((bbox[0]+bbox[2])*0.42, bbox[1]-14, 6.5, 3)]
    sm = "".join(f'<path class="twk t{k}" style="transform-origin:{cx}px {cy}px" d="{star(cx,cy,rr,0.3)}" fill="{g1 if dark else g1}"/>' for cx,cy,rr,k in smalls)
    anim = f'''
.eye{{animation:blink 5.5s ease-in-out infinite}}
@keyframes blink{{0%,90%,100%{{transform:scaleY(1)}}93%,96%{{transform:scaleY(.12)}}}}
.twk{{opacity:.9;animation:twk 5.5s ease-in-out infinite}}
.t1{{animation-delay:.9s}}.t2{{animation-delay:2.1s}}.t3{{animation-delay:3.2s}}
@keyframes twk{{0%,100%{{transform:scale(.55) rotate(0deg);opacity:.35}}45%{{transform:scale(1.08) rotate(16deg);opacity:1}}70%{{transform:scale(.8) rotate(0deg);opacity:.7}}}}
.band{{animation:sweep 5.5s ease-in-out infinite}}
@keyframes sweep{{0%,12%{{transform:translateX(-160px)}}55%,100%{{transform:translateX(560px)}}}}
@media (prefers-reduced-motion:reduce){{.eye,.twk,.band{{animation:none}}.twk{{transform:scale(.95);opacity:.9}}.band{{display:none}}}}''' if animated else ".band{display:none}"
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{W0} {H0} {VW} {VH}" width="{VW}" height="{VH}" role="img" aria-labelledby="t">
<title id="t">Blinkling</title>
<defs>
<linearGradient id="gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{g1}"/><stop offset="1" stop-color="{g2}"/></linearGradient>
<linearGradient id="bd" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="{'#d9fff0' if not dark else '#fff'}" stop-opacity="{'.42' if not dark else '.4'}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<clipPath id="lt">{all_letters}</clipPath>
</defs>
<style>{anim}</style>
<g fill="{c_blink}">{letters_a}</g>
<g fill="url(#gl)">{letters_b}</g>
{eye}{big}{sm}
<g clip-path="url(#lt)"><rect class="band" x="-60" y="-100" width="90" height="140" fill="url(#bd)" transform="skewX(-18)"/></g>
</svg>
'''
if __name__ == "__main__":
    import cairosvg
    for th in ("light", "dark"):
        svg = build(th, animated=False)
        open(f"wm-{th}.svg", "w").write(build(th))
        bg = "#f5f5f4" if th == "light" else "#0c0e0d"
        full = svg.replace("<defs>", f'<rect x="-14" y="-118" width="484" height="168" fill="{bg}"/><defs>', 1)
        cairosvg.svg2png(bytestring=full.encode(), write_to=f"wm-{th}.png", scale=2.2)
