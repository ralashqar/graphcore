import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const source = readFileSync(resolve('supabase/functions/_shared/world-prompt.ts'), 'utf8')

function functionBody(name: string) {
  const start = source.indexOf(`function ${name}`)
  assert.notEqual(start, -1, `${name} should exist`)
  const next = source.indexOf('\nfunction ', start + 1)
  return source.slice(start, next === -1 ? source.length : next)
}

test('applied sequence insertion prompts route as direct structural mutations before refinement diagnosis', () => {
  const detectBody = functionBody('detectPromptIntent')
  const resolvePlannerBody = functionBody('resolvePlannerMode')
  const classifyBody = functionBody('classifyCanonIntent')

  assert.equal(source.includes('function promptHasAppliedStructuralMutationLanguage'), true)
  assert.equal(detectBody.includes('promptHasAppliedStructuralMutationLanguage(trimmed)'), true)
  assert.equal(resolvePlannerBody.includes("return 'direct_build' satisfies PlannerMode"), true)
  assert.equal(resolvePlannerBody.includes('promptHasAppliedStructuralMutationLanguage(input.prompt)'), true)

  const structuralReturn = classifyBody.indexOf("intent: 'structural_rewire'")
  const plannerDiagnosisGate = classifyBody.indexOf("input.plannerMode !== 'direct_build'")
  assert.ok(structuralReturn > -1, 'classifyCanonIntent should still return structural_rewire')
  assert.ok(plannerDiagnosisGate > -1, 'classifyCanonIntent should still guard non-build diagnostics')
  assert.ok(structuralReturn < plannerDiagnosisGate, 'structural mutations must be classified before plannerMode diagnosis')
})

test('incremental mutation work items pin prompt-mentioned entities and include canonical key catalog', () => {
  const relevantEntitiesBody = functionBody('buildRelevantWorkItemEntities')
  const compactPromptBody = functionBody('buildCompactWorkItemPrompt')
  const sanitizeBody = functionBody('sanitizePromptOp')

  assert.equal(relevantEntitiesBody.includes('promptMentionedEntityKeys'), true)
  assert.equal(relevantEntitiesBody.includes('extractMentionedEntityKeys(input.prompt, input.snapshot)'), true)
  assert.equal(compactPromptBody.includes('canonicalEntityKeyCatalog'), true)
  assert.equal(compactPromptBody.includes('buildCanonicalEntityKeyCatalog'), true)
  assert.equal(source.includes('copy targetEntityKey/sourceEntityKey/targetEntityKey exactly from that catalog'), true)
  assert.equal(sanitizeBody.includes('resolveEntityTargetKey(input.snapshot'), true)
  assert.equal(sanitizeBody.includes('targetResolution'), true)
})

test('prompt turn emits an LLM intent-routing step before main planning', () => {
  const startTurnBody = functionBody('startWorldPromptTurn')
  const inferBody = functionBody('inferCanonIntentWithLlm')

  assert.equal(source.includes('llmCanonIntentClassificationSchema'), true)
  assert.equal(inferBody.includes('lightweight prompt-intent router'), true)
  assert.equal(inferBody.includes('Infer the user intent semantically'), true)
  assert.equal(startTurnBody.includes('Analysing prompt intent.'), true)
  assert.equal(startTurnBody.includes('inferCanonIntentWithLlm'), true)
  assert.equal(startTurnBody.includes('intentRouting'), true)
})

test('prompt op optimization persists chapter summaries without silent mid-word truncation', () => {
  const optimizeBody = functionBody('optimizePlannerOpsForMode')
  const normalizeSummaryBody = functionBody('normalizePersistedEntitySummary')
  const boundaryBody = functionBody('normalizePersistedTextAtBoundary')
  const contextBody = functionBody('normalizePersistedEntityContext')

  assert.equal(source.includes('const PERSISTED_SEQUENCE_SUMMARY_MAX_LENGTH = 420'), true)
  assert.equal(source.includes('const PERSISTED_ENTITY_SUMMARY_MAX_LENGTH = 240'), true)
  assert.equal(boundaryBody.includes('preferSentence'), true)
  assert.equal(boundaryBody.includes("const ellipsis = options.ellipsis === false ? '' : '...'"), true)
  assert.equal(boundaryBody.includes('lastIndexOf'), true)
  assert.equal(normalizeSummaryBody.includes('sequenceSummaryFallbackFromEntity'), true)
  assert.equal(normalizeSummaryBody.includes('looksLikePersistedTextFragment'), true)
  assert.equal(optimizeBody.includes('normalizePersistedEntitySummary(entityRecord)'), true)
  assert.equal(optimizeBody.includes('normalizePersistedEntityContext(entityRecord, allowRichContext)'), true)
  assert.equal(optimizeBody.includes('normalizePersistedEntitySummary(changesRecord)'), true)
  assert.equal(optimizeBody.includes('normalizePersistedEntityContext(changesRecord, allowRichContext)'), true)
  assert.equal(optimizeBody.includes("trimPlannerText(cloned.payload.entity.summary ?? '', 240, { ellipsis: false })"), false)
  assert.equal(contextBody.includes('if (!sequenceEntity && !allowRichContext) return'), true)
  assert.equal(contextBody.includes('buildSequenceContextFallback'), true)
})

test('sequence visual fallback prefers synopsis and outcome over truncated summaries', () => {
  const fallbackBody = functionBody('fallbackVisualDescriptionFromEntity')
  const compactSequenceBody = functionBody('normalizeCompactStreamedSequenceEnvelope')

  assert.equal(fallbackBody.includes('isSequenceEntityLike(entity)'), true)
  assert.equal(fallbackBody.indexOf('sequence.synopsis') < fallbackBody.indexOf('entity.summary'), true)
  assert.equal(fallbackBody.includes('looksLikePersistedTextFragment(entity.summary)'), true)
  assert.equal(compactSequenceBody.includes('normalizePersistedEntitySummary(sequenceSource)'), true)
  assert.equal(compactSequenceBody.includes('normalizePersistedEntityContext(sequenceSource, true)'), true)
  assert.equal(compactSequenceBody.indexOf('value.synopsis') < compactSequenceBody.indexOf('value.dramaticQuestion'), true)
  assert.equal(compactSequenceBody.includes('|| summary'), false)
})
