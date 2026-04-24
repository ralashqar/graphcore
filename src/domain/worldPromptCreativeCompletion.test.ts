import test from 'node:test'
import assert from 'node:assert/strict'

import type { PromptToWorldOp } from './worldPrompt.ts'
import {
  completeCreativeDescriptorOps,
  descriptorResolutionDecision,
  inferDescriptorNodeType,
  isPlaceholderLikeEntityName,
  isUnderspecifiedDescriptorReference,
} from './worldPromptCreativeCompletion.ts'

function upsertEntityOp(input: {
  id: string
  name: string
  nodeType: 'actor' | 'group' | 'place' | 'concept' | 'event' | 'object'
}) {
  return {
    id: input.id,
    op: 'upsert_entity',
    confidence: 0.9,
    applyMode: 'auto',
    dependencyOpIds: [],
    rationale: '',
    status: 'pending',
    metadata: {},
    payload: {
      targetEntityKey: null,
      entity: {
        name: input.name,
        summary: '',
        context: '',
        nodeType: input.nodeType,
        aliases: [],
        tags: [],
        status: 'active',
        thumbnailAssetKey: null,
        linkedDefinitionKey: null,
        source: 'ai',
        customProperties: {},
        metadata: {},
        ensureLinkedDefinition: true,
      },
    },
  } satisfies PromptToWorldOp
}

function upsertRelationshipOp(input: {
  id: string
  sourceName: string
  targetName: string
  verb: string
}) {
  return {
    id: input.id,
    op: 'upsert_relationship',
    confidence: 0.9,
    applyMode: 'auto',
    dependencyOpIds: [],
    rationale: '',
    status: 'pending',
    metadata: {},
    payload: {
      targetRelationshipKey: null,
      relationship: {
        sourceEntityKey: null,
        targetEntityKey: null,
        sourceRef: {
          entityKey: null,
          definitionKey: null,
          name: input.sourceName,
          alias: null,
          matchCandidateEntityKeys: [],
        },
        targetRef: {
          entityKey: null,
          definitionKey: null,
          name: input.targetName,
          alias: null,
          matchCandidateEntityKeys: [],
        },
        verb: input.verb,
        direction: 'outbound',
        strength: null,
        confidence: 0.9,
        source: 'ai',
        notes: '',
        state: 'confirmed',
        metadata: {},
      },
    },
  } satisfies PromptToWorldOp
}

test('isPlaceholderLikeEntityName detects generic canon placeholders', () => {
  assert.equal(isPlaceholderLikeEntityName('Rival Faction', 'group'), true)
  assert.equal(isPlaceholderLikeEntityName('Unnamed Man of the Rival Faction', 'actor'), true)
  assert.equal(isPlaceholderLikeEntityName('Love Interest', 'actor'), true)
  assert.equal(isPlaceholderLikeEntityName('Secret Order', 'group'), true)
  assert.equal(isPlaceholderLikeEntityName('Dark Order', 'group'), true)
  assert.equal(isPlaceholderLikeEntityName('Ashen Banner', 'group'), false)
  assert.equal(isPlaceholderLikeEntityName('Order of Cindervigil', 'group'), false)
  assert.equal(isPlaceholderLikeEntityName('Caelan Voss', 'actor'), false)
})

test('descriptor helpers classify underspecified references and resolution outcomes', () => {
  assert.equal(isUnderspecifiedDescriptorReference('a man from the rival faction', 'actor'), true)
  assert.equal(isUnderspecifiedDescriptorReference('their mentor', 'actor'), true)
  assert.equal(isUnderspecifiedDescriptorReference('House Valedorn', 'group'), false)
  assert.equal(inferDescriptorNodeType('the rival faction'), 'group')
  assert.equal(inferDescriptorNodeType('a man from the rival faction'), 'actor')
  assert.equal(descriptorResolutionDecision({ matchType: 'exact_name', candidateCount: 1 }), 'reused_existing')
  assert.equal(descriptorResolutionDecision({ matchType: 'none', candidateCount: 0 }), 'invented_if_missing')
  assert.equal(descriptorResolutionDecision({ matchType: 'ambiguous_exact', candidateCount: 2 }), 'needs_review')
})

test('completeCreativeDescriptorOps reuses a clear existing faction and binds the invented actor to relationships', () => {
  const prompt = 'add a character called Yara who is the daughter of the queen, and is controversially in a love interest with a man who is from the rival faction'
  const result = completeCreativeDescriptorOps({
    prompt,
    mode: 'direct_build',
    classification: 'graphable_direct',
    existingEntities: [{
      key: 'world.group.red-hand-coalition',
      name: 'Red Hand Coalition',
      aliases: ['the coalition'],
      nodeType: 'group',
      summary: 'The rival faction pressing against the queen.',
      tags: ['rival faction'],
    }],
    ops: [
      upsertEntityOp({ id: 'entity-yara', name: 'Yara', nodeType: 'actor' }),
      upsertEntityOp({ id: 'entity-placeholder-faction', name: 'Rival Faction', nodeType: 'group' }),
      upsertEntityOp({ id: 'entity-caelan', name: 'Caelan Voss', nodeType: 'actor' }),
      upsertRelationshipOp({ id: 'rel-love', sourceName: 'Yara', targetName: 'a man from the rival faction', verb: 'in_love_with' }),
      upsertRelationshipOp({ id: 'rel-faction', sourceName: 'Caelan Voss', targetName: 'the rival faction', verb: 'member_of' }),
    ],
  })

  assert.equal(result.issues.length, 0)
  assert.equal(result.ops.some((op) => op.id === 'entity-placeholder-faction'), false)
  const loveRelationship = result.ops.find((op) => op.id === 'rel-love' && op.op === 'upsert_relationship')
  const factionRelationship = result.ops.find((op) => op.id === 'rel-faction' && op.op === 'upsert_relationship')
  const inventedActor = result.ops.find((op) => op.id === 'entity-caelan' && op.op === 'upsert_entity')

  assert.ok(loveRelationship && loveRelationship.op === 'upsert_relationship')
  assert.ok(factionRelationship && factionRelationship.op === 'upsert_relationship')
  assert.ok(inventedActor && inventedActor.op === 'upsert_entity')
  assert.equal(loveRelationship.payload.relationship.targetEntityKey, inventedActor.payload.targetEntityKey)
  assert.equal(factionRelationship.payload.relationship.targetEntityKey, 'world.group.red-hand-coalition')
  assert.equal(inventedActor.metadata?.descriptorResolution, 'invented_if_missing')
})

test('completeCreativeDescriptorOps flags unresolved placeholder canon when no concrete support entity exists', () => {
  const prompt = 'add a character called Yara who is controversially in love with a man from the rival faction'
  const result = completeCreativeDescriptorOps({
    prompt,
    mode: 'direct_build',
    classification: 'graphable_direct',
    existingEntities: [],
    ops: [
      upsertEntityOp({ id: 'entity-yara', name: 'Yara', nodeType: 'actor' }),
      upsertEntityOp({ id: 'entity-rival-faction', name: 'Rival Faction', nodeType: 'group' }),
      upsertEntityOp({ id: 'entity-unnamed-man', name: 'Unnamed Man of the Rival Faction', nodeType: 'actor' }),
      upsertRelationshipOp({ id: 'rel-love', sourceName: 'Yara', targetName: 'a man from the rival faction', verb: 'in_love_with' }),
    ],
  })

  assert.equal(result.issues.some((issue) => issue.kind === 'placeholder_entity' && issue.entityName === 'Rival Faction'), true)
  assert.equal(result.issues.some((issue) => issue.kind === 'placeholder_entity' && issue.entityName === 'Unnamed Man of the Rival Faction'), true)
})

test('completeCreativeDescriptorOps keeps review pressure when the rival faction descriptor matches multiple existing groups', () => {
  const result = completeCreativeDescriptorOps({
    prompt: 'add a character called Yara who is controversially in love with a man from the rival faction',
    mode: 'direct_build',
    classification: 'graphable_direct',
    existingEntities: [
      {
        key: 'world.group.red-hand-coalition',
        name: 'Red Hand Coalition',
        aliases: [],
        nodeType: 'group',
        summary: 'A rival faction fighting the queen.',
        tags: ['rival faction'],
      },
      {
        key: 'world.group.ashen-banner',
        name: 'Ashen Banner',
        aliases: [],
        nodeType: 'group',
        summary: 'Another rival faction competing for the throne.',
        tags: ['rival faction'],
      },
    ],
    ops: [
      upsertEntityOp({ id: 'entity-yara', name: 'Yara', nodeType: 'actor' }),
      upsertEntityOp({ id: 'entity-placeholder-faction', name: 'Rival Faction', nodeType: 'group' }),
      upsertRelationshipOp({ id: 'rel-love', sourceName: 'Yara', targetName: 'the rival faction', verb: 'entangled_with' }),
    ],
  })

  assert.equal(result.issues.some((issue) => issue.kind === 'placeholder_entity' && issue.entityName === 'Rival Faction'), true)
})

test('completeCreativeDescriptorOps does not invent graph mutations for advisory turns', () => {
  const result = completeCreativeDescriptorOps({
    prompt: 'what relationship options might fit a daughter of the queen and someone from the rival faction?',
    mode: 'advisory_diagnosis',
    classification: 'advisory_question',
    existingEntities: [],
    ops: [
      upsertEntityOp({ id: 'entity-rival-faction', name: 'Rival Faction', nodeType: 'group' }),
    ],
  })

  assert.equal(result.issues.length, 0)
  assert.equal(result.ops.length, 1)
  const op = result.ops[0]
  assert.ok(op && op.op === 'upsert_entity')
  assert.equal(op.payload.entity.name, 'Rival Faction')
})
