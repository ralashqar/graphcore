import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  promptToWorldOpSchema,
  worldPromptBuildLedgerEntrySchema,
  worldPromptCancelGenerationJobRequestSchema,
  worldPromptGenerationJobSchema,
  worldPromptGenerationJobStepSchema,
  worldPromptGenerationStatusResponseSchema,
  worldPromptIncrementalBuildBriefSchema,
  worldPromptStreamGraphOpEnvelopeSchema,
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

test('streamed generation schemas accept jobs and graph-op envelopes', () => {
  const job = worldPromptGenerationJobSchema.parse({
    id: 'job_1',
    draftId: 'draft_1',
    sessionId: 'session_1',
    turnId: 'turn_1',
    kind: 'initial_seed_stream',
    status: 'running',
    attemptCount: 1,
    tokenUsage: { totalTokens: 1200 },
    counts: { entities: 2 },
    createdAt: '2026-04-30T00:00:00.000Z',
    updatedAt: '2026-04-30T00:00:01.000Z',
  })
  const envelope = worldPromptStreamGraphOpEnvelopeSchema.parse({
    kind: 'op',
    op: {
      id: 'create_mara',
      op: 'upsert_entity',
      payload: {
        targetEntityKey: 'mara_veyr',
        entity: {
          nodeType: 'actor',
          name: 'Mara Veyr',
          summary: 'A memory mage.',
        },
      },
    },
  })

  assert.equal(job.status, 'running')
  assert.equal(envelope.kind, 'op')
  assert.equal(envelope.op.id, 'create_mara')

  const step = worldPromptGenerationJobStepSchema.parse({
    id: 'step_1',
    jobId: 'job_1',
    draftId: 'draft_1',
    sessionId: 'session_1',
    turnId: 'turn_1',
    stepKey: 'full_stream',
    phase: 'full_stream',
    status: 'running',
    orderIndex: 0,
    attemptCount: 1,
    createdAt: '2026-04-30T00:00:00.000Z',
    updatedAt: '2026-04-30T00:00:01.000Z',
  })
  assert.equal(step.phase, 'full_stream')
})

test('streamed generation schemas reject invalid node types and parse status/cancel shapes', () => {
  assert.equal(worldPromptStreamGraphOpEnvelopeSchema.safeParse({
    kind: 'op',
    op: {
      id: 'bad_location',
      op: 'upsert_entity',
      payload: {
        entity: {
          nodeType: 'location',
          name: 'The Wrong Type',
          summary: 'Invalid node type.',
        },
      },
    },
  }).success, false)

  const status = worldPromptGenerationStatusResponseSchema.parse({
    ok: true,
    session: {
      id: 'session_1',
      key: 'world',
      draftId: 'draft_1',
      title: 'World',
      createdAt: '2026-04-30T00:00:00.000Z',
      updatedAt: '2026-04-30T00:00:00.000Z',
    },
    turn: {
      id: 'turn_1',
      sessionId: 'session_1',
      draftId: 'draft_1',
      prompt: 'Seed world',
      status: 'streaming',
      createdAt: '2026-04-30T00:00:00.000Z',
      updatedAt: '2026-04-30T00:00:00.000Z',
    },
    job: {
      id: 'job_1',
      draftId: 'draft_1',
      sessionId: 'session_1',
      turnId: 'turn_1',
      status: 'queued',
      createdAt: '2026-04-30T00:00:00.000Z',
      updatedAt: '2026-04-30T00:00:00.000Z',
    },
    terminal: false,
  })
  const cancel = worldPromptCancelGenerationJobRequestSchema.parse({
    jobId: 'job_1',
    snapshot: {
      workspace: { id: 'workspace_1', name: 'Workspace', slug: 'workspace', role: 'owner' },
      project: { id: 'project_1', name: 'Project', slug: 'project', summary: '', visibility: 'private' },
      draft: { id: 'draft_1', name: 'Draft', version: 1, isPrimary: true },
    },
  })

  assert.equal(status.terminal, false)
  assert.equal(cancel.jobId, 'job_1')
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
