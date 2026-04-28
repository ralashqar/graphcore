import { z } from 'zod'

import type { WorldThread } from './worldThread.ts'
import { worldThreadPrioritySchema, worldThreadStatusSchema } from './worldThread.ts'

const looseRecordSchema = z.record(z.string(), z.unknown())

export const plannerThreadLinkModeSchema = z.enum(['merge', 'replace'])
export const plannerThreadActionKindSchema = z.enum([
  'create',
  'update',
  'resolve',
  'park',
  'reprioritize',
  'relink_entities',
])

export const plannerThreadActionSchema = z.object({
  action: plannerThreadActionKindSchema,
  key: z.string(),
  title: z.string().default(''),
  summary: z.string().default(''),
  status: worldThreadStatusSchema.optional(),
  priority: worldThreadPrioritySchema.optional(),
  linkedEntityKeys: z.array(z.string()).default([]),
  linkMode: plannerThreadLinkModeSchema.default('merge'),
  metadata: looseRecordSchema.default({}),
})

export const plannerThreadCandidateSchema = z.object({
  key: z.string(),
  title: z.string(),
  summary: z.string().default(''),
  status: worldThreadStatusSchema.default('open'),
  priority: worldThreadPrioritySchema.default('secondary'),
  linkedEntityKeys: z.array(z.string()).default([]),
  linkMode: plannerThreadLinkModeSchema.default('merge'),
  metadata: looseRecordSchema.default({}),
})

export type PlannerThreadAction = z.infer<typeof plannerThreadActionSchema>
export type PlannerThreadCandidate = z.infer<typeof plannerThreadCandidateSchema>

export type PreparedPlannerThreadMutation = {
  action: z.infer<typeof plannerThreadActionKindSchema>
  key: string
  title: string
  summary: string
  status: WorldThread['status']
  priority: WorldThread['priority']
  linkedEntityKeys: string[]
  metadata: Record<string, unknown>
  existing: boolean
}

export type RejectedPlannerThreadMutation = {
  key: string
  action: string
  reason: string
}

export type PlannerThreadMutationPreparationResult = {
  mutations: PreparedPlannerThreadMutation[]
  rejected: RejectedPlannerThreadMutation[]
  diagnostics: Array<'no_thread_change' | 'thread_actions_applied' | 'thread_actions_rejected'>
}

const PLACEHOLDER_THREAD_TITLES = new Set([
  'emerging story thread',
  'story thread',
  'main thread',
  'new thread',
  'thread',
  'subplot',
  'emerging thread',
  'unresolved thread',
  'mystery thread',
  'political thread',
  'lore thread',
  'character thread',
])

function normalizeLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function isPlaceholderLikeThreadTitle(value: string) {
  const normalized = normalizeLabel(value)
  if (!normalized) return true
  if (PLACEHOLDER_THREAD_TITLES.has(normalized)) return true
  return /^thread(?:\s+\d+)?$/.test(normalized)
}

export function preparePlannerThreadMutations(input: {
  existingThreads: Array<Pick<WorldThread, 'key' | 'title' | 'summary' | 'status' | 'priority' | 'linkedEntityKeys' | 'metadata'>>
  knownEntityKeys: Iterable<string>
  threadActions?: PlannerThreadAction[]
  threadCandidates?: PlannerThreadCandidate[]
}) {
  const knownEntityKeys = new Set(input.knownEntityKeys)
  const workingByKey = new Map(input.existingThreads.map((thread) => [thread.key, thread]))
  const rawActions: Array<PlannerThreadAction | (PlannerThreadCandidate & { action?: undefined })> = (
    input.threadActions && input.threadActions.length > 0
      ? input.threadActions
      : (input.threadCandidates ?? [])
  )

  const mutations: PreparedPlannerThreadMutation[] = []
  const rejected: RejectedPlannerThreadMutation[] = []

  for (const rawAction of rawActions) {
    const key = rawAction.key.trim()
    const existing = workingByKey.get(key) ?? null
    const action = 'action' in rawAction && rawAction.action
      ? rawAction.action
      : existing ? 'update' : 'create'
    const linkedEntityKeys = Array.from(new Set((rawAction.linkedEntityKeys ?? []).filter((entityKey) => knownEntityKeys.has(entityKey))))
    const title = ('title' in rawAction ? rawAction.title : '').trim()
    const summary = ('summary' in rawAction ? rawAction.summary : '').trim()
    const metadata = rawAction.metadata ?? {}
    const linkMode = ('linkMode' in rawAction ? rawAction.linkMode : 'merge') ?? 'merge'

    if (!key) {
      rejected.push({ key: '', action, reason: 'Missing thread key.' })
      continue
    }

    if (action === 'create') {
      if (existing) {
        rejected.push({ key, action, reason: 'Create action targeted an existing thread key.' })
        continue
      }
      if (!title) {
        rejected.push({ key, action, reason: 'Create action requires a concrete thread title.' })
        continue
      }
      if (isPlaceholderLikeThreadTitle(title)) {
        rejected.push({ key, action, reason: 'Create action used a placeholder-like thread title.' })
        continue
      }
      if (linkedEntityKeys.length === 0) {
        rejected.push({ key, action, reason: 'Create action requires at least one known linked entity.' })
        continue
      }
      mutations.push({
        action,
        key,
        title,
        summary,
        status: rawAction.status ?? 'open',
        priority: rawAction.priority ?? 'secondary',
        linkedEntityKeys,
        metadata,
        existing: false,
      })
      workingByKey.set(key, mutations[mutations.length - 1]!)
      continue
    }

    if (!existing) {
      rejected.push({ key, action, reason: 'Thread action targeted a missing thread.' })
      continue
    }

    const nextTitle = title || existing.title
    if (title && isPlaceholderLikeThreadTitle(title)) {
      rejected.push({ key, action, reason: 'Thread action used a placeholder-like thread title.' })
      continue
    }

    const mergedLinkedEntityKeys = linkMode === 'replace'
      ? linkedEntityKeys
      : Array.from(new Set([...(existing.linkedEntityKeys ?? []), ...linkedEntityKeys]))

    const mutation: PreparedPlannerThreadMutation = {
      action,
      key,
      title: nextTitle,
      summary: summary || existing.summary || '',
      status:
        action === 'resolve'
          ? 'resolved'
          : action === 'park'
            ? 'parked'
            : rawAction.status ?? existing.status,
      priority: rawAction.priority ?? existing.priority,
      linkedEntityKeys:
        action === 'relink_entities'
          ? mergedLinkedEntityKeys
          : mergedLinkedEntityKeys,
      metadata: {
        ...(existing.metadata ?? {}),
        ...metadata,
      },
      existing: true,
    }

    const unchanged = (
      mutation.title === existing.title
      && mutation.summary === existing.summary
      && mutation.status === existing.status
      && mutation.priority === existing.priority
      && mutation.linkedEntityKeys.length === existing.linkedEntityKeys.length
      && mutation.linkedEntityKeys.every((entityKey, index) => entityKey === existing.linkedEntityKeys[index])
    )
    if (unchanged) {
      continue
    }
    mutations.push(mutation)
    workingByKey.set(key, mutation)
  }

  const mutationsByKey = new Map<string, PreparedPlannerThreadMutation>()
  for (const mutation of mutations) {
    mutationsByKey.set(mutation.key, mutation)
  }
  const dedupedMutations = Array.from(mutationsByKey.values())

  const diagnostics: PlannerThreadMutationPreparationResult['diagnostics'] = []
  if (dedupedMutations.length > 0) diagnostics.push('thread_actions_applied')
  if (rejected.length > 0) diagnostics.push('thread_actions_rejected')
  if (dedupedMutations.length === 0 && rejected.length === 0) diagnostics.push('no_thread_change')

  return {
    mutations: dedupedMutations,
    rejected,
    diagnostics,
  } satisfies PlannerThreadMutationPreparationResult
}
