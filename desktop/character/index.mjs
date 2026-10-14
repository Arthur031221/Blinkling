/** Static rig anchor using the house palette. Motion/edge peek is a builder task. */
export function mountBlink(host) {
  host.innerHTML = `<svg viewBox="0 0 140 160" aria-label="Blink" role="img"><rect x="10" y="10" width="120" height="140" rx="32" fill="#3ddc97" stroke="#0c0e0d" stroke-width="5"/><path d="M24 116 Q70 142 116 116" fill="none" stroke="#2cc283" stroke-width="12"/><ellipse cx="47" cy="65" rx="7" ry="10" fill="#0c0e0d"/><ellipse cx="93" cy="65" rx="7" ry="10" fill="#0c0e0d"/><path d="M54 96 Q70 112 86 96" fill="none" stroke="#0c0e0d" stroke-width="5" stroke-linecap="round"/></svg>`;
  return {
    regions: () =>
      Array.from({ length: 140 }, (_, y) => {
        const dy = Math.max(0, 32 - Math.min(y, 139 - y));
        const inset = dy ? 32 - Math.sqrt(32 ** 2 - dy ** 2) : 0;
        return { x: 30 + inset, y: 70 + y, width: 120 - 2 * inset, height: 1 };
      }),
  };
}
