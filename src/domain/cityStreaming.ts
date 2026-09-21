/** Conservative ground-plane coverage for the fixed isometric camera, plus preload margin. */
export function streamRadius(width: number, height: number, zoom: number) {
  return Math.max(120, Math.min(520, Math.hypot(width, height / 0.54) / (2 * Math.max(zoom, 1)) + 70));
}
export function entranceScale(elapsed: number) {
  const t = Math.max(0, Math.min(1, elapsed / 550));
  // One restrained overshoot; no ongoing spring or oscillation.
  return 1 + 2 * (t - 1) ** 3 + (t - 1) ** 2;
}
