import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildReferenceSheetIconCacheKey,
  resolveReferenceSheetIconTrimRectFromPixels,
  resolveTopRightReferenceSheetIconCropRect,
} from './referenceSheetIconCrop.ts'

function makeRgbaImage(width: number, height: number, colorForPixel: (x: number, y: number) => [number, number, number, number?]) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a = 255] = colorForPixel(x, y)
      const index = ((y * width) + x) * 4
      data[index] = r
      data[index + 1] = g
      data[index + 2] = b
      data[index + 3] = a
    }
  }
  return data
}

test('reference sheet icon cache key changes when the source sheet changes', () => {
  const base = {
    projectId: 'project-1',
    entityKey: 'hero',
    referenceSheetAssetKey: 'sheet_hero',
    storagePath: 'generated/entity-reference-sheets/draft/job-a/hero.webp',
    visualJobId: 'job-a',
  }

  const first = buildReferenceSheetIconCacheKey(base)
  assert.equal(buildReferenceSheetIconCacheKey({ ...base }), first)
  assert.match(first, /^safe-inset-10-edge-trim-2\u001f/)
  assert.notEqual(buildReferenceSheetIconCacheKey({ ...base, storagePath: 'generated/entity-reference-sheets/draft/job-b/hero.webp' }), first)
  assert.notEqual(buildReferenceSheetIconCacheKey({ ...base, visualJobId: 'job-b' }), first)
})

test('top-right crop rect uses an inward padded 512 square for 2048x2048 sheets', () => {
  assert.deepEqual(resolveTopRightReferenceSheetIconCropRect({
    naturalWidth: 2048,
    naturalHeight: 2048,
  }), {
    sx: 1485,
    sy: 51,
    sw: 512,
    sh: 512,
    outputWidth: 512,
    outputHeight: 512,
  })
})

test('edge trim removes a flat left strip while preserving padding', () => {
  const width = 512
  const height = 512
  const data = makeRgbaImage(width, height, (x, y) => {
    if (x < 72) return [250, 250, 248]
    return [40 + (y % 11), 90 + (x % 13), 160 + (y % 17)]
  })

  const rect = resolveReferenceSheetIconTrimRectFromPixels({ data, width, height })
  assert.ok(rect.sx > 0)
  assert.ok(rect.sw < width)
  assert.equal(rect.sw, rect.sh)
})

test('edge trim removes flat strips from right, top, and bottom edges', () => {
  const width = 512
  const height = 512
  const data = makeRgbaImage(width, height, (x, y) => {
    if (x >= width - 70 || y < 64 || y >= height - 68) return [246, 246, 242]
    return [80 + (x % 19), 55 + (y % 23), 130 + ((x + y) % 29)]
  })

  const rect = resolveReferenceSheetIconTrimRectFromPixels({ data, width, height })
  assert.ok(rect.sx > 0)
  assert.ok(rect.sy > 0)
  assert.ok(rect.sw < width)
  assert.equal(rect.sw, rect.sh)
})

test('edge trim removes noisy flat strip edges that include minor texture', () => {
  const width = 512
  const height = 512
  const data = makeRgbaImage(width, height, (x, y) => {
    if (x < 80) return [246 + ((x + y) % 4), 246 + ((x * 2 + y) % 4), 244 + ((x + y * 2) % 4)]
    if (x === 82 && y % 23 === 0) return [210, 210, 206]
    return [34 + (y % 17), 88 + (x % 29), 150 + ((x + y) % 31)]
  })

  const rect = resolveReferenceSheetIconTrimRectFromPixels({ data, width, height })
  assert.ok(rect.sx > 0)
  assert.ok(rect.sw < width)
})

test('edge trim keeps all-white crops unchanged', () => {
  const width = 512
  const height = 512
  const data = makeRgbaImage(width, height, () => [255, 255, 255])

  assert.deepEqual(resolveReferenceSheetIconTrimRectFromPixels({ data, width, height }), {
    sx: 0,
    sy: 0,
    sw: width,
    sh: height,
  })
})

test('edge trim keeps complex non-flat edges unchanged', () => {
  const width = 512
  const height = 512
  const data = makeRgbaImage(width, height, (x, y) => [
    (x * 31 + y * 17) % 256,
    (x * 13 + y * 29) % 256,
    (x * 7 + y * 41) % 256,
  ])

  assert.deepEqual(resolveReferenceSheetIconTrimRectFromPixels({ data, width, height }), {
    sx: 0,
    sy: 0,
    sw: width,
    sh: height,
  })
})

test('edge trim does not over-zoom tiny centered content', () => {
  const width = 512
  const height = 512
  const data = makeRgbaImage(width, height, (x, y) => {
    if (x >= 230 && x <= 280 && y >= 230 && y <= 280) return [30, 80, 140]
    return [252, 252, 250]
  })

  assert.deepEqual(resolveReferenceSheetIconTrimRectFromPixels({ data, width, height }), {
    sx: 0,
    sy: 0,
    sw: width,
    sh: height,
  })
})

test('top-right crop rect uses an inward padded 512 square for 2048x1536 sheets', () => {
  assert.deepEqual(resolveTopRightReferenceSheetIconCropRect({
    naturalWidth: 2048,
    naturalHeight: 1536,
  }), {
    sx: 1485,
    sy: 51,
    sw: 512,
    sh: 512,
    outputWidth: 512,
    outputHeight: 512,
  })
})

test('top-right crop rect falls back to the largest available square for small images', () => {
  assert.deepEqual(resolveTopRightReferenceSheetIconCropRect({
    naturalWidth: 420,
    naturalHeight: 320,
  }), {
    sx: 68,
    sy: 0,
    sw: 320,
    sh: 320,
    outputWidth: 512,
    outputHeight: 512,
  })
})
