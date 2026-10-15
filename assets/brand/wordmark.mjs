/** The one Wordmark component. It draws the name from wordmark-parts.json and
 * nowhere else: glyph outlines, colours and timing are all read from there.
 *
 * - `wordmarkSvg(options)` returns the inline <svg> markup (a string, so a
 *   server can render it too). Every instance gets its own gradient and clip
 *   ids, so several can share a page.
 * - `WORDMARK_CSS` is the theme and motion. Colours are CSS variables
 *   (--wm-ink, --wm-green-1, --wm-green-2, --wm-band, --wm-band-opacity); the
 *   light set is the default, `data-theme="dark"` or `prefers-color-scheme`
 *   (unless `data-theme="light"`) switches to the dark set. Size it with
 *   --wordmark-height. Under prefers-reduced-motion the motion stops and one
 *   sparkle frame is held.
 * - `mountWordmark(parent, options)` adds the stylesheet once per document and
 *   puts one wordmark in `parent`.
 *
 * The motion is the one in wordmark-light.svg: a 5.5 s loop with Blink's eye
 * blinking, the stars twinkling and a soft band of light crossing the letters.
 * Elements turn around their own centre (fill-box) so the stylesheet needs no
 * inline styles and works under a strict Content-Security-Policy. */
import parts from "./wordmark-parts.json" with { type: "json" };

/** The two band-of-light stops are not in the parts file; the kit draws them
 * at these opacities (build.py). */
const BAND_OPACITY = { light: 0.42, dark: 0.4 };
const STAR_INNER = 0.3;
const STYLE_ATTRIBUTE = "data-bl-wordmark";

const fixed = (n) => n.toFixed(2);

/** A concave four-point star, as the kit draws it. */
export function starPath(cx, cy, r, inner = STAR_INNER) {
  const k = r * inner * 0.55;
  const curve = (qx, qy, x, y) =>
    `Q${fixed(qx)},${fixed(qy)} ${fixed(x)},${fixed(y)}`;
  return (
    `M${fixed(cx)},${fixed(cy - r)}` +
    curve(cx + k, cy - k, cx + r, cy) +
    curve(cx + k, cy + k, cx, cy + r) +
    curve(cx - k, cy + k, cx - r, cy) +
    curve(cx - k, cy - k, cx, cy - r) +
    "Z"
  );
}

const colorVars = (set, opacity) =>
  `--wm-ink:${set.blink};--wm-green-1:${set.ling[0]};--wm-green-2:${set.ling[1]};--wm-band:${set.band};--wm-band-opacity:${opacity};`;

/** The theme and motion stylesheet, built from `source` (default: the kit's
 * wordmark-parts.json). */
export function wordmarkCss(source = parts) {
  const { motion, colors } = source;
  const loop = `${motion.loopSeconds}s`;
  const [blinkFrom, blinkTo] = motion.eyeBlinkAt.map((t) => t * 100);
  const blinkMid = (blinkFrom + blinkTo) / 2;
  const sweepFrom = motion.bandSweepFrom * 100;
  const sweepTo = motion.bandSweepTo * 100;
  const delays = motion.starDelays
    .map((s, i) => (s ? `.bl-wm-t${i}{animation-delay:${s}s}` : ""))
    .join("");
  const dark = colorVars(colors.dark, BAND_OPACITY.dark);
  return `
.bl-wordmark{${colorVars(colors.light, BAND_OPACITY.light)}display:inline-block;height:var(--wordmark-height,1.6em);width:auto;overflow:visible;vertical-align:middle}
.bl-wordmark[data-theme="dark"]{${dark}}
@media (prefers-color-scheme:dark){.bl-wordmark:not([data-theme="light"]){${dark}}}
.bl-wm-ink{fill:var(--wm-ink)}
.bl-wm-small{fill:var(--wm-green-1)}
.bl-wm-g1{stop-color:var(--wm-green-1)}
.bl-wm-g2{stop-color:var(--wm-green-2)}
.bl-wm-band-stop{stop-color:var(--wm-band);stop-opacity:var(--wm-band-opacity)}
.bl-wm-eye,.bl-wm-twk{transform-box:fill-box;transform-origin:center}
.bl-wm-eye{animation:bl-wm-blink ${loop} ease-in-out infinite}
@keyframes bl-wm-blink{0%,${blinkFrom}%,100%{transform:scaleY(1)}${blinkMid}%,${blinkTo}%{transform:scaleY(.12)}}
.bl-wm-twk{opacity:.9;animation:bl-wm-twk ${loop} ease-in-out infinite}
${delays}
@keyframes bl-wm-twk{0%,100%{transform:scale(.55) rotate(0deg);opacity:.35}45%{transform:scale(1.08) rotate(16deg);opacity:1}70%{transform:scale(.8) rotate(0deg);opacity:.7}}
.bl-wm-band{animation:bl-wm-sweep ${loop} ease-in-out infinite}
@keyframes bl-wm-sweep{0%,${sweepFrom}%{transform:translateX(-160px)}${sweepTo}%,100%{transform:translateX(560px)}}
@media (prefers-reduced-motion:reduce){.bl-wm-eye,.bl-wm-twk,.bl-wm-band{animation:none}.bl-wm-twk{transform:scale(.95);opacity:.9}.bl-wm-band{display:none}}
.bl-wordmark[data-still] .bl-wm-eye,.bl-wordmark[data-still] .bl-wm-twk,.bl-wordmark[data-still] .bl-wm-band{animation:none}
.bl-wordmark[data-still] .bl-wm-twk{opacity:.95}
.bl-wordmark[data-still] .bl-wm-band{display:none}
`.trim();
}

export const WORDMARK_CSS = wordmarkCss();

let instances = 0;
/** A fresh id prefix for one drawing. */
export const nextWordmarkId = () => `bl-wm-${++instances}`;

/** The inline <svg> markup. `id` prefixes the gradient and clip ids (default:
 * a new one each call); `still` draws the held frame instead of the motion;
 * `theme` ("light" or "dark") pins the colours, otherwise they follow
 * prefers-color-scheme. */
export function wordmarkSvg({
  id = nextWordmarkId(),
  still = false,
  theme,
  source = parts,
} = {}) {
  const [x, y, width, height] = source.viewBox;
  const path = (d) => `<path d="${d}"/>`;
  const letters = (group) =>
    source.letters
      .filter((l) => l.group === group)
      .map((l) => path(l.d))
      .join("");
  const { eye, bigStar, smallStars } = source;
  const glint = `<circle cx="${fixed(eye.cx - eye.r * 0.32)}" cy="${fixed(eye.cy - eye.r * 0.34)}" r="${fixed(eye.r * 0.3)}" fill="#fff" opacity=".95"/>`;
  const stars = [
    `<g class="bl-wm-twk bl-wm-t0"><path d="${starPath(bigStar.cx, bigStar.cy, bigStar.r)}" fill="url(#${id}-gl)"/><path d="${starPath(bigStar.cx, bigStar.cy, bigStar.r * 0.43)}" fill="#fff" opacity=".9"/></g>`,
    ...smallStars.map(
      (s, i) =>
        `<path class="bl-wm-twk bl-wm-small bl-wm-t${i + 1}" d="${starPath(s.cx, s.cy, s.r)}"/>`,
    ),
  ];
  const attributes = [
    'xmlns="http://www.w3.org/2000/svg"',
    'class="bl-wordmark"',
    `viewBox="${x} ${y} ${width} ${height}"`,
    'role="img"',
    `aria-labelledby="${id}-t"`,
    ...(theme ? [`data-theme="${theme}"`] : []),
    ...(still ? ["data-still"] : []),
  ];
  return (
    `<svg ${attributes.join(" ")}>` +
    `<title id="${id}-t">Blinkling</title><defs>` +
    `<linearGradient id="${id}-gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="bl-wm-g1"/><stop offset="1" class="bl-wm-g2"/></linearGradient>` +
    `<linearGradient id="${id}-bd" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" class="bl-wm-band-stop"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
    `<clipPath id="${id}-lt">${source.letters.map((l) => path(l.d)).join("")}</clipPath></defs>` +
    `<g class="bl-wm-ink">${letters("blink")}</g>` +
    `<g fill="url(#${id}-gl)">${letters("ling")}</g>` +
    `<g class="bl-wm-eye"><circle cx="${fixed(eye.cx)}" cy="${fixed(eye.cy)}" r="${fixed(eye.r)}" fill="url(#${id}-gl)"/>${glint}</g>` +
    stars.join("") +
    `<g clip-path="url(#${id}-lt)"><rect class="bl-wm-band" x="-60" y="-100" width="90" height="140" fill="url(#${id}-bd)" transform="skewX(-18)"/></g>` +
    "</svg>"
  );
}

/** Draw one wordmark into `parent` and make sure its stylesheet is in the
 * document. Returns the <svg> element. */
export function mountWordmark(parent, options = {}) {
  const doc = parent.ownerDocument;
  if (!doc.head.querySelector(`style[${STYLE_ATTRIBUTE}]`)) {
    const style = doc.createElement("style");
    style.setAttribute(STYLE_ATTRIBUTE, "");
    style.textContent = WORDMARK_CSS;
    doc.head.append(style);
  }
  const holder = doc.createElement("template");
  holder.innerHTML = wordmarkSvg(options);
  const svg = holder.content.firstElementChild;
  parent.replaceChildren(svg);
  return svg;
}
