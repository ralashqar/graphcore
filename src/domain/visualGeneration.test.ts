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

test('visual generation schemas parse legacy persisted icon jobs, brand atlas, and wiki visual jobs', () => {
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
  assert.equal(request.provider, 'fal')
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

test('visual generation schemas support OpenAI direct provider mode', () => {
  const request = visualGenerationStartRequestSchema.parse({
    projectId: 'project-1',
    draftId: 'draft-1',
    kind: 'wiki_visual',
    provider: 'openai',
    model: 'gpt-image-2',
    targetKeys: { role: 'world_concept_image', assetKey: 'world_concept_project' },
    input: { imagePrompt: 'single cinematic world concept scene' },
  })

  assert.equal(request.provider, 'openai')
  assert.equal(request.model, 'gpt-image-2')
})

test('visual generation start endpoint preserves backend provider defaults when the client omits provider', () => {
  const repositorySource = readFileSync(resolve(repoRoot, 'src/data/graphcoreRepository.ts'), 'utf8')
  const startEndpoint = readFileSync(resolve(repoRoot, 'supabase/functions/start-visual-generation-job/index.ts'), 'utf8')

  assert.match(repositorySource, /delete payload\.provider/)
  assert.match(startEndpoint, /VISUAL_GENERATION_IMAGE_PROVIDER/)
  assert.match(startEndpoint, /return 'fal'/)
  assert.match(startEndpoint, /providerMode === 'both'/)
  assert.match(startEndpoint, /chooseBalancedImageProvider/)
  assert.match(startEndpoint, /normalizeVisualGenerationModel/)
  assert.match(startEndpoint, /providerDefaultSource/)
  assert.match(startEndpoint, /notifyWorkerWakeBestEffort/)
  assert.match(startEndpoint, /family:\s*'visual'/)
})

test('Fly visual worker can render queued visual jobs through OpenAI direct or Fal', () => {
  const visualWorker = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/visual-generation-worker.ts'), 'utf8')
  const claimMigration = readFileSync(resolve(repoRoot, 'supabase/migrations/20260512120000_visual_generation_provider_claim_caps.sql'), 'utf8')

  assert.match(visualWorker, /runTrackedOpenAiImages/)
  assert.match(visualWorker, /function normalizeOpenAiImageModel/)
  assert.match(visualWorker, /Deno\.env\.get\('VISUAL_GENERATION_IMAGE_PROVIDER'\) \|\| 'fal'/)
  assert.match(visualWorker, /function generateVisualImage/)
  assert.match(visualWorker, /provider === 'openai'/)
  assert.match(visualWorker, /extractOpenAiImageOutput/)
  assert.match(visualWorker, /b64_json/)
  assert.match(visualWorker, /VISUAL_GENERATION_OPENAI_TIMEOUT_MS/)
  assert.match(visualWorker, /VISUAL_GENERATION_OPENAI_ATTEMPTS/)
  assert.match(visualWorker, /VISUAL_GENERATION_OPENAI_CONCURRENCY/)
  assert.match(visualWorker, /openai_running_limit/)
  assert.match(visualWorker, /buildFalWebhookUrl/)
  assert.match(visualWorker, /webhook_url/)
  assert.match(visualWorker, /loadVisualJobFalWebhookResult/)
  assert.match(visualWorker, /falWebhookImageUrl/)
  assert.match(visualWorker, /VISUAL_GENERATION_FAL_WEBHOOK_POLL_INTERVAL_MS/)
  assert.match(claimMigration, /openai_running_limit integer default 8/)
  assert.match(claimMigration, /provider = 'openai'/)
  assert.match(claimMigration, /capacity\.active_openai_jobs < openai_limit/)
})

test('brand atlas endpoint enqueues generic visual jobs instead of calling image provider directly', () => {
  const source = readFileSync(resolve(repoRoot, 'supabase/functions/start-world-brand-atlas-image/index.ts'), 'utf8')
  assert.match(source, /visual_generation_jobs/)
  assert.match(source, /kind:\s*'brand_atlas'/)
  assert.match(source, /notifyWorkerWakeBestEffort/)
  assert.match(source, /family:\s*'visual'/)
  assert.doesNotMatch(source, /runOpenAiImages/)
  assert.doesNotMatch(source, /waitUntil/)
})

test('manual entity icon-grid starts are disabled but the Fly worker supports restricted lore sequence grids', () => {
  const iconEndpoint = readFileSync(resolve(repoRoot, 'supabase/functions/start-world-entity-icon-batch/index.ts'), 'utf8')
  const startEndpoint = readFileSync(resolve(repoRoot, 'supabase/functions/start-visual-generation-job/index.ts'), 'utf8')
  const worker = readFileSync(resolve(repoRoot, 'workers/world-generation/main.ts'), 'utf8')
  const visualWorker = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/visual-generation-worker.ts'), 'utf8')

  assert.match(iconEndpoint, /Legacy world entity icon-grid generation is disabled/)
  assert.doesNotMatch(iconEndpoint, /visual_generation_jobs/)
  assert.doesNotMatch(iconEndpoint, /kind:\s*'world_entity_icon_grid'/)
  assert.match(startEndpoint, /payload\.kind === 'world_entity_icon_grid'/)
  assert.match(startEndpoint, /Legacy world entity icon-grid generation is disabled/)
  assert.match(worker, /processFlyVisualGenerationJobs/)
  assert.match(worker, /VISUAL_GENERATION_WORKER_CONCURRENCY/)
  assert.match(worker, /Array\.from\(\{\s*length:\s*visualWorkerConcurrency\s*\}/)
  assert.match(visualWorker, /world_entity_icon_grid/)
  assert.match(visualWorker, /await processEntityIconGridJob\(input\.client,\s*job,\s*input\.workerId\)/)
  assert.match(visualWorker, /only allowed for lore\/concept and story sequence entries/)
  assert.doesNotMatch(visualWorker, /legacy_icon_grid_disabled/)
  assert.match(visualWorker, /brand_atlas/)
  assert.match(visualWorker, /processWikiVisualJob/)
  assert.match(visualWorker, /job\.kind === 'wiki_visual'/)
  assert.match(visualWorker, /world_concept_image/)
})

test('initial streamed seed queues world concept image, per-entity reference sheets, and final lore sequence grid', () => {
  const source = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/world-prompt.ts'), 'utf8')

  assert.match(source, /op\.op === 'update_world_wiki_metadata'[\s\S]{0,180}await maybeQueueInitialSeedWorldConceptImage\('world_wiki_metadata'\)/)
  assert.doesNotMatch(source, /skippedReason:\s*'existing_asset'/)
  assert.match(source, /function asRecord\(value: unknown\): Record<string, unknown>/)
  assert.match(source, /function hasInitialSeedReferenceArtDirection/)
  assert.match(source, /skippedReason:\s*'missing_world_wiki_art_style_description'/)
  assert.match(source, /op\.op === 'update_world_wiki_metadata'[\s\S]{0,260}await maybeQueueInitialSeedEntityReferenceSheetsForExistingEntities\('world_wiki_metadata'\)/)
  assert.match(source, /const appliedEntityTargetKey = op\.op === 'upsert_entity'[\s\S]{0,160}op\.payload\.targetEntityKey/)
  assert.doesNotMatch(source, /entity\.key === op\.payload\.entity\.key/)
  assert.match(source, /op\.op === 'upsert_entity'[\s\S]{0,320}await maybeQueueInitialSeedEntityReferenceSheet\(entity,\s*'streamed_upsert_entity'\)/)
  assert.doesNotMatch(source, /op\.op === 'upsert_entity' && op\.payload\.entity\.nodeType === 'sequence_unit'[\s\S]{0,240}maybeQueueInitialSeedIconBatch/)
  assert.doesNotMatch(source, /initial_seed_sequence_boundary/)
  assert.doesNotMatch(source, /world_entity_icon_generation_jobs/)
  assert.match(source, /kind:\s*'wiki_visual'/)
  assert.match(source, /role:\s*'world_concept_image'/)
  assert.match(source, /kind:\s*'entity_reference_sheet'/)
  assert.match(source, /queuedBy:\s*'initial_seed_entity_reference_sheet'/)
  assert.match(source, /maybeQueueInitialSeedLoreSequenceGrid\('initial_seed_complete'\)/)
  assert.match(source, /kind:\s*'world_entity_icon_grid'/)
  assert.match(source, /queuedBy:\s*'initial_seed_lore_sequence_grid'/)
  assert.match(source, /nodeTypes:\s*\['concept', 'sequence_unit'\]/)
  assert.match(source, /target_keys:\s*\{\s*entityKey:\s*candidate\.key/)
  assert.match(source, /maybeQueueInitialSeedEntityReferenceSheetsForExistingEntities\('initial_seed_complete'\)/)
  assert.match(source, /source:\s*'initial-seed-world-concept-image'/)
  assert.match(source, /source:\s*'initial-seed-entity-reference-sheet'/)
  assert.match(source, /source:\s*'initial-seed-lore-sequence-grid'/)
  assert.match(source, /quality:\s*'low'/)
  assert.match(source, /outputFormat:\s*'webp'/)
  assert.match(source, /imageSize:\s*\{\s*width:\s*1536,\s*height:\s*864\s*\}/)
})

test('generic visual generation start normalizes and persists pending world concept wiki assets', () => {
  const source = readFileSync(resolve(repoRoot, 'supabase/functions/start-visual-generation-job/index.ts'), 'utf8')

  assert.match(source, /const worldConceptImageQuality = 'low'/)
  assert.match(source, /const worldConceptImageSize = \{\s*width:\s*1536,\s*height:\s*864\s*\} as const/)
  assert.match(source, /function normalizeVisualGenerationInput/)
  assert.match(source, /quality:\s*worldConceptImageQuality/)
  assert.match(source, /imageSize:\s*worldConceptImageSize/)
  assert.match(source, /persistPendingWorldConceptImage/)
  assert.match(source, /input\.kind === 'wiki_visual' && role === 'world_concept_image'/)
  assert.match(source, /generatedBy:\s*'world_concept_image'/)
  assert.match(source, /worldConceptPrompt:\s*input\.sourcePrompt \|\| input\.imagePrompt \|\| readString\(currentWiki\.worldConceptPrompt\)/)
  assert.match(source, /worldConceptAssetKey:\s*input\.assetKey/)
  assert.match(source, /worldConceptVisualJobId:\s*input\.jobId/)
})

test('Fly wiki visual worker hard-forces low quality wide world concept images', () => {
  const visualWorker = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/visual-generation-worker.ts'), 'utf8')

  assert.match(visualWorker, /const worldConceptImageQuality = 'low'/)
  assert.match(visualWorker, /const worldConceptImageSize = \{\s*width:\s*1536,\s*height:\s*864\s*\} as const/)
  assert.match(visualWorker, /const outputFormat = worldConceptOutputFormat/)
  assert.match(visualWorker, /const quality = worldConceptImageQuality/)
  assert.match(visualWorker, /const imageSize = worldConceptImageSize/)
  assert.match(visualWorker, /worldConceptPrompt:\s*sourcePrompt \|\| prompt \|\| readString\(currentWiki\.worldConceptPrompt\)/)
})

test('wiki hero concept generation rebuilds prompts from current wiki state instead of stale stored prompts', () => {
  const appSource = readFileSync(resolve(repoRoot, 'src/App.tsx'), 'utf8')
  const seedSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/world-prompt.ts'), 'utf8')

  assert.match(appSource, /const imagePrompt = buildWorldConceptImagePrompt\(/)
  assert.doesNotMatch(appSource, /const sourcePrompt = trimOptionalString\(wiki\.worldConceptPrompt\)/)
  assert.match(appSource, /sourcePrompt:\s*imagePrompt/)
  assert.match(appSource, /worldConceptPrompt:\s*imagePrompt/)
  assert.match(seedSource, /const prompt = buildInitialSeedWorldConceptPrompt\(currentWiki, input\.projectContext\)/)
  assert.doesNotMatch(seedSource, /const prompt = asCompactString\(currentWiki\.worldConceptPrompt\) \|\| buildInitialSeedWorldConceptPrompt/)
})

test('wiki hero banner only renders world concept image assets, not entity reference sheets', () => {
  const appSource = readFileSync(resolve(repoRoot, 'src/App.tsx'), 'utf8')
  const worldGraphSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/WorldGraphPage.tsx'), 'utf8')
  const wikiPanelSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/wiki/WorldWikiPanel.tsx'), 'utf8')

  assert.match(appSource, /function isWorldConceptImageAsset/)
  assert.match(appSource, /generatedBy\) === 'world_concept_image'/)
  assert.match(appSource, /jobKind\) === 'wiki_visual'/)
  assert.match(worldGraphSource, /function isWorldConceptImageAsset/)
  assert.match(worldGraphSource, /const wikiOverviewImageUrl = liveWikiGenerationState\.active/)
  assert.match(worldGraphSource, /overviewWorldConceptAssetKey/)
  assert.match(worldGraphSource, /wikiWorldConceptAsset\?\.key === liveWikiGenerationState\.overviewWorldConceptAssetKey/)
  assert.match(worldGraphSource, /readEntityReferenceSheetAssetKey\(entity\)[\s\S]{0,120}referenceSheetIconUrlByEntityKey\.get\(entity\.key\) \?\? null/)
  assert.match(wikiPanelSource, /const liveOverviewReady = !liveGenerationActive \|\| wikiOverviewShowMetadata/)
  assert.match(worldGraphSource, /onGenerateWorldConceptImage/)
  assert.match(worldGraphSource, /failed to auto-start world concept image generation from Wiki/)
  assert.doesNotMatch(worldGraphSource, /wikiOverviewImageUrl = liveWorldConceptImageUrl \?\? wikiWorldConceptImageUrl \?\? wikiHeroEntityImageUrl/)
})

test('wiki hero auto generation is first-run only and uses durable concept bindings', () => {
  const worldGraphSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/WorldGraphPage.tsx'), 'utf8')

  assert.match(worldGraphSource, /const hasDurableWorldConceptBinding = Boolean\(/)
  assert.match(worldGraphSource, /trimOptionalString\(wikiModel\.overview\.worldConceptAssetKey\)/)
  assert.match(worldGraphSource, /trimOptionalString\(wikiModel\.overview\.worldConceptVisualJobId\)/)
  assert.match(worldGraphSource, /if \(!liveWikiGenerationState\.active\) return/)
  assert.match(worldGraphSource, /if \(!liveWikiGenerationState\.overviewMetadataBelongsToActiveSeed\) return/)
  assert.match(worldGraphSource, /if \(hasDurableWorldConceptBinding \|\| wikiWorldConceptPending \|\| activeWorldConceptJobId\) return/)
  assert.doesNotMatch(worldGraphSource, /const activeConceptImageReady =/)
})

test('project world reset clears stale wiki hero metadata and generated world visuals', () => {
  const appSource = readFileSync(resolve(repoRoot, 'src/App.tsx'), 'utf8')
  const repositorySource = readFileSync(resolve(repoRoot, 'src/data/graphcoreRepository.ts'), 'utf8')
  const resetFunction = readFileSync(resolve(repoRoot, 'supabase/functions/reset-project-world/index.ts'), 'utf8')

  assert.doesNotMatch(repositorySource, /buildProjectContext\(\{\s*projectType: snapshot\.projectContext\.projectType/)
  assert.match(resetFunction, /function clearResetWorldWikiMetadata/)
  assert.match(resetFunction, /projectContext: _projectContext/)
  assert.match(resetFunction, /await clearResetWorldWikiMetadata\(admin, payload\.draftId\)/)
  assert.match(resetFunction, /async function cancelActiveWorldConceptVisualJobs/)
  assert.match(resetFunction, /\.eq\('kind', 'wiki_visual'\)/)
  assert.match(resetFunction, /role === 'world_concept_image'/)
  assert.match(resetFunction, /admin\.rpc\('cancel_visual_generation_job'/)
  assert.match(resetFunction, /await cancelActiveWorldConceptVisualJobs\(admin, payload\.projectId, payload\.draftId\)/)
  assert.match(appSource, /projectContext: _resetProjectContext/)
  assert.match(appSource, /projectContext: null/)
  assert.match(appSource, /generatedBy !== 'world_concept_image'/)
  assert.match(appSource, /!storagePath\.startsWith\('generated\/wiki-concept-images\/'\)/)
})

test('initial seed continuation persists transient project context before streamed generation completes', () => {
  const worldPromptSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/world-prompt.ts'), 'utf8')

  assert.match(worldPromptSource, /await persistProjectContextForSeed\(\{\s*client: input\.client,\s*snapshot: seedSnapshot,\s*projectContext,/)
  assert.match(worldPromptSource, /seedSnapshot\.draft\.metadata = \{\s*\.\.\.draftMetadataWithoutProjectContext,\s*projectContext,/)
  assert.match(worldPromptSource, /snapshot: seedSnapshot,/)
  assert.match(worldPromptSource, /projectContext,\s*worldEntities: seedSnapshot\.worldEntities/)
  assert.doesNotMatch(worldPromptSource, /snapshot: input\.payload\.snapshot,\s*sourceContext,\s*inference,\s*skeletonProfile,\s*selectedPreset/)
})

test('visual worker and RPCs skip stale side effects after world concept job cancellation', () => {
  const visualWorker = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/visual-generation-worker.ts'), 'utf8')
  const migration = readFileSync(resolve(repoRoot, 'supabase/migrations/20260513120000_harden_visual_job_cancellation.sql'), 'utf8')

  assert.match(visualWorker, /class VisualJobCancelledError extends Error/)
  assert.match(visualWorker, /async function ensureVisualJobStillRunning/)
  assert.match(visualWorker, /await ensureVisualJobStillRunning\(client, job\.id, 'wiki_visual_uploading_asset'\)/)
  assert.match(visualWorker, /error instanceof VisualJobCancelledError/)
  assert.match(visualWorker, /skipped cancelled job side effects/)
  assert.match(migration, /create or replace function public\.complete_visual_generation_job/)
  assert.match(migration, /and job\.status = 'running'/)
  assert.match(migration, /create or replace function public\.fail_visual_generation_job/)
})

test('Fly visual worker bounds Fal image downloads so completed jobs cannot hang forever', () => {
  const visualWorker = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/visual-generation-worker.ts'), 'utf8')

  assert.match(visualWorker, /VISUAL_GENERATION_IMAGE_DOWNLOAD_TIMEOUT_MS/)
  assert.match(visualWorker, /VISUAL_GENERATION_IMAGE_DOWNLOAD_ATTEMPTS/)
  assert.match(visualWorker, /fetch\(imageUrl,\s*\{\s*signal:\s*controller\.signal\s*\}\)/)
  assert.match(visualWorker, /Generated image could not be downloaded after/)
})

test('entity reference sheet jobs route through Fly visual worker with medium webp output', () => {
  const visualWorker = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/visual-generation-worker.ts'), 'utf8')
  const appSource = readFileSync(resolve(repoRoot, 'src/App.tsx'), 'utf8')
  const worldGraphSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/WorldGraphPage.tsx'), 'utf8')
  const worldPromptSource = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/world-prompt.ts'), 'utf8')

  assert.match(visualWorker, /processEntityReferenceSheetJob/)
  assert.match(visualWorker, /job\.kind === 'entity_reference_sheet' \|\| job\.kind === 'character_sheet'/)
  assert.match(visualWorker, /VISUAL_GENERATION_ENTITY_REFERENCE_SHEET_MODEL/)
  assert.match(visualWorker, /requestedModel = explicitModel \|\| configuredModel \|\| job\.model \|\| 'openai\/gpt-image-2'/)
  assert.match(visualWorker, /model: requestedModel/)
  assert.match(visualWorker, /VISUAL_GENERATION_ENTITY_REFERENCE_SHEET_QUALITY'\) \|\| 'medium'/)
  assert.match(visualWorker, /VISUAL_GENERATION_ENTITY_REFERENCE_SHEET_OUTPUT_FORMAT'\) \|\| 'webp'/)
  assert.match(visualWorker, /referenceSheetAssetKey/)
  assert.match(visualWorker, /thumbnail_asset_key: assetKey/)
  assert.match(visualWorker, /icon_asset_key: assetKey/)
  assert.match(visualWorker, /upsertDefinitionPreviewImageBinding/)
  assert.doesNotMatch(appSource, /referenceAssetKeys:\s*\[entity\.thumbnailAssetKey,\s*definition\.iconAssetKey\]/)
  assert.match(worldGraphSource, /autoQueuedReferenceSheetEntityKeysRef/)
  assert.match(worldGraphSource, /void handleGenerateEntityReferenceSheet\(entity\)/)
  assert.match(worldGraphSource, /getArtStylePresetPromptDirectives/)
  assert.match(appSource, /async function applyCompletedEntityReferenceSheetVisualJob/)
  assert.match(appSource, /referenceSheetAssetKey:\s*assetKey/)
  assert.match(appSource, /thumbnailAssetKey:\s*assetKey/)
  assert.match(appSource, /applyCompletedVisualGenerationJobLocally\(job\)/)
  assert.match(appSource, /isMissingLiveDraftSessionError/)
  assert.match(appSource, /const cachedJob = visualGenerationJobs\.find\(\(job\) => job\.id === jobId\)/)
  assert.match(worldGraphSource, /visualStatusErrorIsMissingLiveDraft/)
  assert.doesNotMatch(worldGraphSource, /skipped live snapshot refresh after entity reference sheet status update/)
  assert.match(worldPromptSource, /getArtStylePresetPromptDirectives\(input\.projectContext\.artStylePreset\)/)
})

test('entity reference-sheet regeneration can refine visual metadata and pass guidance references', () => {
  const visualWorker = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/visual-generation-worker.ts'), 'utf8')
  const worldGraphSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/WorldGraphPage.tsx'), 'utf8')
  const appSource = readFileSync(resolve(repoRoot, 'src/App.tsx'), 'utf8')
  const repositorySource = readFileSync(resolve(repoRoot, 'src/data/graphcoreRepository.ts'), 'utf8')
  const refineFunction = readFileSync(resolve(repoRoot, 'supabase/functions/refine-entity-visual-profile/index.ts'), 'utf8')
  const uploadFunction = readFileSync(resolve(repoRoot, 'supabase/functions/upload-entity-reference-guidance-image/index.ts'), 'utf8')

  assert.match(worldGraphSource, /handleConfirmEntityReferenceSheetRegeneration/)
  assert.match(worldGraphSource, /onUploadEntityReferenceGuidanceImage/)
  assert.match(worldGraphSource, /onRefineWorldEntityVisualProfile/)
  assert.match(worldGraphSource, /regenerationGuidance: options\.guidance/)
  assert.match(worldGraphSource, /referenceImageAssetKey: options\.referenceImageAssetKey/)
  assert.match(appSource, /async function refineWorldEntityVisualProfile/)
  assert.match(appSource, /worldEntities: syncedSnapshot\.worldEntities\.map/)
  assert.match(repositorySource, /upload-entity-ref-guidance/)
  assert.match(repositorySource, /refine-entity-visual-profile/)
  assert.match(refineFunction, /visualDescriptionSource: 'wiki_entity_reference_sheet_regeneration'/)
  assert.match(refineFunction, /input_image/)
  assert.match(uploadFunction, /entity_reference_guidance_image/)
  assert.match(uploadFunction, /uploads\/entity-reference-guidance/)
  assert.match(visualWorker, /referenceImageAssetKeys/)
  assert.match(visualWorker, /createProjectAssetSignedUrls\(client, referenceAssets\)/)
  assert.match(visualWorker, /Regeneration guidance from the user/)
  assert.match(visualWorker, /downloadOpenAiReferenceImage/)
  assert.match(visualWorker, /action: referenceImages\.length > 0 \? 'edit' : 'generate'/)
})

test('entity reference variants are durable visual-only jobs', () => {
  const migration = readFileSync(resolve(repoRoot, 'supabase/migrations/20260514094844_entity_reference_art_variants.sql'), 'utf8')
  const createVariantFunction = readFileSync(resolve(repoRoot, 'supabase/functions/create-entity-reference-variant/index.ts'), 'utf8')
  const visualWorker = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/visual-generation-worker.ts'), 'utf8')
  const visualAssetGeneration = readFileSync(resolve(repoRoot, 'src/domain/visualAssetGeneration.ts'), 'utf8')
  const worldGraphSource = readFileSync(resolve(repoRoot, 'src/features/world-builder/WorldGraphPage.tsx'), 'utf8')
  const appSource = readFileSync(resolve(repoRoot, 'src/App.tsx'), 'utf8')
  const outputWorker = readFileSync(resolve(repoRoot, 'supabase/functions/_shared/output-workflow.ts'), 'utf8')

  assert.match(migration, /create table if not exists public\.world_entity_visual_variants/)
  assert.match(migration, /unique \(draft_id, entity_key, variant_key\)/)
  assert.match(migration, /app_private\.can_read_draft\(draft_id\)/)
  assert.match(createVariantFunction, /baseReferenceAssetKey/)
  assert.match(createVariantFunction, /resolveDefaultReferenceAssetKey/)
  assert.match(createVariantFunction, /const requestedBaseVariantKey = 'default'/)
  assert.match(createVariantFunction, /allocateUniqueVariantKey/)
  assert.match(createVariantFunction, /function slugifyOptional/)
  assert.doesNotMatch(createVariantFunction, /const requestedVariantKey = slugify\(readString\(payload\.variantKey\)\)/)
  assert.match(createVariantFunction, /thumbnail_asset_key/)
  assert.match(createVariantFunction, /assetLooksLikeEntityReferenceSheet/)
  assert.match(createVariantFunction, /referenceImageAssetKeys:\s*\[baseReferenceAssetKey\]/)
  assert.match(createVariantFunction, /variantType: inferred\.variantType/)
  assert.match(visualWorker, /variantKey/)
  assert.match(visualWorker, /world_entity_visual_variants/)
  assert.match(visualWorker, /targetKind: 'world_entity_visual_variant'/)
  assert.match(visualWorker, /Hard style lock: render the final variant in this exact target project art style/)
  assert.match(visualWorker, /must not override, dilute, or restyle the target project art style/)
  assert.match(visualWorker, /buildShotLocationReferenceSheetPrompt/)
  assert.match(visualWorker, /variantType === 'shot_location_sheet'/)
  assert.match(visualAssetGeneration, /SHOT LOCATION VARIANT REFERENCE SHEET/)
  assert.match(visualAssetGeneration, /Hard style lock: render the final shot-location variant in this exact target project art style/)
  assert.match(visualAssetGeneration, /Do not include a map, floor plan, top-down diagram, isometric diagram, spatial diagram, color palette, swatch strip/i)
  assert.match(visualAssetGeneration, /Do not include characters, people, actors, mascots, crowds, portraits, faces, bodies, silhouettes, or tiny scale figures/i)
  assert.doesNotMatch(visualWorker, /This is a visual-only SHOT LOCATION VARIANT\. Create a square cinematic shot-location production sheet/)
  assert.match(visualWorker, /return \{ assetKey, entityKey, sheetKind, variantKey \}/)
  assert.match(appSource, /variantKey && variantKey !== 'default'/)
  assert.match(appSource, /worldEntityVisualVariants: nextVariants/)
  assert.match(worldGraphSource, /Create variation/)
  assert.match(worldGraphSource, /referenceVariantIconUrlByVariantKey/)
  assert.match(worldGraphSource, /onCreateEntityReferenceVariant/)
  assert.match(outputWorker, /referenceVariants/)
  assert.match(outputWorker, /selectReferenceVariantForPrompt/)
  assert.match(outputWorker, /selectedReferenceVariantAssetKey/)
  assert.match(outputWorker, /resolveImageOutputReferenceSelection/)
  assert.match(outputWorker, /primaryAssetKey/)
  assert.match(outputWorker, /selectedReferenceVariants/)
  assert.match(outputWorker, /referenceDiagnostics/)
})
