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

test('visual generation schemas accept generic icon, brand atlas, and wiki visual jobs', () => {
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

  const wikiVisualRequest = visualGenerationStartRequestSchema.parse({
    projectId: 'project-1',
    draftId: 'draft-1',
    kind: 'wiki_visual',
    targetKeys: { assetKey: 'world_concept_project', role: 'world_concept_image' },
    input: { imagePrompt: 'single cinematic world concept scene', quality: 'low', outputFormat: 'webp' },
  })
  assert.equal(wikiVisualRequest.kind, 'wiki_visual')
  assert.equal(wikiVisualRequest.input.outputFormat, 'webp')
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

test('visual generation schemas accept entity reference sheet jobs and legacy character sheet alias', () => {
  const createdAt = new Date().toISOString()
  const request = visualGenerationStartRequestSchema.parse({
    projectId: 'project-1',
    draftId: 'draft-1',
    kind: 'entity_reference_sheet',
    targetKeys: { entityKey: 'actor.eva_9' },
    input: { entityKey: 'actor.eva_9', sheetKind: 'character' },
  })
  assert.equal(request.kind, 'entity_reference_sheet')
  assert.equal(request.model, 'openai/gpt-image-2')

  const legacy = visualGenerationJobSchema.parse({
    id: 'job-character-sheet',
    projectId: 'project-1',
    draftId: 'draft-1',
    requestedBy: 'user-1',
    status: 'queued',
    kind: 'character_sheet',
    provider: 'fal',
    model: 'openai/gpt-image-2',
    targetKeys: { entityKey: 'actor.eva_9' },
    input: {},
    outputs: {},
    metadata: {},
    createdAt,
    updatedAt: createdAt,
  })
  assert.equal(legacy.kind, 'character_sheet')
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
  assert.match(visualWorker, /processWikiVisualJob/)
  assert.match(visualWorker, /job\.kind === 'wiki_visual'/)
  assert.match(visualWorker, /world_concept_image/)
})

test('initial streamed seed queues world concept image after wiki metadata and before icon batch boundary', () => {
  const source = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/world-prompt.ts'), 'utf8')

  assert.match(source, /op\.op === 'update_world_wiki_metadata'[\s\S]{0,180}await maybeQueueInitialSeedWorldConceptImage\('world_wiki_metadata'\)/)
  assert.match(source, /op\.op === 'upsert_entity' && op\.payload\.entity\.nodeType === 'sequence_unit'[\s\S]{0,180}await maybeQueueInitialSeedIconBatch\('first_sequence_unit'\)/)
  assert.match(source, /kind:\s*'wiki_visual'/)
  assert.match(source, /role:\s*'world_concept_image'/)
  assert.match(source, /quality:\s*'low'/)
  assert.match(source, /outputFormat:\s*'webp'/)
})

test('generic visual generation start persists pending world concept wiki assets', () => {
  const source = readFileSync(resolve(repoRoot, 'supabase/functions/start-visual-generation-job/index.ts'), 'utf8')

  assert.match(source, /persistPendingWorldConceptImage/)
  assert.match(source, /payload\.kind === 'wiki_visual' && role === 'world_concept_image'/)
  assert.match(source, /generatedBy:\s*'world_concept_image'/)
  assert.match(source, /worldConceptAssetKey:\s*input\.assetKey/)
  assert.match(source, /worldConceptVisualJobId:\s*input\.jobId/)
})

test('entity reference sheet jobs route through Fly visual worker with medium webp output', () => {
  const visualWorker = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/visual-generation-worker.ts'), 'utf8')
  const appSource = readFileSync(resolve(repoRoot, 'src/App.tsx'), 'utf8')

  assert.match(visualWorker, /processEntityReferenceSheetJob/)
  assert.match(visualWorker, /job\.kind === 'entity_reference_sheet' \|\| job\.kind === 'character_sheet'/)
  assert.match(visualWorker, /VISUAL_GENERATION_ENTITY_REFERENCE_SHEET_MODEL/)
  assert.match(visualWorker, /explicitModel \|\| configuredModel \|\| 'openai\/gpt-image-2'/)
  assert.match(visualWorker, /baseModel === 'openai\/gpt-image-2\/edit' \? 'openai\/gpt-image-2' : baseModel/)
  assert.match(visualWorker, /VISUAL_GENERATION_ENTITY_REFERENCE_SHEET_QUALITY'\) \|\| 'medium'/)
  assert.match(visualWorker, /VISUAL_GENERATION_ENTITY_REFERENCE_SHEET_OUTPUT_FORMAT'\) \|\| 'webp'/)
  assert.match(visualWorker, /referenceSheetAssetKey/)
  assert.match(visualWorker, /thumbnail_asset_key: assetKey/)
  assert.match(visualWorker, /icon_asset_key: assetKey/)
  assert.match(visualWorker, /upsertDefinitionPreviewImageBinding/)
  assert.doesNotMatch(appSource, /referenceAssetKeys:\s*\[entity\.thumbnailAssetKey,\s*definition\.iconAssetKey\]/)
})

test('entity icon grid generation uses low quality and larger custom size for 3x3 plus grids', () => {
  const visualWorker = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/visual-generation-worker.ts'), 'utf8')
  const legacyWorker = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/entity-icon-worker.ts'), 'utf8')

  for (const source of [visualWorker, legacyWorker]) {
    assert.match(source, /cellCount\s*>=\s*9\s*\?\s*\{\s*width:\s*2048,\s*height:\s*2048\s*\}\s*:\s*'square_hd'/)
    assert.match(source, /quality:[\s\S]*\?\?\s*'low'/)
    assert.match(source, /image_size:\s*input\.imageSize\s*\?\?\s*'square_hd'/)
  }
})
