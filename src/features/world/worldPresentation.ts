import type { CSSProperties } from 'react'

import type {
  PromptToWorldOp,
  WorldPromptEvent,
  WorldPromptMessage,
  WorldPromptPlanPreview,
  WorldPromptSuggestion,
  WorldPromptTurn,
} from '../../domain/worldPrompt.ts'
import { worldPromptEventPayloadSchema, worldPromptPlanPreviewSchema } from '../../domain/worldPrompt.ts'
import type { WorldEntity, WorldOperator, WorldResult } from '../../domain/worldGraph.ts'
import { labelForWorldEntity } from '../../domain/worldGraphHelpers.ts'

export type WorldGraphNodeRecord =
  | { kind: 'entity'; entity: WorldEntity; title: string; subtitle: string; summary: string; imageUrl: string | null }
  | { kind: 'operator'; operator: WorldOperator; title: string; subtitle: string; summary: string; imageUrl: string | null }
  | { kind: 'result'; result: WorldResult; title: string; subtitle: string; summary: string; imageUrl: string | null }

export type WorldNodeData = {
  record: WorldGraphNodeRecord
  relationCount: number
  usageCount: number
  dimmed: boolean
  animateIn: boolean
}

export type WorldPromptTranscriptEntry =
  | { id: string; createdAt: string; kind: 'user_message' | 'assistant_message'; content: string; pending?: boolean }
  | { id: string; createdAt: string; kind: 'system_status'; label: string; detail?: string; tone?: 'normal' | 'error' }
  | { id: string; createdAt: string; kind: 'entity_created'; label: string; detail?: string; entityKey: string }
  | { id: string; createdAt: string; kind: 'relationship_created'; label: string; detail?: string; relationshipKey: string }
  | { id: string; createdAt: string; kind: 'queue_started'; label: string; detail?: string }
  | { id: string; createdAt: string; kind: 'suggestion_row' | 'choice_row'; suggestions: WorldPromptSuggestion[]; label?: string }

export type WorldInspectorViewModel = {
  title: string
  kicker: string
  summary: string
  imageUrl: string | null
  stats: string[]
}

export function worldNodeRecordEqual(left: WorldGraphNodeRecord, right: WorldGraphNodeRecord) {
  if (left.kind !== right.kind) return false
  if (left.title !== right.title || left.subtitle !== right.subtitle || left.summary !== right.summary || left.imageUrl !== right.imageUrl) {
    return false
  }
  if (left.kind === 'entity' && right.kind === 'entity') {
    return left.entity.key === right.entity.key && left.entity.status === right.entity.status && left.entity.thumbnailAssetKey === right.entity.thumbnailAssetKey
  }
  if (left.kind === 'operator' && right.kind === 'operator') {
    return left.operator.key === right.operator.key && left.operator.operatorType === right.operator.operatorType && left.operator.label === right.operator.label
  }
  if (left.kind === 'result' && right.kind === 'result') {
    return left.result.key === right.result.key && left.result.previewAssetKey === right.result.previewAssetKey && left.result.title === right.result.title
  }
  return false
}

export function worldNodeDataEqual(left: WorldNodeData, right: WorldNodeData) {
  return (
    left.relationCount === right.relationCount
    && left.usageCount === right.usageCount
    && left.dimmed === right.dimmed
    && left.animateIn === right.animateIn
    && worldNodeRecordEqual(left.record, right.record)
  )
}

export function nodeShellStyle(record: WorldGraphNodeRecord, selected: boolean, dimmed: boolean): CSSProperties {
  const palette =
    record.kind === 'entity'
      ? record.entity.nodeType === 'actor'
        ? ['rgba(125, 211, 252, 0.34)', 'rgba(56, 189, 248, 0.12)', 'rgba(186, 230, 253, 0.18)', '#c8e2ff']
        : record.entity.nodeType === 'group'
          ? ['rgba(248, 113, 113, 0.34)', 'rgba(185, 28, 28, 0.12)', 'rgba(254, 202, 202, 0.18)', '#ffbe9d']
          : record.entity.nodeType === 'place'
            ? ['rgba(94, 234, 212, 0.3)', 'rgba(13, 148, 136, 0.12)', 'rgba(153, 246, 228, 0.18)', '#a7f3d0']
            : record.entity.nodeType === 'object'
              ? ['rgba(250, 204, 21, 0.32)', 'rgba(161, 98, 7, 0.12)', 'rgba(254, 240, 138, 0.2)', '#fcd34d']
              : record.entity.nodeType === 'concept'
                ? ['rgba(196, 181, 253, 0.32)', 'rgba(109, 40, 217, 0.12)', 'rgba(221, 214, 254, 0.18)', '#d8b4fe']
                : ['rgba(251, 146, 60, 0.3)', 'rgba(194, 65, 12, 0.12)', 'rgba(254, 215, 170, 0.18)', '#fdba74']
      : record.kind === 'operator'
        ? ['rgba(148, 163, 184, 0.28)', 'rgba(51, 65, 85, 0.12)', 'rgba(226, 232, 240, 0.16)', '#e2e8f0']
        : ['rgba(226, 232, 240, 0.24)', 'rgba(71, 85, 105, 0.12)', 'rgba(226, 232, 240, 0.16)', '#f8fafc']

  return {
    opacity: dimmed ? 0.2 : 1,
    borderColor: selected ? 'rgba(255,255,255,0.36)' : palette[0],
    background: `linear-gradient(180deg, rgba(9, 13, 20, 0.985), ${palette[1]})`,
    boxShadow: selected
      ? `0 0 0 1px rgba(255,255,255,0.08), 0 24px 54px rgba(5, 8, 14, 0.52), 0 0 24px ${palette[1]}, inset 0 1px 0 ${palette[2]}`
      : `0 18px 40px rgba(5, 8, 14, 0.34), inset 0 1px 0 ${palette[2]}`,
    ['--world-node-ring' as string]: palette[0],
    ['--world-node-glow' as string]: palette[1],
    ['--world-node-highlight' as string]: palette[2],
    ['--world-node-accent' as string]: palette[3],
  }
}

export function describePromptOp(op: PromptToWorldOp) {
  switch (op.op) {
    case 'upsert_entity':
      return `Add or extend ${op.payload.entity.name}`
    case 'update_entity':
      return `Update ${op.payload.targetEntityKey}`
    case 'upsert_relationship':
      return `Link ${op.payload.relationship.sourceEntityKey ?? op.payload.relationship.sourceRef?.name ?? 'source'} to ${op.payload.relationship.targetEntityKey ?? op.payload.relationship.targetRef?.name ?? 'target'}`
    case 'update_relationship':
      return `Update relationship ${op.payload.targetRelationshipKey}`
    case 'create_derived_result':
      return `Create ${op.payload.title ?? op.payload.operatorType}`
    case 'queue_image_generation':
      return 'Queue image generation'
    case 'queue_cinematic_generation':
      return 'Queue cinematic generation'
    case 'assistant_note':
      return op.payload.message
  }
}

export function describePlannerStatus(status: NonNullable<ReturnType<typeof worldPromptEventPayloadSchema.safeParse>['data']>['plannerStatus']) {
  switch (status) {
    case 'planning':
      return 'Planning'
    case 'scoping':
      return 'Scoping'
    case 'applying':
      return 'Applying'
    case 'awaiting_approval':
      return 'Awaiting Approval'
    case 'blocked':
      return 'Blocked'
    case 'completed':
      return 'Completed'
    default:
      return 'Working'
  }
}

export function promptSuggestionImpactLabel(suggestion: WorldPromptSuggestion) {
  const parts = [
    suggestion.estimatedNodeCount > 0 ? `+${suggestion.estimatedNodeCount} nodes` : null,
    suggestion.estimatedEdgeCount > 0 ? `+${suggestion.estimatedEdgeCount} links` : null,
    suggestion.willQueueImages ? 'images' : null,
    suggestion.willQueueCinematics ? 'cinematics' : null,
  ].filter(Boolean)
  return parts.join(' · ')
}

export function stripInternalPlannerDiagnostics(text: string) {
  if (!text.trim()) return ''
  return text
    .replace(/\s*World prompt planner returned JSON that did not match the expected schema\.[\s\S]*$/i, '')
    .replace(/\s*Planner (?:output|response) validation failed\.[\s\S]*$/i, '')
    .replace(/\s*Cinematic planner response validation failed\.[\s\S]*$/i, '')
    .trim()
}

function buildTranscriptSuggestionsEntry(event: WorldPromptEvent, suggestions: WorldPromptSuggestion[]) {
  return {
    id: `suggestions:${event.id}`,
    createdAt: event.createdAt,
    kind: suggestions.length > 1 ? 'choice_row' : 'suggestion_row',
    suggestions,
    label: suggestions.length > 1 ? 'Choose how to continue' : 'Next move',
  } satisfies WorldPromptTranscriptEntry
}

export function buildWorldPromptTranscriptEntries(input: {
  events: WorldPromptEvent[]
  messages: WorldPromptMessage[]
  entityByKey: Map<string, WorldEntity>
}) {
  const sources = [
    ...input.messages.map((message) => ({ source: 'message' as const, createdAt: message.createdAt, id: `message:${message.id}`, message })),
    ...input.events
      .filter((event) => !['turn_started', 'message_created', 'op_needs_approval', 'op_approved', 'op_rejected'].includes(event.eventType))
      .map((event) => ({ source: 'event' as const, createdAt: event.createdAt, id: `event:${event.id}`, event })),
  ].sort((left, right) => {
    const timeDelta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
    return timeDelta !== 0 ? timeDelta : left.id.localeCompare(right.id)
  })

  const entries: WorldPromptTranscriptEntry[] = []
  let lastSuggestionSignature: string | null = null

  for (const source of sources) {
    if (source.source === 'message') {
      entries.push({
        id: source.id,
        createdAt: source.message.createdAt,
        kind: source.message.role === 'user' ? 'user_message' : 'assistant_message',
        content: source.message.role === 'assistant'
          ? stripInternalPlannerDiagnostics(source.message.content)
          : source.message.content,
        pending: false,
      })
      continue
    }

    const parsed = worldPromptEventPayloadSchema.safeParse(source.event.payload)
    if (!parsed.success) {
      entries.push({
        id: source.id,
        createdAt: source.event.createdAt,
        kind: 'system_status',
        label: source.event.eventType,
      })
      continue
    }

    const payload = parsed.data
    switch (source.event.eventType) {
      case 'planner_status':
        if (payload.plannerStatus) {
          entries.push({
            id: source.id,
            createdAt: source.event.createdAt,
            kind: 'system_status',
            label: describePlannerStatus(payload.plannerStatus),
            detail: payload.note ?? (payload.scope ? `${payload.scope.mode} scope` : ''),
          })
        }
        break
      case 'assistant_note':
        if (payload.note) {
          entries.push({
            id: source.id,
            createdAt: source.event.createdAt,
            kind: 'assistant_message',
            content: stripInternalPlannerDiagnostics(payload.note),
            pending: true,
          })
        }
        break
      case 'op_applied': {
        const applied = payload.applied
        for (const entity of applied?.worldEntities ?? []) {
          entries.push({
            id: `${source.id}:entity:${entity.key}`,
            createdAt: source.event.createdAt,
            kind: 'entity_created',
            label: `Added ${entity.name}`,
            detail: labelForWorldEntity(entity.nodeType),
            entityKey: entity.key,
          })
        }
        for (const relationship of applied?.worldRelationships ?? []) {
          const sourceName = input.entityByKey.get(relationship.sourceEntityKey)?.name ?? relationship.sourceEntityKey
          const targetName = input.entityByKey.get(relationship.targetEntityKey)?.name ?? relationship.targetEntityKey
          entries.push({
            id: `${source.id}:relationship:${relationship.key}`,
            createdAt: source.event.createdAt,
            kind: 'relationship_created',
            label: `Linked ${sourceName} and ${targetName}`,
            detail: relationship.notes.trim() || relationship.verb,
            relationshipKey: relationship.key,
          })
        }
        for (const worldResult of applied?.worldResults ?? []) {
          entries.push({
            id: `${source.id}:result:${worldResult.key}`,
            createdAt: source.event.createdAt,
            kind: 'system_status',
            label: `Created ${worldResult.title}`,
            detail: 'Derived result',
          })
        }
        break
      }
      case 'queue_started': {
        const label = payload.queue?.type === 'cinematic_generation'
          ? 'Started cinematic generation'
          : 'Started image generation'
        const detail = payload.queue?.targetEntityKey
          ? input.entityByKey.get(payload.queue.targetEntityKey)?.name ?? payload.queue.targetEntityKey
          : payload.queue?.graphKey ?? ''
        entries.push({
          id: source.id,
          createdAt: source.event.createdAt,
          kind: 'queue_started',
          label,
          detail,
        })
        break
      }
      case 'turn_cancel_requested':
        entries.push({
          id: source.id,
          createdAt: source.event.createdAt,
          kind: 'system_status',
          label: 'Cancelling turn',
          detail: payload.note ?? 'Stopping future ops for this turn.',
        })
        break
      case 'turn_failed':
        entries.push({
          id: source.id,
          createdAt: source.event.createdAt,
          kind: 'system_status',
          label: 'Turn failed',
          detail: payload.diagnostics?.[0] ?? payload.note ?? 'World prompt turn failed.',
          tone: 'error',
        })
        break
      case 'turn_completed':
        if (payload.note) {
          entries.push({
            id: source.id,
            createdAt: source.event.createdAt,
            kind: 'system_status',
            label: 'Turn completed',
            detail: payload.note,
          })
        }
        break
      default:
        break
    }

    if (payload.suggestions.length > 0) {
      const signature = payload.suggestions.map((suggestion) => `${suggestion.id}:${suggestion.prompt}`).join('|')
      if (signature && signature !== lastSuggestionSignature) {
        entries.push(buildTranscriptSuggestionsEntry(source.event, payload.suggestions))
        lastSuggestionSignature = signature
      }
    }
  }

  return entries
}

export function buildWorldInspectorViewModel(input: {
  entity: WorldEntity | null
  operator: WorldOperator | null
  result: WorldResult | null
  imageUrl?: string | null
  relationCount?: number
  usageCount?: number
}): WorldInspectorViewModel | null {
  if (input.entity) {
    return {
      title: input.entity.name,
      kicker: labelForWorldEntity(input.entity.nodeType),
      summary: input.entity.summary,
      imageUrl: input.imageUrl ?? null,
      stats: [
        `${input.relationCount ?? 0} relationships`,
        `${input.usageCount ?? 0} usages`,
        input.entity.source === 'ai' ? 'AI-sourced' : 'Manual',
      ],
    }
  }

  if (input.operator) {
    return {
      title: input.operator.label || input.operator.operatorType,
      kicker: 'Derived operator',
      summary: `Inputs: ${input.operator.inputEntityKeys.length}`,
      imageUrl: null,
      stats: [`${input.operator.inputEntityKeys.length} inputs`],
    }
  }

  if (input.result) {
    return {
      title: input.result.title,
      kicker: 'Derived result',
      summary: input.result.summary,
      imageUrl: input.imageUrl ?? null,
      stats: [
        input.result.status,
        typeof input.result.metadata?.cinematicGraphKey === 'string' ? 'Linked cinematic' : 'Standalone result',
      ],
    }
  }

  return null
}

export function activePreviewForTurn(turn: WorldPromptTurn | null): WorldPromptPlanPreview | null {
  const preview = turn?.metadata?.preview
  const parsed = worldPromptPlanPreviewSchema.safeParse(preview)
  return parsed.success ? parsed.data : null
}
