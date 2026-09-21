/** CPU validation: edge-connected key removal preserves enclosed pink branding. */
export function cutoutCityArt(data: Uint8Array, width: number, height: number) {
  if (width !== 512 || height !== 512 || data.length !== width * height * 4) {
    throw new Error("Expected a 512px RGBA image.");
  }
  const mask = new Uint8Array(width * height),
    queue = new Int32Array(width * height);
  let head = 0, tail = 0;
  const key = (p: number) =>
    data[p * 4 + 3] < 16 ||
    (data[p * 4] > 170 && data[p * 4 + 2] > 170 && data[p * 4 + 1] < 100 &&
      Math.abs(data[p * 4] - data[p * 4 + 2]) < 65);
  const add = (p: number) => {
    if (!mask[p] && key(p)) {
      mask[p] = 1;
      queue[tail++] = p;
    }
  };
  for (let i = 0; i < 512; i++) {
    add(i);
    add(511 * 512 + i);
    add(i * 512);
    add(i * 512 + 511);
  }
  while (head < tail) {
    const p = queue[head++], x = p % 512, y = Math.floor(p / 512);
    if (x) add(p - 1);
    if (x < 511) add(p + 1);
    if (y) add(p - 512);
    if (y < 511) add(p + 512);
  }
  if (tail < width * height * .12 || tail > width * height * .85) {
    throw new Error(
      "Background is not a clean isolated tile. Generate a new candidate.",
    );
  }
  const pixels = new Uint8Array(data);
  for (let p = 0; p < mask.length; p++) if (mask[p]) pixels[p * 4 + 3] = 0;
  const bottom = new Int16Array(512).fill(-1);
  let minX = 512, maxX = -1, minY = 512, maxY = -1;
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      if (pixels[(y * 512 + x) * 4 + 3] > 128) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        bottom[x] = y;
      }
    }
  }
  if (
    minX < 8 || maxX > 503 || minY < 8 || maxY > 503 || maxX - minX < 360 ||
    minY > 250
  ) throw new Error("Building is clipped or does not fill the tile reference.");
  // Fit the lower diamond edges away from rounded corners; disallow asymmetric scaling.
  const mid = (minX + maxX) / 2;
  function fit(a: number, b: number) {
    let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let x = Math.ceil(a); x <= b; x++) {
      if (bottom[x] >= 0) {
        n++;
        sx += x;
        sy += bottom[x];
        sxx += x * x;
        sxy += x * bottom[x];
      }
    }
    if (n < 80) throw new Error("Tile edges are missing.");
    const m = (n * sxy - sx * sy) / (n * sxx - sx * sx), c = (sy - m * sx) / n;
    let error = 0;
    for (let x = Math.ceil(a); x <= b; x++) {
      if (bottom[x] >= 0) error += (bottom[x] - m * x - c) ** 2;
    }
    return { m, c, error: Math.sqrt(error / n) };
  }
  const left = fit(minX + 18, mid - 22), right = fit(mid + 22, maxX - 18);
  const expected = 120 / 224;
  if (
    Math.abs(left.m - expected) > .07 || Math.abs(right.m + expected) > .07 ||
    Math.abs(left.m + right.m) > .045 || left.error > 3 || right.error > 3
  ) throw new Error("Tile perspective does not match the isometric reference.");
  const frontX = (right.c - left.c) / (left.m - right.m),
    frontY = left.m * frontX + left.c;
  const sideY = (left.m * minX + left.c + right.m * maxX + right.c) / 2;
  if (
    Math.abs(frontX - mid) > 8 || frontY - sideY < 90 || frontY - sideY > 140
  ) throw new Error("Tile is skewed.");
  const scale = 448 / (maxX - minX),
    dx = 32 - minX * scale,
    dy = 480 - frontY * scale;
  if (minY * scale + dy < 8 || Math.abs(sideY * scale + dy - 360) > 12) {
    throw new Error("Tile cannot be aligned without clipping.");
  }
  return {
    pixels,
    scale,
    dx,
    dy,
    evidence: {
      left: minX,
      right: maxX,
      frontY,
      sideY,
      leftSlope: left.m,
      rightSlope: right.m,
      edgeError: Math.max(left.error, right.error),
    },
  };
}

export function alignCityArt(source: ReturnType<typeof cutoutCityArt>) {
  const out = new Uint8Array(512 * 512 * 4);
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const sx = (x - source.dx) / source.scale,
        sy = (y - source.dy) / source.scale,
        ix = Math.floor(sx),
        iy = Math.floor(sy);
      let alpha = 0;
      const rgb = [0, 0, 0];
      for (let j = 0; j < 2; j++) {
        for (let i = 0; i < 2; i++) {
          const px = ix + i, py = iy + j;
          if (px < 0 || py < 0 || px > 511 || py > 511) continue;
          const weight = (i ? sx - ix : 1 - sx + ix) *
              (j ? sy - iy : 1 - sy + iy),
            p = (py * 512 + px) * 4,
            a = source.pixels[p + 3] / 255 * weight;
          alpha += a;
          for (let c = 0; c < 3; c++) rgb[c] += source.pixels[p + c] * a;
        }
      }
      const p = (y * 512 + x) * 4;
      out[p + 3] = Math.round(alpha * 255);
      if (alpha) {
        for (let c = 0; c < 3; c++) out[p + c] = Math.round(rgb[c] / alpha);
      }
    }
  }
  return out;
}
