// The drawn name used on the install guide: the same band of light and stars
// as the panel and the popup, so the CSS block is kept identical (a test checks).
export const SPARKLE_CSS = `
/* sparkle:start — the drawn name; keep this block identical in src/style.css, extension/style.css and bridge/src/sparkle.ts */
.sparkle-name {
  --spark-base: var(--sparkle-ink, #168454);
  position: relative;
  display: inline-block;
  white-space: nowrap;
  color: var(--spark-base);
  overflow: visible;
}
.sparkle-name > .sparkle-text {
  color: inherit;
}
@supports (background-clip: text) or (-webkit-background-clip: text) {
  .sparkle-name > .sparkle-text {
    background-image:
      linear-gradient(100deg, transparent 40%, #fff 50%, transparent 60%),
      linear-gradient(var(--spark-base), var(--spark-base));
    background-size:
      300% 100%,
      100% 100%;
    background-repeat: no-repeat;
    background-position:
      100% 0,
      0 0;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: sparkle-sweep 5.5s ease-in-out infinite;
  }
}
.sparkle-star {
  position: absolute;
  width: 0.34em;
  height: 0.34em;
  pointer-events: none;
  background: radial-gradient(circle, #fff 0 22%, #3ddc97 62%);
  clip-path: polygon(
    50% 0,
    61% 39%,
    100% 50%,
    61% 61%,
    50% 100%,
    39% 61%,
    0 50%,
    39% 39%
  );
  opacity: 0;
  transform: scale(0.2) rotate(0deg);
  animation: sparkle-twinkle 5.5s ease-in-out infinite;
  will-change: transform, opacity;
}
.sparkle-star:nth-child(2) {
  left: 4%;
  top: 4%;
  animation-delay: 0.9s;
}
.sparkle-star:nth-child(3) {
  right: 12%;
  top: 0;
  width: 0.26em;
  height: 0.26em;
  animation-delay: 1.5s;
}
.sparkle-star:nth-child(4) {
  right: -2%;
  bottom: 14%;
  width: 0.2em;
  height: 0.2em;
  animation-delay: 2.1s;
}
@keyframes sparkle-sweep {
  0% {
    background-position:
      100% 0,
      0 0;
  }
  32%,
  100% {
    background-position:
      0% 0,
      0 0;
  }
}
@keyframes sparkle-twinkle {
  0%,
  22%,
  100% {
    opacity: 0;
    transform: scale(0.2) rotate(0deg);
  }
  10% {
    opacity: 1;
    transform: scale(1) rotate(45deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .sparkle-name > .sparkle-text {
    animation: none;
    background-position:
      62% 0,
      0 0;
  }
  .sparkle-star {
    animation: none;
    opacity: 0.9;
    transform: scale(0.85);
    will-change: auto;
  }
  .sparkle-star:nth-child(4) {
    opacity: 0;
  }
}
/* sparkle:end */
`;

export const sparkleName = (name: string) =>
  `<span class="sparkle-name"><span class="sparkle-text">${name}</span><i class="sparkle-star" aria-hidden="true"></i><i class="sparkle-star" aria-hidden="true"></i><i class="sparkle-star" aria-hidden="true"></i></span>`;
