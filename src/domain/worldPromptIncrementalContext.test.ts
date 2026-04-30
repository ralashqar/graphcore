import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  promptToWorldOpSchema,
  worldPromptBuildLedgerEntrySchema,
  worldPromptIncrementalBuildBriefSchema,
  worldPromptTokenBudgetDiagnosticsSchema,
  worldPromptWorkItemContextSchema,
  worldPromptWorkItemResultSchema,
} from './worldPrompt.ts'

test('incremental build brief stores compact continuity instead of raw source', () => {
  const brief = worldPromptIncrementalBuildBriefSchema.parse({
    summary: 'A fallen empire where memory is the last magic.',
    sourceOutline: 'A concise outline extracted from the source.',
    requirements: ['Create full main cast', 'Create ordered story beats'],
    canonConstraints: ['Use sequence_unit for authored story progression'],
    tone: ['Live-action cinematic'],
    plannedCoverage: ['Cast', 'Locations', 'Sequence units'],
    sourceExcerptKeys: ['opening_pages'],
  })

  assert.equal(brief.summary.includes('fallen empire'), true)
  assert.deepEqual(brief.sourceExcerptKeys, ['opening_pages'])
  assert.equal('extractedText' in brief, false)
})

test('incremental ledger entries are compact graph references', () => {
  const relationship = worldPromptBuildLedgerEntrySchema.parse({
    key: 'rel_shadow_empire_rules_capital',
    entryType: 'relationship',
    sourceEntityKey: 'shadow_empire',
    targetEntityKey: 'capital',
    verb: 'rules',
    role: 'rules',
  })

  assert.equal(relationship.sourceEntityKey, 'shadow_empire')
  assert.equal(relationship.targetEntityKey, 'capital')
  assert.equal(relationship.role, 'rules')
  assert.equal('notes' in relationship, false)
})

test('work item context can run in ledger-only mode without graph prose', () => {
  const context = worldPromptWorkItemContextSchema.parse({
    buildBrief: {
      summary: 'A compact build brief.',
      requirements: ['Create key locations'],
    },
    currentWorkItem: {
      id: 'main_locations',
      kind: 'entity_batch',
      label: 'Main locations',
      objective: 'Create key places.',
      entityTypes: ['place'],
    },
    ledger: [
      {
        key: 'protagonist',
        entryType: 'entity',
        nodeType: 'actor',
        name: 'Mara Veyr',
        role: 'Disinherited memory mage.',
      },
    ],
    ledgerOnly: true,
  })

  assert.equal(context.ledgerOnly, true)
  assert.equal(context.relevantRelationships.length, 0)
  assert.equal(context.sourceExcerpts.length, 0)
  assert.equal(context.ledger[0]?.role, 'Disinherited memory mage.')
})

test('work item result schema keeps the output narrow but still accepts graph ops', () => {
  const op = promptToWorldOpSchema.parse({
    id: 'main_cast_1',
    op: 'assistant_note',
    payload: {
      message: 'Created the main cast.',
    },
  })
  const result = worldPromptWorkItemResultSchema.parse({
    assistantSummary: 'Created the main cast.',
    wave1Ops: [op],
  })

  assert.equal(result.assistantSummary, 'Created the main cast.')
  assert.equal(result.wave1Ops.length, 1)
  assert.equal(result.threadActions.length, 0)
  assert.equal(result.suggestionCandidates.length, 0)
})

test('token diagnostics records per-section prompt budget data', () => {
  const diagnostics = worldPromptTokenBudgetDiagnosticsSchema.parse({
    surface: 'incremental-work-item',
    promptChars: 8400,
    sourceChars: 500,
    retrievalChars: 0,
    manifestChars: 360,
    graphStateChars: 1200,
    ledgerChars: 2600,
    schemaSurface: 'incremental-work-item-narrow',
    workItemId: 'sequence_03',
    workItemKind: 'sequence_unit',
    workItemIndex: 5,
    ledgerOnly: false,
  })

  assert.equal(diagnostics.workItemId, 'sequence_03')
  assert.equal(diagnostics.ledgerChars, 2600)
})

test('incremental work item prompts do not resend full manifest, retrieval, or raw source context', () => {
  const source = readFileSync(resolve('supabase/functions/_shared/world-prompt.ts'), 'utf8')
  const functionStart = source.indexOf('async function generateIncrementalWorkItemPlan')
  const functionEnd = source.indexOf('async function executeIncrementalWorldPromptTurn')
  const body = source.slice(functionStart, functionEnd)

  assert.equal(body.includes('workItems: input.manifest.workItems'), false)
  assert.equal(body.includes('retrieval: input.retrievalPacket'), false)
  assert.equal(body.includes('sourceContext: input.payload.sourceContext'), false)
  assert.equal(body.includes('buildCompactWorkItemPrompt'), true)
})
