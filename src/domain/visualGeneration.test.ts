import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  visualGenerationJobSchema,
  visualGenerationStartRequestSchema,
  visualGenerationStatusResponseSchema,
} from './visualGeneration.ts'

const repoRoot = resolve(import.meta.dirname, '../..')

test('visual generation schemas accept generic icon and brand atlas jobs', () => {
  const createdAt = new Date().toISOString()
  const iconJob = visualGenerationJobSchema.parse({
    id: 'job-icon',
    projectId: 'project-1',
    draftId: 'draft-1',
    requestedBy: 'user-1',
    status: 'queued',
    kind: 'world_entity_icon_grid',
    provider: 'fal',
    model: 'openai/gpt-image-2',
    targetKeys: { entityKeys: ['actor.mara'] },
    input: { gridRows: 1, gridCols: 1 },
    outputs: {},
    metadata: {},
    createdAt,
    updatedAt: createdAt,
  })

  assert.equal(iconJob.kind, 'world_entity_icon_grid')
  assert.deepEqual(iconJob.outputs.assets, [])

  const atlasJob = visualGenerationStatusResponseSchema.parse({
    ok: true,
    terminal: true,
    job: {
      ...iconJob,
      id: 'job-atlas',
      status: 'completed',
      kind: 'brand_atlas',
      targetKeys: { assetKey: 'brand_atlas_project' },
      outputs: {
        assets: [{
          assetKey: 'brand_atlas_project',
          storagePath: 'generated/wiki-brand-atlas/draft-1/brand_atlas_project.png',
          targetKind: 'world_wiki',
          targetKey: 'brandAtlasAssetKey',
          role: 'brand_atlas',
        }],
      },
    },
  })

  assert.equal(atlasJob.job.outputs.assets[0].role, 'brand_atlas')
})

test('visual generation start request supports app mockup and analysis kinds', () => {
  const request = visualGenerationStartRequestSchema.parse({
    projectId: 'project-1',
    draftId: 'draft-1',
    kind: 'app_screen_mockup',
    targetKeys: { screenKey: 'screen.home' },
    input: { prompt: 'premium mobile home screen' },
  })

  assert.equal(request.provider, 'fal')
  assert.equal(request.model, 'openai/gpt-image-2')
  assert.equal(request.kind, 'app_screen_mockup')

  const analysisRequest = visualGenerationStartRequestSchema.parse({
    projectId: 'project-1',
    draftId: 'draft-1',
    kind: 'app_screen_analysis',
    provider: 'graphcore',
    model: 'app-screen-analysis-v1',
    targetKeys: { screenKey: 'screen.home', screenMockupKey: 'screen_mockup_home' },
    input: { screenKey: 'screen.home', sourceAssetKey: 'screen-home-art' },
  })
  assert.equal(analysisRequest.kind, 'app_screen_analysis')
})

test('brand atlas endpoint enqueues generic visual jobs instead of calling image provider directly', () => {
  const source = readFileSync(resolve(repoRoot, 'supabase/functions/start-world-brand-atlas-image/index.ts'), 'utf8')
  assert.match(source, /visual_generation_jobs/)
  assert.match(source, /kind:\s*'brand_atlas'/)
  assert.doesNotMatch(source, /runOpenAiImages/)
  assert.doesNotMatch(source, /waitUntil/)
})

test('entity icon endpoint and Fly worker use the generic visual job pipeline', () => {
  const iconEndpoint = readFileSync(resolve(repoRoot, 'supabase/functions/start-world-entity-icon-batch/index.ts'), 'utf8')
  const worker = readFileSync(resolve(repoRoot, 'workers/world-generation/main.ts'), 'utf8')
  const visualWorker = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/visual-generation-worker.ts'), 'utf8')

  assert.match(iconEndpoint, /visual_generation_jobs/)
  assert.match(iconEndpoint, /kind:\s*'world_entity_icon_grid'/)
  assert.match(worker, /processFlyVisualGenerationJobs/)
  assert.match(visualWorker, /world_entity_icon_grid/)
  assert.match(visualWorker, /brand_atlas/)
})
