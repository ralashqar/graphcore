export type ViewportRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
export function clearCityViewport(
  width: number,
  height: number,
  panels: ViewportRect[],
): ViewportRect {
  let left = 16, top = 16, right = width - 16, bottom = height - 20;
  for (const p of panels) {
    if (p.right <= 0 || p.bottom <= 0 || p.left >= width || p.top >= height) {
      continue;
    }
    if (width >= 900 && p.left < width * .2 && p.right < width * .55) {
      left = Math.max(left, p.right + 24);
    } else if (
      width >= 900 && p.right > width * .8 && p.left > width * .55 &&
      p.bottom - p.top > height * .45
    ) right = Math.min(right, p.left - 24);
    else if (p.top < height * .3) top = Math.max(top, p.bottom + 14);
    else if (p.bottom > height * .7) bottom = Math.min(bottom, p.top - 14);
  }
  if (right - left < 100) {
    left = width * .35;
    right = width - 16;
  }
  if (bottom - top < 100) {
    top = height * .35;
    bottom = Math.max(top + 100, height * .7);
  }
  return { left, top, right, bottom };
}
/** Consecutive sampled visibility; long gaps and motion restart the dwell window. */
export function exposureDwell(
  previous: { since: number; last: number; x: number; y: number } | undefined,
  now: number,
  x: number,
  y: number,
  visible: boolean,
) {
  if (!visible) return null;
  const stable = previous && now - previous.last <= 1100 &&
    Math.hypot(previous.x - x, previous.y - y) < 6;
  const state = { since: stable ? previous.since : now, last: now, x, y };
  return { state, qualified: now - state.since >= 2000 };
}
export function initialWelcome(
  storage: Pick<Storage, "getItem"> | null,
  path: string,
  query: string,
) {
  try {
    return path === "/city" && !query && !storage?.getItem("city-explored-v1");
  } catch {
    return path === "/city" && !query;
  }
}
