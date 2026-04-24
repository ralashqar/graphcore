import type { PromptToWorldOp, WorldPromptClassification } from './worldPrompt.ts'
import type { WorldEntity } from './worldGraph.ts'

export type CreativeDescriptorResolution = 'reused_existing' | 'invented_if_missing' | 'needs_review'

export type CreativeDescriptorIssue = {
  kind: 'placeholder_entity' | 'unresolved_relationship_endpoint'
  opId: string
  entityName: string
  endpoint?: 'source' | 'target'
}

export type CreativeDescriptorDiagnostic = {
  opId: string
  descriptor: string
  resolution: CreativeDescriptorResolution
  entityKey: string | null
}

type PlannerMode = 'direct_build' | 'refinement' | 'advisory_diagnosis'

type EntityCandidate = {
  key: string
  name: string
  aliases: string[]
  summary: string
  tags: string[]
  nodeType: WorldEntity['nodeType']
  source: 'existing' | 'planned'
  opId: string | null
  explicitInPrompt: boolean
  placeholderLike: boolean
}

type ResolveMatchType =
  | 'exact_key'
  | 'exact_name'
  | 'containment'
  | 'fuzzy'
  | 'ambiguous_exact'
  | 'ambiguous_containment'
  | 'ambiguous_fuzzy'
  | 'none'

const GROUP_DESCRIPTOR_TERMS = [
  'faction',
  'group',
  'guild',
  'order',
  'house',
  'clan',
  'court',
  'council',
  'regime',
  'religion',
  'cult',
]

const PLACE_DESCRIPTOR_TERMS = [
  'kingdom',
  'realm',
  'city',
  'capital',
  'district',
  'region',
  'fortress',
  'keep',
  'harbor',
  'border',
  'village',
  'settlement',
  'ruin',
]

const CONCEPT_DESCRIPTOR_TERMS = [
  'belief',
  'law',
  'curse',
  'prophecy',
  'myth',
  'ritual',
  'magic',
  'taboo',
  'custom',
]

const EVENT_DESCRIPTOR_TERMS = [
  'war',
  'battle',
  'rebellion',
  'coronation',
  'catastrophe',
  'crisis',
  'incident',
  'event',
]

const OBJECT_DESCRIPTOR_TERMS = [
  'artifact',
  'relic',
  'weapon',
  'device',
  'crown',
  'blade',
  'key',
  'idol',
]

const ACTOR_DESCRIPTOR_TERMS = [
  'man',
  'woman',
  'person',
  'boy',
  'girl',
  'child',
  'daughter',
  'son',
  'brother',
  'sister',
  'mother',
  'father',
  'mentor',
  'friend',
  'ally',
  'lover',
  'love interest',
  'captain',
  'guard',
  'heir',
]

const GENERIC_DESCRIPTOR_MODIFIERS = [
  'secret',
  'hidden',
  'dark',
  'forbidden',
  'ancient',
  'mysterious',
  'shadow',
  'royal',
  'inner',
  'outer',
  'young',
  'old',
  'lost',
  'new',
  'rival',
  'enemy',
  'opposing',
]

const ARTICLE_PREFIX_RE = /^(a|an|the|their|his|her)\s+/

function normalizeName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function slugify(value: string) {
  const normalized = normalizeName(value)
  return normalized
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'entity'
}

function buildNameVariants(value: string) {
  const normalized = normalizeName(value)
  if (!normalized) return []
  const withoutArticles = normalized.replace(ARTICLE_PREFIX_RE, '')
  return Array.from(new Set([normalized, withoutArticles].filter(Boolean)))
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

function promptExplicitlyNamesEntity(prompt: string, name: string) {
  const normalizedPrompt = normalizeName(prompt)
  if (!normalizedPrompt) return false
  return buildNameVariants(name).some((variant) => variant.length >= 3 && normalizedPrompt.includes(variant))
}

export function promptAllowsPlaceholderCanon(prompt: string) {
  return /\b(placeholder|unnamed|leave (?:them|it) unnamed|template|tbd|to be named|nameless)\b/i.test(prompt)
}

export function inferDescriptorNodeType(value: string): WorldEntity['nodeType'] | null {
  const normalized = normalizeName(value)
  if (!normalized) return null
  if (ACTOR_DESCRIPTOR_TERMS.some((term) => normalized.includes(term))) return 'actor'
  if (GROUP_DESCRIPTOR_TERMS.some((term) => normalized.includes(term))) return 'group'
  if (PLACE_DESCRIPTOR_TERMS.some((term) => normalized.includes(term))) return 'place'
  if (CONCEPT_DESCRIPTOR_TERMS.some((term) => normalized.includes(term))) return 'concept'
  if (EVENT_DESCRIPTOR_TERMS.some((term) => normalized.includes(term))) return 'event'
  if (OBJECT_DESCRIPTOR_TERMS.some((term) => normalized.includes(term))) return 'object'
  return null
}

export function isUnderspecifiedDescriptorReference(value: string, nodeType?: WorldEntity['nodeType'] | null) {
  const normalized = normalizeName(value)
  if (!normalized) return false
  if (isPlaceholderLikeEntityName(value, nodeType)) return true
  if (/^(a|an|the|their|his|her)\s+/.test(normalized) && inferDescriptorNodeType(normalized) !== null) return true
  if (/(from|of|inside|within|under|serving|tied to)\s+the\s+/.test(normalized) && inferDescriptorNodeType(normalized) !== null) return true
  return false
}

export function isPlaceholderLikeEntityName(value: string, nodeType?: WorldEntity['nodeType'] | null) {
  const normalized = normalizeName(value)
  if (!normalized) return false
  const tokens = normalized.split(' ').filter(Boolean)
  const genericGroupTokens = new Set([...GENERIC_DESCRIPTOR_MODIFIERS, ...GROUP_DESCRIPTOR_TERMS])
  const genericActorTokens = new Set([...GENERIC_DESCRIPTOR_MODIFIERS, ...ACTOR_DESCRIPTOR_TERMS])
  const genericPlaceTokens = new Set([...GENERIC_DESCRIPTOR_MODIFIERS, ...PLACE_DESCRIPTOR_TERMS])
  if (/^(unnamed|unknown|mystery)\b/.test(normalized)) return true
  if (['rival faction', 'the rival faction', 'love interest', 'the love interest', 'central conflict'].includes(normalized)) return true
  if (normalized === 'man' || normalized === 'woman' || normalized === 'child' || normalized === 'person') return true
  if (/^(a|an|the)\s+(man|woman|boy|girl|child|person|daughter|son|brother|sister|mentor|friend|rival|ally|lover|captain|guard)\b/.test(normalized)) return true
  if (/^unnamed\s+(man|woman|child|heir|captain|mentor|faction|group|order|guild|house)\b/.test(normalized)) return true
  if (/^(the\s+)?(rival|opposing|enemy)\s+(faction|group|house|guild|order|clan)\b/.test(normalized)) return true
  if (
    nodeType === 'group'
    && tokens.some((token) => GROUP_DESCRIPTOR_TERMS.includes(token))
    && tokens.every((token) => genericGroupTokens.has(token))
  ) return true
  if (
    nodeType === 'actor'
    && tokens.some((token) => ACTOR_DESCRIPTOR_TERMS.includes(token))
    && tokens.every((token) => genericActorTokens.has(token))
  ) return true
  if (
    nodeType === 'place'
    && tokens.some((token) => PLACE_DESCRIPTOR_TERMS.includes(token))
    && tokens.every((token) => genericPlaceTokens.has(token))
  ) return true
  if (nodeType === 'group' && GROUP_DESCRIPTOR_TERMS.includes(normalized)) return true
  if (nodeType === 'actor' && ACTOR_DESCRIPTOR_TERMS.includes(normalized)) return true
  return false
}

export function descriptorResolutionDecision(input: {
  matchType: ResolveMatchType
  candidateCount: number
}): CreativeDescriptorResolution {
  if (['exact_key', 'exact_name', 'containment', 'fuzzy'].includes(input.matchType) && input.candidateCount === 1) {
    return 'reused_existing'
  }
  if (
    ['ambiguous_exact', 'ambiguous_containment', 'ambiguous_fuzzy'].includes(input.matchType)
    || input.candidateCount > 1
  ) {
    return 'needs_review'
  }
  return 'invented_if_missing'
}

function allowsCreativeDescriptorCompletion(mode: PlannerMode, classification: WorldPromptClassification) {
  if (!['direct_build', 'refinement'].includes(mode)) return false
  return classification === 'graphable_direct' || classification === 'refinement_only'
}

function buildProjectedEntityKey(existingKeys: Set<string>, nodeType: WorldEntity['nodeType'], name: string) {
  const base = `world.${nodeType}.${slugify(name)}`
  let candidate = base
  let index = 2
  while (existingKeys.has(candidate)) {
    candidate = `${base}-${index}`
    index += 1
  }
  existingKeys.add(candidate)
  return candidate
}

function buildEntityCandidates(
  prompt: string,
  existingEntities: Array<Pick<WorldEntity, 'key' | 'name' | 'aliases' | 'nodeType' | 'summary' | 'tags'>>,
  ops: PromptToWorldOp[],
) {
  const seenKeys = new Set(existingEntities.map((entity) => entity.key))
  const plannedKeysByOpId = new Map<string, string>()

  for (const op of ops) {
    if (op.op !== 'upsert_entity') continue
    const key = op.payload.targetEntityKey || buildProjectedEntityKey(seenKeys, op.payload.entity.nodeType, op.payload.entity.name)
    op.payload.targetEntityKey = key
    plannedKeysByOpId.set(op.id, key)
    op.metadata = {
      ...(op.metadata ?? {}),
      projectedCreate: !existingEntities.some((entity) => entity.key === key),
    }
  }

  const candidates: EntityCandidate[] = [
    ...existingEntities.map((entity) => ({
      key: entity.key,
      name: entity.name,
      aliases: entity.aliases ?? [],
      summary: entity.summary ?? '',
      tags: entity.tags ?? [],
      nodeType: entity.nodeType,
      source: 'existing' as const,
      opId: null,
      explicitInPrompt: promptExplicitlyNamesEntity(prompt, entity.name),
      placeholderLike: false,
    })),
    ...ops
      .filter((op): op is Extract<PromptToWorldOp, { op: 'upsert_entity' }> => op.op === 'upsert_entity')
      .map((op) => ({
        key: plannedKeysByOpId.get(op.id) ?? op.payload.targetEntityKey ?? buildProjectedEntityKey(seenKeys, op.payload.entity.nodeType, op.payload.entity.name),
        name: op.payload.entity.name,
        aliases: op.payload.entity.aliases ?? [],
        summary: op.payload.entity.summary ?? '',
        tags: op.payload.entity.tags ?? [],
        nodeType: op.payload.entity.nodeType,
        source: 'planned' as const,
        opId: op.id,
        explicitInPrompt: promptExplicitlyNamesEntity(prompt, op.payload.entity.name),
        placeholderLike: isPlaceholderLikeEntityName(op.payload.entity.name, op.payload.entity.nodeType),
      })),
  ]

  return { candidates, plannedKeysByOpId }
}

function resolveCandidateReference(
  candidates: EntityCandidate[],
  input: {
    entityKey?: string | null
    name?: string | null
    alias?: string | null
    nodeTypeHint?: WorldEntity['nodeType'] | null
  },
) {
  const byKey = input.entityKey ? candidates.find((candidate) => candidate.key === input.entityKey) ?? null : null
  if (byKey) return { entity: byKey, candidates: [byKey], matchType: 'exact_key' as const }

  const probeVariants = Array.from(new Set([
    ...buildNameVariants(input.name ?? ''),
    ...buildNameVariants(input.alias ?? ''),
  ]))
  const filteredCandidates = input.nodeTypeHint
    ? (() => {
        const matching = candidates.filter((candidate) => candidate.nodeType === input.nodeTypeHint)
        return matching.length > 0 ? matching : candidates
      })()
    : candidates

  if (!probeVariants.length) return { entity: null, candidates: [], matchType: 'none' as const }

  const exactCandidates = filteredCandidates.filter((candidate) => {
    const names = [candidate.name, ...candidate.aliases, candidate.summary, ...candidate.tags]
    return names.some((value) => buildNameVariants(value).some((variant) => probeVariants.includes(variant)))
  })
  if (exactCandidates.length === 1) return { entity: exactCandidates[0], candidates: exactCandidates, matchType: 'exact_name' as const }
  if (exactCandidates.length > 1) return { entity: null, candidates: exactCandidates, matchType: 'ambiguous_exact' as const }

  const containmentCandidates = filteredCandidates.filter((candidate) => {
    const names = [candidate.name, ...candidate.aliases, candidate.summary, ...candidate.tags]
    return names.some((value) => buildNameVariants(value).some((variant) => (
      probeVariants.some((probeVariant) => (
        probeVariant.length >= 4
        && variant.length >= 4
        && (variant.includes(probeVariant) || probeVariant.includes(variant))
      ))
    )))
  })
  if (containmentCandidates.length === 1) return { entity: containmentCandidates[0], candidates: containmentCandidates, matchType: 'containment' as const }
  if (containmentCandidates.length > 1) return { entity: null, candidates: containmentCandidates, matchType: 'ambiguous_containment' as const }

  const scored = filteredCandidates
    .map((candidate) => ({
      candidate,
      score: Math.max(
        ...[candidate.name, ...candidate.aliases, candidate.summary, ...candidate.tags].flatMap((value) => (
          buildNameVariants(value).flatMap((variant) => probeVariants.map((probeVariant) => diceCoefficient(probeVariant, variant)))
        )),
        0,
      ),
    }))
    .filter((entry) => entry.score >= 0.82)
    .sort((left, right) => right.score - left.score)

  if (scored.length === 1) return { entity: scored[0].candidate, candidates: [scored[0].candidate], matchType: 'fuzzy' as const }
  if (scored.length > 1) return { entity: null, candidates: scored.map((entry) => entry.candidate), matchType: 'ambiguous_fuzzy' as const }

  return { entity: null, candidates: [], matchType: 'none' as const }
}

function unresolvedInventedCandidatesByType(candidates: EntityCandidate[], nodeTypeHint: WorldEntity['nodeType'] | null) {
  const filtered = candidates.filter((candidate) => (
    candidate.source === 'planned'
    && !candidate.placeholderLike
    && !candidate.explicitInPrompt
    && (!nodeTypeHint || candidate.nodeType === nodeTypeHint)
  ))
  return filtered
}

export function completeCreativeDescriptorOps(input: {
  prompt: string
  mode: PlannerMode
  classification: WorldPromptClassification
  existingEntities: Array<Pick<WorldEntity, 'key' | 'name' | 'aliases' | 'nodeType' | 'summary' | 'tags'>>
  ops: PromptToWorldOp[]
}) {
  const ops = structuredClone(input.ops) as PromptToWorldOp[]
  if (!allowsCreativeDescriptorCompletion(input.mode, input.classification) || promptAllowsPlaceholderCanon(input.prompt)) {
    return {
      ops,
      issues: [] as CreativeDescriptorIssue[],
      diagnostics: [] as CreativeDescriptorDiagnostic[],
    }
  }

  const diagnostics: CreativeDescriptorDiagnostic[] = []
  const issues: CreativeDescriptorIssue[] = []
  const removedOpIds = new Set<string>()
  const reusedDescriptorByName = new Map<string, EntityCandidate>()
  const { candidates, plannedKeysByOpId } = buildEntityCandidates(input.prompt, input.existingEntities, ops)

  for (const op of ops) {
    if (op.op !== 'upsert_entity') continue
    if (!isPlaceholderLikeEntityName(op.payload.entity.name, op.payload.entity.nodeType)) continue

    const resolved = resolveCandidateReference(
      candidates.filter((candidate) => candidate.source === 'existing'),
      {
        entityKey: op.payload.targetEntityKey,
        name: op.payload.entity.name,
        alias: op.payload.entity.aliases?.[0] ?? null,
        nodeTypeHint: inferDescriptorNodeType(op.payload.entity.name) ?? op.payload.entity.nodeType,
      },
    )
    const decision = descriptorResolutionDecision({
      matchType: resolved.matchType,
      candidateCount: resolved.candidates.length,
    })

    if (decision === 'reused_existing' && resolved.entity) {
      removedOpIds.add(op.id)
      reusedDescriptorByName.set(normalizeName(op.payload.entity.name), resolved.entity)
      diagnostics.push({
        opId: op.id,
        descriptor: op.payload.entity.name,
        resolution: 'reused_existing',
        entityKey: resolved.entity.key,
      })
      continue
    }

    issues.push({
      kind: 'placeholder_entity',
      opId: op.id,
      entityName: op.payload.entity.name,
    })
    diagnostics.push({
      opId: op.id,
      descriptor: op.payload.entity.name,
      resolution: decision === 'needs_review' ? 'needs_review' : 'invented_if_missing',
      entityKey: null,
    })
  }

  const retainedOps = ops.filter((op) => !removedOpIds.has(op.id))
  const retainedCandidates = buildEntityCandidates(input.prompt, input.existingEntities, retainedOps).candidates
  const entityOpByKey = new Map<string, Extract<PromptToWorldOp, { op: 'upsert_entity' }>>(
    retainedOps
      .filter((op): op is Extract<PromptToWorldOp, { op: 'upsert_entity' }> => op.op === 'upsert_entity')
      .map((op) => [plannedKeysByOpId.get(op.id) ?? op.payload.targetEntityKey ?? '', op] as const)
      .filter(([key]) => Boolean(key)),
  )

  for (const op of retainedOps) {
    if (op.op !== 'upsert_relationship') continue

    ;([
      ['source', op.payload.relationship.sourceEntityKey, op.payload.relationship.sourceRef],
      ['target', op.payload.relationship.targetEntityKey, op.payload.relationship.targetRef],
    ] as const).forEach(([endpoint, entityKey, ref]) => {
      if (entityKey) return
      const refName = ref?.name?.trim() ?? ''
      if (!refName) {
        issues.push({
          kind: 'unresolved_relationship_endpoint',
          opId: op.id,
          endpoint,
          entityName: endpoint,
        })
        return
      }

      const reused = reusedDescriptorByName.get(normalizeName(refName))
      if (reused) {
        if (endpoint === 'source') op.payload.relationship.sourceEntityKey = reused.key
        else op.payload.relationship.targetEntityKey = reused.key
        op.metadata = {
          ...(op.metadata ?? {}),
          [`${endpoint}DescriptorResolution`]: 'reused_existing',
          [`${endpoint}DescriptorEntityKey`]: reused.key,
        }
        diagnostics.push({
          opId: op.id,
          descriptor: refName,
          resolution: 'reused_existing',
          entityKey: reused.key,
        })
        return
      }

      const nodeTypeHint = inferDescriptorNodeType(refName)
      const resolved = resolveCandidateReference(retainedCandidates, {
        name: refName,
        alias: ref?.alias ?? null,
        nodeTypeHint,
      })
      const decision = descriptorResolutionDecision({
        matchType: resolved.matchType,
        candidateCount: resolved.candidates.length,
      })
      if (decision === 'reused_existing' && resolved.entity) {
        if (endpoint === 'source') op.payload.relationship.sourceEntityKey = resolved.entity.key
        else op.payload.relationship.targetEntityKey = resolved.entity.key
        op.metadata = {
          ...(op.metadata ?? {}),
          [`${endpoint}DescriptorResolution`]: resolved.entity.source === 'existing' ? 'reused_existing' : 'invented_if_missing',
          [`${endpoint}DescriptorEntityKey`]: resolved.entity.key,
        }
        const supportingOp = entityOpByKey.get(resolved.entity.key)
        if (supportingOp && !promptExplicitlyNamesEntity(input.prompt, supportingOp.payload.entity.name)) {
          supportingOp.metadata = {
            ...(supportingOp.metadata ?? {}),
            descriptorResolution: 'invented_if_missing',
            descriptorDisplayName: supportingOp.payload.entity.name,
            displayName: supportingOp.payload.entity.name,
          }
        }
        diagnostics.push({
          opId: op.id,
          descriptor: refName,
          resolution: resolved.entity.source === 'existing' ? 'reused_existing' : 'invented_if_missing',
          entityKey: resolved.entity.key,
        })
        return
      }

      const inventedCandidates = unresolvedInventedCandidatesByType(retainedCandidates, nodeTypeHint)
      if (isUnderspecifiedDescriptorReference(refName, nodeTypeHint) && inventedCandidates.length === 1) {
        const invented = inventedCandidates[0]
        if (endpoint === 'source') op.payload.relationship.sourceEntityKey = invented.key
        else op.payload.relationship.targetEntityKey = invented.key
        op.metadata = {
          ...(op.metadata ?? {}),
          [`${endpoint}DescriptorResolution`]: 'invented_if_missing',
          [`${endpoint}DescriptorEntityKey`]: invented.key,
        }
        const supportingOp = entityOpByKey.get(invented.key)
        if (supportingOp) {
          supportingOp.metadata = {
            ...(supportingOp.metadata ?? {}),
            descriptorResolution: 'invented_if_missing',
            descriptorDisplayName: supportingOp.payload.entity.name,
            displayName: supportingOp.payload.entity.name,
          }
        }
        diagnostics.push({
          opId: op.id,
          descriptor: refName,
          resolution: 'invented_if_missing',
          entityKey: invented.key,
        })
        return
      }

      if (isUnderspecifiedDescriptorReference(refName, nodeTypeHint) || isPlaceholderLikeEntityName(refName, nodeTypeHint)) {
        issues.push({
          kind: 'unresolved_relationship_endpoint',
          opId: op.id,
          endpoint,
          entityName: refName,
        })
        diagnostics.push({
          opId: op.id,
          descriptor: refName,
          resolution: decision === 'needs_review' ? 'needs_review' : 'invented_if_missing',
          entityKey: null,
        })
      }
    })
  }

  return {
    ops: retainedOps,
    issues,
    diagnostics,
  }
}
