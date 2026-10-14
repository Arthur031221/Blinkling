export function contains(rect, point) {
  return (
    point.x >= rect.x &&
    point.y >= rect.y &&
    point.x < rect.x + rect.width &&
    point.y < rect.y + rect.height
  );
}
export function pixelRectToDip(rect, capture) {
  const sx = capture.region.width / capture.pixelWidth;
  const sy = capture.region.height / capture.pixelHeight;
  return {
    x: capture.region.x + rect.x * sx,
    y: capture.region.y + rect.y * sy,
    width: rect.width * sx,
    height: rect.height * sy,
  };
}
