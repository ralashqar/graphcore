import { defineWorkflowNodePack } from '../../../src/domain/workflowNodeHandlerRegistry.ts'
import { createWorkflowNodeExecutionResult } from './output-workflow-node-pack-runtime.ts'

type LooseRecord = Record<string, unknown>

type ComicNodeExecutionContext = {
  client: unknown
  inputHash: string
  node: {
    id: string
    key: string
    label: string
    config: unknown
    inputs: LooseRecord
  }
  workflow: {
    id: string
    key: string
    name: string
  }
  run: {
    id: string
    projectId: string
    draftId: string
    preset: string
    prompt: string
    input: LooseRecord
  }
  upstream: Record<string, Record<string, unknown>>
  documentRenderer?: unknown
}

type ComicNodeExecutionResult = {
  inputHash: string
  outputHash: string
  outputs: LooseRecord
  provider: string
  model: string
  providerRequestId?: string
}

export type ComicWorkflowNodePackHelpers = {
  asRecord: (value: unknown) => LooseRecord
  readText: (value: unknown) => string
  readStringArray: (value: unknown) => string[]
  readFirstUpstreamRecord: (upstream: Record<string, Record<string, unknown>>, fields: string[]) => LooseRecord
  readFirstUpstreamText: (upstream: Record<string, Record<string, unknown>>, fields?: string[]) => string
  readUpstreamGuidanceBundle: (upstream: Record<string, Record<string, unknown>>) => unknown
  resolveGuidanceForExecution: (input: {
    run: ComicNodeExecutionContext['run']
    node: ComicNodeExecutionContext['node']
    upstream: ComicNodeExecutionContext['upstream']
  }) => unknown
  worldContextFromRunInput: (run: ComicNodeExecutionContext['run']) => LooseRecord
  titleFromContext: (context: LooseRecord) => string
  buildDeterministicComicAssetPack: (context: LooseRecord) => LooseRecord
  mergeComicSelectedEntitiesWithFallback: (selectedEntities: LooseRecord[], fallbackPack: LooseRecord) => LooseRecord[]
  buildComicEntitySelectorInstruction: (input: LooseRecord) => string
  buildComicSceneScriptInstruction: (input: LooseRecord) => string
  buildComicPagePlanInstruction: (input: LooseRecord) => string
  buildComicScriptInstruction: (input: LooseRecord) => string
  buildComicScriptRepairInstruction: (input: LooseRecord) => string
  runOpenAiResponses: (input: LooseRecord) => Promise<{
    status?: string
    response: { ok: boolean; status: number; headers: { get: (name: string) => string | null } }
    outputText: string
    body: LooseRecord
  }>
  outputWorkflowTextModel: () => string
  outputWorkflowComicTextModel: () => string
  openAiErrorMessage: (response: unknown, fallback: string) => string
  parseJsonObject: (text: string) => LooseRecord
  comicSceneScriptJsonSchema: LooseRecord
  comicPagePlanJsonSchema: LooseRecord
  comicScriptJsonSchema: LooseRecord
  comicSceneScriptMarkdown: (sceneScript: LooseRecord) => string
  comicPagePlanMarkdown: (pagePlan: LooseRecord) => string
  validateComicPagePlan: (pagePlan: LooseRecord, input: { pageCount: number }) => string[]
  normalizeComicScript: (raw: LooseRecord, input: { context: LooseRecord; pageCount: number; prompt: string }) => LooseRecord
  validateComicScript: (script: LooseRecord, input: { pageCount: number }) => string[]
  comicScriptMarkdown: (script: LooseRecord) => string
  comicScriptPage: (script: LooseRecord, pageNumber: number) => LooseRecord
  buildDeterministicComicPageImagePrompt: (input: LooseRecord) => string
  filterComicAssetPackForPage: (assetPack: LooseRecord, page: LooseRecord, limit?: number) => LooseRecord
  collectComicPageImages: (upstream: Record<string, Record<string, unknown>>) => LooseRecord[]
  registerComicArtifact: (input: LooseRecord) => Promise<{
    pdfArtifact: LooseRecord
    scriptArtifact: LooseRecord
    renderMetadata: LooseRecord
  }>
  slugify: (value: string) => string
  hashOutputWorkflowValue: (value: unknown) => string
}

function result(input: {
  context: ComicNodeExecutionContext
  helpers: ComicWorkflowNodePackHelpers
  outputs: LooseRecord
  model: string
  provider?: string | null
  providerRequestId?: string | null
}): ComicNodeExecutionResult {
  return createWorkflowNodeExecutionResult<ComicNodeExecutionResult>(input)
}

function worldContextFromUpstream(context: ComicNodeExecutionContext, helpers: ComicWorkflowNodePackHelpers) {
  return helpers.asRecord(helpers.asRecord(context.upstream.world_context).context)
}

async function comicEntitySelector(context: ComicNodeExecutionContext, helpers: ComicWorkflowNodePackHelpers) {
  const worldContext = worldContextFromUpstream(context, helpers)
  const guidance = helpers.resolveGuidanceForExecution({ run: context.run, node: context.node, upstream: context.upstream })
  const fallbackPack = helpers.buildDeterministicComicAssetPack(worldContext)
  const model = helpers.outputWorkflowTextModel()
  const response = await helpers.runOpenAiResponses({
    model,
    instructions: 'You select visual comic references from canonical world context and return compact JSON only.',
    input: helpers.buildComicEntitySelectorInstruction({ context: worldContext, prompt: context.run.prompt, guidance }),
    maxOutputTokens: 1800,
    metadata: {
      graphcore_task: 'output_workflow_comic_entity_selector',
      graphcore_node_key: context.node.key,
    },
    timeoutMs: 120_000,
  })
  const parsed = response.response.ok ? helpers.parseJsonObject(response.outputText) : {}
  const parsedEntities = Array.isArray(parsed.entities) && parsed.entities.length > 0
    ? parsed.entities.map(helpers.asRecord).map((entity) => ({
      key: helpers.readText(entity.key),
      name: helpers.readText(entity.name),
      type: helpers.readText(entity.type),
      role: helpers.readText(entity.role),
      summary: helpers.readText(entity.summary),
      visualDescription: helpers.readText(entity.visualDescription),
      visualTraits: helpers.readStringArray(entity.visualTraits),
      visualTraitMap: helpers.asRecord(entity.visualTraitMap),
      assetKeys: helpers.readStringArray(entity.assetKeys),
    })).filter((entity) => entity.key || entity.name)
    : []
  const selectedEntities = helpers.mergeComicSelectedEntitiesWithFallback(parsedEntities, fallbackPack)
  const assetPack = {
    entities: selectedEntities,
    missingReferenceEntityKeys: selectedEntities
      .filter((entity) => helpers.readStringArray(entity.assetKeys).length === 0)
      .map((entity) => helpers.readText(entity.key)),
  }
  const outputs = {
    assetPack,
    asset_pack: assetPack,
    text: JSON.stringify(assetPack, null, 2),
    guidance,
    usage: helpers.asRecord(response.body?.usage),
  }
  return result({
    context,
    helpers,
    outputs,
    provider: response.response.ok ? 'openai' : 'graphcore',
    model: response.response.ok ? model : 'deterministic-comic-asset-pack-v1',
    providerRequestId: helpers.readText(response.body?.id) || response.response.headers.get('x-request-id') || null,
  })
}

async function comicSceneScript(context: ComicNodeExecutionContext, helpers: ComicWorkflowNodePackHelpers) {
  const config = helpers.asRecord(context.node.config)
  const worldContext = worldContextFromUpstream(context, helpers)
  const guidance = helpers.resolveGuidanceForExecution({ run: context.run, node: context.node, upstream: context.upstream })
  const pageCount = Math.max(1, Math.min(12, Number(config.pageCount ?? 8)))
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const model = helpers.outputWorkflowComicTextModel()
  const response = await helpers.runOpenAiResponses({
    model,
    instructions: 'You are a senior comic adaptation writer. Return a rich structured dramatic scene script as JSON only, not final panel JSON.',
    input: helpers.buildComicSceneScriptInstruction({ context: worldContext, assetPack, prompt: context.run.prompt, guidance, pageCount }),
    text: { format: { type: 'json_schema', name: 'output_workflow_comic_scene_script', schema: helpers.comicSceneScriptJsonSchema, strict: true } },
    maxOutputTokens: 7000,
    metadata: { graphcore_task: 'output_workflow_comic_scene_script', graphcore_node_key: context.node.key },
    timeoutMs: 240_000,
  })
  if (!response.response.ok) throw new Error(helpers.openAiErrorMessage(response, `OpenAI comic scene script failed with status ${response.response.status}.`))
  if (response.status === 'incomplete') throw new Error('OpenAI comic scene script response was incomplete; rerun the Scene Script node.')
  const sceneScript = helpers.parseJsonObject(response.outputText)
  const markdown = helpers.comicSceneScriptMarkdown(sceneScript)
  const outputs = { sceneScript, scene_script: sceneScript, markdown, text: markdown, assetPack, guidance, usage: helpers.asRecord(response.body.usage) }
  return result({ context, helpers, outputs, provider: 'openai', model, providerRequestId: helpers.readText(response.body.id) || response.response.headers.get('x-request-id') || null })
}

async function comicPagePlan(context: ComicNodeExecutionContext, helpers: ComicWorkflowNodePackHelpers) {
  const config = helpers.asRecord(context.node.config)
  const worldContext = worldContextFromUpstream(context, helpers)
  const guidance = helpers.resolveGuidanceForExecution({ run: context.run, node: context.node, upstream: context.upstream })
  const pageCount = Math.max(1, Math.min(12, Number(config.pageCount ?? 8)))
  const sceneScript = helpers.readFirstUpstreamRecord(context.upstream, ['sceneScript', 'scene_script'])
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const model = helpers.outputWorkflowComicTextModel()
  const response = await helpers.runOpenAiResponses({
    model,
    instructions: 'You are a senior comic editor planning page rhythm and compression. Return page-plan JSON only, not final panels.',
    input: helpers.buildComicPagePlanInstruction({ context: worldContext, sceneScript, assetPack, prompt: context.run.prompt, guidance, pageCount }),
    text: { format: { type: 'json_schema', name: 'output_workflow_comic_page_plan', schema: helpers.comicPagePlanJsonSchema, strict: true } },
    maxOutputTokens: 5200,
    metadata: { graphcore_task: 'output_workflow_comic_page_plan', graphcore_node_key: context.node.key },
    timeoutMs: 180_000,
  })
  if (!response.response.ok) throw new Error(helpers.openAiErrorMessage(response, `OpenAI comic page plan failed with status ${response.response.status}.`))
  if (response.status === 'incomplete') throw new Error('OpenAI comic page plan response was incomplete; rerun the Page Plan node.')
  const pagePlan = helpers.parseJsonObject(response.outputText)
  const diagnostics = helpers.validateComicPagePlan(pagePlan, { pageCount })
  if (diagnostics.length > 0) throw new Error(`Comic page plan validation failed: ${diagnostics.slice(0, 8).join(' ')}`)
  const markdown = helpers.comicPagePlanMarkdown(pagePlan)
  const outputs = { pagePlan, page_plan: pagePlan, markdown, text: markdown, sceneScript, assetPack, guidance, usage: helpers.asRecord(response.body.usage) }
  return result({ context, helpers, outputs, provider: 'openai', model, providerRequestId: helpers.readText(response.body.id) || response.response.headers.get('x-request-id') || null })
}

async function comicScript(context: ComicNodeExecutionContext, helpers: ComicWorkflowNodePackHelpers) {
  const config = helpers.asRecord(context.node.config)
  const worldContext = worldContextFromUpstream(context, helpers)
  const guidance = helpers.resolveGuidanceForExecution({ run: context.run, node: context.node, upstream: context.upstream })
  const pageCount = Math.max(1, Math.min(12, Number(config.pageCount ?? 8)))
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const sceneScript = helpers.readFirstUpstreamRecord(context.upstream, ['sceneScript', 'scene_script'])
  const pagePlan = helpers.readFirstUpstreamRecord(context.upstream, ['pagePlan', 'page_plan'])
  const model = helpers.outputWorkflowComicTextModel()
  const response = await helpers.runOpenAiResponses({
    model,
    instructions: 'You are a professional comic writer and comics editor converting an approved scene treatment and page plan into final page/panel script JSON only. Never return outline placeholders.',
    input: helpers.buildComicScriptInstruction({ context: worldContext, assetPack, sceneScript, pagePlan, prompt: context.run.prompt, guidance, pageCount }),
    text: { format: { type: 'json_schema', name: 'output_workflow_comic_script', schema: helpers.comicScriptJsonSchema, strict: true } },
    maxOutputTokens: 9000,
    metadata: { graphcore_task: 'output_workflow_comic_script', graphcore_node_key: context.node.key },
    timeoutMs: 240_000,
  })
  if (!response.response.ok) throw new Error(helpers.openAiErrorMessage(response, `OpenAI comic script failed with status ${response.response.status}.`))
  if (response.status === 'incomplete') throw new Error('OpenAI comic script response was incomplete; rerun the Comic Script node.')
  let script = helpers.normalizeComicScript(helpers.parseJsonObject(response.outputText), { context: worldContext, pageCount, prompt: context.run.prompt })
  let diagnostics = helpers.validateComicScript(script, { pageCount })
  let repairResponse: Awaited<ReturnType<ComicWorkflowNodePackHelpers['runOpenAiResponses']>> | null = null
  const firstPassDiagnostics = diagnostics
  if (diagnostics.length > 0) {
    repairResponse = await helpers.runOpenAiResponses({
      model,
      instructions: 'You are a senior comic script doctor. Repair invalid comic JSON into a complete production script JSON object only.',
      input: helpers.buildComicScriptRepairInstruction({
        context: worldContext,
        assetPack,
        sceneScript,
        pagePlan,
        invalidScript: script,
        diagnostics,
        prompt: context.run.prompt,
        guidance,
        pageCount,
      }),
      text: { format: { type: 'json_schema', name: 'output_workflow_comic_script_repair', schema: helpers.comicScriptJsonSchema, strict: true } },
      maxOutputTokens: 10_000,
      metadata: { graphcore_task: 'output_workflow_comic_script_repair', graphcore_node_key: context.node.key },
      timeoutMs: 240_000,
    })
    if (!repairResponse.response.ok) throw new Error(helpers.openAiErrorMessage(repairResponse, `OpenAI comic script repair failed with status ${repairResponse.response.status}.`))
    if (repairResponse.status === 'incomplete') throw new Error('OpenAI comic script repair response was incomplete; rerun the Comic Script node.')
    script = helpers.normalizeComicScript(helpers.parseJsonObject(repairResponse.outputText), { context: worldContext, pageCount, prompt: context.run.prompt })
    diagnostics = helpers.validateComicScript(script, { pageCount })
  }
  if (diagnostics.length > 0) throw new Error(`Comic script validation failed after repair: ${diagnostics.slice(0, 8).join(' ')}`)
  const markdown = helpers.comicScriptMarkdown(script)
  const outputs = {
    script,
    pages: script.pages,
    markdown,
    text: markdown,
    guidance,
    repaired: repairResponse !== null,
    firstPassDiagnostics,
    usage: helpers.asRecord(repairResponse?.body.usage ?? response.body.usage),
    firstPassUsage: repairResponse ? helpers.asRecord(response.body.usage) : undefined,
  }
  return result({ context, helpers, outputs, provider: 'openai', model, providerRequestId: helpers.readText(response.body.id) || response.response.headers.get('x-request-id') || null })
}

async function comicPagePrompt(context: ComicNodeExecutionContext, helpers: ComicWorkflowNodePackHelpers) {
  const config = helpers.asRecord(context.node.config)
  const pageNumber = Math.max(1, Number(config.pageNumber ?? 1))
  const pageCount = Math.max(1, Number(config.pageCount ?? 8))
  const script = helpers.readFirstUpstreamRecord(context.upstream, ['script'])
  const assetPack = helpers.readFirstUpstreamRecord(context.upstream, ['assetPack', 'asset_pack'])
  const guidance = helpers.readUpstreamGuidanceBundle(context.upstream)
  const scriptPage = helpers.comicScriptPage(script, pageNumber)
  const pagePrompt = helpers.buildDeterministicComicPageImagePrompt({ script, assetPack, pageNumber, pageCount, prompt: context.run.prompt, guidance })
  const pageAssetPack = helpers.filterComicAssetPackForPage(assetPack, scriptPage, 6)
  const outputs = {
    prompt: pagePrompt,
    text: pagePrompt,
    pageNumber,
    pageCount,
    scriptPage,
    pageAssetPack,
    page_asset_pack: pageAssetPack,
    pageReferenceEntityKeys: helpers.readStringArray(pageAssetPack.pageReferenceEntityKeys),
    assetPack,
    guidance,
    deterministic: true,
  }
  return result({ context, helpers, outputs, model: 'deterministic-comic-page-prompt-v1' })
}

async function comicPdfRender(context: ComicNodeExecutionContext, helpers: ComicWorkflowNodePackHelpers) {
  const script = helpers.readFirstUpstreamRecord(context.upstream, ['script'])
  const markdown = helpers.readFirstUpstreamText(context.upstream, ['markdown', 'text'])
  const guidance = helpers.readUpstreamGuidanceBundle(context.upstream)
  const comicPages = helpers.collectComicPageImages(context.upstream)
  const worldContext = helpers.worldContextFromRunInput(context.run)
  const renderMetadata = {
    renderer: 'graphcore-comic-pdf-v1',
    pageSize: '6.625in x 10.25in',
    pageCount: comicPages.length,
    scriptCharacterCount: markdown.length,
    sequenceUnitKey: helpers.readStringArray(context.run.input.sourceSequenceUnitKeys)[0] ?? '',
    title: helpers.readText(script.title) || helpers.titleFromContext(worldContext),
  }
  const outputs = {
    markdown,
    text: markdown,
    script,
    comicPages,
    pageImages: comicPages,
    mimeType: 'application/pdf',
    fileName: `${helpers.slugify(context.workflow.name)}.pdf`,
    renderMetadata,
    guidance,
  }
  return result({ context, helpers, outputs, model: 'deterministic-comic-document-render-v1' })
}

async function comicArtifact(context: ComicNodeExecutionContext, helpers: ComicWorkflowNodePackHelpers) {
  const script = helpers.readFirstUpstreamRecord(context.upstream, ['script'])
  const markdown = helpers.readFirstUpstreamText(context.upstream, ['markdown', 'text'])
  const comicPages = helpers.collectComicPageImages(context.upstream)
  if (comicPages.length === 0) throw new Error('Comic PDF artifact requires generated comic page images.')
  const artifact = await helpers.registerComicArtifact({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    node: context.node,
    comicPages,
    scriptMarkdown: markdown,
    script,
    documentRenderer: context.documentRenderer,
  })
  const outputs = {
    artifactKey: artifact.pdfArtifact.key,
    assetKey: artifact.pdfArtifact.assetKey,
    scriptArtifactKey: artifact.scriptArtifact.key,
    scriptAssetKey: artifact.scriptArtifact.assetKey,
    artifact: artifact.pdfArtifact,
    artifacts: [artifact.pdfArtifact, artifact.scriptArtifact],
    renderMetadata: artifact.renderMetadata,
    pageAssetKeys: comicPages.map((page) => helpers.readText(page.assetKey)).filter(Boolean),
  }
  return result({ context, helpers, outputs, model: 'deterministic-comic-artifact-v1' })
}

const comicHandlers = {
  comic_artifact: comicArtifact,
  comic_entity_selector: comicEntitySelector,
  comic_page_plan: comicPagePlan,
  comic_page_prompt: comicPagePrompt,
  comic_pdf_render: comicPdfRender,
  comic_scene_script: comicSceneScript,
  comic_script: comicScript,
}

export const comicWorkflowNodePack = defineWorkflowNodePack<
  ComicNodeExecutionContext,
  ComicNodeExecutionResult,
  ComicWorkflowNodePackHelpers,
  typeof comicHandlers
>({
  packKey: 'output_workflow_comic',
  handlers: comicHandlers,
})

export const comicWorkflowNodeHandlerKeys = comicWorkflowNodePack.handlerKeys

export function registerComicWorkflowNodePack(input: {
  helpers: ComicWorkflowNodePackHelpers
  register: (handlerKey: string, handler: (context: ComicNodeExecutionContext) => Promise<ComicNodeExecutionResult>) => void
}) {
  comicWorkflowNodePack.register({
    dependencies: input.helpers,
    register: input.register,
  })
}
