/* Blink, the madeforyou mascot.
 *
 * Blink is the green block from the logo (brand/avatar.svg), with a face,
 * arms and legs. It is the host of every Reel: it points at things, hops
 * between them, reacts, and at the end hops back into the logo and turns
 * into the green block again.
 *
 * Rig rules (from the bang-motion skill, kartun-panggung.md, Law 5): every
 * joint is a proxy object and its SVG transform attribute is written by
 * hand, so rotations always turn around the joint and GSAP never fights an
 * existing translate. All motion is a function of the timeline time, so
 * HyperFrames can seek to any frame.
 *
 * Usage inside a HyperFrames composition (GSAP already loaded):
 *
 *   const b = Blink.create(svgElement, { x: 540, y: 1500, scale: 0.9 });
 *   b.idle(tl, 0, 45);              // breathing, sway, blinking
 *   b.jumpTo(tl, 2.0, 820, 1400);   // hop to a new spot
 *   b.point(tl, 3.0, "R", -60);     // right arm points up-right
 *   b.toLogoBlock(tl, 42.0, 765, 727, 0.3);
 *
 * Supporting cast, for cameo appearances next to Blink (same style, same
 * actions, never the host):  Blink.create(svg, { kind: "pixel" | "mochi" | "kit", ... })
 *
 * Coordinates are frame pixels. (x, y) is the point between the feet.
 * The body is 240 x 280 at scale 1, the logo block's 72 x 84 ratio.
 */
(function (global) {
  const NS = "http://www.w3.org/2000/svg";
  const C = {
    ink: "#0c0e0d",
    green: "#3ddc97",
    greenDark: "#1f9e68",
    shade: "#2cc283",
    bone: "#f5f5f4",
    cheek: "#ff8fb1",
  };

  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  // A joint. Base values (x, y, r, sx, sy) are driven by tweens, idle offsets
  // (ix, iy, ir) are added on top. Every property is an accessor that rewrites
  // the transform attribute, so the rig follows any seek even when the
  // renderer suppresses GSAP callbacks.
  function J(node, tx = 0, ty = 0) {
    const v = { tx, ty, x: 0, y: 0, r: 0, sx: 1, sy: 1, ix: 0, iy: 0, ir: 0 };
    const j = {
      node,
      apply() {
        node.setAttribute("transform",
          `translate(${v.tx + v.x + v.ix},${v.ty + v.y + v.iy}) rotate(${v.r + v.ir}) scale(${v.sx},${v.sy})`);
      },
    };
    for (const k of Object.keys(v)) {
      Object.defineProperty(j, k, { get: () => v[k], set: (n) => { v[k] = n; j.apply(); }, enumerable: true });
    }
    j.apply();
    return j;
  }

  // A 0..1 driver whose setter runs fn, for motion computed from one value.
  function drive(fn, start = 0) {
    let q = start;
    return Object.defineProperty({}, "q", { get: () => q, set: (n) => { q = n; fn(n); }, enumerable: true });
  }

  function limb(parent, len1, len2, handR, inner = C.greenDark) {
    // Upper segment, then a child segment, then the hand. Outlined strokes.
    const upper = el("g", {}, parent);
    el("line", { x1: 0, y1: 0, x2: 0, y2: len1, stroke: C.ink, "stroke-width": 34, "stroke-linecap": "round" }, upper);
    el("line", { x1: 0, y1: 0, x2: 0, y2: len1, stroke: inner, "stroke-width": 18, "stroke-linecap": "round" }, upper);
    const lower = el("g", {}, upper);
    el("line", { x1: 0, y1: 0, x2: 0, y2: len2, stroke: C.ink, "stroke-width": 34, "stroke-linecap": "round" }, lower);
    el("line", { x1: 0, y1: 0, x2: 0, y2: len2, stroke: inner, "stroke-width": 18, "stroke-linecap": "round" }, lower);
    if (handR) el("circle", { cx: 0, cy: len2 + 6, r: handR, fill: C.bone, stroke: C.ink, "stroke-width": 8 }, lower);
    return { upper, lower };
  }

  // The supporting cast. They share Blink's drawing style (ink outline,
  // flat fill, shade band, shine bar, outlined limbs, Blink's eyes, cheeks
  // and mouth) and every action, but each has its own body and colour.
  // Green belongs to Blink alone. Only Blink can become the logo block.
  const KINDS = {
    blink: { fill: C.green, limb: C.greenDark, shade: C.shade, shine: "#8ff0c4" },
    pixel: { fill: "#4c6fff", limb: "#3a56d6", shade: "#3a56d6", shine: "#b7c6ff" },
    mochi: { fill: "#ff8fb1", limb: "#e87397", shade: "#e87397", shine: "#ffd3e0", arm1: 50, arm2: 40, shoulderY: -180, shoulderX: 146 },
    kit: { fill: C.bone, limb: "#cfcec6", shade: "#dcdbd3", shine: "#ffffff" },
  };

  function create(svg, opts = {}) {
    const kind = opts.kind || "blink";
    const K = KINDS[kind];
    const root = el("g", { class: `mascot mascot-${kind}` }, svg);
    const place = J(root, opts.x ?? 540, opts.y ?? 1500);
    place.sx = place.sy = opts.scale ?? 1;
    const plan = { x: place.tx, y: place.ty, s: place.sx };

    const shadow = J(el("ellipse", { cx: 0, cy: 0, rx: 118, ry: 20, fill: C.ink, opacity: 0.22 }, root));
    const lift = J(el("g", {}, root));            // vertical offset for hops
    const squash = J(el("g", {}, lift.node));     // squash and stretch around the feet

    // Legs (behind the body).
    const legs = {};
    for (const [side, sx] of [["L", -52], ["R", 52]]) {
      const hip = el("g", {}, squash.node);
      const l = limb(hip, 40, 30, 0, K.limb);
      el("rect", { x: -34, y: 22, width: 68, height: 30, rx: 15, fill: C.ink }, l.lower);
      legs[side] = { hip: J(hip, sx, -78), knee: J(l.lower, 0, 40) };
    }

    // Arms: the back arm is drawn before the body, the front arm after.
    const arms = {};
    function arm(side) {
      const sh = el("g", {}, squash.node);
      const a1 = K.arm1 ?? 74, a2 = K.arm2 ?? 62, sx = K.shoulderX ?? 112;
      const a = limb(sh, a1, a2, 24, K.limb);
      arms[side] = { shoulder: J(sh, side === "L" ? -sx : sx, K.shoulderY ?? -232), elbow: J(a.lower, 0, a1) };
      arms[side].shoulder.r = side === "L" ? 14 : -14;
    }
    arm("L");

    // Behind-the-body extras: Kit's tail, Pixel's antenna.
    if (kind === "kit") {
      for (const [w, c] of [[40, C.ink], [24, K.fill]]) {
        el("path", { d: "M 100 -110 Q 200 -120 180 -230 Q 172 -270 150 -262", fill: "none", stroke: c, "stroke-width": w, "stroke-linecap": "round" }, squash.node);
      }
    }
    if (kind === "pixel") {
      for (const [w, c] of [[30, C.ink], [15, K.limb]]) {
        el("path", { d: "M 0 -350 Q 4 -384 0 -412", fill: "none", stroke: c, "stroke-width": w, "stroke-linecap": "round" }, squash.node);
      }
      el("rect", { x: -22, y: -450, width: 44, height: 44, rx: 9, fill: "#ffc83d", stroke: C.ink, "stroke-width": 8 }, squash.node);
    }

    const bodyG = el("g", {}, squash.node);
    let body, shade, shine;
    if (kind === "mochi") {
      body = el("path", { d: "M -150 -110 Q -150 -380 0 -385 Q 150 -380 150 -110 Q 150 -76 112 -76 H -112 Q -150 -76 -150 -110 Z", fill: K.fill, stroke: C.ink, "stroke-width": 10 }, bodyG);
      shade = el("path", { d: "M -145 -118 H 145 V -112 Q 145 -81 112 -81 H -112 Q -145 -81 -145 -112 Z", fill: K.shade }, bodyG);
      shine = el("rect", { x: -78, y: -350, width: 54, height: 16, rx: 8, fill: K.shine }, bodyG);
    } else if (kind === "kit") {
      for (const sx of [-1, 1]) {
        el("path", { d: `M ${sx * 112} -300 L ${sx * 116} -420 L ${sx * 46} -352 Z`, fill: K.fill, stroke: C.ink, "stroke-width": 10, "stroke-linejoin": "round" }, bodyG);
        el("path", { d: `M ${sx * 100} -332 L ${sx * 102} -390 L ${sx * 66} -354 Z`, fill: C.cheek }, bodyG);
      }
      body = el("rect", { x: -124, y: -370, width: 248, height: 294, rx: 70, fill: K.fill, stroke: C.ink, "stroke-width": 10 }, bodyG);
      shade = el("path", { d: "M -119 -118 H 119 Q 112 -81 60 -81 H -60 Q -112 -81 -119 -118 Z", fill: K.shade }, bodyG);
      shine = el("rect", { x: -80, y: -346, width: 54, height: 16, rx: 8, fill: K.shine }, bodyG);
    } else {
      body = el("rect", { x: -120, y: -356, width: 240, height: 280, rx: kind === "pixel" ? 36 : 22, fill: K.fill, stroke: C.ink, "stroke-width": 10 }, bodyG);
      shade = el("path", { d: "M -115 -116 H 115 V -98 Q 115 -81 98 -81 H -98 Q -115 -81 -115 -98 Z", fill: K.shade }, bodyG);
      shine = el("rect", { x: -96, y: -334, width: 54, height: 16, rx: 8, fill: K.shine }, bodyG);
      if (kind === "pixel") el("rect", { x: -98, y: -318, width: 196, height: 150, rx: 24, fill: C.ink }, bodyG);
    }

    const face = J(el("g", {}, bodyG), 0, kind === "mochi" ? -238 : -248);
    const eyes = J(el("g", {}, face.node));
    for (const ex of [-50, 50]) {
      el("ellipse", { cx: ex, cy: 0, rx: 31, ry: 38, fill: C.bone, stroke: C.ink, "stroke-width": 8 }, eyes.node);
    }
    const pupils = J(el("g", {}, eyes.node));
    for (const ex of [-50, 50]) {
      el("circle", { cx: ex, cy: 6, r: 16, fill: C.ink }, pupils.node);
      el("circle", { cx: ex + 6, cy: 0, r: 5, fill: C.bone }, pupils.node);
    }
    const cheeks = el("g", { opacity: 0.75 }, face.node);
    for (const cx of [-86, 86]) el("ellipse", { cx, cy: 52, rx: 19, ry: 10, fill: C.cheek }, cheeks);
    const smile = el("path", { d: "M -28 50 Q 0 78 28 50", fill: "none", stroke: C.ink, "stroke-width": 9, "stroke-linecap": "round" }, face.node);
    const open = el("path", { d: "M -26 48 Q 0 44 26 48 Q 24 88 0 90 Q -24 88 -26 48 Z", fill: C.ink, opacity: 0 }, face.node);
    el("path", { d: "M -14 76 Q 0 66 14 76 Q 8 86 0 87 Q -8 86 -14 76 Z", fill: C.cheek, opacity: 1 }, open);

    if (kind === "pixel") { smile.setAttribute("stroke", C.bone); open.setAttribute("fill", C.bone); }
    if (kind === "kit") el("path", { d: "M -12 30 H 12 L 0 44 Z", fill: C.cheek, stroke: C.ink, "stroke-width": 5, "stroke-linejoin": "round" }, face.node);

    arm("R");

    const all = [place, shadow, lift, squash, face, eyes, pupils,
      legs.L.hip, legs.L.knee, legs.R.hip, legs.R.knee,
      arms.L.shoulder, arms.L.elbow, arms.R.shoulder, arms.R.elbow];
    const up = () => all.forEach((j) => j.apply());

    const b = { root, place, shadow, lift, squash, face, eyes, pupils, legs, arms, parts: { body, shade, shine, smile, open, cheeks }, up };

    // Breathing, sway and limb drift for [t0, t1]. Added on top of every action.
    b.idle = function (tl, t0, t1) {
      const p = drive((t) => {
        face.ir = Math.sin(t * 2.7) * 1.6;
        arms.L.shoulder.ir = Math.sin(t * 3.3) * 3;
        arms.R.shoulder.ir = Math.sin(t * 3.3 + 1.4) * 3;
        bodyG.setAttribute("transform", `translate(0,${Math.sin(t * 3.7) * 3})`);
      });
      tl.to(p, { q: t1 - t0, duration: t1 - t0, ease: "none" }, t0);
      for (let t = t0 + 1.3; t < t1 - 0.3; t += 3.4) b.blink(tl, t);
      return b;
    };

    b.blink = function (tl, at) {
      tl.to(eyes, { sy: 0.08, duration: 0.06, ease: "power2.in" }, at)
        .to(eyes, { sy: 1, duration: 0.08, ease: "power2.out" }, at + 0.07);
      return b;
    };

    // Eyes look towards (dx, dy) in -1..1.
    b.look = function (tl, at, dx, dy = 0, dur = 0.25) {
      tl.to(pupils, { x: dx * 11, y: dy * 10, duration: dur, ease: "power2.out" }, at);
      return b;
    };

    b.mouth = function (tl, at, isOpen) {
      tl.to(smile, { opacity: isOpen ? 0 : 1, duration: 0.08 }, at)
        .to(open, { opacity: isOpen ? 1 : 0, duration: 0.08 }, at);
      return b;
    };

    // Hop to (x, y) with anticipation, stretch, arc, landing squash and settle.
    // Hop to (x, y) with anticipation, stretch, arc, landing squash and settle.
    // Add actions in time order: each hop starts where the previous one ended.
    b.jumpTo = function (tl, at, x, y, o = {}) {
      const dur = o.dur ?? 0.62, h = o.height ?? 240;
      const from = { ...plan }, to = { x, y, s: o.scale ?? plan.s };
      Object.assign(plan, to);
      tl.to(squash, { sx: 1.14, sy: 0.82, duration: 0.1, ease: "power2.out" }, at)
        .to(squash, { sx: 0.88, sy: 1.16, duration: 0.12, ease: "power2.out" }, at + 0.1)
        .to(squash, { sx: 1, sy: 1, duration: 0.2, ease: "power1.out" }, at + 0.22);
      const inout = gsap.parseEase("power1.inOut");
      const air = drive((q) => {
        const e = inout(q), arc = 4 * q * (1 - q);
        place.tx = from.x + (to.x - from.x) * e;
        place.ty = from.y + (to.y - from.y) * e;
        place.sx = place.sy = from.s + (to.s - from.s) * e;
        lift.y = -h * arc;
        shadow.sx = shadow.sy = 1 - 0.45 * arc;
        const swing = 120 * Math.sin(Math.PI * q);
        arms.L.shoulder.r = 14 + swing;
        arms.R.shoulder.r = -14 - swing;
        legs.L.knee.r = -28 * Math.sin(Math.PI * q);
        legs.R.knee.r = 28 * Math.sin(Math.PI * q);
      });
      tl.fromTo(air, { q: 0 }, { q: 1, duration: dur, ease: "none", immediateRender: false }, at + 0.1);
      const land = at + 0.1 + dur;
      tl.to(squash, { sx: 1.2, sy: 0.78, duration: 0.07, ease: "power2.out" }, land)
        .to(squash, { sx: 1, sy: 1, duration: 0.45, ease: "elastic.out(1, 0.45)" }, land + 0.07);
      return b;
    };

    // Point with one arm. angle: 90 = straight out to Blink's side, 150 = up and out.
    // Negative values are not needed: use the other arm.
    b.point = function (tl, at, side, angle = 100, hold = 1.2) {
      const s = side === "L" ? 1 : -1;
      const sh = arms[side].shoulder, elb = arms[side].elbow;
      tl.to(sh, { r: s * angle, duration: 0.32, ease: "back.out(2)" }, at)
        .to(elb, { r: 0, duration: 0.2 }, at)
        .to(sh, { r: s * (angle + 6), duration: 0.12, yoyo: true, repeat: 3, ease: "sine.inOut" }, at + 0.35);
      if (hold > 0) tl.to(sh, { r: s * 14, duration: 0.35, ease: "power2.inOut" }, at + 0.35 + hold);
      b.look(tl, at, side === "L" ? -1 : 1, angle > 110 ? -0.7 : 0);
      return b;
    };

    b.wave = function (tl, at, side = "R", n = 3) {
      const s = side === "L" ? 1 : -1;
      const sh = arms[side].shoulder, elb = arms[side].elbow;
      tl.to(sh, { r: s * 150, duration: 0.25, ease: "back.out(2)" }, at);
      for (let i = 0; i < n; i++) {
        tl.to(elb, { r: s * 35, duration: 0.14, ease: "sine.inOut" }, at + 0.25 + i * 0.28)
          .to(elb, { r: s * -25, duration: 0.14, ease: "sine.inOut" }, at + 0.39 + i * 0.28);
      }
      tl.to(elb, { r: 0, duration: 0.2 }, at + 0.25 + n * 0.28)
        .to(sh, { r: s * 14, duration: 0.3, ease: "power2.inOut" }, at + 0.3 + n * 0.28);
      return b;
    };

    // Both arms up, open mouth, a small hop on the spot.
    b.cheer = function (tl, at, hold = 0.9) {
      b.mouth(tl, at, true);
      tl.to(arms.L.shoulder, { r: 160, duration: 0.25, ease: "back.out(2.2)" }, at)
        .to(arms.R.shoulder, { r: -160, duration: 0.25, ease: "back.out(2.2)" }, at);
      b.jumpTo(tl, at, plan.x, plan.y, { dur: 0.45, height: 120 });
      tl.to(arms.L.shoulder, { r: 14, duration: 0.3 }, at + hold)
        .to(arms.R.shoulder, { r: -14, duration: 0.3 }, at + hold);
      b.mouth(tl, at + hold, false);
      return b;
    };

    // A surprised beat: eyes widen, mouth opens, a little jolt.
    b.surprise = function (tl, at) {
      b.mouth(tl, at, true);
      tl.to(eyes, { sx: 1.18, sy: 1.18, duration: 0.12, ease: "back.out(3)" }, at)
        .to(squash, { sy: 1.1, sx: 0.94, duration: 0.1, yoyo: true, repeat: 1 }, at)
        .to(eyes, { sx: 1, sy: 1, duration: 0.3 }, at + 0.7);
      b.mouth(tl, at + 0.8, false);
      return b;
    };

    // Turn back into the logo's green block. (x, y) is the block's bottom
    // centre in frame pixels, scale is block width / 240. Face and limbs fold
    // away, the outline and rounding go, the block matches the logo exactly.
    b.toLogoBlock = function (tl, at, x, y, scale, dur = 0.7) {
      b.jumpTo(tl, at, x, y, { dur, height: 260, scale });
      const t = at + dur + 0.25;
      tl.to([legs.L.hip, legs.R.hip, arms.L.shoulder, arms.R.shoulder], { sx: 0, sy: 0, duration: 0.22, ease: "back.in(2)" }, t)
        .to(face.node, { opacity: 0, duration: 0.18 }, t + 0.05)
        .to([shade, shine], { opacity: 0, duration: 0.18 }, t + 0.05)
        .to(shadow.node, { opacity: 0, duration: 0.2 }, t)
        .to(body, { attr: { rx: 0, "stroke-width": 0 }, duration: 0.2 }, t + 0.1)
        .to(lift, { y: 76, duration: 0.22, ease: "power2.in" }, t);
      return b;
    };

    up();
    return b;
  }

  global.Blink = { create, colors: C };
})(typeof window !== "undefined" ? window : globalThis);
