/** The product name drawn with a slow band of light and a few small stars. */
export function SparkleName({ name = "Blinkling" }: { name?: string }) {
  return (
    <span className="sparkle-name">
      <span className="sparkle-text">{name}</span>
      <i className="sparkle-star" aria-hidden="true" />
      <i className="sparkle-star" aria-hidden="true" />
      <i className="sparkle-star" aria-hidden="true" />
    </span>
  );
}
