import { z } from 'npm:zod@4'

import { buildDefaultDefinitionComponents, type DefinitionBase } from '../../../src/domain/graphcore.ts'
import {
  worldPromptApplyPreviewRequestSchema,
  worldPromptApplyPreviewResponseSchema,
  worldPromptCancelTurnRequestSchema,
  worldPromptCancelTurnResponseSchema,
  promptToWorldOpSchema,
  worldPromptEventPayloadSchema,
  worldPromptPlanPreviewSchema,
  worldPromptSessionSchema,
  worldPromptSuggestionSchema,
  worldPromptStartTurnRequestSchema,
  worldPromptStartTurnResponseSchema,
  worldPromptTurnSchema,
  worldPromptResolveOpRequestSchema,
  worldPromptResolveOpResponseSchema,
  type PromptToWorldOp,
  type WorldPromptClassification,
  type WorldPromptEvent,
  type WorldPromptMessage,
  type WorldPromptPlanPreview,
  type WorldPromptPlanPreviewItem,
  type WorldPromptScopeDecision,
  type WorldPromptSession,
  type WorldPromptSuggestion,
  type WorldPromptSnapshot,
  type WorldPromptStartTurnRequest,
  type WorldPromptTurn,
} from '../../../src/domain/worldPrompt.ts'
import {
  worldThreadSchema,
  type WorldThread,
} from '../../../src/domain/worldThread.ts'
import {
  worldEntitySchema,
  worldRelationshipSchema,
  worldViewSchema,
  type WorldEntity,
  type WorldEntityCreateInput,
  type WorldRelationship,
  type WorldRelationshipCreateInput,
  type WorldResult,
  type WorldOperator,
  type WorldGraphConnection,
} from '../../../src/domain/worldGraph.ts'
import {
  worldBuildPlanResponseSchema,
  worldBuildStatusResponseSchema,
  type WorldBuildPlanResponse,
  type WorldBuildStatusResponse,
} from '../../../src/domain/worldBuild.ts'
import { runOpenAiResponses } from './openai.ts'
import { generateExpansionPlan, generateSeedPlan } from './world-graph.ts'

type SupabaseClient = any

type WorldPromptSessionRow = {
  id: string
  draft_id: string
  key: string
  title: string
  status: string
  is_active: boolean
  summary_memory: string | null
  last_context: Record<string, unknown> | null
  selected_root_entity_key: string | null
  selected_view_key: string | null
  model: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type WorldPromptTurnRow = {
  id: string
  session_id: string
  draft_id: string
  prompt: string
  status: string
  model: string | null
  resolved_context: Record<string, unknown> | null
  approval_state: string
  assistant_summary: string | null
  error_message: string | null
  response_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type WorldPromptMessageRow = {
  id: string
  session_id: string
  turn_id: string | null
  draft_id: string
  role: string
  content: string
  metadata: Record<string, unknown> | null
  created_at: string
}

type WorldPromptEventRow = {
  id: string
  session_id: string
  turn_id: string
  draft_id: string
  sequence: number
  event_type: string
  op_id: string | null
  payload: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_at: string
}

type WorldThreadRow = {
  id: string
  draft_id: string
  key: string
  title: string
  summary: string | null
  status: string
  priority: string
  linked_entity_keys: string[] | null
  source_turn_id: string | null
  last_turn_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

const SESSION_SELECT = 'id, draft_id, key, title, status, is_active, summary_memory, last_context, selected_root_entity_key, selected_view_key, model, metadata, created_at, updated_at'
const TURN_SELECT = 'id, session_id, draft_id, prompt, status, model, resolved_context, approval_state, assistant_summary, error_message, response_id, metadata, created_at, updated_at'
const MESSAGE_SELECT = 'id, session_id, turn_id, draft_id, role, content, metadata, created_at'
const EVENT_SELECT = 'id, session_id, turn_id, draft_id, sequence, event_type, op_id, payload, metadata, created_at'
const THREAD_SELECT = 'id, draft_id, key, title, summary, status, priority, linked_entity_keys, source_turn_id, last_turn_id, metadata, created_at, updated_at'

const plannerThreadCandidateSchema = z.object({
  key: z.string(),
  title: z.string(),
  summary: z.string().default(''),
  status: z.enum(['open', 'resolved', 'parked']).default('open'),
  priority: z.enum(['primary', 'secondary', 'background']).default('secondary'),
  linkedEntityKeys: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

const plannerIdeaSchema = worldPromptSuggestionSchema.extend({
  source: z.enum(['thread', 'wave2', 'repair']).default('wave2'),
})

const worldPromptPlannerSchema = z.object({
  classification: z.enum([
    'graphable_direct',
    'graphable_broad',
    'graphable_plan_only',
    'not_graphable',
    'contradictory_or_low_confidence',
  ]).optional(),
  assistantSummary: z.string().default(''),
  operations: z.array(promptToWorldOpSchema).default([]),
  wave1Ops: z.array(promptToWorldOpSchema).default([]),
  wave2Ideas: z.array(plannerIdeaSchema).default([]),
  optionalIdeas: z.array(plannerIdeaSchema).default([]),
  threadCandidates: z.array(plannerThreadCandidateSchema).default([]),
  suggestionCandidates: z.array(plannerIdeaSchema).default([]),
})

const DIRECT_SCOPE_CAPS = {
  entityOps: 6,
  relationshipOps: 10,
  existingEntityModificationOps: 2,
  queueOps: 2,
  derivedResultOps: 1,
}

const STAGED_SCOPE_CAPS = {
  entityOps: 5,
  relationshipOps: 6,
  existingEntityModificationOps: 2,
  queueOps: 2,
  derivedResultOps: 1,
}

function isTruthyEnv(value: string | undefined | null) {
  if (!value) return false
  return ['1', 'true', 'yes', 'on', 'debug'].includes(value.trim().toLowerCase())
}

function shouldDebugWorldPromptOpenAi() {
  return isTruthyEnv(Deno.env.get('WORLD_PROMPT_DEBUG_OPENAI'))
    || isTruthyEnv(Deno.env.get('WORLD_BUILD_DEBUG_OPENAI'))
}

function previewJson(value: unknown, maxLength = 4000) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}...<truncated>`
}

function extractJsonBlock(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i) ?? trimmed.match(/```([\s\S]*?)```/i)
    if (!fencedMatch?.[1]) return null

    try {
      return JSON.parse(fencedMatch[1].trim()) as Record<string, unknown>
    } catch {
      return null
    }
  }
}

function formatIssues(issues: Array<{ path: PropertyKey[]; message: string }>) {
  return issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join(' | ')
}

function normalizePlannerOperation(rawOp: unknown, index: number) {
  if (!rawOp || typeof rawOp !== 'object') {
    return rawOp
  }

  const record = { ...(rawOp as Record<string, unknown>) }
  const op = typeof record.op === 'string' ? record.op : null
  if (!op) {
    return record
  }

  if (typeof record.id !== 'string' || !record.id.trim()) {
    record.id = `planner-op-${index + 1}-${slugify(op)}`
  }

  if (record.payload && typeof record.payload === 'object') {
    return record
  }

  switch (op) {
    case 'upsert_entity':
      if (record.entity && typeof record.entity === 'object') {
        record.payload = {
          targetEntityKey: typeof record.targetEntityKey === 'string' ? record.targetEntityKey : null,
          entity: record.entity,
        }
      }
      break
    case 'update_entity':
      if (typeof record.targetEntityKey === 'string') {
        record.payload = {
          targetEntityKey: record.targetEntityKey,
          changes: record.changes && typeof record.changes === 'object' ? record.changes : {},
        }
      }
      break
    case 'upsert_relationship': {
      const relationship = record.relationship && typeof record.relationship === 'object'
        ? record.relationship
        : {
            sourceEntityKey: typeof record.sourceEntityKey === 'string' ? record.sourceEntityKey : null,
            targetEntityKey: typeof record.targetEntityKey === 'string' ? record.targetEntityKey : null,
            sourceRef: record.sourceRef,
            targetRef: record.targetRef,
            verb: record.verb,
            direction: record.direction,
            strength: record.strength,
            confidence: record.relationshipConfidence ?? record.confidence,
            source: record.source,
            notes: record.notes,
            state: record.state,
            metadata: record.relationshipMetadata ?? record.metadata,
          }
      record.payload = {
        targetRelationshipKey: typeof record.targetRelationshipKey === 'string' ? record.targetRelationshipKey : null,
        relationship,
      }
      break
    }
    case 'update_relationship':
      if (typeof record.targetRelationshipKey === 'string') {
        record.payload = {
          targetRelationshipKey: record.targetRelationshipKey,
          changes: record.changes && typeof record.changes === 'object'
            ? record.changes
            : {
                sourceEntityKey: record.sourceEntityKey,
                targetEntityKey: record.targetEntityKey,
                verb: record.verb,
                direction: record.direction,
                strength: record.strength,
                confidence: record.relationshipConfidence ?? record.confidence,
                source: record.source,
                notes: record.notes,
                state: record.state,
                metadata: record.relationshipMetadata ?? record.metadata,
              },
        }
      }
      break
    case 'create_derived_result':
      record.payload = {
        sourceEntityKey: record.sourceEntityKey,
        targetEntityKey: record.targetEntityKey,
        operatorType: record.operatorType,
        title: record.title,
        summary: record.summary,
        metadata: record.metadata,
      }
      break
    case 'queue_image_generation':
      record.payload = {
        targetEntityKey: record.targetEntityKey,
        definitionKey: record.definitionKey ?? null,
        prompt: record.prompt,
        reason: record.reason,
        queueType: 'image_generation',
      }
      break
    case 'queue_cinematic_generation':
      record.payload = {
        prompt: record.prompt,
        title: record.title,
        relatedEntityKeys: Array.isArray(record.relatedEntityKeys) ? record.relatedEntityKeys : [],
        resultKey: record.resultKey ?? null,
        queueType: 'cinematic_generation',
      }
      break
    case 'assistant_note':
      if (typeof record.message === 'string' || typeof record.note === 'string' || typeof record.text === 'string') {
        record.payload = {
          message: typeof record.message === 'string'
            ? record.message
            : typeof record.note === 'string'
              ? record.note
              : String(record.text),
        }
      }
      break
    default:
      break
  }

  return record
}

function normalizePlannerJson(raw: Record<string, unknown>) {
  const normalized = { ...raw }
  const normalizeOpArray = (value: unknown) => Array.isArray(value)
    ? value.map((entry, index) => normalizePlannerOperation(entry, index))
    : value

  normalized.operations = normalizeOpArray(normalized.operations)
  normalized.wave1Ops = normalizeOpArray(normalized.wave1Ops)

  return normalized
}

type PromptScopeCounts = WorldPromptScopeDecision['counts']
type PromptClassificationMode = WorldPromptClassification
type PromptScopeMode = 'direct' | 'preview' | 'blocked'

type PromptExecutionClassification = {
  classification: PromptClassificationMode
  mode: PromptScopeMode
  scope: WorldPromptScopeDecision
  selectedOps: PromptToWorldOp[]
  deferredOps: PromptToWorldOp[]
  suggestions: WorldPromptSuggestion[]
  note: string
  preview: WorldPromptPlanPreview | null
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'entry'
}

function normalizeName(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ')
}

function diceCoefficient(left: string, right: string) {
  if (!left || !right) return 0
  if (left === right) return 1
  if (left.length < 2 || right.length < 2) return 0
  const leftPairs = new Map<string, number>()
  for (let index = 0; index < left.length - 1; index += 1) {
    const pair = left.slice(index, index + 2)
    leftPairs.set(pair, (leftPairs.get(pair) ?? 0) + 1)
  }
  let intersection = 0
  for (let index = 0; index < right.length - 1; index += 1) {
    const pair = right.slice(index, index + 2)
    const count = leftPairs.get(pair) ?? 0
    if (count > 0) {
      leftPairs.set(pair, count - 1)
      intersection += 1
    }
  }
  return (2 * intersection) / ((left.length - 1) + (right.length - 1))
}

function mapSessionRow(row: WorldPromptSessionRow): WorldPromptSession {
  return worldPromptSessionSchema.parse({
    id: row.id,
    key: row.key,
    draftId: row.draft_id,
    title: row.title,
    status: row.status,
    isActive: row.is_active,
    summaryMemory: row.summary_memory ?? '',
    lastContext: row.last_context ?? {},
    selectedRootEntityKey: row.selected_root_entity_key,
    selectedViewKey: row.selected_view_key,
    model: row.model ?? 'gpt-5.4-mini',
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function mapTurnRow(row: WorldPromptTurnRow): WorldPromptTurn {
  return worldPromptTurnSchema.parse({
    id: row.id,
    sessionId: row.session_id,
    draftId: row.draft_id,
    prompt: row.prompt,
    status: row.status,
    model: row.model ?? 'gpt-5.4-mini',
    resolvedContext: row.resolved_context ?? {},
    approvalState: row.approval_state,
    assistantSummary: row.assistant_summary ?? '',
    errorMessage: row.error_message,
    responseId: row.response_id,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

function mapMessageRow(row: WorldPromptMessageRow): WorldPromptMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    turnId: row.turn_id,
    draftId: row.draft_id,
    role: row.role as WorldPromptMessage['role'],
    content: row.content,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }
}

function mapEventRow(row: WorldPromptEventRow): WorldPromptEvent {
  return {
    id: row.id,
    sessionId: row.session_id,
    turnId: row.turn_id,
    draftId: row.draft_id,
    sequence: row.sequence,
    eventType: row.event_type as WorldPromptEvent['eventType'],
    opId: row.op_id,
    payload: row.payload ?? {},
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }
}

function mapThreadRow(row: WorldThreadRow): WorldThread {
  return worldThreadSchema.parse({
    id: row.id,
    draftId: row.draft_id,
    key: row.key,
    title: row.title,
    summary: row.summary ?? '',
    status: row.status,
    priority: row.priority,
    linkedEntityKeys: row.linked_entity_keys ?? [],
    sourceTurnId: row.source_turn_id,
    lastTurnId: row.last_turn_id,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

async function ensurePromptSession(input: {
  client: SupabaseClient
  payload: WorldPromptStartTurnRequest
}) {
  const sessionKey = input.payload.sessionKey?.trim() || 'world.prompt.main'
  const existing = await input.client
    .from('world_prompt_sessions')
    .select(SESSION_SELECT)
    .eq('draft_id', input.payload.snapshot.draft.id)
    .eq('key', sessionKey)
    .maybeSingle()

  if (existing.error) throw new Error(existing.error.message)
  if (existing.data) {
    const updated = await input.client
      .from('world_prompt_sessions')
      .update({
        is_active: true,
        status: 'active',
        selected_root_entity_key: input.payload.selectedRootEntityKey,
        selected_view_key: input.payload.selectedViewKey,
        model: input.payload.model,
        last_context: {
          lastPrompt: input.payload.prompt,
          selectedRootEntityKey: input.payload.selectedRootEntityKey,
          selectedViewKey: input.payload.selectedViewKey,
          selectedThreadKey: input.payload.selectedThreadKey,
        },
      })
      .eq('id', existing.data.id)
      .select(SESSION_SELECT)
      .single()
    if (updated.error) throw new Error(updated.error.message)
    return mapSessionRow(updated.data as WorldPromptSessionRow)
  }

  const titleSeed = input.payload.snapshot.project.name || input.payload.snapshot.draft.name || 'World Session'
  const inserted = await input.client
    .from('world_prompt_sessions')
    .insert({
      draft_id: input.payload.snapshot.draft.id,
      key: sessionKey,
      title: `${titleSeed} World Session`,
      status: 'active',
      is_active: true,
      summary_memory: '',
      last_context: {
        selectedRootEntityKey: input.payload.selectedRootEntityKey,
        selectedViewKey: input.payload.selectedViewKey,
        selectedThreadKey: input.payload.selectedThreadKey,
      },
      selected_root_entity_key: input.payload.selectedRootEntityKey,
      selected_view_key: input.payload.selectedViewKey,
      model: input.payload.model,
      metadata: {},
    })
    .select(SESSION_SELECT)
    .single()
  if (inserted.error) throw new Error(inserted.error.message)
  return mapSessionRow(inserted.data as WorldPromptSessionRow)
}

async function loadSessionMessages(client: SupabaseClient, sessionId: string) {
  const response = await client
    .from('world_prompt_messages')
    .select(MESSAGE_SELECT)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  if (response.error) throw new Error(response.error.message)
  return ((response.data ?? []) as WorldPromptMessageRow[]).map(mapMessageRow)
}

function compactMessageHistory(summaryMemory: string, messages: WorldPromptMessage[]) {
  if (messages.length <= 12) {
    return {
      summaryMemory,
      recentMessages: messages.slice(-10),
      compacted: false,
    }
  }

  const olderMessages = messages.slice(0, Math.max(0, messages.length - 10))
  const nextSummary = [
    summaryMemory.trim(),
    olderMessages
      .map((message) => `${message.role}: ${message.content.replace(/\s+/g, ' ').trim().slice(0, 180)}`)
      .join('\n'),
  ].filter(Boolean).join('\n').slice(-4000)

  return {
    summaryMemory: nextSummary,
    recentMessages: messages.slice(-10),
    compacted: true,
  }
}

function emptyScopeCounts(): PromptScopeCounts {
  return {
    actionableOps: 0,
    entityOps: 0,
    relationshipOps: 0,
    existingEntityModificationOps: 0,
    queueOps: 0,
    derivedResultOps: 0,
  }
}

function isPlanOnlyPrompt(prompt: string) {
  const normalized = prompt.toLowerCase()
  return normalized.includes('plan only')
    || normalized.includes('do not apply')
    || normalized.includes('no mutations')
    || normalized.includes('preview only')
}

function resolveEntityReference(
  snapshot: WorldPromptSnapshot,
  input: {
    entityKey?: string | null
    definitionKey?: string | null
    name?: string | null
    alias?: string | null
  },
) {
  const byKey = input.entityKey ? snapshot.worldEntities.find((entity) => entity.key === input.entityKey) ?? null : null
  if (byKey) {
    return { entity: byKey, candidates: [byKey], matchType: 'exact_key' as const }
  }

  const byDefinitionKey = input.definitionKey
    ? snapshot.worldEntities.find((entity) => entity.linkedDefinitionKey === input.definitionKey) ?? null
    : null
  if (byDefinitionKey) {
    return { entity: byDefinitionKey, candidates: [byDefinitionKey], matchType: 'definition' as const }
  }

  const probe = normalizeName(input.name ?? input.alias ?? '')
  if (!probe) {
    return { entity: null, candidates: [], matchType: 'none' as const }
  }

  const exactCandidates = snapshot.worldEntities.filter((entity) => {
    const names = [entity.name, ...entity.aliases]
    return names.some((value) => normalizeName(value) === probe)
  })
  if (exactCandidates.length === 1) {
    return { entity: exactCandidates[0], candidates: exactCandidates, matchType: 'exact_name' as const }
  }
  if (exactCandidates.length > 1) {
    return { entity: null, candidates: exactCandidates, matchType: 'ambiguous_exact' as const }
  }

  const scored = snapshot.worldEntities
    .map((entity) => ({
      entity,
      score: Math.max(
        diceCoefficient(probe, normalizeName(entity.name)),
        ...entity.aliases.map((alias) => diceCoefficient(probe, normalizeName(alias))),
      ),
    }))
    .filter((entry) => entry.score >= 0.82)
    .sort((left, right) => right.score - left.score)

  if (scored.length === 1) {
    return { entity: scored[0].entity, candidates: [scored[0].entity], matchType: 'fuzzy' as const }
  }
  if (scored.length > 1) {
    return { entity: null, candidates: scored.map((entry) => entry.entity), matchType: 'ambiguous_fuzzy' as const }
  }

  return { entity: null, candidates: [], matchType: 'none' as const }
}

function determineDefinitionKind(nodeType: WorldEntity['nodeType']): DefinitionBase['kind'] | null {
  switch (nodeType) {
    case 'actor':
      return 'character'
    case 'place':
      return 'environment'
    case 'object':
      return 'item'
    default:
      return null
  }
}

function buildWorldEntityKey(snapshot: WorldPromptSnapshot, nodeType: WorldEntity['nodeType'], name: string) {
  const base = `world.${nodeType}.${slugify(name)}`
  let candidate = base
  let index = 2
  while (snapshot.worldEntities.some((entity) => entity.key === candidate)) {
    candidate = `${base}-${index}`
    index += 1
  }
  return candidate
}

function buildWorldRelationshipKey(snapshot: WorldPromptSnapshot, sourceKey: string, verb: string, targetKey: string) {
  const base = `world.relationship.${slugify(`${sourceKey}-${verb}-${targetKey}`)}`
  let candidate = base
  let index = 2
  while (snapshot.worldRelationships.some((relationship) => relationship.key === candidate)) {
    candidate = `${base}-${index}`
    index += 1
  }
  return candidate
}

function buildWorldOperatorKey(snapshot: WorldPromptSnapshot, sourceKey: string, operatorType: string, targetKey: string) {
  const base = `world.operator.${slugify(`${sourceKey}-${operatorType}-${targetKey}`)}`
  let candidate = base
  let index = 2
  while (snapshot.worldOperators.some((entry) => entry.key === candidate)) {
    candidate = `${base}-${index}`
    index += 1
  }
  return candidate
}

function buildWorldResultKey(snapshot: WorldPromptSnapshot, title: string) {
  const base = `world.result.${slugify(title)}`
  let candidate = base
  let index = 2
  while (snapshot.worldResults.some((entry) => entry.key === candidate)) {
    candidate = `${base}-${index}`
    index += 1
  }
  return candidate
}

function buildWorldConnectionKey(snapshot: WorldPromptSnapshot, seed: string) {
  const base = `world.connection.${slugify(seed)}`
  let candidate = base
  let index = 2
  while (snapshot.worldGraphConnections.some((entry) => entry.key === candidate)) {
    candidate = `${base}-${index}`
    index += 1
  }
  return candidate
}

function isProjectedCreate(op: PromptToWorldOp) {
  return op.op === 'upsert_entity' && op.metadata?.projectedCreate === true
}

function countScopeOps(ops: PromptToWorldOp[], snapshot: WorldPromptSnapshot) {
  const counts = emptyScopeCounts()
  for (const op of ops) {
    if (op.op === 'assistant_note') continue
    counts.actionableOps += 1
    if (op.op === 'upsert_entity' || op.op === 'update_entity') {
      counts.entityOps += 1
      const targetsExisting =
        op.op === 'update_entity'
          || (
            op.op === 'upsert_entity'
            && !isProjectedCreate(op)
            && Boolean(
              op.payload.targetEntityKey
              && snapshot.worldEntities.some((entity) => entity.key === op.payload.targetEntityKey),
            )
          )
      if (targetsExisting) {
        counts.existingEntityModificationOps += 1
      }
      continue
    }
    if (op.op === 'upsert_relationship' || op.op === 'update_relationship') {
      counts.relationshipOps += 1
      continue
    }
    if (op.op === 'queue_image_generation' || op.op === 'queue_cinematic_generation') {
      counts.queueOps += 1
      continue
    }
    if (op.op === 'create_derived_result') {
      counts.derivedResultOps += 1
    }
  }
  return counts
}

function exceedsScopeCaps(counts: PromptScopeCounts, caps: typeof DIRECT_SCOPE_CAPS | typeof STAGED_SCOPE_CAPS) {
  return counts.entityOps > caps.entityOps
    || counts.relationshipOps > caps.relationshipOps
    || counts.existingEntityModificationOps > caps.existingEntityModificationOps
    || counts.queueOps > caps.queueOps
    || counts.derivedResultOps > caps.derivedResultOps
}

function promptIncludesAny(prompt: string, probes: string[]) {
  const normalized = normalizeName(prompt)
  return probes.some((probe) => normalized.includes(normalizeName(probe)))
}

function scorePromptOpForStaging(op: PromptToWorldOp, prompt: string) {
  if (op.op === 'assistant_note') return -10
  if (op.op === 'upsert_entity') {
    const nameBoost = promptIncludesAny(prompt, [op.payload.entity.name, ...op.payload.entity.aliases]) ? 30 : 0
    const anchorBoost = op.payload.entity.nodeType === 'place' || op.payload.entity.nodeType === 'event' ? 20 : 0
    const peopleBoost = op.payload.entity.nodeType === 'actor' || op.payload.entity.nodeType === 'group' ? 16 : 0
    const loreBoost = op.payload.entity.nodeType === 'concept' ? 8 : 0
    return 120 + nameBoost + anchorBoost + peopleBoost + loreBoost
  }
  if (op.op === 'upsert_relationship') {
    return 90
  }
  if (op.op === 'update_entity') {
    return 70
  }
  if (op.op === 'update_relationship') {
    return 60
  }
  if (op.op === 'create_derived_result') {
    return promptIncludesAny(prompt, ['scene', 'staged', 'paired', 'wear', 'equip']) ? 75 : 45
  }
  if (op.op === 'queue_image_generation') {
    return promptIncludesAny(prompt, ['image', 'portrait', 'visual', 'look']) ? 40 : 20
  }
  if (op.op === 'queue_cinematic_generation') {
    return promptIncludesAny(prompt, ['cinematic', 'scene', 'shot', 'trailer', 'storyboard', 'cutscene']) ? 35 : 10
  }
  return 0
}

function resolveStagingEntityKeys(op: PromptToWorldOp) {
  if (op.op === 'upsert_entity') {
    return [op.payload.targetEntityKey].filter((value): value is string => Boolean(value))
  }
  if (op.op === 'upsert_relationship') {
    return [op.payload.relationship.sourceEntityKey, op.payload.relationship.targetEntityKey].filter((value): value is string => Boolean(value))
  }
  if (op.op === 'update_entity') {
    return [op.payload.targetEntityKey]
  }
  if (op.op === 'queue_image_generation') {
    return [op.payload.targetEntityKey]
  }
  if (op.op === 'create_derived_result') {
    return [op.payload.sourceEntityKey, op.payload.targetEntityKey]
  }
  if (op.op === 'queue_cinematic_generation') {
    return op.payload.relatedEntityKeys
  }
  return []
}

function buildPromptSuggestion(input: {
  id: string
  label: string
  prompt: string
  kind: WorldPromptSuggestion['kind']
  style?: WorldPromptSuggestion['style']
  source?: WorldPromptSuggestion['source']
  threadKey?: string | null
  summary?: string
  estimatedNodeCount?: number
  estimatedEdgeCount?: number
  willQueueImages?: boolean
  willQueueCinematics?: boolean
}) {
  return {
    id: input.id,
    label: input.label,
    prompt: input.prompt,
    kind: input.kind,
    style: input.style ?? 'secondary',
    source: input.source ?? 'repair',
    threadKey: input.threadKey ?? null,
    summary: input.summary ?? '',
    estimatedNodeCount: input.estimatedNodeCount ?? 0,
    estimatedEdgeCount: input.estimatedEdgeCount ?? 0,
    willQueueImages: input.willQueueImages ?? false,
    willQueueCinematics: input.willQueueCinematics ?? false,
  } satisfies WorldPromptSuggestion
}

function dedupeSuggestions(suggestions: WorldPromptSuggestion[]) {
  const seen = new Set<string>()
  const deduped: WorldPromptSuggestion[] = []
  for (const suggestion of suggestions) {
    if (seen.has(suggestion.label)) continue
    seen.add(suggestion.label)
    deduped.push(suggestion)
  }
  return deduped.slice(0, 4)
}

function canonicalThreadPrompt(input: {
  thread: WorldThread
  mode?: 'continue' | 'plan'
}) {
  if (input.mode === 'plan') {
    return `Plan only the next best beat for the world thread "${input.thread.title}". Preserve existing canon and do not apply graph mutations.`
  }
  return `Continue the world thread "${input.thread.title}" with one compact additive step that builds on: ${input.thread.summary || input.thread.title}.`
}

function suggestionsFromPlannerIdeas(input: {
  ideas: Array<z.infer<typeof plannerIdeaSchema>>
  fallbackKind: WorldPromptSuggestion['kind']
}) {
  return input.ideas.map((idea) => buildPromptSuggestion({
    id: idea.id,
    label: idea.label,
    prompt: idea.prompt,
    kind: idea.kind ?? input.fallbackKind,
    style: idea.style,
    source: idea.source,
    threadKey: idea.threadKey,
    summary: idea.summary,
    estimatedNodeCount: idea.estimatedNodeCount,
    estimatedEdgeCount: idea.estimatedEdgeCount,
    willQueueImages: idea.willQueueImages,
    willQueueCinematics: idea.willQueueCinematics,
  }))
}

function buildThreadAwareSuggestions(input: {
  snapshot: WorldPromptSnapshot
  selectedThreadKey?: string | null
}) {
  const rankedThreads = [...input.snapshot.worldThreads]
    .filter((thread) => thread.status === 'open')
    .sort((left, right) => {
      const leftPriority = left.priority === 'primary' ? 0 : left.priority === 'secondary' ? 1 : 2
      const rightPriority = right.priority === 'primary' ? 0 : right.priority === 'secondary' ? 1 : 2
      return leftPriority - rightPriority || new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    })

  const selectedThread = input.selectedThreadKey
    ? rankedThreads.find((thread) => thread.key === input.selectedThreadKey) ?? null
    : null

  const seedThreads = [
    selectedThread,
    ...rankedThreads.filter((thread) => !selectedThread || thread.key !== selectedThread.key),
  ].filter((thread): thread is WorldThread => Boolean(thread)).slice(0, 3)

  return dedupeSuggestions([
    ...seedThreads.map((thread, index) => buildPromptSuggestion({
      id: `thread-${thread.key}-continue`,
      label: thread.title,
      prompt: canonicalThreadPrompt({ thread, mode: 'continue' }),
      kind: 'continue_scope',
      style: index === 0 ? 'primary' : 'secondary',
      source: 'thread',
      threadKey: thread.key,
      summary: thread.summary || 'Continue this active world thread with one compact additive beat.',
      estimatedNodeCount: 2,
      estimatedEdgeCount: 2,
    })),
    buildPromptSuggestion({
      id: 'thread-plan-only',
      label: 'Plan Only',
      prompt: 'Plan only the next best world beat from the active threads. Preserve canon and do not apply graph mutations.',
      kind: 'plan_only',
      style: 'secondary',
      source: 'thread',
      summary: 'Preview the next story-gardening beat without mutating the graph.',
    }),
  ])
}

function impactForOp(op: PromptToWorldOp) {
  switch (op.op) {
    case 'upsert_entity':
    case 'update_entity':
      return { nodeCount: 1, edgeCount: 0, queueCount: 0 }
    case 'upsert_relationship':
    case 'update_relationship':
      return { nodeCount: 0, edgeCount: 1, queueCount: 0 }
    case 'create_derived_result':
      return { nodeCount: 1, edgeCount: 3, queueCount: 0 }
    case 'queue_image_generation':
    case 'queue_cinematic_generation':
      return { nodeCount: 0, edgeCount: 0, queueCount: 1 }
    default:
      return { nodeCount: 0, edgeCount: 0, queueCount: 0 }
  }
}

function summarizeImpact(ops: PromptToWorldOp[]) {
  return ops.reduce((totals, op) => {
    const impact = impactForOp(op)
    return {
      nodeCount: totals.nodeCount + impact.nodeCount,
      edgeCount: totals.edgeCount + impact.edgeCount,
      queueCount: totals.queueCount + impact.queueCount,
    }
  }, { nodeCount: 0, edgeCount: 0, queueCount: 0 })
}

function buildFallbackPlannerOpsFromWorldGraph(input: {
  payload: WorldPromptStartTurnRequest
  requestSummary: string
  assistantSummary: string
  entities: Array<{
    name: string
    summary: string
    nodeType: WorldEntity['nodeType']
    aliases: string[]
    tags: string[]
  }>
  relationships: Array<{
    sourceName: string
    targetName: string
    verb: string
    direction: 'outbound' | 'inbound' | 'bidirectional'
    notes: string
  }>
}) {
  const wave1Ops: PromptToWorldOp[] = []

  for (const entity of input.entities) {
    wave1Ops.push({
      id: `fallback-entity-${slugify(entity.name)}`,
      op: 'upsert_entity',
      confidence: 0.62,
      applyMode: 'auto',
      dependencyOpIds: [],
      rationale: 'Fallback world prompt seed generated inside the edge function.',
      status: 'pending',
      metadata: {
        fallbackPlanner: true,
      },
      payload: {
        targetEntityKey: null,
        entity: {
          name: entity.name,
          summary: entity.summary,
          nodeType: entity.nodeType,
          aliases: entity.aliases,
          tags: entity.tags,
          status: 'active',
          thumbnailAssetKey: null,
          linkedDefinitionKey: null,
          source: 'ai',
          customProperties: {},
          metadata: {
            fallbackPlanner: true,
          },
          ensureLinkedDefinition: true,
        },
      },
    })
  }

  for (const relationship of input.relationships) {
    wave1Ops.push({
      id: `fallback-relationship-${slugify(`${relationship.sourceName}-${relationship.verb}-${relationship.targetName}`)}`,
      op: 'upsert_relationship',
      confidence: 0.58,
      applyMode: 'auto',
      dependencyOpIds: [],
      rationale: 'Fallback relationship generated inside the edge function.',
      status: 'pending',
      metadata: {
        fallbackPlanner: true,
      },
      payload: {
        targetRelationshipKey: null,
        relationship: {
          sourceEntityKey: null,
          targetEntityKey: null,
          sourceRef: {
            entityKey: null,
            definitionKey: null,
            name: relationship.sourceName,
            alias: null,
            matchCandidateEntityKeys: [],
          },
          targetRef: {
            entityKey: null,
            definitionKey: null,
            name: relationship.targetName,
            alias: null,
            matchCandidateEntityKeys: [],
          },
          verb: relationship.verb,
          direction: relationship.direction,
          strength: null,
          confidence: 0.58,
          source: 'ai',
          notes: relationship.notes,
          state: 'confirmed',
          metadata: {
            fallbackPlanner: true,
          },
        },
      },
    })
  }

  const suggestionTail = input.payload.snapshot.worldEntities.length === 0
    ? [
        buildPromptSuggestion({
          id: 'fallback-add-characters',
          label: 'Add Key Characters',
          prompt: `Continue this world by adding 2 or 3 key characters to "${input.requestSummary}" and connect them to the main conflict.`,
          kind: 'continue_scope',
          style: 'primary',
          source: 'wave2',
          summary: 'Add a compact first cast and tie them into the seeded world conflict.',
          estimatedNodeCount: 3,
          estimatedEdgeCount: 3,
        }),
        buildPromptSuggestion({
          id: 'fallback-add-lore',
          label: 'Add Lore Layer',
          prompt: `Continue this world by adding one hidden piece of lore and one event that deepens "${input.requestSummary}".`,
          kind: 'continue_scope',
          style: 'secondary',
          source: 'wave2',
          summary: 'Deepen the seed with one lore thread and one consequence.',
          estimatedNodeCount: 2,
          estimatedEdgeCount: 2,
        }),
      ]
    : [
        buildPromptSuggestion({
          id: 'fallback-expand-selection',
          label: 'Expand The Selection',
          prompt: input.payload.selectedRootEntityKey
            ? `Continue by expanding the selected world entity "${input.payload.selectedRootEntityKey}" with one compact additive beat.`
            : 'Continue this world with one compact additive beat around the main conflict.',
          kind: 'continue_scope',
          style: 'primary',
          source: 'wave2',
          summary: 'Push the world one step outward without broadening too fast.',
          estimatedNodeCount: 2,
          estimatedEdgeCount: 2,
        }),
      ]

  return worldPromptPlannerSchema.parse({
    classification: isPlanOnlyPrompt(input.payload.prompt) ? 'graphable_plan_only' : 'graphable_direct',
    assistantSummary: input.assistantSummary,
    operations: wave1Ops,
    wave1Ops,
    wave2Ideas: [],
    optionalIdeas: [],
    threadCandidates: [
      {
        key: `thread-${slugify(input.requestSummary)}`,
        title: input.requestSummary.slice(0, 90) || 'World Seed',
        summary: input.assistantSummary,
        status: 'open',
        priority: input.payload.snapshot.worldEntities.length === 0 ? 'primary' : 'secondary',
        linkedEntityKeys: [],
        metadata: {
          fallbackPlanner: true,
        },
      },
    ],
    suggestionCandidates: dedupeSuggestions([
      ...suggestionTail,
      buildPromptSuggestion({
        id: 'fallback-plan-only',
        label: 'Plan Only',
        prompt: 'Plan only the next best additions for this world. Preserve canon and do not apply graph mutations.',
        kind: 'plan_only',
        style: 'secondary',
        source: 'wave2',
        summary: 'Preview the next beat without mutating the graph.',
      }),
    ]),
  })
}

async function buildFallbackPromptPlan(input: {
  payload: WorldPromptStartTurnRequest
  plannerError: unknown
}) {
  const assistantPrefix = 'Hosted prompt planning was unavailable, so GraphCore used a local fallback seed.'

  if (
    input.payload.selectedRootEntityKey
    && input.payload.snapshot.worldEntities.some((entity) => entity.key === input.payload.selectedRootEntityKey)
  ) {
    const expansion = await generateExpansionPlan({
      snapshot: input.payload.snapshot,
      rootEntityKey: input.payload.selectedRootEntityKey,
      model: input.payload.model,
    })
    return buildFallbackPlannerOpsFromWorldGraph({
      payload: input.payload,
      requestSummary: expansion.requestSummary || 'World Expansion',
      assistantSummary: [assistantPrefix, expansion.assistantNote].filter(Boolean).join(' '),
      entities: expansion.entities,
      relationships: expansion.relationships,
    })
  }

  const seed = await generateSeedPlan({
    snapshot: input.payload.snapshot,
    prompt: input.payload.prompt,
    model: input.payload.model,
  })
  return buildFallbackPlannerOpsFromWorldGraph({
    payload: input.payload,
    requestSummary: seed.requestSummary || 'Starter World',
    assistantSummary: [assistantPrefix, seed.assistantNote].filter(Boolean).join(' '),
    entities: seed.entities,
    relationships: seed.relationships,
  })
}

function looksContradictoryOrLowConfidence(prompt: string) {
  const normalized = prompt.toLowerCase()
  return normalized.includes('but not really')
    || normalized.includes('vibes')
    || normalized.includes('whatever')
    || normalized.includes('make it go brr')
    || normalized.includes('seven dimensions')
}

function buildBlockedSuggestions(prompt: string, snapshot: WorldPromptSnapshot) {
  const hasWorld = snapshot.worldEntities.length > 0
  return dedupeSuggestions([
    buildPromptSuggestion({
      id: 'repair-characters',
      label: 'Add Characters',
      prompt: hasWorld
        ? 'Continue from the current world by adding a protagonist and a rival, then connect them to the existing graph.'
        : 'Start this world by adding a protagonist and a rival, then connect them with a central conflict.',
      kind: 'repair_prompt',
      style: 'primary',
      source: 'repair',
      summary: 'Add one hero, one rival, and a clear conflict anchor.',
      estimatedNodeCount: 2,
      estimatedEdgeCount: 2,
    }),
    buildPromptSuggestion({
      id: 'repair-places',
      label: 'Add Places',
      prompt: hasWorld
        ? 'Continue from the current world by adding a capital city and a frontier outpost that matter next.'
        : 'Start this world by creating a capital city and a frontier outpost, then connect them to the main conflict.',
      kind: 'repair_prompt',
      source: 'repair',
      summary: 'Create two important locations and connect them to the main tension.',
      estimatedNodeCount: 2,
      estimatedEdgeCount: 1,
    }),
    buildPromptSuggestion({
      id: 'repair-conflict',
      label: 'Define Conflict',
      prompt: `Use this as context: "${prompt}". Define the central conflict of the world with a few compact nodes and links.`,
      kind: 'repair_prompt',
      source: 'repair',
      summary: 'Focus only on the main pressure shaping the world.',
      estimatedNodeCount: 3,
      estimatedEdgeCount: 2,
    }),
    buildPromptSuggestion({
      id: 'plan-only',
      label: 'Plan Only',
      prompt: 'Plan only the next highest-leverage world additions. Do not apply graph mutations. Return assistant notes instead of entity, relationship, result, or queue ops.',
      kind: 'plan_only',
      source: 'repair',
      summary: 'Preview the next best world-building moves without changing the graph.',
    }),
  ])
}

function buildStagedSuggestions(input: {
  prompt: string
  deferredOps: PromptToWorldOp[]
  snapshot: WorldPromptSnapshot
}) {
  const hasCharacters = input.deferredOps.some((op) => (
    op.op === 'upsert_entity' && ['actor', 'group'].includes(op.payload.entity.nodeType)
  ))
  const hasPlaces = input.deferredOps.some((op) => (
    op.op === 'upsert_entity' && op.payload.entity.nodeType === 'place'
  ))
  const hasLore = input.deferredOps.some((op) => (
    op.op === 'upsert_entity' && ['concept', 'event', 'object'].includes(op.payload.entity.nodeType)
  ))
  const suggestions = [
    hasCharacters ? buildPromptSuggestion({
      id: 'continue-characters',
      label: 'Add Key Characters',
      prompt: 'Continue from the current world by adding only the next key characters and groups that anchor this setting. Keep it compact and additive.',
      kind: 'continue_scope',
      style: 'primary',
      source: 'wave2',
      summary: 'Grow the cast and faction layer without widening the whole world at once.',
      estimatedNodeCount: 3,
      estimatedEdgeCount: 3,
    }) : null,
    hasPlaces ? buildPromptSuggestion({
      id: 'continue-places',
      label: 'Expand Places',
      prompt: 'Continue from the current world by adding only the main places, settlements, and landmarks that matter next. Keep it compact and additive.',
      kind: 'continue_scope',
      source: 'wave2',
      summary: 'Add the next places that make the current conflict legible.',
      estimatedNodeCount: 3,
      estimatedEdgeCount: 2,
    }) : null,
    hasLore ? buildPromptSuggestion({
      id: 'continue-lore',
      label: 'Add Lore Layer',
      prompt: 'Continue from the current world by adding only the core lore, concepts, history, or artifacts needed next. Keep it compact and additive.',
      kind: 'continue_scope',
      source: 'wave2',
      summary: 'Add one lore layer that clarifies stakes, history, or artifacts.',
      estimatedNodeCount: 2,
      estimatedEdgeCount: 2,
    }) : null,
    buildPromptSuggestion({
      id: 'plan-only',
      label: 'Plan Only',
      prompt: 'Plan only the next highest-leverage world additions. Do not apply graph mutations. Return assistant notes instead of entity, relationship, result, or queue ops.',
      kind: 'plan_only',
      source: 'wave2',
      summary: 'Preview the next wave before applying it.',
    }),
  ].filter((entry): entry is WorldPromptSuggestion => Boolean(entry))

  if (suggestions.length < 4) {
    suggestions.unshift(buildPromptSuggestion({
      id: 'continue-conflict',
      label: 'Continue Conflict',
      prompt: `Continue from "${input.prompt}" by expanding only the main conflict, alliances, and rivalries that should come next.`,
      kind: 'continue_scope',
      style: 'primary',
      source: 'wave2',
      summary: 'Continue only the conflict cluster instead of broadening every axis at once.',
      estimatedNodeCount: 2,
      estimatedEdgeCount: 4,
    }))
  }

  return dedupeSuggestions(suggestions)
}

function buildStagedFirstWave(input: {
  prompt: string
  snapshot: WorldPromptSnapshot
  ops: PromptToWorldOp[]
}) {
  const selected: PromptToWorldOp[] = []
  const selectedEntityKeys = new Set<string>()
  const runningCounts = emptyScopeCounts()
  const ranked = [...input.ops].sort((left, right) => scorePromptOpForStaging(right, input.prompt) - scorePromptOpForStaging(left, input.prompt))

  for (const op of ranked) {
    if (op.op === 'assistant_note') continue
    const nextCounts = countScopeOps([...selected, op], input.snapshot)
    if (exceedsScopeCaps(nextCounts, STAGED_SCOPE_CAPS)) {
      continue
    }
    if (op.op === 'upsert_relationship') {
      const entityKeys = resolveStagingEntityKeys(op)
      const canLink = entityKeys.every((key) => selectedEntityKeys.has(key) || input.snapshot.worldEntities.some((entity) => entity.key === key))
      if (!canLink) continue
    }
    if (op.op === 'create_derived_result' || op.op === 'queue_image_generation' || op.op === 'queue_cinematic_generation') {
      const entityKeys = resolveStagingEntityKeys(op)
      const dependenciesReady = entityKeys.every((key) => selectedEntityKeys.has(key) || input.snapshot.worldEntities.some((entity) => entity.key === key))
      if (!dependenciesReady && entityKeys.length > 0) continue
    }
    selected.push(op)
    Object.assign(runningCounts, nextCounts)
    for (const key of resolveStagingEntityKeys(op)) {
      selectedEntityKeys.add(key)
    }
  }

  const selectedIds = new Set(selected.map((op) => op.id))
  const deferred = input.ops.filter((op) => op.op !== 'assistant_note' && !selectedIds.has(op.id))
  const selectedNotes = input.ops.filter((op) => op.op === 'assistant_note')
  return {
    selectedOps: [...selectedNotes, ...selected],
    deferredOps: deferred,
    counts: runningCounts,
  }
}

function buildPreviewItem(op: PromptToWorldOp): WorldPromptPlanPreviewItem {
  const impact = impactForOp(op)
  const diffMode = op.metadata?.touchesExisting === true ? 'touches_existing' : 'new'
  const touchesCanon = op.metadata?.canonTouch === true
  const approvalRequired = op.applyMode === 'needs_approval' || op.metadata?.approvalReason !== undefined
  switch (op.op) {
    case 'upsert_entity':
      return {
        id: op.id,
        kind: 'entity',
        title: op.payload.entity.name,
        summary: op.payload.entity.summary,
        targetKeys: [op.payload.targetEntityKey].filter((value): value is string => Boolean(value)),
        diffMode,
        touchesCanon,
        approvalRequired,
        estimatedImpact: impact,
        status: 'preview',
      }
    case 'update_entity':
      return {
        id: op.id,
        kind: 'entity',
        title: op.payload.targetEntityKey,
        summary: 'Update existing entity details.',
        targetKeys: [op.payload.targetEntityKey],
        diffMode,
        touchesCanon,
        approvalRequired,
        estimatedImpact: impact,
        status: 'preview',
      }
    case 'upsert_relationship':
      return {
        id: op.id,
        kind: 'relationship',
        title: `${op.payload.relationship.sourceEntityKey ?? op.payload.relationship.sourceRef?.name ?? 'Source'} ${op.payload.relationship.verb} ${op.payload.relationship.targetEntityKey ?? op.payload.relationship.targetRef?.name ?? 'Target'}`,
        summary: op.payload.relationship.notes,
        targetKeys: [op.payload.relationship.sourceEntityKey, op.payload.relationship.targetEntityKey].filter((value): value is string => Boolean(value)),
        diffMode,
        touchesCanon,
        approvalRequired,
        estimatedImpact: impact,
        status: 'preview',
      }
    case 'update_relationship':
      return {
        id: op.id,
        kind: 'relationship',
        title: op.payload.targetRelationshipKey,
        summary: 'Update an existing relationship.',
        targetKeys: [op.payload.targetRelationshipKey],
        diffMode,
        touchesCanon,
        approvalRequired,
        estimatedImpact: impact,
        status: 'preview',
      }
    case 'create_derived_result':
      return {
        id: op.id,
        kind: 'derived_result',
        title: op.payload.title ?? op.payload.operatorType,
        summary: op.payload.summary,
        targetKeys: [op.payload.sourceEntityKey, op.payload.targetEntityKey],
        diffMode,
        touchesCanon,
        approvalRequired,
        estimatedImpact: impact,
        status: 'preview',
      }
    case 'queue_image_generation':
      return {
        id: op.id,
        kind: 'image_queue',
        title: 'Queue image generation',
        summary: op.payload.reason || op.payload.prompt,
        targetKeys: [op.payload.targetEntityKey],
        diffMode,
        touchesCanon,
        approvalRequired,
        estimatedImpact: impact,
        status: 'preview',
      }
    case 'queue_cinematic_generation':
      return {
        id: op.id,
        kind: 'cinematic_queue',
        title: op.payload.title || 'Queue cinematic generation',
        summary: op.payload.prompt,
        targetKeys: op.payload.relatedEntityKeys,
        diffMode,
        touchesCanon,
        approvalRequired,
        estimatedImpact: impact,
        status: 'preview',
      }
    case 'assistant_note':
      return {
        id: op.id,
        kind: 'assistant_note',
        title: 'Assistant note',
        summary: op.payload.message,
        targetKeys: [],
        diffMode,
        touchesCanon,
        approvalRequired,
        estimatedImpact: impact,
        status: 'preview',
      }
  }
}

function buildPlanPreview(input: {
  mode: WorldPromptPlanPreview['mode']
  requestSummary: string
  scope: WorldPromptScopeDecision
  selectedOps: PromptToWorldOp[]
  suggestions: WorldPromptSuggestion[]
  canApplyFirstWave: boolean
}) {
  return worldPromptPlanPreviewSchema.parse({
    mode: input.mode,
    requestSummary: input.requestSummary,
    scopeDecision: input.scope,
    items: input.selectedOps.map(buildPreviewItem),
    suggestions: input.suggestions,
    canApplyFirstWave: input.canApplyFirstWave,
    pendingOps: input.selectedOps,
    appliedAt: null,
  })
}

function entityIsCanonLocked(entity: Pick<WorldEntity, 'metadata'> | null) {
  return Boolean(entity && entity.metadata && typeof entity.metadata === 'object' && (entity.metadata as Record<string, unknown>).canon && typeof (entity.metadata as Record<string, unknown>).canon === 'object' && ((entity.metadata as Record<string, unknown>).canon as Record<string, unknown>).locked === true)
}

function relationshipIsCanonLocked(relationship: Pick<WorldRelationship, 'metadata'> | null) {
  return Boolean(relationship && relationship.metadata && typeof relationship.metadata === 'object' && (relationship.metadata as Record<string, unknown>).canon && typeof (relationship.metadata as Record<string, unknown>).canon === 'object' && ((relationship.metadata as Record<string, unknown>).canon as Record<string, unknown>).locked === true)
}

function annotatePromptOpMetadata(input: {
  op: PromptToWorldOp
  touchesExisting?: boolean
  canonTouch?: boolean
  approvalReason?: string | null
}) {
  input.op.metadata = {
    ...(input.op.metadata ?? {}),
    touchesExisting: input.touchesExisting ?? false,
    canonTouch: input.canonTouch ?? false,
    approvalReason: input.approvalReason ?? undefined,
  }
  return input.op
}

async function upsertWorldThreads(input: {
  client: SupabaseClient
  draftId: string
  turnId: string
  snapshot: WorldPromptSnapshot
  selectedThreadKey?: string | null
  threadCandidates: Array<z.infer<typeof plannerThreadCandidateSchema>>
}) {
  const knownEntityKeys = new Set(input.snapshot.worldEntities.map((entity) => entity.key))
  const fallbackCandidates = input.threadCandidates.length > 0
    ? input.threadCandidates
    : (() => {
      const linkedEntityKeys = input.snapshot.worldEntities
        .filter((entity) => entity.metadata?.projected === true)
        .slice(-3)
        .map((entity) => entity.key)
      if (linkedEntityKeys.length === 0) return []
      return [{
        key: `thread.${slugify(linkedEntityKeys.join('-'))}`,
        title: 'Emerging Story Thread',
        summary: 'A newly introduced world thread inferred from the latest prompt wave.',
        status: 'open' as const,
        priority: 'primary' as const,
        linkedEntityKeys,
        metadata: {
          inferred: true,
          tags: ['story_gardener'],
        },
      }]
    })()
  const existingResponse = await input.client
    .from('world_threads')
    .select(THREAD_SELECT)
    .eq('draft_id', input.draftId)
  if (existingResponse.error) throw new Error(existingResponse.error.message)

  const existingThreads = ((existingResponse.data ?? []) as WorldThreadRow[]).map(mapThreadRow)
  const existingByKey = new Map(existingThreads.map((thread) => [thread.key, thread]))
  const upsertPayload = fallbackCandidates.map((candidate) => {
    const existing = existingByKey.get(candidate.key) ?? null
    const linkedEntityKeys = candidate.linkedEntityKeys.filter((key) => knownEntityKeys.has(key))
    return {
      draft_id: input.draftId,
      key: candidate.key,
      title: candidate.title,
      summary: candidate.summary,
      status: candidate.status,
      priority: candidate.priority,
      linked_entity_keys: Array.from(new Set([...(existing?.linkedEntityKeys ?? []), ...linkedEntityKeys])),
      source_turn_id: existing?.sourceTurnId ?? input.turnId,
      last_turn_id: input.turnId,
      metadata: {
        ...(existing?.metadata ?? {}),
        ...(candidate.metadata ?? {}),
      },
    }
  })

  const persisted: WorldThread[] = []
  if (upsertPayload.length > 0) {
    const upsertResponse = await input.client
      .from('world_threads')
      .upsert(upsertPayload, { onConflict: 'draft_id,key' })
      .select(THREAD_SELECT)
    if (upsertResponse.error) throw new Error(upsertResponse.error.message)
    persisted.push(...((upsertResponse.data ?? []) as WorldThreadRow[]).map(mapThreadRow))
  }

  if (input.selectedThreadKey) {
    const selectedThread = existingByKey.get(input.selectedThreadKey) ?? persisted.find((thread) => thread.key === input.selectedThreadKey) ?? null
    if (selectedThread) {
      const touchResponse = await input.client
        .from('world_threads')
        .update({ last_turn_id: input.turnId })
        .eq('draft_id', input.draftId)
        .eq('key', selectedThread.key)
        .select(THREAD_SELECT)
        .single()
      if (touchResponse.error) throw new Error(touchResponse.error.message)
      const touched = mapThreadRow(touchResponse.data as WorldThreadRow)
      const existingIndex = persisted.findIndex((thread) => thread.key === touched.key)
      if (existingIndex >= 0) {
        persisted[existingIndex] = touched
      } else {
        persisted.push(touched)
      }
    }
  }

  return persisted
}

function classifyPromptExecution(input: {
  prompt: string
  snapshot: WorldPromptSnapshot
  ops: PromptToWorldOp[]
  classificationHint?: WorldPromptClassification | null
  suggestionCandidates?: WorldPromptSuggestion[]
  selectedThreadKey?: string | null
  assistantSummary: string
}): PromptExecutionClassification {
  const actionableOps = input.ops.filter((op) => op.op !== 'assistant_note')
  const counts = countScopeOps(input.ops, input.snapshot)
  const contradictoryOrLowConfidence = looksContradictoryOrLowConfidence(input.prompt)
  const classificationHint = input.classificationHint ?? null
  const blockedSuggestions = dedupeSuggestions([
    ...(input.suggestionCandidates ?? []),
    ...buildThreadAwareSuggestions({
      snapshot: input.snapshot,
      selectedThreadKey: input.selectedThreadKey,
    }),
    ...buildBlockedSuggestions(input.prompt, input.snapshot),
  ])

  if (isPlanOnlyPrompt(input.prompt) || classificationHint === 'graphable_plan_only' || actionableOps.length === 0 || classificationHint === 'not_graphable' || classificationHint === 'contradictory_or_low_confidence') {
    const classification: PromptClassificationMode =
      classificationHint === 'contradictory_or_low_confidence'
        ? 'contradictory_or_low_confidence'
        : classificationHint === 'not_graphable'
          ? 'not_graphable'
          : isPlanOnlyPrompt(input.prompt) || classificationHint === 'graphable_plan_only'
            ? 'graphable_plan_only'
            : contradictoryOrLowConfidence
              ? 'contradictory_or_low_confidence'
              : 'not_graphable'
    const previewableOps = actionableOps.length > 0
      ? buildStagedFirstWave(input).selectedOps.filter((op) => op.op !== 'assistant_note')
      : []
    const scope: WorldPromptScopeDecision = {
      mode: classification === 'graphable_plan_only' ? 'staged' : 'blocked',
      counts,
      starterPackApplied: false,
    }
    const suggestions = classification === 'graphable_plan_only'
      ? dedupeSuggestions([
        ...(input.suggestionCandidates ?? []),
        ...buildThreadAwareSuggestions({
          snapshot: input.snapshot,
          selectedThreadKey: input.selectedThreadKey,
        }),
      ])
      : blockedSuggestions
    const preview = classification === 'graphable_plan_only' && previewableOps.length > 0
      ? buildPlanPreview({
        mode: 'plan_only',
        requestSummary: input.assistantSummary || input.prompt,
        scope,
        selectedOps: previewableOps,
        suggestions,
        canApplyFirstWave: true,
      })
      : null
    return {
      classification,
      mode: classification === 'graphable_plan_only' ? 'preview' : 'blocked',
      scope,
      selectedOps: input.ops.filter((op) => op.op === 'assistant_note'),
      deferredOps: [],
      suggestions,
      note: classification === 'graphable_plan_only'
        ? 'Plan-only mode: no graph mutations were applied. Review the preview and apply the first wave only if it looks right.'
        : contradictoryOrLowConfidence
          ? 'This prompt is too contradictory or low-confidence to map cleanly into a world-graph turn, so I did not mutate the graph.'
          : 'I could not map that request cleanly into a coherent world-graph turn, so I did not mutate the graph.',
      preview,
    }
  }

  if (!exceedsScopeCaps(counts, DIRECT_SCOPE_CAPS)) {
    const scope: WorldPromptScopeDecision = {
      mode: 'direct',
      counts,
      starterPackApplied: false,
    }
    return {
      classification: classificationHint === 'graphable_broad' ? 'graphable_broad' : 'graphable_direct',
      mode: 'direct',
      scope,
      selectedOps: input.ops,
      deferredOps: [],
      suggestions: classificationHint === 'graphable_broad'
        ? dedupeSuggestions([
          ...(input.suggestionCandidates ?? []),
          ...buildThreadAwareSuggestions({
            snapshot: input.snapshot,
            selectedThreadKey: input.selectedThreadKey,
          }),
        ])
        : [] as WorldPromptSuggestion[],
      note: '',
      preview: null,
    }
  }

  const staged = buildStagedFirstWave(input)
  if (staged.selectedOps.filter((op) => op.op !== 'assistant_note').length === 0) {
    const scope: WorldPromptScopeDecision = {
      mode: 'blocked',
      counts,
      starterPackApplied: false,
    }
    return {
      classification: classificationHint === 'contradictory_or_low_confidence'
        ? 'contradictory_or_low_confidence'
        : classificationHint === 'not_graphable'
          ? 'not_graphable'
          : contradictoryOrLowConfidence ? 'contradictory_or_low_confidence' : 'not_graphable',
      mode: 'blocked',
      scope,
      selectedOps: input.ops.filter((op) => op.op === 'assistant_note'),
      deferredOps: [],
      suggestions: blockedSuggestions,
      note: 'This prompt is too broad to apply safely in one turn, and I could not derive a coherent starter slice automatically.',
      preview: null,
    }
  }

  const stagedSuggestions = dedupeSuggestions([
    ...(input.suggestionCandidates ?? []),
    ...buildThreadAwareSuggestions({
      snapshot: input.snapshot,
      selectedThreadKey: input.selectedThreadKey,
    }),
    ...buildStagedSuggestions({
      prompt: input.prompt,
      deferredOps: staged.deferredOps,
      snapshot: input.snapshot,
    }),
  ])
  const scope: WorldPromptScopeDecision = {
    mode: 'staged',
    counts,
    starterPackApplied: true,
  }
  return {
    classification: 'graphable_broad',
    mode: 'preview',
    scope,
    selectedOps: staged.selectedOps,
    deferredOps: staged.deferredOps,
    suggestions: stagedSuggestions,
    note: 'This request asked for a lot in one turn, so I prepared a compact first wave preview to keep the graph readable and responsive.',
    preview: buildPlanPreview({
      mode: 'staged_first_wave',
      requestSummary: input.assistantSummary || input.prompt,
      scope,
      selectedOps: staged.selectedOps.filter((op) => op.op !== 'assistant_note'),
      suggestions: stagedSuggestions,
      canApplyFirstWave: true,
    }),
  }
}

function projectSanitizedOpIntoSnapshot(snapshot: WorldPromptSnapshot, op: PromptToWorldOp) {
  if (op.applyMode === 'needs_approval') return
  if (op.op !== 'upsert_entity') return
  if (op.payload.targetEntityKey && snapshot.worldEntities.some((entity) => entity.key === op.payload.targetEntityKey)) {
    return
  }
  const key = op.payload.targetEntityKey || buildWorldEntityKey(snapshot, op.payload.entity.nodeType, op.payload.entity.name)
  op.payload.targetEntityKey = key
  op.metadata = {
    ...(op.metadata ?? {}),
    projectedCreate: true,
  }
  const now = new Date().toISOString()
  snapshot.worldEntities = [
    ...snapshot.worldEntities,
    worldEntitySchema.parse({
      id: `projected:${key}`,
      key,
      name: op.payload.entity.name,
      summary: op.payload.entity.summary,
      nodeType: op.payload.entity.nodeType,
      aliases: op.payload.entity.aliases ?? [],
      tags: op.payload.entity.tags ?? [],
      status: op.payload.entity.status,
      thumbnailAssetKey: op.payload.entity.thumbnailAssetKey,
      linkedDefinitionKey: op.payload.entity.linkedDefinitionKey,
      source: op.payload.entity.source ?? 'ai',
      customProperties: op.payload.entity.customProperties ?? {},
      metadata: {
        ...(op.payload.entity.metadata ?? {}),
        projected: true,
      },
      createdAt: now,
      updatedAt: now,
    }),
  ]
}

async function ensureLinkedDefinition(input: {
  client: SupabaseClient
  snapshot: WorldPromptSnapshot
  entity: WorldEntityCreateInput
}) {
  const definitionKind = determineDefinitionKind(input.entity.nodeType)
  if (!definitionKind || input.entity.ensureLinkedDefinition === false) {
    return null
  }

  const existingByName = input.snapshot.definitions.find((definition) => (
    definition.kind === definitionKind && normalizeName(definition.name) === normalizeName(input.entity.name)
  )) ?? null
  if (existingByName) {
    return existingByName.key
  }

  let candidateKey = `${definitionKind}.${slugify(input.entity.name).replace(/-/g, '_')}`
  let index = 2
  while (input.snapshot.definitions.some((definition) => definition.key === candidateKey)) {
    candidateKey = `${definitionKind}.${slugify(input.entity.name).replace(/-/g, '_')}_${index}`
    index += 1
  }

  const inserted = await input.client
    .from('project_definitions')
    .insert({
      draft_id: input.snapshot.draft.id,
      key: candidateKey,
      kind: definitionKind,
      name: input.entity.name,
      summary: input.entity.summary,
      status: 'draft',
      tags: input.entity.tags,
      schema_version: 1,
      metadata: {},
      llm_hints: {},
      asset_refs: [],
      definition_data: {},
    })
    .select('id, key')
    .single()
  if (inserted.error) throw new Error(inserted.error.message)

  const components = buildDefaultDefinitionComponents(definitionKind)
  if (components.length > 0) {
    const componentInsert = await input.client
      .from('project_definition_components')
      .insert(components.map((component) => ({
        definition_id: inserted.data.id,
        component_type: component.type,
        config: component.config,
      })))
    if (componentInsert.error) throw new Error(componentInsert.error.message)
  }

  input.snapshot.definitions = [
    ...input.snapshot.definitions,
    {
      key: candidateKey,
      kind: definitionKind,
      name: input.entity.name,
      summary: input.entity.summary,
    },
  ]
  return candidateKey
}

async function insertPromptMessage(input: {
  client: SupabaseClient
  sessionId: string
  turnId: string | null
  draftId: string
  role: 'system' | 'user' | 'assistant'
  content: string
  metadata?: Record<string, unknown>
}) {
  const response = await input.client
    .from('world_prompt_messages')
    .insert({
      session_id: input.sessionId,
      turn_id: input.turnId,
      draft_id: input.draftId,
      role: input.role,
      content: input.content,
      metadata: input.metadata ?? {},
    })
    .select(MESSAGE_SELECT)
    .single()
  if (response.error) throw new Error(response.error.message)
  return mapMessageRow(response.data as WorldPromptMessageRow)
}

async function createEventWriter(input: {
  client: SupabaseClient
  sessionId: string
  turnId: string
  draftId: string
}) {
  const maxResponse = await input.client
    .from('world_prompt_events')
    .select('sequence')
    .eq('turn_id', input.turnId)
    .order('sequence', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (maxResponse.error) throw new Error(maxResponse.error.message)
  let sequence = maxResponse.data?.sequence ?? 0

  return async (eventType: WorldPromptEvent['eventType'], payload: Record<string, unknown>, options?: { opId?: string | null; metadata?: Record<string, unknown> }) => {
    sequence += 1
    const parsedPayload = worldPromptEventPayloadSchema.parse(payload)
    const response = await input.client
      .from('world_prompt_events')
      .insert({
        session_id: input.sessionId,
        turn_id: input.turnId,
        draft_id: input.draftId,
        sequence,
        event_type: eventType,
        op_id: options?.opId ?? null,
        payload: parsedPayload,
        metadata: options?.metadata ?? {},
      })
      .select(EVENT_SELECT)
      .single()
    if (response.error) throw new Error(response.error.message)
    return mapEventRow(response.data as WorldPromptEventRow)
  }
}

async function generatePromptPlan(input: {
  payload: WorldPromptStartTurnRequest
  session: WorldPromptSession
  summaryMemory: string
  recentMessages: WorldPromptMessage[]
}) {
  const debugEnabled = shouldDebugWorldPromptOpenAi()
  const instructions = [
    'You are the GraphCore prompt-to-world graph planner.',
    'Return compact JSON only.',
    'Generate world-graph actions, not prose conversation.',
    'Return top-level keys: classification, assistantSummary, wave1Ops, wave2Ideas, optionalIdeas, threadCandidates, suggestionCandidates.',
    'Allowed operations for wave1Ops: upsert_entity, update_entity, upsert_relationship, update_relationship, create_derived_result, queue_image_generation, queue_cinematic_generation, assistant_note.',
    'Favor additive graph growth.',
    'Use queue_image_generation only for actor, place, or object nodes when the prompt is visually explicit.',
    'Use queue_cinematic_generation only when the prompt explicitly requests a cinematic, scene, shot, trailer, storyboard, or cutscene.',
    'Do not invent deletions or archival actions.',
    'If the prompt asks for plan only, preview only, or no mutations, put the proposed applyable ops in wave1Ops, set classification to graphable_plan_only, and do not assume they will be applied immediately.',
    'When referring to existing world items, prefer targetEntityKey when obvious, otherwise use entity names and let the resolver match them.',
    'If a change would rename or substantially rewrite an existing entity, set applyMode to needs_approval.',
    'Use graphable_broad when the request wants too much for one turn. In that case, keep only the best first wave in wave1Ops and place follow-up ideas in wave2Ideas/optionalIdeas.',
    'Use not_graphable or contradictory_or_low_confidence when the prompt cannot be mapped cleanly. In that case, wave1Ops may be empty and suggestionCandidates should repair the request.',
    'threadCandidates should describe the main unresolved narrative or lore threads implied by the prompt and resulting graph changes.',
    'Suggestion ideas should be concrete and world-specific, not generic categories.',
    'Keep operations compact and high-signal.',
  ].join('\n')

  const prompt = JSON.stringify({
    session: {
      key: input.session.key,
      title: input.session.title,
      summaryMemory: input.summaryMemory,
    },
    recentMessages: input.recentMessages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    selectedRootEntityKey: input.payload.selectedRootEntityKey,
    selectedViewKey: input.payload.selectedViewKey,
    selectedThreadKey: input.payload.selectedThreadKey,
    prompt: input.payload.prompt,
    snapshot: {
      project: input.payload.snapshot.project,
      draft: input.payload.snapshot.draft,
      worldEntities: input.payload.snapshot.worldEntities.slice(-30),
      worldRelationships: input.payload.snapshot.worldRelationships.slice(-40),
      worldResults: input.payload.snapshot.worldResults.slice(-20),
      worldThreads: input.payload.snapshot.worldThreads.slice(-16),
      graphs: input.payload.snapshot.graphs.slice(-12),
    },
  })

  try {
    if (debugEnabled) {
      console.log('[world-prompt-debug] planner request-meta', previewJson({
        model: input.payload.model,
        selectedRootEntityKey: input.payload.selectedRootEntityKey,
        selectedViewKey: input.payload.selectedViewKey,
        selectedThreadKey: input.payload.selectedThreadKey,
      }))
      console.log('[world-prompt-debug] planner request-instructions', instructions)
      console.log('[world-prompt-debug] planner request-prompt', prompt)
    }

    const response = await runOpenAiResponses({
      model: input.payload.model,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: instructions }] },
        { role: 'user', content: [{ type: 'input_text', text: prompt }] },
      ],
      text: {
        format: {
          type: 'json_object',
        },
      },
      reasoning: { effort: 'low' },
      metadata: {
        feature: 'world-prompt',
        surface: 'grow-mode',
      },
      store: false,
      timeoutMs: 45_000,
    })

    if (debugEnabled) {
      console.log('[world-prompt-debug] planner response-meta', previewJson({
        ok: response.response.ok,
        status: response.response.status,
        requestId: response.response.headers.get('x-request-id'),
        outputText: response.outputText,
        body: response.body,
      }))
    }

    if (!response.response.ok) {
      const upstreamMessage =
        typeof response.body.error === 'object' && response.body.error !== null
          ? ((response.body.error as { message?: string }).message ?? 'OpenAI request failed.')
          : 'OpenAI request failed.'
      throw new Error(`[world-prompt-planner] ${upstreamMessage}`)
    }

    const parsedJson = extractJsonBlock(response.outputText)
    if (!parsedJson) {
      throw new Error('World prompt planner returned invalid JSON.')
    }

    const normalizedJson = normalizePlannerJson(parsedJson)
    const validated = worldPromptPlannerSchema.safeParse(normalizedJson)
    if (!validated.success) {
      if (debugEnabled) {
        console.log('[world-prompt-debug] planner schema-failed', previewJson(validated.error.issues))
      }
      throw new Error(`World prompt planner returned JSON that did not match the expected schema. ${formatIssues(validated.error.issues)}`)
    }

    return validated.data
  } catch (error) {
    console.error('[world-prompt] planner failed, using fallback plan.', error)
    return buildFallbackPromptPlan({
      payload: input.payload,
      plannerError: error,
    })
  }
}

function sanitizePromptOp(input: {
  op: PromptToWorldOp
  snapshot: WorldPromptSnapshot
}) {
  const op = structuredClone(input.op) as PromptToWorldOp

  if (op.op === 'upsert_entity') {
    const entity = op.payload.entity
    entity.source = entity.source ?? 'ai'
    entity.ensureLinkedDefinition = entity.ensureLinkedDefinition ?? true
    const resolved = resolveEntityReference(input.snapshot, {
      entityKey: op.payload.targetEntityKey,
      definitionKey: entity.linkedDefinitionKey,
      name: entity.name,
    })
    if (resolved.candidates.length > 1) {
      op.applyMode = 'needs_approval'
      op.metadata = {
        ...(op.metadata ?? {}),
        matchCandidateEntityKeys: resolved.candidates.map((candidate) => candidate.key),
        resolution: resolved.matchType,
      }
      return annotatePromptOpMetadata({
        op,
        touchesExisting: true,
        approvalReason: 'Ambiguous entity match',
      })
    }
    if (resolved.entity) {
      op.payload.targetEntityKey = resolved.entity.key
      const renaming = normalizeName(entity.name) !== normalizeName(resolved.entity.name)
      const rewritingSummary = Boolean(entity.summary.trim() && resolved.entity.summary.trim() && entity.summary.trim() !== resolved.entity.summary.trim())
      const changingKind = entity.nodeType !== resolved.entity.nodeType
      const relinking = Boolean(entity.linkedDefinitionKey && entity.linkedDefinitionKey !== resolved.entity.linkedDefinitionKey)
      const canonTouch = entityIsCanonLocked(resolved.entity)
      if (renaming || rewritingSummary || changingKind || relinking || canonTouch) {
        op.applyMode = 'needs_approval'
      }
      return annotatePromptOpMetadata({
        op,
        touchesExisting: true,
        canonTouch,
        approvalReason: renaming || rewritingSummary || changingKind || relinking
          ? 'Semantic rewrite of existing entity'
          : canonTouch ? 'Touches canon-locked entity' : null,
      })
    }
    return annotatePromptOpMetadata({ op, touchesExisting: false })
  }

  if (op.op === 'update_entity') {
    const target = input.snapshot.worldEntities.find((entity) => entity.key === op.payload.targetEntityKey) ?? null
    if (!target) {
      op.applyMode = 'needs_approval'
      return annotatePromptOpMetadata({
        op,
        touchesExisting: true,
        approvalReason: 'Missing entity target',
      })
    }
    const destructive = (
      op.payload.changes.name !== undefined
      || op.payload.changes.nodeType !== undefined
      || op.payload.changes.linkedDefinitionKey !== undefined
      || (typeof op.payload.changes.summary === 'string' && target.summary.trim() && op.payload.changes.summary.trim() !== target.summary.trim())
    )
    const canonTouch = entityIsCanonLocked(target)
    if (destructive || canonTouch) {
      op.applyMode = 'needs_approval'
    }
    return annotatePromptOpMetadata({
      op,
      touchesExisting: true,
      canonTouch,
      approvalReason: destructive ? 'Semantic rewrite of existing entity' : canonTouch ? 'Touches canon-locked entity' : null,
    })
  }

  if (op.op === 'upsert_relationship') {
    const relationship = op.payload.relationship
    const source = resolveEntityReference(input.snapshot, {
      entityKey: relationship.sourceEntityKey,
      definitionKey: relationship.sourceRef?.definitionKey,
      name: relationship.sourceRef?.name ?? relationship.sourceEntityKey,
      alias: relationship.sourceRef?.alias,
    })
    const target = resolveEntityReference(input.snapshot, {
      entityKey: relationship.targetEntityKey,
      definitionKey: relationship.targetRef?.definitionKey,
      name: relationship.targetRef?.name ?? relationship.targetEntityKey,
      alias: relationship.targetRef?.alias,
    })
    if (!source.entity || !target.entity || source.candidates.length > 1 || target.candidates.length > 1) {
      op.applyMode = 'needs_approval'
      op.metadata = {
        ...(op.metadata ?? {}),
        sourceCandidates: source.candidates.map((candidate) => candidate.key),
        targetCandidates: target.candidates.map((candidate) => candidate.key),
      }
      return annotatePromptOpMetadata({
        op,
        touchesExisting: true,
        approvalReason: 'Ambiguous relationship endpoint',
      })
    }
    relationship.sourceEntityKey = source.entity.key
    relationship.targetEntityKey = target.entity.key
    const existing = input.snapshot.worldRelationships.find((entry) => (
      entry.sourceEntityKey === source.entity?.key
      && entry.targetEntityKey === target.entity?.key
      && normalizeName(entry.verb) === normalizeName(relationship.verb)
    )) ?? null
    if (existing) {
      op.payload.targetRelationshipKey = existing.key
    }
    return annotatePromptOpMetadata({
      op,
      touchesExisting: Boolean(existing),
      canonTouch: entityIsCanonLocked(source.entity) || entityIsCanonLocked(target.entity) || relationshipIsCanonLocked(existing),
      approvalReason: entityIsCanonLocked(source.entity) || entityIsCanonLocked(target.entity) || relationshipIsCanonLocked(existing)
        ? 'Touches canon-locked graph semantics'
        : null,
    })
  }

  if (op.op === 'update_relationship') {
    const target = input.snapshot.worldRelationships.find((relationship) => relationship.key === op.payload.targetRelationshipKey) ?? null
    if (!target) {
      op.applyMode = 'needs_approval'
      return annotatePromptOpMetadata({
        op,
        touchesExisting: true,
        approvalReason: 'Missing relationship target',
      })
    }
    const semanticChange = (
      op.payload.changes.verb !== undefined
      || op.payload.changes.direction !== undefined
      || op.payload.changes.sourceEntityKey !== undefined
      || op.payload.changes.targetEntityKey !== undefined
    )
    const canonTouch = relationshipIsCanonLocked(target)
    if (semanticChange || canonTouch) {
      op.applyMode = 'needs_approval'
    }
    return annotatePromptOpMetadata({
      op,
      touchesExisting: true,
      canonTouch,
      approvalReason: semanticChange ? 'Semantic rewrite of existing relationship' : canonTouch ? 'Touches canon-locked relationship' : null,
    })
  }

  if (op.op === 'create_derived_result') {
    const source = input.snapshot.worldEntities.find((entity) => entity.key === op.payload.sourceEntityKey) ?? null
    const target = input.snapshot.worldEntities.find((entity) => entity.key === op.payload.targetEntityKey) ?? null
    if (!source || !target) {
      op.applyMode = 'needs_approval'
    }
    return annotatePromptOpMetadata({
      op,
      touchesExisting: true,
      canonTouch: entityIsCanonLocked(source) || entityIsCanonLocked(target),
      approvalReason: !source || !target ? 'Derived result dependencies are missing' : entityIsCanonLocked(source) || entityIsCanonLocked(target) ? 'Touches canon-locked entity' : null,
    })
  }

  if (op.op === 'queue_image_generation') {
    const target = input.snapshot.worldEntities.find((entity) => entity.key === op.payload.targetEntityKey) ?? null
    if (!target || !['actor', 'place', 'object'].includes(target.nodeType)) {
      op.applyMode = 'needs_approval'
    }
    return annotatePromptOpMetadata({
      op,
      touchesExisting: true,
      canonTouch: entityIsCanonLocked(target),
      approvalReason: !target || !['actor', 'place', 'object'].includes(target.nodeType)
        ? 'Image generation target is invalid'
        : entityIsCanonLocked(target) ? 'Touches canon-locked entity' : null,
    })
  }

  return annotatePromptOpMetadata({ op, touchesExisting: false })
}

async function invokeEdgeFunction<TResponse>(input: {
  authHeader: string
  functionName: string
  body: Record<string, unknown>
  schema?: z.ZodType<TResponse>
}) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  if (!supabaseUrl) throw new Error('SUPABASE_URL is not configured.')
  const response = await fetch(`${supabaseUrl}/functions/v1/${input.functionName}`, {
    method: 'POST',
    headers: {
      Authorization: input.authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input.body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : `${input.functionName} failed.`)
  }
  return input.schema ? input.schema.parse(payload) : payload as TResponse
}

async function applyPromptOp(input: {
  client: SupabaseClient
  authHeader: string
  model: string
  snapshot: WorldPromptSnapshot
  prompt: string
  op: PromptToWorldOp
}) {
  if (input.op.op === 'assistant_note') {
    return {
      applied: {},
      queue: null,
      note: input.op.payload.message,
    }
  }

  if (input.op.op === 'upsert_entity') {
    const target = !isProjectedCreate(input.op) && input.op.payload.targetEntityKey
      ? input.snapshot.worldEntities.find((entity) => entity.key === input.op.payload.targetEntityKey) ?? null
      : null
    if (target) {
      const nextAliases = Array.from(new Set([...target.aliases, ...(input.op.payload.entity.aliases ?? [])]))
      const nextTags = Array.from(new Set([...target.tags, ...(input.op.payload.entity.tags ?? [])]))
      const nextSummary = target.summary.trim() ? target.summary : input.op.payload.entity.summary
      const updateResponse = await input.client
        .from('world_entities')
        .update({
          aliases: nextAliases,
          tags: nextTags,
          summary: nextSummary,
          metadata: {
            ...(target.metadata ?? {}),
            ...(input.op.payload.entity.metadata ?? {}),
          },
        })
        .eq('draft_id', input.snapshot.draft.id)
        .eq('key', target.key)
        .select('id, key, name, summary, node_type, aliases, tags, status, thumbnail_asset_key, linked_definition_key, source, custom_properties, metadata, created_at, updated_at')
        .single()
      if (updateResponse.error) throw new Error(updateResponse.error.message)
      const updatedEntity = worldEntitySchema.parse({
        id: updateResponse.data.id,
        key: updateResponse.data.key,
        name: updateResponse.data.name,
        summary: updateResponse.data.summary ?? '',
        nodeType: updateResponse.data.node_type,
        aliases: updateResponse.data.aliases ?? [],
        tags: updateResponse.data.tags ?? [],
        status: updateResponse.data.status,
        thumbnailAssetKey: updateResponse.data.thumbnail_asset_key,
        linkedDefinitionKey: updateResponse.data.linked_definition_key,
        source: updateResponse.data.source,
        customProperties: updateResponse.data.custom_properties ?? {},
        metadata: updateResponse.data.metadata ?? {},
        createdAt: updateResponse.data.created_at,
        updatedAt: updateResponse.data.updated_at,
      })
      input.snapshot.worldEntities = input.snapshot.worldEntities.map((entity) => entity.key === updatedEntity.key ? updatedEntity : entity)
      return { applied: { worldEntities: [updatedEntity] }, queue: null, note: null }
    }

    const linkedDefinitionKey = await ensureLinkedDefinition({
      client: input.client,
      snapshot: input.snapshot,
      entity: input.op.payload.entity,
    })
    const key = input.op.payload.targetEntityKey || buildWorldEntityKey(input.snapshot, input.op.payload.entity.nodeType, input.op.payload.entity.name)
    const insertResponse = await input.client
      .from('world_entities')
      .insert({
        draft_id: input.snapshot.draft.id,
        key,
        name: input.op.payload.entity.name,
        summary: input.op.payload.entity.summary,
        node_type: input.op.payload.entity.nodeType,
        aliases: input.op.payload.entity.aliases,
        tags: input.op.payload.entity.tags,
        status: input.op.payload.entity.status,
        thumbnail_asset_key: input.op.payload.entity.thumbnailAssetKey,
        linked_definition_key: linkedDefinitionKey,
        source: input.op.payload.entity.source ?? 'ai',
        custom_properties: input.op.payload.entity.customProperties,
        metadata: input.op.payload.entity.metadata,
      })
      .select('id, key, name, summary, node_type, aliases, tags, status, thumbnail_asset_key, linked_definition_key, source, custom_properties, metadata, created_at, updated_at')
      .single()
    if (insertResponse.error) throw new Error(insertResponse.error.message)
    const createdEntity = worldEntitySchema.parse({
      id: insertResponse.data.id,
      key: insertResponse.data.key,
      name: insertResponse.data.name,
      summary: insertResponse.data.summary ?? '',
      nodeType: insertResponse.data.node_type,
      aliases: insertResponse.data.aliases ?? [],
      tags: insertResponse.data.tags ?? [],
      status: insertResponse.data.status,
      thumbnailAssetKey: insertResponse.data.thumbnail_asset_key,
      linkedDefinitionKey: insertResponse.data.linked_definition_key,
      source: insertResponse.data.source,
      customProperties: insertResponse.data.custom_properties ?? {},
      metadata: insertResponse.data.metadata ?? {},
      createdAt: insertResponse.data.created_at,
      updatedAt: insertResponse.data.updated_at,
    })
    input.snapshot.worldEntities = [
      ...input.snapshot.worldEntities.filter((entity) => entity.key !== createdEntity.key),
      createdEntity,
    ]
    return { applied: { worldEntities: [createdEntity] }, queue: null, note: null }
  }

  if (input.op.op === 'update_entity') {
    const target = input.snapshot.worldEntities.find((entity) => entity.key === input.op.payload.targetEntityKey) ?? null
    if (!target) throw new Error(`World entity ${input.op.payload.targetEntityKey} not found.`)
    const changes = input.op.payload.changes
    const nextAliases = changes.aliases ? Array.from(new Set([...target.aliases, ...changes.aliases])) : target.aliases
    const nextTags = changes.tags ? Array.from(new Set([...target.tags, ...changes.tags])) : target.tags
    const nextSummary = typeof changes.summary === 'string' && !target.summary.trim() ? changes.summary : target.summary
    const updateResponse = await input.client
      .from('world_entities')
      .update({
        aliases: nextAliases,
        tags: nextTags,
        summary: nextSummary,
        metadata: {
          ...(target.metadata ?? {}),
          ...(changes.metadata ?? {}),
        },
      })
      .eq('draft_id', input.snapshot.draft.id)
      .eq('key', target.key)
      .select('id, key, name, summary, node_type, aliases, tags, status, thumbnail_asset_key, linked_definition_key, source, custom_properties, metadata, created_at, updated_at')
      .single()
    if (updateResponse.error) throw new Error(updateResponse.error.message)
    const updatedEntity = worldEntitySchema.parse({
      id: updateResponse.data.id,
      key: updateResponse.data.key,
      name: updateResponse.data.name,
      summary: updateResponse.data.summary ?? '',
      nodeType: updateResponse.data.node_type,
      aliases: updateResponse.data.aliases ?? [],
      tags: updateResponse.data.tags ?? [],
      status: updateResponse.data.status,
      thumbnailAssetKey: updateResponse.data.thumbnail_asset_key,
      linkedDefinitionKey: updateResponse.data.linked_definition_key,
      source: updateResponse.data.source,
      customProperties: updateResponse.data.custom_properties ?? {},
      metadata: updateResponse.data.metadata ?? {},
      createdAt: updateResponse.data.created_at,
      updatedAt: updateResponse.data.updated_at,
    })
    input.snapshot.worldEntities = input.snapshot.worldEntities.map((entity) => entity.key === updatedEntity.key ? updatedEntity : entity)
    return { applied: { worldEntities: [updatedEntity] }, queue: null, note: null }
  }

  if (input.op.op === 'upsert_relationship') {
    const relationship = input.op.payload.relationship
    const existing = input.op.payload.targetRelationshipKey
      ? input.snapshot.worldRelationships.find((entry) => entry.key === input.op.payload.targetRelationshipKey) ?? null
      : null
    if (existing) {
      const nextNotes = [existing.notes, relationship.notes].filter(Boolean).join('\n').trim()
      const updateResponse = await input.client
        .from('world_relationships')
        .update({
          notes: nextNotes,
          metadata: {
            ...(existing.metadata ?? {}),
            ...(relationship.metadata ?? {}),
          },
        })
        .eq('draft_id', input.snapshot.draft.id)
        .eq('key', existing.key)
        .select('id, key, source_entity_id, target_entity_id, verb, direction, strength, confidence, source, notes, state, metadata, created_at, updated_at')
        .single()
      if (updateResponse.error) throw new Error(updateResponse.error.message)
      const updated = worldRelationshipSchema.parse({
        id: updateResponse.data.id,
        key: updateResponse.data.key,
        sourceEntityKey: relationship.sourceEntityKey,
        targetEntityKey: relationship.targetEntityKey,
        verb: updateResponse.data.verb,
        direction: updateResponse.data.direction,
        strength: updateResponse.data.strength,
        confidence: updateResponse.data.confidence,
        source: updateResponse.data.source,
        notes: updateResponse.data.notes ?? '',
        state: updateResponse.data.state,
        metadata: updateResponse.data.metadata ?? {},
        createdAt: updateResponse.data.created_at,
        updatedAt: updateResponse.data.updated_at,
      })
      input.snapshot.worldRelationships = input.snapshot.worldRelationships.map((entry) => entry.key === updated.key ? updated : entry)
      return { applied: { worldRelationships: [updated] }, queue: null, note: null }
    }

    if (!relationship.sourceEntityKey || !relationship.targetEntityKey) {
      throw new Error('Relationship endpoints must be resolved before apply.')
    }
    const key = buildWorldRelationshipKey(input.snapshot, relationship.sourceEntityKey, relationship.verb, relationship.targetEntityKey)
    const sourceEntity = input.snapshot.worldEntities.find((entity) => entity.key === relationship.sourceEntityKey) ?? null
    const targetEntity = input.snapshot.worldEntities.find((entity) => entity.key === relationship.targetEntityKey) ?? null
    if (!sourceEntity || !targetEntity) {
      throw new Error('Relationship endpoints are missing.')
    }
    const insertResponse = await input.client
      .from('world_relationships')
      .insert({
        draft_id: input.snapshot.draft.id,
        key,
        source_entity_id: sourceEntity.id,
        target_entity_id: targetEntity.id,
        verb: relationship.verb,
        direction: relationship.direction,
        strength: relationship.strength,
        confidence: relationship.confidence,
        source: relationship.source,
        notes: relationship.notes,
        state: relationship.state,
        metadata: relationship.metadata,
      })
      .select('id, key, source_entity_id, target_entity_id, verb, direction, strength, confidence, source, notes, state, metadata, created_at, updated_at')
      .single()
    if (insertResponse.error) throw new Error(insertResponse.error.message)
    const created = worldRelationshipSchema.parse({
      id: insertResponse.data.id,
      key: insertResponse.data.key,
      sourceEntityKey: sourceEntity.key,
      targetEntityKey: targetEntity.key,
      verb: insertResponse.data.verb,
      direction: insertResponse.data.direction,
      strength: insertResponse.data.strength,
      confidence: insertResponse.data.confidence,
      source: insertResponse.data.source,
      notes: insertResponse.data.notes ?? '',
      state: insertResponse.data.state,
      metadata: insertResponse.data.metadata ?? {},
      createdAt: insertResponse.data.created_at,
      updatedAt: insertResponse.data.updated_at,
    })
    input.snapshot.worldRelationships = [...input.snapshot.worldRelationships, created]
    return { applied: { worldRelationships: [created] }, queue: null, note: null }
  }

  if (input.op.op === 'update_relationship') {
    const target = input.snapshot.worldRelationships.find((relationship) => relationship.key === input.op.payload.targetRelationshipKey) ?? null
    if (!target) throw new Error(`World relationship ${input.op.payload.targetRelationshipKey} not found.`)
    const nextNotes = [target.notes, input.op.payload.changes.notes ?? ''].filter(Boolean).join('\n').trim() || target.notes
    const updateResponse = await input.client
      .from('world_relationships')
      .update({
        notes: nextNotes,
        metadata: {
          ...(target.metadata ?? {}),
          ...(input.op.payload.changes.metadata ?? {}),
        },
      })
      .eq('draft_id', input.snapshot.draft.id)
      .eq('key', target.key)
      .select('id, key, source_entity_id, target_entity_id, verb, direction, strength, confidence, source, notes, state, metadata, created_at, updated_at')
      .single()
    if (updateResponse.error) throw new Error(updateResponse.error.message)
    const updated = worldRelationshipSchema.parse({
      id: updateResponse.data.id,
      key: updateResponse.data.key,
      sourceEntityKey: target.sourceEntityKey,
      targetEntityKey: target.targetEntityKey,
      verb: updateResponse.data.verb,
      direction: updateResponse.data.direction,
      strength: updateResponse.data.strength,
      confidence: updateResponse.data.confidence,
      source: updateResponse.data.source,
      notes: updateResponse.data.notes ?? '',
      state: updateResponse.data.state,
      metadata: updateResponse.data.metadata ?? {},
      createdAt: updateResponse.data.created_at,
      updatedAt: updateResponse.data.updated_at,
    })
    input.snapshot.worldRelationships = input.snapshot.worldRelationships.map((relationship) => relationship.key === updated.key ? updated : relationship)
    return { applied: { worldRelationships: [updated] }, queue: null, note: null }
  }

  if (input.op.op === 'create_derived_result') {
    const sourceEntity = input.snapshot.worldEntities.find((entity) => entity.key === input.op.payload.sourceEntityKey) ?? null
    const targetEntity = input.snapshot.worldEntities.find((entity) => entity.key === input.op.payload.targetEntityKey) ?? null
    if (!sourceEntity || !targetEntity) throw new Error('Derived result requires both source and target entities.')
    const operatorKey = buildWorldOperatorKey(input.snapshot, sourceEntity.key, input.op.payload.operatorType, targetEntity.key)
    const operatorInsert = await input.client
      .from('world_operators')
      .insert({
        draft_id: input.snapshot.draft.id,
        key: operatorKey,
        operator_type: input.op.payload.operatorType,
        input_entity_keys: [sourceEntity.key, targetEntity.key],
        label: '',
        status: 'active',
        metadata: input.op.payload.metadata,
      })
      .select('id, key, operator_type, input_entity_keys, label, status, metadata, created_at, updated_at')
      .single()
    if (operatorInsert.error) throw new Error(operatorInsert.error.message)
    const resultTitle = input.op.payload.title?.trim() || `${sourceEntity.name} ${targetEntity.name}`
    const resultKey = buildWorldResultKey(input.snapshot, resultTitle)
    const resultInsert = await input.client
      .from('world_results')
      .insert({
        draft_id: input.snapshot.draft.id,
        key: resultKey,
        result_type: input.op.payload.operatorType === 'place_in' ? 'scene_setup' : input.op.payload.operatorType === 'paired_with' ? 'paired_subject' : input.op.payload.operatorType === 'stage_scene' ? 'staged_character' : input.op.payload.operatorType === 'wear' ? 'look_variant' : 'equipped_variant',
        source_operator_key: operatorKey,
        title: resultTitle,
        summary: input.op.payload.summary,
        preview_asset_key: sourceEntity.thumbnailAssetKey ?? targetEntity.thumbnailAssetKey ?? null,
        status: 'draft',
        metadata: input.op.payload.metadata,
      })
      .select('id, key, result_type, source_operator_key, title, summary, preview_asset_key, status, metadata, created_at, updated_at')
      .single()
    if (resultInsert.error) throw new Error(resultInsert.error.message)
    const connectionInsert = await input.client
      .from('world_graph_connections')
      .insert([
        {
          draft_id: input.snapshot.draft.id,
          key: buildWorldConnectionKey(input.snapshot, `${sourceEntity.key}-to-${operatorKey}`),
          source_node_key: sourceEntity.key,
          source_node_kind: 'entity',
          target_node_key: operatorKey,
          target_node_kind: 'operator',
          role: 'input',
          metadata: {},
        },
        {
          draft_id: input.snapshot.draft.id,
          key: buildWorldConnectionKey(input.snapshot, `${targetEntity.key}-to-${operatorKey}`),
          source_node_key: targetEntity.key,
          source_node_kind: 'entity',
          target_node_key: operatorKey,
          target_node_kind: 'operator',
          role: 'input',
          metadata: {},
        },
        {
          draft_id: input.snapshot.draft.id,
          key: buildWorldConnectionKey(input.snapshot, `${operatorKey}-to-${resultKey}`),
          source_node_key: operatorKey,
          source_node_kind: 'operator',
          target_node_key: resultKey,
          target_node_kind: 'result',
          role: 'output',
          metadata: {},
        },
      ])
      .select('id, key, source_node_key, source_node_kind, target_node_key, target_node_kind, role, metadata, created_at, updated_at')
    if (connectionInsert.error) throw new Error(connectionInsert.error.message)
    const operator: WorldOperator = {
      id: operatorInsert.data.id,
      key: operatorInsert.data.key,
      operatorType: operatorInsert.data.operator_type,
      inputEntityKeys: operatorInsert.data.input_entity_keys ?? [],
      label: operatorInsert.data.label ?? '',
      status: operatorInsert.data.status,
      metadata: operatorInsert.data.metadata ?? {},
      createdAt: operatorInsert.data.created_at,
      updatedAt: operatorInsert.data.updated_at,
    }
    const result: WorldResult = {
      id: resultInsert.data.id,
      key: resultInsert.data.key,
      resultType: resultInsert.data.result_type,
      sourceOperatorKey: resultInsert.data.source_operator_key,
      title: resultInsert.data.title,
      summary: resultInsert.data.summary ?? '',
      previewAssetKey: resultInsert.data.preview_asset_key,
      status: resultInsert.data.status,
      metadata: resultInsert.data.metadata ?? {},
      createdAt: resultInsert.data.created_at,
      updatedAt: resultInsert.data.updated_at,
    }
    const connections: WorldGraphConnection[] = ((connectionInsert.data ?? []) as Array<Record<string, unknown>>).map((entry) => ({
      id: String(entry.id),
      key: String(entry.key),
      sourceNodeKey: String(entry.source_node_key),
      sourceNodeKind: entry.source_node_kind as WorldGraphConnection['sourceNodeKind'],
      targetNodeKey: String(entry.target_node_key),
      targetNodeKind: entry.target_node_kind as WorldGraphConnection['targetNodeKind'],
      role: entry.role as WorldGraphConnection['role'],
      metadata: (entry.metadata as Record<string, unknown>) ?? {},
      createdAt: String(entry.created_at),
      updatedAt: String(entry.updated_at),
    }))
    input.snapshot.worldOperators = [...input.snapshot.worldOperators, operator]
    input.snapshot.worldResults = [...input.snapshot.worldResults, result]
    input.snapshot.worldGraphConnections = [...input.snapshot.worldGraphConnections, ...connections]
    return {
      applied: {
        worldOperators: [operator],
        worldResults: [result],
        worldGraphConnections: connections,
      },
      queue: null,
      note: null,
    }
  }

  if (input.op.op === 'queue_image_generation') {
    const target = input.snapshot.worldEntities.find((entity) => entity.key === input.op.payload.targetEntityKey) ?? null
    const definitionKey = input.op.payload.definitionKey ?? target?.linkedDefinitionKey ?? null
    if (!target || !definitionKey) throw new Error('Image generation requires a linked entity definition.')
    const definition = input.snapshot.definitions.find((entry) => entry.key === definitionKey) ?? null
    if (!definition) throw new Error(`Definition ${definitionKey} not found.`)
    const kind = definition.kind === 'character' ? 'character' : definition.kind === 'environment' ? 'environment' : definition.kind === 'item' ? 'item' : null
    if (!kind) throw new Error('Only character, environment, and item definitions can queue concept images.')
    const pendingGenerationMetadata = {
      ...(target.metadata ?? {}),
      generation: {
        jobId: `world-prompt-image:${input.op.id}`,
        state: 'pending',
        placeholder: true,
        source: 'global_prompt',
      },
    }
    const entityUpdate = await input.client
      .from('world_entities')
      .update({
        metadata: pendingGenerationMetadata,
      })
      .eq('draft_id', input.snapshot.draft.id)
      .eq('key', target.key)
      .select('id, key, name, summary, node_type, aliases, tags, status, thumbnail_asset_key, linked_definition_key, source, custom_properties, metadata, created_at, updated_at')
      .single()
    if (entityUpdate.error) throw new Error(entityUpdate.error.message)
    const updatedEntity = worldEntitySchema.parse({
      id: entityUpdate.data.id,
      key: entityUpdate.data.key,
      name: entityUpdate.data.name,
      summary: entityUpdate.data.summary ?? '',
      nodeType: entityUpdate.data.node_type,
      aliases: entityUpdate.data.aliases ?? [],
      tags: entityUpdate.data.tags ?? [],
      status: entityUpdate.data.status,
      thumbnailAssetKey: entityUpdate.data.thumbnail_asset_key,
      linkedDefinitionKey: entityUpdate.data.linked_definition_key,
      source: entityUpdate.data.source,
      customProperties: entityUpdate.data.custom_properties ?? {},
      metadata: entityUpdate.data.metadata ?? {},
      createdAt: entityUpdate.data.created_at,
      updatedAt: entityUpdate.data.updated_at,
    })
    input.snapshot.worldEntities = input.snapshot.worldEntities.map((entity) => entity.key === updatedEntity.key ? updatedEntity : entity)
    const status = await invokeEdgeFunction<WorldBuildStatusResponse>({
      authHeader: input.authHeader,
      functionName: 'start-world-build',
      schema: worldBuildStatusResponseSchema,
      body: {
        plannerMode: 'direct_asset_generation',
        prompt: input.prompt,
        requestSummary: `Generate concept image for ${target.name}`,
        snapshot: input.snapshot,
        planItems: [{
          id: `direct_asset_${target.key}`,
          kind,
          name: definition.name,
          summary: definition.summary,
          dependsOn: [],
          enabled: true,
          generationOptions: {
            generateConceptImage: true,
            existingDefinitionKey: definitionKey,
          },
        }],
        cinematicPlan: null,
        model: input.model,
      },
    })
    return {
      applied: {
        worldEntities: [updatedEntity],
      },
      queue: {
        type: 'image_generation',
        batchId: status.batch.id,
        targetEntityKey: target.key,
        definitionKey,
        batch: status.batch as unknown as Record<string, unknown>,
        definitions: status.definitions as Array<Record<string, unknown>>,
        graphs: status.graphs as Array<Record<string, unknown>>,
        assets: status.assets as Array<Record<string, unknown>>,
        cinematicRuns: status.cinematicRuns as Array<Record<string, unknown>>,
      },
      note: null,
    }
  }

  if (input.op.op === 'queue_cinematic_generation') {
    const plan = await invokeEdgeFunction<WorldBuildPlanResponse>({
      authHeader: input.authHeader,
      functionName: 'plan-world-build',
      schema: worldBuildPlanResponseSchema,
      body: {
        prompt: input.op.payload.prompt || input.prompt,
        plannerModeHint: 'cinematic_build',
        snapshot: input.snapshot,
        model: input.model,
      },
    })
    const status = await invokeEdgeFunction<WorldBuildStatusResponse>({
      authHeader: input.authHeader,
      functionName: 'start-world-build',
      schema: worldBuildStatusResponseSchema,
      body: {
        plannerMode: plan.plannerMode,
        prompt: input.op.payload.prompt || input.prompt,
        requestSummary: plan.requestSummary,
        snapshot: input.snapshot,
        planItems: plan.planItems,
        cinematicPlan: plan.cinematicPlan ?? null,
        model: input.model,
      },
    })
    const firstGraphKey =
      Array.isArray(status.graphs) && status.graphs.length > 0 && typeof (status.graphs[0] as { key?: unknown }).key === 'string'
        ? String((status.graphs[0] as { key: string }).key)
        : null
    return {
      applied: {},
      queue: {
        type: 'cinematic_generation',
        batchId: status.batch.id,
        graphKey: firstGraphKey,
        batch: status.batch as unknown as Record<string, unknown>,
        definitions: status.definitions as Array<Record<string, unknown>>,
        graphs: status.graphs as Array<Record<string, unknown>>,
        assets: status.assets as Array<Record<string, unknown>>,
        cinematicRuns: status.cinematicRuns as Array<Record<string, unknown>>,
      },
      note: null,
    }
  }

  throw new Error(`Unsupported world prompt op ${input.op.op}.`)
}

async function updateTurn(client: SupabaseClient, turnId: string, changes: Record<string, unknown>) {
  const response = await client
    .from('world_prompt_turns')
    .update(changes)
    .eq('id', turnId)
    .select(TURN_SELECT)
    .single()
  if (response.error) throw new Error(response.error.message)
  return mapTurnRow(response.data as WorldPromptTurnRow)
}

async function loadTurnById(client: SupabaseClient, turnId: string) {
  const response = await client
    .from('world_prompt_turns')
    .select(TURN_SELECT)
    .eq('id', turnId)
    .single()
  if (response.error) throw new Error(response.error.message)
  return mapTurnRow(response.data as WorldPromptTurnRow)
}

async function isTurnCancelled(client: SupabaseClient, turnId: string) {
  const turn = await loadTurnById(client, turnId)
  return turn.status === 'cancelled'
}

function mergePreviewItemStatuses(input: {
  preview: WorldPromptPlanPreview
  appliedOpIds: string[]
}) {
  const appliedSet = new Set(input.appliedOpIds)
  return worldPromptPlanPreviewSchema.parse({
    ...input.preview,
    items: input.preview.items.map((item) => ({
      ...item,
      status: appliedSet.has(item.id) ? 'applied' : item.status,
    })),
    appliedAt: appliedSet.size > 0 ? new Date().toISOString() : input.preview.appliedAt,
  })
}

function stopExecutionError() {
  return new Error('__WORLD_PROMPT_TURN_CANCELLED__')
}

function isStopExecutionError(error: unknown) {
  return error instanceof Error && error.message === '__WORLD_PROMPT_TURN_CANCELLED__'
}

async function throwIfTurnCancelled(client: SupabaseClient, turnId: string) {
  if (await isTurnCancelled(client, turnId)) {
    throw stopExecutionError()
  }
}

function summarizeAppliedOps(ops: PromptToWorldOp[]) {
  const summary = ops
    .filter((op) => op.op !== 'assistant_note')
    .map((op) => {
      switch (op.op) {
        case 'upsert_entity':
          return op.payload.entity.name
        case 'upsert_relationship':
          return op.payload.relationship.verb
        case 'create_derived_result':
          return op.payload.title ?? op.payload.operatorType
        case 'queue_image_generation':
          return 'image generation'
        case 'queue_cinematic_generation':
          return 'cinematic generation'
        default:
          return op.op
      }
    })
  return summary.length > 0 ? summary.join(', ') : 'No world graph changes were required.'
}

export async function startWorldPromptTurn(input: {
  client: SupabaseClient
  authHeader: string
  payload: unknown
}) {
  const payload = worldPromptStartTurnRequestSchema.parse(input.payload)
  const session = await ensurePromptSession({ client: input.client, payload })
  const existingMessages = await loadSessionMessages(input.client, session.id)
  const compacted = compactMessageHistory(session.summaryMemory, existingMessages)
  let workingSession = session
  if (compacted.compacted) {
    const sessionUpdate = await input.client
      .from('world_prompt_sessions')
      .update({ summary_memory: compacted.summaryMemory })
      .eq('id', session.id)
      .select(SESSION_SELECT)
      .single()
    if (sessionUpdate.error) throw new Error(sessionUpdate.error.message)
    workingSession = mapSessionRow(sessionUpdate.data as WorldPromptSessionRow)
  }

  const insertedTurn = await input.client
    .from('world_prompt_turns')
    .insert({
      draft_id: payload.snapshot.draft.id,
      session_id: workingSession.id,
      prompt: payload.prompt,
      status: 'streaming',
      model: payload.model,
      resolved_context: {
        summaryMemory: compacted.summaryMemory,
        selectedRootEntityKey: payload.selectedRootEntityKey,
        selectedViewKey: payload.selectedViewKey,
        selectedThreadKey: payload.selectedThreadKey,
      },
      approval_state: 'not_required',
      assistant_summary: '',
      metadata: {
        selectedThreadKey: payload.selectedThreadKey,
      },
    })
    .select(TURN_SELECT)
    .single()
  if (insertedTurn.error) throw new Error(insertedTurn.error.message)
  let turn = mapTurnRow(insertedTurn.data as WorldPromptTurnRow)

  const writeEvent = await createEventWriter({
    client: input.client,
    sessionId: workingSession.id,
    turnId: turn.id,
    draftId: payload.snapshot.draft.id,
  })

  try {
    await writeEvent('turn_started', {
      session: workingSession,
      turn,
    })

    const userMessage = await insertPromptMessage({
      client: input.client,
      sessionId: workingSession.id,
      turnId: turn.id,
      draftId: payload.snapshot.draft.id,
      role: 'user',
      content: payload.prompt,
    })
    await writeEvent('message_created', {
      message: userMessage,
      turn: { id: turn.id },
    })

    await writeEvent('planner_status', {
      plannerStatus: 'planning',
      turn: { id: turn.id },
    })

    const generated = await generatePromptPlan({
      payload,
      session: workingSession,
      summaryMemory: compacted.summaryMemory,
      recentMessages: compacted.recentMessages,
    })
    await throwIfTurnCancelled(input.client, turn.id)

    const planningSnapshot = structuredClone(payload.snapshot) as WorldPromptSnapshot
    const sanitizedOps: PromptToWorldOp[] = []
    const plannerOps = generated.wave1Ops.length > 0 ? generated.wave1Ops : generated.operations
    for (const operation of plannerOps) {
      const sanitized = sanitizePromptOp({ op: operation, snapshot: planningSnapshot })
      sanitizedOps.push(sanitized)
      projectSanitizedOpIntoSnapshot(planningSnapshot, sanitized)
    }

    const persistedThreads = await upsertWorldThreads({
      client: input.client,
      draftId: payload.snapshot.draft.id,
      turnId: turn.id,
      snapshot: planningSnapshot,
      selectedThreadKey: payload.selectedThreadKey,
      threadCandidates: generated.threadCandidates,
    })

    const plannerSuggestions = dedupeSuggestions([
      ...suggestionsFromPlannerIdeas({
        ideas: generated.suggestionCandidates,
        fallbackKind: 'continue_scope',
      }),
      ...suggestionsFromPlannerIdeas({
        ideas: generated.wave2Ideas,
        fallbackKind: 'continue_scope',
      }),
      ...suggestionsFromPlannerIdeas({
        ideas: generated.optionalIdeas,
        fallbackKind: 'continue_scope',
      }),
    ])

    const execution = classifyPromptExecution({
      prompt: payload.prompt,
      snapshot: payload.snapshot,
      ops: sanitizedOps,
      classificationHint: generated.classification ?? null,
      suggestionCandidates: plannerSuggestions,
      selectedThreadKey: payload.selectedThreadKey,
      assistantSummary: generated.assistantSummary,
    })

    await writeEvent('planner_status', {
      plannerStatus: 'scoping',
      classification: execution.classification,
      scope: execution.scope,
      preview: execution.preview ?? undefined,
      suggestions: execution.suggestions,
      threads: persistedThreads,
      turn: { id: turn.id },
    })

    const mutableSnapshot = structuredClone(payload.snapshot) as WorldPromptSnapshot
    let pendingApprovals = 0
    const opsToRun = execution.selectedOps

    if (execution.mode === 'blocked') {
      await writeEvent('planner_status', {
        plannerStatus: 'blocked',
        classification: execution.classification,
        scope: execution.scope,
        preview: execution.preview ?? undefined,
        suggestions: execution.suggestions,
        threads: persistedThreads,
        note: execution.note,
        turn: { id: turn.id },
      })
    } else if (execution.mode === 'preview') {
      await writeEvent('assistant_note', {
        classification: execution.classification,
        note: execution.note,
        preview: execution.preview ?? undefined,
        scope: execution.scope,
        suggestions: execution.suggestions,
        threads: persistedThreads,
        turn: { id: turn.id },
      })
    } else {
      await writeEvent('planner_status', {
        plannerStatus: 'applying',
        classification: execution.classification,
        scope: execution.scope,
        preview: execution.preview ?? undefined,
        suggestions: execution.suggestions,
        threads: persistedThreads,
        turn: { id: turn.id },
      })

      for (const op of opsToRun) {
        await throwIfTurnCancelled(input.client, turn.id)
        if (op.op === 'assistant_note') {
          await writeEvent('assistant_note', {
            op,
            note: op.payload.message,
            classification: execution.classification,
            scope: execution.scope,
          }, { opId: op.id })
          continue
        }

        if (op.applyMode === 'needs_approval') {
          pendingApprovals += 1
          await writeEvent('op_needs_approval', {
            op,
            diagnostics: ['This change requires approval before it can be applied.'],
            classification: execution.classification,
            scope: execution.scope,
          }, { opId: op.id })
          continue
        }

        const result = await applyPromptOp({
          client: input.client,
          authHeader: input.authHeader,
          model: payload.model,
          snapshot: mutableSnapshot,
          prompt: payload.prompt,
          op,
        })

        if (result.note) {
          await writeEvent('assistant_note', {
            op,
            note: result.note,
            classification: execution.classification,
            scope: execution.scope,
          }, { opId: op.id })
        } else {
          await writeEvent('op_applied', {
            op: { ...op, status: 'applied' },
            applied: result.applied,
            classification: execution.classification,
            scope: execution.scope,
          }, { opId: op.id })
        }

        if (result.queue) {
          await writeEvent('queue_started', {
            op: { ...op, status: 'applied' },
            queue: result.queue,
            classification: execution.classification,
            scope: execution.scope,
          }, { opId: op.id })
        }
      }
    }

    if (execution.note || execution.suggestions.length > 0) {
      await writeEvent('assistant_note', {
        classification: execution.classification,
        note: execution.note,
        preview: execution.preview ?? undefined,
        suggestions: execution.suggestions,
        scope: execution.scope,
        threads: persistedThreads,
      })
    }

    const generatedSummary = generated.assistantSummary.trim()
    const assistantSummary = [
      execution.note || null,
      execution.mode === 'blocked'
        ? generatedSummary || null
        : generatedSummary || summarizeAppliedOps(opsToRun),
    ].filter((value, index, values) => Boolean(value) && values.indexOf(value) === index).join('\n\n')

    const assistantMessage = await insertPromptMessage({
      client: input.client,
      sessionId: workingSession.id,
      turnId: turn.id,
      draftId: payload.snapshot.draft.id,
      role: 'assistant',
      content: assistantSummary,
      metadata: {
        opCount: opsToRun.length,
        classification: execution.classification,
        preview: execution.preview,
        scopeDecision: execution.scope,
        suggestions: execution.suggestions,
        threads: persistedThreads,
      },
    })
    await writeEvent('message_created', {
      message: assistantMessage,
      turn: { id: turn.id },
    })

    turn = await updateTurn(input.client, turn.id, {
      status: execution.mode === 'direct' && pendingApprovals > 0 ? 'awaiting_approval' : 'completed',
      approval_state: pendingApprovals > 0 ? 'pending' : 'not_required',
      assistant_summary: assistantSummary,
      metadata: {
        opCount: opsToRun.length,
        pendingApprovalCount: pendingApprovals,
        classification: execution.classification,
        preview: execution.preview,
        scopeDecision: execution.scope,
        selectedThreadKey: payload.selectedThreadKey,
      },
    })

    await writeEvent('planner_status', {
      plannerStatus: execution.mode === 'direct' && pendingApprovals > 0 ? 'awaiting_approval' : 'completed',
      classification: execution.classification,
      preview: execution.preview ?? undefined,
      scope: execution.scope,
      suggestions: execution.suggestions,
      threads: persistedThreads,
      turn,
    })

    await writeEvent('turn_completed', {
      turn,
      classification: execution.classification,
      preview: execution.preview ?? undefined,
      threads: persistedThreads,
      note: pendingApprovals > 0 ? `${pendingApprovals} change(s) waiting for approval.` : assistantSummary,
    })
    return worldPromptStartTurnResponseSchema.parse({
      ok: true,
      session: workingSession,
      turn,
    })
  } catch (error) {
    if (isStopExecutionError(error)) {
      const cancelledMessage = 'Turn cancelled. Future ops and new queued work from this turn were stopped.'
      turn = await updateTurn(input.client, turn.id, {
        status: 'cancelled',
        approval_state: 'not_required',
        assistant_summary: cancelledMessage,
        error_message: null,
      })
      const assistantMessage = await insertPromptMessage({
        client: input.client,
        sessionId: workingSession.id,
        turnId: turn.id,
        draftId: payload.snapshot.draft.id,
        role: 'assistant',
        content: cancelledMessage,
        metadata: {
          cancelled: true,
        },
      })
      await writeEvent('message_created', {
        message: assistantMessage,
        turn,
      })
      await writeEvent('turn_completed', {
        turn,
        note: cancelledMessage,
      })
      return worldPromptStartTurnResponseSchema.parse({
        ok: true,
        session: workingSession,
        turn,
      })
    }
    turn = await updateTurn(input.client, turn.id, {
      status: 'failed',
      approval_state: 'not_required',
      error_message: error instanceof Error ? error.message : 'World prompt turn failed.',
    })
    await writeEvent('turn_failed', {
      turn,
      diagnostics: [error instanceof Error ? error.message : 'World prompt turn failed.'],
    })
    throw error
  }
}

async function loadPendingOp(client: SupabaseClient, turnId: string, opId: string) {
  const response = await client
    .from('world_prompt_events')
    .select(EVENT_SELECT)
    .eq('turn_id', turnId)
    .eq('op_id', opId)
    .order('sequence', { ascending: true })
  if (response.error) throw new Error(response.error.message)
  const rows = (response.data ?? []) as WorldPromptEventRow[]
  const needsApproval = rows.find((row) => row.event_type === 'op_needs_approval') ?? null
  const alreadyResolved = rows.some((row) => row.event_type === 'op_approved' || row.event_type === 'op_rejected' || row.event_type === 'op_applied')
  if (!needsApproval || alreadyResolved) {
    return null
  }
  return {
    event: mapEventRow(needsApproval),
    op: promptToWorldOpSchema.parse((needsApproval.payload ?? {}).op),
  }
}

async function finalizeTurnApprovalState(client: SupabaseClient, turnId: string) {
  const response = await client
    .from('world_prompt_events')
    .select('event_type')
    .eq('turn_id', turnId)
  if (response.error) throw new Error(response.error.message)
  const rows = (response.data ?? []) as Array<{ event_type: string }>
  const pending = rows.filter((row) => row.event_type === 'op_needs_approval').length
  const resolved = rows.filter((row) => row.event_type === 'op_approved' || row.event_type === 'op_rejected' || row.event_type === 'op_applied').length
  const hasPending = pending > resolved
  return updateTurn(client, turnId, {
    status: hasPending ? 'awaiting_approval' : 'completed',
    approval_state: hasPending ? 'pending' : 'resolved',
  })
}

export async function approveWorldPromptOp(input: {
  client: SupabaseClient
  authHeader: string
  payload: unknown
}) {
  const payload = worldPromptResolveOpRequestSchema.parse(input.payload)
  const pending = await loadPendingOp(input.client, payload.turnId, payload.opId)
  if (!pending) {
    throw new Error('The selected world prompt op is no longer pending approval.')
  }
  const turnResponse = await input.client
    .from('world_prompt_turns')
    .select(TURN_SELECT)
    .eq('id', payload.turnId)
    .single()
  if (turnResponse.error) throw new Error(turnResponse.error.message)
  const turn = mapTurnRow(turnResponse.data as WorldPromptTurnRow)
  const writeEvent = await createEventWriter({
    client: input.client,
    sessionId: turn.sessionId,
    turnId: turn.id,
    draftId: turn.draftId,
  })
  const mutableSnapshot = structuredClone(payload.snapshot) as WorldPromptSnapshot
  const result = await applyPromptOp({
    client: input.client,
    authHeader: input.authHeader,
    model: turn.model,
    snapshot: mutableSnapshot,
    prompt: turn.prompt,
    op: { ...pending.op, status: 'approved' },
  })
  await writeEvent('op_approved', {
    op: { ...pending.op, status: 'approved' },
    applied: result.applied,
  }, { opId: pending.op.id })
  if (result.queue) {
    await writeEvent('queue_started', {
      op: { ...pending.op, status: 'approved' },
      queue: result.queue,
    }, { opId: pending.op.id })
  }
  const updatedTurn = await finalizeTurnApprovalState(input.client, turn.id)
  return worldPromptResolveOpResponseSchema.parse({
    ok: true,
    turn: updatedTurn,
  })
}

export async function rejectWorldPromptOp(input: {
  client: SupabaseClient
  payload: unknown
}) {
  const payload = worldPromptResolveOpRequestSchema.parse(input.payload)
  const pending = await loadPendingOp(input.client, payload.turnId, payload.opId)
  if (!pending) {
    throw new Error('The selected world prompt op is no longer pending approval.')
  }
  const turnResponse = await input.client
    .from('world_prompt_turns')
    .select(TURN_SELECT)
    .eq('id', payload.turnId)
    .single()
  if (turnResponse.error) throw new Error(turnResponse.error.message)
  const turn = mapTurnRow(turnResponse.data as WorldPromptTurnRow)
  const writeEvent = await createEventWriter({
    client: input.client,
    sessionId: turn.sessionId,
    turnId: turn.id,
    draftId: turn.draftId,
  })
  await writeEvent('op_rejected', {
    op: { ...pending.op, status: 'rejected' },
    diagnostics: ['This op was rejected by the user.'],
  }, { opId: pending.op.id })
  const updatedTurn = await finalizeTurnApprovalState(input.client, turn.id)
  return worldPromptResolveOpResponseSchema.parse({
    ok: true,
    turn: updatedTurn,
  })
}

export async function applyWorldPromptPreview(input: {
  client: SupabaseClient
  authHeader: string
  payload: unknown
}) {
  const payload = worldPromptApplyPreviewRequestSchema.parse(input.payload)
  let turn = await loadTurnById(input.client, payload.turnId)
  const preview = turn.metadata?.preview ? worldPromptPlanPreviewSchema.parse(turn.metadata.preview) : null
  if (!preview || preview.pendingOps.length === 0 || !preview.canApplyFirstWave) {
    throw new Error('This turn does not have an applyable preview.')
  }
  if (preview.appliedAt) {
    throw new Error('This preview has already been applied.')
  }

  const writeEvent = await createEventWriter({
    client: input.client,
    sessionId: turn.sessionId,
    turnId: turn.id,
    draftId: turn.draftId,
  })

  await writeEvent('planner_status', {
    plannerStatus: 'applying',
    classification: turn.metadata?.classification as WorldPromptClassification | undefined,
    preview,
    scope: preview.scopeDecision,
    suggestions: preview.suggestions,
    turn: { id: turn.id },
  })

  const mutableSnapshot = structuredClone(payload.snapshot) as WorldPromptSnapshot
  const appliedOpIds: string[] = []
  let pendingApprovals = 0

  for (const rawOp of preview.pendingOps) {
    await throwIfTurnCancelled(input.client, turn.id)
    const op = sanitizePromptOp({ op: rawOp, snapshot: mutableSnapshot })

    if (op.op === 'assistant_note') {
      await writeEvent('assistant_note', {
        classification: turn.metadata?.classification as WorldPromptClassification | undefined,
        op,
        note: op.payload.message,
        preview,
        scope: preview.scopeDecision,
      }, { opId: op.id })
      continue
    }

    if (op.applyMode === 'needs_approval') {
      pendingApprovals += 1
      await writeEvent('op_needs_approval', {
        classification: turn.metadata?.classification as WorldPromptClassification | undefined,
        op,
        preview,
        scope: preview.scopeDecision,
        diagnostics: ['This preview op now requires approval before it can be applied.'],
      }, { opId: op.id })
      continue
    }

    const result = await applyPromptOp({
      client: input.client,
      authHeader: input.authHeader,
      model: turn.model,
      snapshot: mutableSnapshot,
      prompt: turn.prompt,
      op,
    })
    appliedOpIds.push(op.id)

    if (result.note) {
      await writeEvent('assistant_note', {
        classification: turn.metadata?.classification as WorldPromptClassification | undefined,
        op,
        note: result.note,
        preview,
        scope: preview.scopeDecision,
      }, { opId: op.id })
    } else {
      await writeEvent('op_applied', {
        classification: turn.metadata?.classification as WorldPromptClassification | undefined,
        op: { ...op, status: 'applied' },
        applied: result.applied,
        preview,
        scope: preview.scopeDecision,
      }, { opId: op.id })
    }

    if (result.queue) {
      await writeEvent('queue_started', {
        classification: turn.metadata?.classification as WorldPromptClassification | undefined,
        op: { ...op, status: 'applied' },
        queue: result.queue,
        preview,
        scope: preview.scopeDecision,
      }, { opId: op.id })
    }
  }

  const nextPreview = mergePreviewItemStatuses({
    preview,
    appliedOpIds,
  })
  const assistantSummary = [
    turn.assistantSummary.trim(),
    appliedOpIds.length > 0 ? `Applied preview first wave: ${summarizeAppliedOps(preview.pendingOps.filter((op) => appliedOpIds.includes(op.id)))}` : null,
  ].filter(Boolean).join('\n\n')

  turn = await updateTurn(input.client, turn.id, {
    status: pendingApprovals > 0 ? 'awaiting_approval' : 'completed',
    approval_state: pendingApprovals > 0 ? 'pending' : turn.approvalState,
    assistant_summary: assistantSummary,
    metadata: {
      ...(turn.metadata ?? {}),
      preview: nextPreview,
    },
  })

  await writeEvent('assistant_note', {
    classification: turn.metadata?.classification as WorldPromptClassification | undefined,
    note: appliedOpIds.length > 0 ? 'Applied the previewed first wave.' : 'The preview did not contain any directly applicable ops.',
    preview: nextPreview,
    scope: nextPreview.scopeDecision,
    suggestions: nextPreview.suggestions,
    turn,
  })

  await writeEvent('planner_status', {
    plannerStatus: pendingApprovals > 0 ? 'awaiting_approval' : 'completed',
    classification: turn.metadata?.classification as WorldPromptClassification | undefined,
    preview: nextPreview,
    scope: nextPreview.scopeDecision,
    suggestions: nextPreview.suggestions,
    turn,
  })

  await writeEvent('turn_completed', {
    classification: turn.metadata?.classification as WorldPromptClassification | undefined,
    preview: nextPreview,
    note: pendingApprovals > 0 ? `${pendingApprovals} preview change(s) waiting for approval.` : 'Preview first wave applied.',
    turn,
  })

  return worldPromptApplyPreviewResponseSchema.parse({
    ok: true,
    turn,
  })
}

export async function cancelWorldPromptTurn(input: {
  client: SupabaseClient
  payload: unknown
}) {
  const payload = worldPromptCancelTurnRequestSchema.parse(input.payload)
  let turn = await loadTurnById(input.client, payload.turnId)
  if (!['queued', 'streaming', 'awaiting_approval'].includes(turn.status)) {
    return worldPromptCancelTurnResponseSchema.parse({
      ok: true,
      turn,
    })
  }

  const writeEvent = await createEventWriter({
    client: input.client,
    sessionId: turn.sessionId,
    turnId: turn.id,
    draftId: turn.draftId,
  })

  turn = await updateTurn(input.client, turn.id, {
    status: 'cancelled',
    approval_state: 'not_required',
    assistant_summary: turn.assistantSummary || 'Turn cancelled.',
    error_message: null,
  })

  await writeEvent('turn_cancel_requested', {
    classification: turn.metadata?.classification as WorldPromptClassification | undefined,
    note: 'Cancellation requested. Future ops for this turn will stop.',
    turn,
  })
  await writeEvent('assistant_note', {
    classification: turn.metadata?.classification as WorldPromptClassification | undefined,
    note: 'Turn cancelled. Already-applied graph changes remain, but later ops and new queued work from this turn were stopped.',
    turn,
  })
  await writeEvent('turn_completed', {
    classification: turn.metadata?.classification as WorldPromptClassification | undefined,
    note: 'Turn cancelled.',
    turn,
  })

  return worldPromptCancelTurnResponseSchema.parse({
    ok: true,
    turn,
  })
}
