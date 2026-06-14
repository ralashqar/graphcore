import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  createSpatialWorldIdempotencyKey,
  isTerminalSpatialWorldGenerationStatus,
  spatialWorldGenerationJobSchema,
  spatialWorldGenerationStartRequestSchema,
  spatialWorldManifestSchema,
  spatialWorldMarkerSchema,
  spatialWorldVariantSchema,
} from './spatialWorldGeneration.ts'

const timestamp = '2026-06-13T12:00:00.000Z'

test('spatial world requests normalize a dual-provider benchmark', () => {
  const request = spatialWorldGenerationStartRequestSchema.parse({
    projectId: 'project-1',
    draftId: 'draft-1',
    targetKind: 'environment',
    targetKey: 'environment.sky-temple',
    providers: ['worldlabs', 'spaitial'],
    input: {
      prompt: 'A wind-carved sky temple above a cloud ocean.',
      sourceImages: [{ assetKey: 'image.sky-temple', role: 'primary' }],
      idempotencyKey: 'benchmark:sky-temple:v1',
    },
  })

  assert.deepEqual(request.providers, ['worldlabs', 'spaitial'])
  assert.equal(request.variantKey, 'default')
  assert.equal(request.input.quality, 'draft')
  assert.equal(request.input.sourceImages[0].role, 'primary')
})

test('spatial world requests reject duplicate provider charges', () => {
  assert.throws(() => spatialWorldGenerationStartRequestSchema.parse({
    projectId: 'project-1', draftId: 'draft-1', targetKind: 'environment', targetKey: 'environment.sky-temple',
    providers: ['worldlabs', 'worldlabs'],
    input: { prompt: 'Sky temple', idempotencyKey: 'duplicate-provider' },
  }))
})

test('spatial world manifests preserve visual, collider, scale, and bounds outputs', () => {
  const manifest = spatialWorldManifestSchema.parse({
    version: 1,
    provider: 'worldlabs',
    providerWorldId: 'world-123',
    visualAssetKeys: ['splat.sky-temple.full'],
    primarySplatAssetKey: 'splat.sky-temple.full',
    lodAssetKeys: ['splat.sky-temple.100k'],
    colliderMeshAssetKey: 'mesh.sky-temple.collider',
    panoramaAssetKey: 'image.sky-temple.panorama',
    thumbnailAssetKey: 'image.sky-temple.thumbnail',
    units: 'meters',
    metricScaleFactor: 1.4,
    groundPlaneOffset: -0.25,
    bounds: { min: [-12, -1, -9], max: [15, 18, 11] },
  })

  assert.equal(manifest.colliderMeshAssetKey, 'mesh.sky-temple.collider')
  assert.equal(manifest.metricScaleFactor, 1.4)
  assert.deepEqual(manifest.bounds?.max, [15, 18, 11])
})

test('spatial world jobs default durable worker and output state', () => {
  const job = spatialWorldGenerationJobSchema.parse({
    id: 'job-1',
    projectId: 'project-1',
    draftId: 'draft-1',
    targetKind: 'cinematic_location',
    targetKey: 'scene.storm-gate',
    provider: 'spaitial',
    model: 'echo',
    status: 'queued',
    input: {
      prompt: 'A rain-soaked gatehouse at night.',
      idempotencyKey: 'spatial-world:project-1:draft-1:cinematic_location:scene.storm-gate:default:spaitial',
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  })

  assert.equal(job.attemptCount, 0)
  assert.equal(job.outputs.manifest, null)
  assert.equal(job.variantKey, 'default')
  assert.equal(job.actualUsd, null)
})

test('spatial world terminal-state and idempotency helpers are stable', () => {
  assert.equal(isTerminalSpatialWorldGenerationStatus('running'), false)
  assert.equal(isTerminalSpatialWorldGenerationStatus('completed'), true)
  assert.equal(isTerminalSpatialWorldGenerationStatus('failed'), true)
  assert.equal(isTerminalSpatialWorldGenerationStatus('cancelled'), true)

  const key = createSpatialWorldIdempotencyKey({
    projectId: 'project-1',
    draftId: 'draft-1',
    targetKind: 'world_model',
    targetKey: 'world.aether',
    variantKey: 'night',
    provider: 'worldlabs',
  })

  assert.equal(key, 'spatial-world:project-1:draft-1:world_model:world.aether:night:worldlabs')
})

test('spatial world variants and cinematic viewpoints preserve alignment and bindings', () => {
  const variant = spatialWorldVariantSchema.parse({
    id: 'variant-1',
    projectId: 'project-1',
    draftId: 'draft-1',
    targetKind: 'environment',
    targetKey: 'environment.sky-temple',
    key: 'night-storm',
    name: 'Night Storm',
    provider: 'worldlabs',
    model: 'marble',
    status: 'ready',
    isActive: true,
    alignmentTransform: {
      position: [4, 0, -2],
      rotation: [0, 1.57, 0],
      scale: [1.2, 1.2, 1.2],
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  assert.equal(variant.alignmentTransform.position[0], 4)

  const marker = spatialWorldMarkerSchema.parse({
    id: 'marker-1',
    projectId: 'project-1',
    draftId: 'draft-1',
    variantId: variant.id,
    key: 'storm-gate-wide',
    kind: 'camera_viewpoint',
    name: 'Storm Gate Wide',
    transform: {
      position: [2, 1.8, 7],
      rotation: [0, 3.14, 0],
      scale: [1, 1, 1],
    },
    camera: { fov: 42, target: [0, 2, 0] },
    linkedSceneId: 'scene.storm-gate',
    linkedCoverageSetupId: 'coverage.wide-master',
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  assert.equal(marker.kind, 'camera_viewpoint')
  assert.equal(marker.camera?.projection, 'perspective')
  assert.equal(marker.linkedCoverageSetupId, 'coverage.wide-master')
})

test('spatial world pipeline keeps quotes, billing, storage, and activation durable', () => {
  const migration = readFileSync('supabase/migrations/20260613130000_spatial_world_generation_foundation.sql', 'utf8')
  const start = readFileSync('supabase/functions/start-spatial-world-generation/index.ts', 'utf8')
  const worker = readFileSync('supabase/functions/_shared/spatial-world-generation-worker.ts', 'utf8')
  const provider = readFileSync('supabase/functions/_shared/spatial-world-providers.ts', 'utf8')
  assert.match(migration, /enqueue_spatial_world_generation_jobs/)
  assert.match(migration, /activate_spatial_world_variant/)
  assert.match(start, /verifySpatialWorldQuoteToken/)
  assert.match(start, /can_edit_project_draft/)
  assert.match(worker, /generated\/spatial-worlds/)
  assert.match(worker, /spatial_world_variants/)
  assert.match(provider, /worlds:generate/)
  assert.match(provider, /collider_mesh_url/)
  assert.match(provider, /SpAItial generation is not enabled/)
})

test('spatial world viewer uses Spark with signed assets and mesh hybrid controls', () => {
  const viewport = readFileSync('src/features/viewer3d/ThreeSceneViewport.tsx', 'utf8')
  const panel = readFileSync('src/features/viewer3d/Character3dPanel.tsx', 'utf8')
  const app = readFileSync('src/App.tsx', 'utf8')
  const packageJson = readFileSync('package.json', 'utf8')
  assert.match(packageJson, /@sparkjsdev\/spark/)
  assert.match(viewport, /new SparkRenderer/)
  assert.match(viewport, /new SplatMesh/)
  assert.match(viewport, /enableLod: true/)
  assert.match(panel, /'mesh' \| 'spatial_world' \| 'hybrid'/)
  assert.match(panel, /colliderSourceUrl/)
  assert.match(app, /signProjectAssetUrls\(snapshot\.project\.id, assetKeys\)/)
})
