import { buildEbookDocumentMetadata } from '../../../src/domain/ebookDocument.ts'
import { defineWorkflowNodePack } from '../../../src/domain/workflowNodeHandlerRegistry.ts'
import { createWorkflowNodeExecutionResult } from './output-workflow-node-pack-runtime.ts'

type LooseRecord = Record<string, unknown>

type DocumentNodeExecutionContext = {
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
  priorStep?: {
    providerRequestId?: string | null
  } | null
  documentRenderer?: unknown
  shouldCancel?: () => Promise<boolean>
  onProgress?: (progress: {
    provider?: string | null
    model?: string | null
    providerRequestId?: string | null
    metadata?: Record<string, unknown>
  }) => Promise<void>
}

type DocumentNodeExecutionResult = {
  inputHash: string
  outputHash: string
  outputs: LooseRecord
  provider: string
  model: string
  providerRequestId?: string
}

export type DocumentWorkflowNodePackHelpers = {
  asRecord: (value: unknown) => LooseRecord
  readText: (value: unknown) => string
  readFirstUpstreamArray: (upstream: Record<string, Record<string, unknown>>, fields: string[]) => LooseRecord[]
  readFirstUpstreamText: (upstream: Record<string, Record<string, unknown>>, fields?: string[]) => string
  readFirstUpstreamImage: (upstream: Record<string, Record<string, unknown>>, fields?: string[]) => LooseRecord | null
  readUpstreamGuidanceBundle: (upstream: Record<string, Record<string, unknown>>) => unknown
  resolveGuidanceForExecution: (input: {
    run: DocumentNodeExecutionContext['run']
    node: DocumentNodeExecutionContext['node']
    upstream: DocumentNodeExecutionContext['upstream']
  }) => unknown
  worldContextFromRunInput: (run: DocumentNodeExecutionContext['run']) => LooseRecord
  titleFromContext: (context: LooseRecord) => string
  outlineFromContext: (context: LooseRecord) => LooseRecord[]
  buildChapterPlan: (context: LooseRecord, outline: LooseRecord[]) => LooseRecord[]
  buildBibleSectionPlan: (config: LooseRecord, context: LooseRecord) => LooseRecord[]
  buildBibleSectionInstruction: (input: LooseRecord) => string
  configuredBibleSections: (config: LooseRecord) => Array<{ key: string; title: string; description: string; order: number }>
  assembleBibleMarkdown: (input: LooseRecord) => string
  buildChapterProsePrompt: (input: LooseRecord) => string
  buildEbookCoverPromptInstruction: (input: LooseRecord) => string
  addFrontBackMatter: (context: LooseRecord, markdown: string) => string
  editMarkdown: (source: string) => string
  assembleChapterMarkdown: (upstream: Record<string, Record<string, unknown>>) => string
  generateBackgroundMarkdown: (input: {
    prompt: string
    instructions: string
    metadata: Record<string, string>
    maxOutputTokens: number
    priorProviderRequestId?: string | null
    shouldCancel?: () => Promise<boolean>
    onProgress?: (progress: {
      providerRequestId: string
      providerStatus: string
      providerMode: string
      lastProviderPollAt: string
    }) => Promise<void>
  }) => Promise<{
    markdown: string
    model: string
    providerRequestId?: string | null
    providerStatus?: string
    usage?: unknown
    timeoutMs?: number
  }>
  runOpenAiResponses: (input: LooseRecord) => Promise<{
    response: { ok: boolean; status: number; headers: { get: (name: string) => string | null } }
    outputText: string
    body: LooseRecord
  }>
  outputWorkflowTextModel: () => string
  openAiErrorMessage: (response: unknown, fallback: string) => string
  registerDocumentArtifact: (input: LooseRecord) => Promise<{
    pdfArtifact: LooseRecord
    htmlArtifact: LooseRecord
    markdownArtifact: LooseRecord
    renderMetadata: LooseRecord
  }>
  slugify: (value: string) => string
  hashOutputWorkflowValue: (value: unknown) => string
}

function result(input: {
  context: DocumentNodeExecutionContext
  helpers: DocumentWorkflowNodePackHelpers
  outputs: LooseRecord
  model: string
  provider?: string | null
  providerRequestId?: string | null
}): DocumentNodeExecutionResult {
  return createWorkflowNodeExecutionResult<DocumentNodeExecutionResult>(input)
}

function worldContextFromUpstream(context: DocumentNodeExecutionContext, helpers: DocumentWorkflowNodePackHelpers) {
  return helpers.asRecord(helpers.asRecord(context.upstream.world_context).context)
}

async function outline(context: DocumentNodeExecutionContext, helpers: DocumentWorkflowNodePackHelpers) {
  const worldContext = worldContextFromUpstream(context, helpers)
  const guidance = helpers.resolveGuidanceForExecution({ run: context.run, node: context.node, upstream: context.upstream })
  const outlineRows = helpers.outlineFromContext(worldContext)
  const outputs = { outline: outlineRows, text: outlineRows.map((chapter) => `${chapter.number}. ${chapter.title}`).join('\n'), guidance }
  return result({ context, helpers, outputs, model: 'deterministic-outline-v1' })
}

async function chapterPlan(context: DocumentNodeExecutionContext, helpers: DocumentWorkflowNodePackHelpers) {
  const worldContext = worldContextFromUpstream(context, helpers)
  const guidance = helpers.resolveGuidanceForExecution({ run: context.run, node: context.node, upstream: context.upstream })
  const outlineRows = helpers.readFirstUpstreamArray(context.upstream, ['outline'])
  const plan = helpers.buildChapterPlan(worldContext, outlineRows.length > 0 ? outlineRows : helpers.outlineFromContext(worldContext))
  const text = plan.map((chapter) => `${chapter.number}. ${chapter.title}: ${chapter.synopsis}`).join('\n')
  const outputs = { chapterPlan: plan, plan, text, guidance }
  return result({ context, helpers, outputs, model: 'deterministic-chapter-plan-v1' })
}

async function bibleSectionPlan(context: DocumentNodeExecutionContext, helpers: DocumentWorkflowNodePackHelpers) {
  const config = helpers.asRecord(context.node.config)
  const worldContext = worldContextFromUpstream(context, helpers)
  const guidance = helpers.resolveGuidanceForExecution({ run: context.run, node: context.node, upstream: context.upstream })
  const sectionPlan = helpers.buildBibleSectionPlan(config, worldContext)
  const text = sectionPlan.map((section) => `${section.order}. ${section.title}: ${section.description}`).join('\n')
  const outputs = { sectionPlan, plan: sectionPlan, sections: sectionPlan, text, guidance }
  return result({ context, helpers, outputs, model: 'deterministic-bible-section-plan-v1' })
}

async function bibleSection(context: DocumentNodeExecutionContext, helpers: DocumentWorkflowNodePackHelpers) {
  const config = helpers.asRecord(context.node.config)
  const worldContext = worldContextFromUpstream(context, helpers)
  const guidance = helpers.resolveGuidanceForExecution({ run: context.run, node: context.node, upstream: context.upstream })
  const prompt = helpers.readText(context.node.inputs.prompt) || context.run.prompt
  const sectionKey = helpers.readText(config.sectionKey)
  const sectionTitle = helpers.readText(config.sectionTitle) || context.node.label
  const sectionDescription = helpers.readText(config.sectionDescription)
  const sectionOrder = Number(config.sectionOrder ?? 9999) || 9999
  const sectionPlan = helpers.readFirstUpstreamArray(context.upstream, ['sectionPlan', 'plan', 'sections'])
  const prose = await helpers.generateBackgroundMarkdown({
    instructions: [
      'You are a senior story bible editor and canon documentation writer.',
      'Write concise reference-document Markdown from the supplied world graph only.',
      'Do not write fiction prose, screenplay, chapter prose, or marketing copy.',
      'If source material is missing, say so plainly instead of inventing canon.',
    ].join(' '),
    prompt: helpers.buildBibleSectionInstruction({
      context: worldContext,
      sectionPlan,
      sectionKey,
      sectionTitle,
      sectionDescription,
      prompt,
      guidance,
    }),
    maxOutputTokens: 4200,
    metadata: {
      graphcore_task: 'output_workflow_bible_section',
      graphcore_node_key: context.node.key,
      graphcore_section_key: sectionKey,
    },
    priorProviderRequestId: context.priorStep?.providerRequestId,
    shouldCancel: context.shouldCancel,
    onProgress: async (progress) => {
      await context.onProgress?.({
        provider: 'openai',
        model: helpers.outputWorkflowTextModel(),
        providerRequestId: progress.providerRequestId,
        metadata: {
          providerMode: progress.providerMode,
          providerStatus: progress.providerStatus,
          lastProviderPollAt: progress.lastProviderPollAt,
        },
      })
    },
  })
  const outputs = {
    markdown: prose.markdown,
    text: prose.markdown,
    sectionKey,
    sectionTitle,
    sectionOrder,
    documentMode: helpers.readText(config.documentMode) || 'reference',
    pageSize: helpers.readText(config.pageSize) || '',
    imagePolicy: helpers.readText(config.imagePolicy) || '',
    guidance,
    usage: prose.usage,
    providerStatus: prose.providerStatus,
  }
  return result({ context, helpers, outputs, provider: 'openai', model: prose.model, providerRequestId: prose.providerRequestId })
}

async function ebookCoverPrompt(context: DocumentNodeExecutionContext, helpers: DocumentWorkflowNodePackHelpers) {
  const worldContext = worldContextFromUpstream(context, helpers)
  const guidance = helpers.resolveGuidanceForExecution({ run: context.run, node: context.node, upstream: context.upstream })
  const model = helpers.outputWorkflowTextModel()
  const response = await helpers.runOpenAiResponses({
    model,
    instructions: [
      'You are a senior publishing art director writing prompts for GPT Image 2.',
      'Return one concise, visual, production-ready image prompt for a finished ebook front cover.',
      'The prompt may request title typography in the image, but must not mention workflow internals.',
    ].join(' '),
    input: helpers.buildEbookCoverPromptInstruction({
      context: worldContext,
      prompt: helpers.readText(context.node.inputs.prompt) || context.run.prompt,
      guidance,
    }),
    maxOutputTokens: 1100,
    metadata: {
      graphcore_task: 'output_workflow_ebook_cover_prompt',
      graphcore_node_key: context.node.key,
    },
    timeoutMs: 120_000,
  })
  if (!response.response.ok) {
    throw new Error(helpers.openAiErrorMessage(response, `OpenAI ebook cover prompt failed with status ${response.response.status}.`))
  }
  const coverPrompt = response.outputText.trim()
  if (!coverPrompt) throw new Error('OpenAI returned an empty ebook cover prompt.')
  const outputs = {
    prompt: coverPrompt,
    text: coverPrompt,
    guidance,
    usage: helpers.asRecord(response.body.usage),
  }
  return result({
    context,
    helpers,
    outputs,
    provider: 'openai',
    model,
    providerRequestId: helpers.readText(response.body.id) || response.response.headers.get('x-request-id') || null,
  })
}

async function chapterProse(context: DocumentNodeExecutionContext, helpers: DocumentWorkflowNodePackHelpers) {
  const config = helpers.asRecord(context.node.config)
  const worldContext = worldContextFromUpstream(context, helpers)
  const guidance = helpers.resolveGuidanceForExecution({ run: context.run, node: context.node, upstream: context.upstream })
  const prompt = helpers.readText(context.node.inputs.prompt) || context.run.prompt
  const chapterNumber = Number(config.chapterNumber ?? 1)
  const sequenceUnitKey = helpers.readText(config.sequenceUnitKey)
  const sequenceUnitName = helpers.readText(config.sequenceUnitName)
  const chapterPlanRows = helpers.readFirstUpstreamArray(context.upstream, ['chapterPlan', 'plan'])
  const prose = await helpers.generateBackgroundMarkdown({
    instructions: [
      'You are a professional longform book writer.',
      'Write restrained, specific, publishable prose from the supplied canon.',
      'Open scenes through character action, choice, dialogue, or immediate pressure rather than weather, skyline, mood, or decorative metaphor.',
      'Follow the requested style guidance, but never reveal the guidance or workflow.',
      'Return only the requested Markdown manuscript content.',
    ].join(' '),
    prompt: helpers.buildChapterProsePrompt({
      context: worldContext,
      prompt,
      chapterPlan: chapterPlanRows.length > 0 ? chapterPlanRows : helpers.buildChapterPlan(worldContext, helpers.outlineFromContext(worldContext)),
      chapterNumber,
      sequenceUnitKey,
      sequenceUnitName,
      guidance,
    }),
    maxOutputTokens: 9000,
    metadata: {
      graphcore_task: 'output_workflow_chapter_prose',
      graphcore_node_key: context.node.key,
    },
    priorProviderRequestId: context.priorStep?.providerRequestId,
    shouldCancel: context.shouldCancel,
    onProgress: async (progress) => {
      await context.onProgress?.({
        provider: 'openai',
        model: helpers.outputWorkflowTextModel(),
        providerRequestId: progress.providerRequestId,
        metadata: {
          providerMode: progress.providerMode,
          providerStatus: progress.providerStatus,
          lastProviderPollAt: progress.lastProviderPollAt,
        },
      })
    },
  })
  const outputs = {
    markdown: prose.markdown,
    text: prose.markdown,
    chapterNumber,
    sequenceUnitKey,
    sourceSequenceUnitKeys: sequenceUnitKey ? [sequenceUnitKey] : [],
    guidance,
    usage: prose.usage,
    timeoutMs: prose.timeoutMs,
    providerStatus: prose.providerStatus,
  }
  return result({ context, helpers, outputs, provider: 'openai', model: prose.model, providerRequestId: prose.providerRequestId })
}

async function frontBackMatter(context: DocumentNodeExecutionContext, helpers: DocumentWorkflowNodePackHelpers) {
  const source = helpers.readFirstUpstreamText(context.upstream)
  const markdown = helpers.addFrontBackMatter(helpers.worldContextFromRunInput(context.run), helpers.editMarkdown(source))
  const guidance = helpers.resolveGuidanceForExecution({ run: context.run, node: context.node, upstream: context.upstream })
  const outputs = { markdown, text: markdown, guidance }
  return result({ context, helpers, outputs, model: 'deterministic-front-back-matter-v1' })
}

async function chapterAssembly(context: DocumentNodeExecutionContext, helpers: DocumentWorkflowNodePackHelpers) {
  const markdown = helpers.assembleChapterMarkdown(context.upstream)
  const guidance = helpers.readUpstreamGuidanceBundle(context.upstream)
  const outputs = { markdown, text: markdown, guidance }
  return result({ context, helpers, outputs, model: 'deterministic-chapter-assembly-v1' })
}

async function bibleAssembly(context: DocumentNodeExecutionContext, helpers: DocumentWorkflowNodePackHelpers) {
  const config = helpers.asRecord(context.node.config)
  const worldContext = helpers.worldContextFromRunInput(context.run)
  const guidance = helpers.readUpstreamGuidanceBundle(context.upstream)
  const markdown = helpers.assembleBibleMarkdown({
    context: worldContext,
    upstream: context.upstream,
    configuredSections: helpers.configuredBibleSections(config),
    outputKind: helpers.readText(config.outputKind),
  })
  const outputs = {
    markdown,
    text: markdown,
    documentMode: helpers.readText(config.documentMode) || 'reference',
    pageSize: helpers.readText(config.pageSize) || '',
    imagePolicy: helpers.readText(config.imagePolicy) || '',
    guidance,
    sectionCount: helpers.configuredBibleSections(config).length,
  }
  return result({ context, helpers, outputs, model: 'deterministic-bible-assembly-v1' })
}

async function storyBibleDocumentRender(context: DocumentNodeExecutionContext, helpers: DocumentWorkflowNodePackHelpers) {
  const markdown = helpers.readFirstUpstreamText(context.upstream)
  const config = helpers.asRecord(context.node.config)
  const guidance = helpers.readUpstreamGuidanceBundle(context.upstream)
  const coverImage = helpers.readFirstUpstreamImage(context.upstream, ['image', 'coverImage'])
  const worldContext = helpers.worldContextFromRunInput(context.run)
  const wiki = helpers.asRecord(worldContext.wiki)
  const title = helpers.titleFromContext(worldContext)
  const subtitle = helpers.readText(wiki.logline) || helpers.readText(wiki.subtitle)
  const configuredDocumentMode = helpers.readText(config.documentMode)
  const documentMode = configuredDocumentMode === 'designed_reference'
    ? 'designed_reference'
    : configuredDocumentMode === 'reference' || context.run.preset === 'story_bible_from_world'
      ? 'reference'
      : 'ebook'
  const pageSize = helpers.readText(config.pageSize) || helpers.readText(helpers.asRecord(context.run.input).pageSize)
  const renderMetadata = buildEbookDocumentMetadata(markdown, {
    title,
    subtitle,
    provenance: 'Generated from the GraphCore world graph',
    generatedAt: new Date().toISOString(),
    documentMode,
    pageSize: pageSize === 'a4' || pageSize === 'letter' || pageSize === 'trade_6x9' ? pageSize : undefined,
  })
  const outputs = {
    markdown,
    mimeType: 'application/pdf',
    fileName: `${helpers.slugify(context.workflow.name)}.pdf`,
    renderMetadata,
    coverImage,
    documentMode,
    pageSize,
    guidance,
  }
  return result({ context, helpers, outputs, model: 'deterministic-document-render-v1' })
}

async function storyBibleArtifact(context: DocumentNodeExecutionContext, helpers: DocumentWorkflowNodePackHelpers) {
  const markdown = helpers.readFirstUpstreamText(context.upstream)
  const guidance = helpers.readUpstreamGuidanceBundle(context.upstream)
  const coverImage = helpers.readFirstUpstreamImage(context.upstream, ['coverImage', 'image'])
  const artifact = await helpers.registerDocumentArtifact({
    client: context.client,
    run: context.run,
    workflow: context.workflow,
    node: context.node,
    markdown,
    guidance,
    coverImage,
    documentMode: helpers.readText(helpers.asRecord(context.node.config).documentMode) === 'designed_reference'
      ? 'designed_reference'
      : 'reference',
    documentRenderer: context.documentRenderer,
  })
  const outputs = {
    artifactKey: artifact.pdfArtifact.key,
    assetKey: artifact.pdfArtifact.assetKey,
    htmlArtifactKey: artifact.htmlArtifact.key,
    htmlAssetKey: artifact.htmlArtifact.assetKey,
    markdownArtifactKey: artifact.markdownArtifact.key,
    markdownAssetKey: artifact.markdownArtifact.assetKey,
    artifact: artifact.pdfArtifact,
    artifacts: [artifact.pdfArtifact, artifact.htmlArtifact, artifact.markdownArtifact],
    renderMetadata: artifact.renderMetadata,
    guidance,
  }
  return result({ context, helpers, outputs, model: 'deterministic-artifact-v1' })
}

const documentHandlers = {
  bible_assembly: bibleAssembly,
  bible_section: bibleSection,
  bible_section_plan: bibleSectionPlan,
  chapter_assembly: chapterAssembly,
  chapter_plan: chapterPlan,
  chapter_prose: chapterProse,
  ebook_cover_prompt: ebookCoverPrompt,
  front_back_matter: frontBackMatter,
  outline,
  story_bible_artifact: storyBibleArtifact,
  story_bible_document_render: storyBibleDocumentRender,
}

export const documentWorkflowNodePack = defineWorkflowNodePack<
  DocumentNodeExecutionContext,
  DocumentNodeExecutionResult,
  DocumentWorkflowNodePackHelpers,
  typeof documentHandlers
>({
  packKey: 'output_workflow_document',
  handlers: documentHandlers,
})

export const documentWorkflowNodeHandlerKeys = documentWorkflowNodePack.handlerKeys

export function registerDocumentWorkflowNodePack(input: {
  helpers: DocumentWorkflowNodePackHelpers
  register: (handlerKey: string, handler: (context: DocumentNodeExecutionContext) => Promise<DocumentNodeExecutionResult>) => void
}) {
  documentWorkflowNodePack.register({
    dependencies: input.helpers,
    register: input.register,
  })
}
