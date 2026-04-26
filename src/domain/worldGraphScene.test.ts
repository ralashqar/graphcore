import test from 'node:test'
import assert from 'node:assert/strict'

import type { WorldEntity, WorldGraphConnection, WorldOperator, WorldRelationship, WorldResult } from './worldGraph.ts'
import { deriveContinuousWorldScene } from './worldGraphScene.ts'

function createEntity(input: Partial<WorldEntity> & Pick<WorldEntity, 'key' | 'name' | 'nodeType'>): WorldEntity {
  return {
    id: input.id ?? input.key,
    key: input.key,
    name: input.name,
    summary: input.summary ?? '',
    context: input.context ?? '',
    nodeType: input.nodeType,
    aliases: input.aliases ?? [],
    tags: input.tags ?? [],
    status: input.status ?? 'active',
    thumbnailAssetKey: input.thumbnailAssetKey ?? null,
    linkedDefinitionKey: input.linkedDefinitionKey ?? null,
    source: input.source ?? 'user',
    customProperties: input.customProperties ?? {},
    metadata: input.metadata ?? {},
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  }
}

function createRelationship(input: Pick<WorldRelationship, 'key' | 'sourceEntityKey' | 'targetEntityKey' | 'verb'>): WorldRelationship {
  return {
    id: input.key,
    key: input.key,
    sourceEntityKey: input.sourceEntityKey,
    targetEntityKey: input.targetEntityKey,
    verb: input.verb,
    direction: 'outbound',
    strength: null,
    confidence: null,
    source: 'user',
    notes: '',
    state: 'confirmed',
    metadata: {},
  }
}

function createConnection(input: Pick<WorldGraphConnection, 'key' | 'sourceNodeKey' | 'sourceNodeKind' | 'targetNodeKey' | 'targetNodeKind'>): WorldGraphConnection {
  return {
    id: input.key,
    key: input.key,
    sourceNodeKey: input.sourceNodeKey,
    sourceNodeKind: input.sourceNodeKind,
    targetNodeKey: input.targetNodeKey,
    targetNodeKind: input.targetNodeKind,
    role: 'input',
    metadata: {},
  }
}

test('deriveContinuousWorldScene keeps sparse reachable neighborhoods expanded instead of forcing artificial far dots', () => {
  const elian = createEntity({ key: 'world.actor.elian', name: 'Elian Vale', nodeType: 'actor' })
  const queen = createEntity({ key: 'world.actor.queen', name: 'Queen Mirelle', nodeType: 'actor' })
  const pact = createEntity({ key: 'world.concept.pact', name: 'Sea Pact', nodeType: 'concept' })
  const harbor = createEntity({ key: 'world.place.harbor', name: 'Harbor', nodeType: 'place' })
  const smuggler = createEntity({ key: 'world.actor.smuggler', name: 'Smuggler', nodeType: 'actor' })

  const scene = deriveContinuousWorldScene({
    entities: [elian, queen, pact, harbor, smuggler],
    operators: [] as WorldOperator[],
    results: [] as WorldResult[],
    relationships: [
      createRelationship({ key: 'r1', sourceEntityKey: elian.key, targetEntityKey: queen.key, verb: 'serves' }),
      createRelationship({ key: 'r2', sourceEntityKey: queen.key, targetEntityKey: pact.key, verb: 'hides' }),
      createRelationship({ key: 'r3', sourceEntityKey: pact.key, targetEntityKey: harbor.key, verb: 'surfaces in' }),
    ],
    connections: [],
    filteredEntityKeys: [elian.key, queen.key, pact.key, harbor.key, smuggler.key],
    seedEntityKeys: [elian.key],
    pinnedNodeKeys: [smuggler.key],
    storyThreadEntityKeys: [],
    selectedNodeKey: null,
    focusRootKey: elian.key,
    presentationMode: 'world',
    viewKind: 'entity_neighborhood',
    focusDepth: 1,
    showDerivedLayer: true,
  })

  assert.equal(scene.rootEntityKey, elian.key)
  assert.equal(scene.nodeByKey[elian.key]?.tier, 'focus')
  assert.equal(scene.nodeByKey[queen.key]?.tier, 'near')
  assert.equal(scene.nodeByKey[pact.key]?.tier, 'near')
  assert.equal(scene.nodeByKey[smuggler.key]?.tier, 'near')
  assert.equal(scene.nodeByKey[harbor.key]?.tier, 'near')
})

test('deriveContinuousWorldScene keeps story-thread entities visible and pulls in connected derived nodes', () => {
  const elian = createEntity({ key: 'world.actor.elian', name: 'Elian Vale', nodeType: 'actor' })
  const pact = createEntity({ key: 'world.concept.pact', name: 'Sea Pact', nodeType: 'concept' })
  const beacon = createEntity({ key: 'world.place.beacon', name: 'Beacon', nodeType: 'place' })
  const operator: WorldOperator = {
    id: 'world.operator.beacon-scene',
    key: 'world.operator.beacon-scene',
    operatorType: 'stage_scene',
    inputEntityKeys: [elian.key, beacon.key],
    label: 'Stage Beacon Scene',
    status: 'active',
    metadata: {},
  }

  const scene = deriveContinuousWorldScene({
    entities: [elian, pact, beacon],
    operators: [operator],
    results: [] as WorldResult[],
    relationships: [
      createRelationship({ key: 'r1', sourceEntityKey: elian.key, targetEntityKey: pact.key, verb: 'investigates' }),
    ],
    connections: [
      createConnection({
        key: 'c1',
        sourceNodeKey: elian.key,
        sourceNodeKind: 'entity',
        targetNodeKey: operator.key,
        targetNodeKind: 'operator',
      }),
    ],
    filteredEntityKeys: [elian.key, pact.key, beacon.key],
    seedEntityKeys: [],
    pinnedNodeKeys: [],
    storyThreadEntityKeys: [elian.key, pact.key],
    selectedNodeKey: null,
    focusRootKey: elian.key,
    presentationMode: 'story',
    viewKind: 'thread_focus',
    focusDepth: 1,
    showDerivedLayer: true,
  })

  assert.equal(scene.nodeByKey[elian.key]?.tier, 'focus')
  assert.equal(scene.nodeByKey[pact.key]?.tier, 'near')
  assert.equal(scene.nodeByKey[operator.key]?.tier, 'far')
  assert.equal(scene.edgeEmphasisByKey.r1, 'focus')
  assert.equal(scene.edgeEmphasisByKey.c1, 'focus')
})

test('deriveContinuousWorldScene demotes dense neighborhoods into far dots instead of clipping too early', () => {
  const root = createEntity({ key: 'world.actor.root', name: 'Root', nodeType: 'actor' })
  const directNeighbors = Array.from({ length: 16 }, (_, index) =>
    createEntity({ key: `world.actor.n${index + 1}`, name: `Neighbor ${index + 1}`, nodeType: 'actor' }))
  const secondHop = Array.from({ length: 12 }, (_, index) =>
    createEntity({ key: `world.place.p${index + 1}`, name: `Place ${index + 1}`, nodeType: 'place' }))

  const relationships: WorldRelationship[] = [
    ...directNeighbors.map((neighbor, index) =>
      createRelationship({ key: `r-direct-${index + 1}`, sourceEntityKey: root.key, targetEntityKey: neighbor.key, verb: 'knows' })),
    ...secondHop.map((place, index) =>
      createRelationship({ key: `r-hop-${index + 1}`, sourceEntityKey: directNeighbors[index % directNeighbors.length]!.key, targetEntityKey: place.key, verb: 'visits' })),
  ]

  const scene = deriveContinuousWorldScene({
    entities: [root, ...directNeighbors, ...secondHop],
    operators: [] as WorldOperator[],
    results: [] as WorldResult[],
    relationships,
    connections: [],
    filteredEntityKeys: [root, ...directNeighbors, ...secondHop].map((entity) => entity.key),
    seedEntityKeys: [root.key],
    pinnedNodeKeys: [],
    storyThreadEntityKeys: [],
    selectedNodeKey: null,
    focusRootKey: root.key,
    presentationMode: 'world',
    viewKind: 'entity_neighborhood',
    focusDepth: 1,
    showDerivedLayer: true,
  })

  const nearCount = Object.values(scene.nodeByKey).filter((node) => node.tier === 'near').length
  const farCount = Object.values(scene.nodeByKey).filter((node) => node.tier === 'far').length

  assert.ok(nearCount >= 6, `expected a meaningful near-card budget, got ${nearCount}`)
  assert.ok(nearCount < directNeighbors.length, `expected dense direct neighbors to be demoted, got ${nearCount}`)
  assert.ok(farCount > 0, 'expected surplus nodes to remain visible as far dots')
  assert.ok(Object.keys(scene.nodeByKey).length > nearCount + 1, 'expected more than just focus + near cards to stay visible')
})

test('deriveContinuousWorldScene spaces dense near neighborhoods away from obvious overlap', () => {
  const root = createEntity({ key: 'world.actor.root', name: 'Root', nodeType: 'actor' })
  const directNeighbors = Array.from({ length: 10 }, (_, index) =>
    createEntity({ key: `world.actor.cluster${index + 1}`, name: `Cluster Neighbor ${index + 1}`, nodeType: 'actor' }))

  const scene = deriveContinuousWorldScene({
    entities: [root, ...directNeighbors],
    operators: [] as WorldOperator[],
    results: [] as WorldResult[],
    relationships: directNeighbors.map((neighbor, index) =>
      createRelationship({ key: `r-cluster-${index + 1}`, sourceEntityKey: root.key, targetEntityKey: neighbor.key, verb: 'knows' })),
    connections: [],
    filteredEntityKeys: [root, ...directNeighbors].map((entity) => entity.key),
    seedEntityKeys: [root.key],
    pinnedNodeKeys: [],
    storyThreadEntityKeys: [],
    selectedNodeKey: null,
    focusRootKey: root.key,
    presentationMode: 'world',
    viewKind: 'entity_neighborhood',
    focusDepth: 1,
    showDerivedLayer: true,
  })

  const nearNodes = Object.values(scene.nodeByKey).filter((node) => node.tier === 'near')
  for (let index = 0; index < nearNodes.length; index += 1) {
    const left = nearNodes[index]
    if (!left) continue
    for (let otherIndex = index + 1; otherIndex < nearNodes.length; otherIndex += 1) {
      const right = nearNodes[otherIndex]
      if (!right) continue
      const dx = right.targetPosition.x - left.targetPosition.x
      const dy = right.targetPosition.y - left.targetPosition.y
      const distance = Math.hypot(dx, dy)
      assert.ok(distance >= 120, `expected near nodes ${left.key} and ${right.key} to be spaced apart, got ${distance}`)
    }
  }
})

test('deriveContinuousWorldScene keeps overflow reachable nodes visible as peripheral dots', () => {
  const root = createEntity({ key: 'world.actor.root', name: 'Root', nodeType: 'actor' })
  const branchRoots = Array.from({ length: 18 }, (_, index) =>
    createEntity({ key: `world.group.branch${index + 1}`, name: `Branch ${index + 1}`, nodeType: 'group' }))
  const outerNodes = Array.from({ length: 80 }, (_, index) =>
    createEntity({ key: `world.concept.outer${index + 1}`, name: `Outer ${index + 1}`, nodeType: 'concept' }))

  const relationships: WorldRelationship[] = [
    ...branchRoots.map((branch, index) =>
      createRelationship({ key: `r-branch-${index + 1}`, sourceEntityKey: root.key, targetEntityKey: branch.key, verb: 'anchors' })),
    ...outerNodes.map((outer, index) =>
      createRelationship({ key: `r-outer-${index + 1}`, sourceEntityKey: branchRoots[index % branchRoots.length]!.key, targetEntityKey: outer.key, verb: 'shapes' })),
  ]

  const scene = deriveContinuousWorldScene({
    entities: [root, ...branchRoots, ...outerNodes],
    operators: [] as WorldOperator[],
    results: [] as WorldResult[],
    relationships,
    connections: [],
    filteredEntityKeys: [root, ...branchRoots, ...outerNodes].map((entity) => entity.key),
    seedEntityKeys: [root.key],
    pinnedNodeKeys: [],
    storyThreadEntityKeys: [],
    selectedNodeKey: null,
    focusRootKey: root.key,
    presentationMode: 'world',
    viewKind: 'entity_neighborhood',
    focusDepth: 2,
    showDerivedLayer: true,
  })

  const peripheralCount = Object.values(scene.nodeByKey).filter((node) => node.tier === 'peripheral').length
  assert.ok(peripheralCount > 0, 'expected third-ring peripheral dots for dense reachable overflow')
})

test('deriveContinuousWorldScene graph depth mode expands outer radar context without changing the root', () => {
  const root = createEntity({ key: 'world.actor.root', name: 'Root', nodeType: 'actor' })
  const branchRoots = Array.from({ length: 10 }, (_, index) =>
    createEntity({ key: `world.group.branch${index + 1}`, name: `Branch ${index + 1}`, nodeType: 'group' }))
  const secondHop = Array.from({ length: 30 }, (_, index) =>
    createEntity({ key: `world.place.second${index + 1}`, name: `Second ${index + 1}`, nodeType: 'place' }))
  const thirdHop = Array.from({ length: 30 }, (_, index) =>
    createEntity({ key: `world.concept.third${index + 1}`, name: `Third ${index + 1}`, nodeType: 'concept' }))

  const relationships: WorldRelationship[] = [
    ...branchRoots.map((branch, index) =>
      createRelationship({ key: `r-branch-depth-${index + 1}`, sourceEntityKey: root.key, targetEntityKey: branch.key, verb: 'anchors' })),
    ...secondHop.map((entity, index) =>
      createRelationship({ key: `r-second-depth-${index + 1}`, sourceEntityKey: branchRoots[index % branchRoots.length]!.key, targetEntityKey: entity.key, verb: 'touches' })),
    ...thirdHop.map((entity, index) =>
      createRelationship({ key: `r-third-depth-${index + 1}`, sourceEntityKey: secondHop[index % secondHop.length]!.key, targetEntityKey: entity.key, verb: 'echoes' })),
  ]
  const entities = [root, ...branchRoots, ...secondHop, ...thirdHop]
  const baseInput = {
    entities,
    operators: [] as WorldOperator[],
    results: [] as WorldResult[],
    relationships,
    connections: [] as WorldGraphConnection[],
    filteredEntityKeys: entities.map((entity) => entity.key),
    seedEntityKeys: [root.key],
    pinnedNodeKeys: [],
    storyThreadEntityKeys: [],
    selectedNodeKey: null,
    focusRootKey: root.key,
    presentationMode: 'world' as const,
    viewKind: 'entity_neighborhood' as const,
    focusDepth: 1,
    showDerivedLayer: true,
  }

  const tightScene = deriveContinuousWorldScene({ ...baseInput, graphDepthMode: 'tight' })
  const wideScene = deriveContinuousWorldScene({ ...baseInput, graphDepthMode: 'wide' })

  assert.equal(tightScene.rootEntityKey, root.key)
  assert.equal(wideScene.rootEntityKey, root.key)
  assert.ok(wideScene.targetNodeKeys.length > tightScene.targetNodeKeys.length, 'expected wide mode to keep more outer nodes visible')
  assert.equal(thirdHop.some((entity) => Boolean(tightScene.nodeByKey[entity.key])), false)
  assert.equal(thirdHop.some((entity) => Boolean(wideScene.nodeByKey[entity.key])), true)
})

test('deriveContinuousWorldScene keeps focused atlas overflow in outer tiers', () => {
  const root = createEntity({ key: 'world.actor.root', name: 'Root', nodeType: 'actor' })
  const neighbor = createEntity({ key: 'world.actor.neighbor', name: 'Neighbor', nodeType: 'actor' })
  const secondHop = createEntity({ key: 'world.place.second', name: 'Second Hop', nodeType: 'place' })
  const unrelatedNodes = Array.from({ length: 12 }, (_, index) =>
    createEntity({ key: `world.concept.unrelated${index + 1}`, name: `Unrelated ${index + 1}`, nodeType: 'concept' }))
  const entities = [root, neighbor, secondHop, ...unrelatedNodes]
  const relationships: WorldRelationship[] = [
    createRelationship({ key: 'r-root-neighbor', sourceEntityKey: root.key, targetEntityKey: neighbor.key, verb: 'knows' }),
    createRelationship({ key: 'r-neighbor-second', sourceEntityKey: neighbor.key, targetEntityKey: secondHop.key, verb: 'guards' }),
  ]

  const focusedScene = deriveContinuousWorldScene({
    entities,
    operators: [] as WorldOperator[],
    results: [] as WorldResult[],
    relationships,
    connections: [],
    filteredEntityKeys: entities.map((entity) => entity.key),
    seedEntityKeys: [root.key],
    pinnedNodeKeys: [],
    storyThreadEntityKeys: [],
    selectedNodeKey: null,
    focusRootKey: root.key,
    presentationMode: 'world',
    viewKind: 'entity_neighborhood',
    focusDepth: 1,
    showDerivedLayer: true,
    graphDepthMode: 'tight',
    includeAllContext: true,
  })
  const globalScene = deriveContinuousWorldScene({
    entities,
    operators: [] as WorldOperator[],
    results: [] as WorldResult[],
    relationships,
    connections: [],
    filteredEntityKeys: entities.map((entity) => entity.key),
    seedEntityKeys: [root.key],
    pinnedNodeKeys: [],
    storyThreadEntityKeys: [],
    selectedNodeKey: null,
    focusRootKey: root.key,
    presentationMode: 'world',
    viewKind: 'global_overview',
    focusDepth: 1,
    showDerivedLayer: true,
    graphDepthMode: 'wide',
  })

  assert.equal(focusedScene.nodeByKey[neighbor.key]?.tier, 'near')
  assert.ok(focusedScene.nodeByKey[secondHop.key], 'expected focused context to keep useful second-hop context')
  assert.equal(unrelatedNodes.every((entity) => focusedScene.nodeByKey[entity.key]?.tier === 'peripheral'), true)
  assert.equal(unrelatedNodes.every((entity) => Boolean(globalScene.nodeByKey[entity.key])), true)
})

test('deriveContinuousWorldScene preserves direct neighbors before second-hop overflow', () => {
  const root = createEntity({ key: 'world.actor.root', name: 'Root', nodeType: 'actor' })
  const directNeighbors = Array.from({ length: 6 }, (_, index) =>
    createEntity({ key: `world.actor.direct${index + 1}`, name: `Direct ${index + 1}`, nodeType: 'actor' }))
  const secondHop = Array.from({ length: 24 }, (_, index) =>
    createEntity({ key: `world.place.second${index + 1}`, name: `Second ${index + 1}`, nodeType: 'place' }))
  const relationships: WorldRelationship[] = [
    ...directNeighbors.map((neighbor, index) =>
      createRelationship({ key: `r-direct-${index + 1}`, sourceEntityKey: root.key, targetEntityKey: neighbor.key, verb: 'knows' })),
    ...secondHop.map((place, index) =>
      createRelationship({ key: `r-second-${index + 1}`, sourceEntityKey: directNeighbors[index % directNeighbors.length]!.key, targetEntityKey: place.key, verb: 'visits' })),
  ]

  const scene = deriveContinuousWorldScene({
    entities: [root, ...directNeighbors, ...secondHop],
    operators: [] as WorldOperator[],
    results: [] as WorldResult[],
    relationships,
    connections: [],
    filteredEntityKeys: [root, ...directNeighbors, ...secondHop].map((entity) => entity.key),
    seedEntityKeys: [root.key],
    pinnedNodeKeys: [],
    storyThreadEntityKeys: [],
    selectedNodeKey: null,
    focusRootKey: root.key,
    presentationMode: 'world',
    viewKind: 'entity_neighborhood',
    focusDepth: 1,
    showDerivedLayer: true,
  })

  for (const neighbor of directNeighbors) {
    assert.equal(scene.nodeByKey[neighbor.key]?.tier, 'near', `expected direct neighbor ${neighbor.key} to stay near`)
  }
})

test('deriveContinuousWorldScene applies display filters to outer tiers while preserving protected nodes', () => {
  const root = createEntity({ key: 'world.actor.root', name: 'Root', nodeType: 'actor' })
  const place = createEntity({ key: 'world.place.keep', name: 'Keep', nodeType: 'place' })
  const protectedConcept = createEntity({ key: 'world.concept.oath', name: 'Oath', nodeType: 'concept' })
  const outerConcepts = Array.from({ length: 18 }, (_, index) =>
    createEntity({ key: `world.concept.outer${index + 1}`, name: `Outer ${index + 1}`, nodeType: 'concept' }))
  const relationships: WorldRelationship[] = [
    createRelationship({ key: 'r-root-place', sourceEntityKey: root.key, targetEntityKey: place.key, verb: 'guards' }),
    createRelationship({ key: 'r-place-protected', sourceEntityKey: place.key, targetEntityKey: protectedConcept.key, verb: 'swears' }),
    ...outerConcepts.map((concept, index) =>
      createRelationship({ key: `r-outer-filter-${index + 1}`, sourceEntityKey: place.key, targetEntityKey: concept.key, verb: 'mentions' })),
  ]
  const entities = [root, place, protectedConcept, ...outerConcepts]

  const scene = deriveContinuousWorldScene({
    entities,
    operators: [] as WorldOperator[],
    results: [] as WorldResult[],
    relationships,
    connections: [],
    filteredEntityKeys: entities.map((entity) => entity.key),
    seedEntityKeys: [root.key],
    pinnedNodeKeys: [],
    storyThreadEntityKeys: [],
    selectedNodeKey: null,
    focusRootKey: root.key,
    presentationMode: 'world',
    viewKind: 'entity_neighborhood',
    focusDepth: 2,
    showDerivedLayer: true,
    graphDepthMode: 'wide',
    enabledEntityTypes: ['actor', 'place'],
    protectedNodeKeys: [protectedConcept.key],
  })

  assert.equal(scene.nodeByKey[root.key]?.tier, 'focus')
  assert.equal(scene.nodeByKey[place.key]?.tier, 'near')
  assert.ok(scene.nodeByKey[protectedConcept.key], 'expected protected filtered node to stay visible')
  assert.equal(outerConcepts.some((entity) => scene.nodeByKey[entity.key]?.tier === 'peripheral'), false)
})

test('deriveContinuousWorldScene is deterministic for branch grouped outer nodes', () => {
  const root = createEntity({ key: 'world.actor.root', name: 'Root', nodeType: 'actor' })
  const branchA = createEntity({ key: 'world.group.branch-a', name: 'Branch A', nodeType: 'group' })
  const branchB = createEntity({ key: 'world.group.branch-b', name: 'Branch B', nodeType: 'group' })
  const outerNodes = Array.from({ length: 18 }, (_, index) =>
    createEntity({ key: `world.concept.outer${index + 1}`, name: `Outer ${index + 1}`, nodeType: 'concept' }))
  const relationships: WorldRelationship[] = [
    createRelationship({ key: 'r-a', sourceEntityKey: root.key, targetEntityKey: branchA.key, verb: 'anchors' }),
    createRelationship({ key: 'r-b', sourceEntityKey: root.key, targetEntityKey: branchB.key, verb: 'anchors' }),
    ...outerNodes.map((outer, index) =>
      createRelationship({ key: `r-outer-${index + 1}`, sourceEntityKey: index % 2 === 0 ? branchA.key : branchB.key, targetEntityKey: outer.key, verb: 'contains' })),
  ]
  const input = {
    entities: [root, branchA, branchB, ...outerNodes],
    operators: [] as WorldOperator[],
    results: [] as WorldResult[],
    relationships,
    connections: [],
    filteredEntityKeys: [root, branchA, branchB, ...outerNodes].map((entity) => entity.key),
    seedEntityKeys: [root.key],
    pinnedNodeKeys: [],
    storyThreadEntityKeys: [],
    selectedNodeKey: null,
    focusRootKey: root.key,
    presentationMode: 'world' as const,
    viewKind: 'entity_neighborhood' as const,
    focusDepth: 2,
    showDerivedLayer: true,
  }

  const first = deriveContinuousWorldScene(input)
  const second = deriveContinuousWorldScene(input)

  assert.deepEqual(first.targetNodeKeys, second.targetNodeKeys)
  for (const key of first.targetNodeKeys) {
    assert.deepEqual(first.nodeByKey[key]?.targetPosition, second.nodeByKey[key]?.targetPosition)
    assert.equal(first.nodeByKey[key]?.layoutGroupKey, second.nodeByKey[key]?.layoutGroupKey)
  }
})
