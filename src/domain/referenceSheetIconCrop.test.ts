import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildReferenceSheetIconCacheKey,
  resolveTopRightReferenceSheetIconCropRect,
} from './referenceSheetIconCrop.ts'

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
  assert.match(first, /^safe-inset-10\u001f/)
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
