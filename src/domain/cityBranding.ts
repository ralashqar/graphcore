export type BillboardCrop = { x: number; y: number; zoom: number };
export const defaultBillboardCrop: BillboardCrop = { x: 50, y: 50, zoom: 1 };

/** Cover a 2:1 sign; position is the percentage of available overflow to crop. */
export function billboardImageRect(
  width: number,
  height: number,
  crop = defaultBillboardCrop,
) {
  const zoom = Math.max(
    1,
    Math.min(3, Number.isFinite(crop.zoom) ? crop.zoom : 1),
  );
  const scale = Math.max(512 / width, 256 / height) * zoom;
  const position = (value: number) =>
    Math.max(0, Math.min(100, Number.isFinite(value) ? value : 50)) / 100;
  return {
    x: (512 - width * scale) * position(crop.x),
    y: (256 - height * scale) * position(crop.y),
    width: width * scale,
    height: height * scale,
  };
}
