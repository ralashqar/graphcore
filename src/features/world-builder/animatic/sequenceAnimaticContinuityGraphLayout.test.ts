import assert from 'node:assert/strict'
import { test } from 'node:test'

import type {
  SequenceAnimaticContinuityGraphEdgeView,
  SequenceAnimaticContinuityGraphNodeKind,
  SequenceAnimaticContinuityGraphNodeView,
} from './sequenceAnimaticContinuityIndexes.ts'
import {
  buildSequenceAnimaticContinuityGraphLayout,
} from './sequenceAnimaticContinuityGraphLayout.ts'

function graphNode(input: {
  id: string
  label: string
  kind: SequenceAnimaticContinuityGraphNodeKind
  parentId?: string | null
  assetUrl?: string | null
}): SequenceAnimaticContinuityGraphNodeView {
  return {
    id: input.id,
    label: input.label,
    kind: input.kind,
    kindLabel: input.kind.replace(/_/g, ' '),
    lane: ['temp_character', 'prop', 'faction', 'vehicle', 'group'].includes(input.kind) ? 'temporary' : 'spatial',
    summary: '',
    shotIds: [],
    blockIds: [],
    parentId: input.parentId ?? null,
    sourceReferenceIds: [],
    assetStatus: input.assetUrl ? 'ready' : 'missing',
    assetStatusLabel: input.assetUrl ? 'Ready' : 'Missing',
    assetKind: input.kind,
    assetUrl: input.assetUrl ?? null,
    required: true,
    batchId: null,
    baseVisualBrief: '',
    overrideVisualBrief: '',
    extraPromptDirection: '',
    effectiveVisualBrief: '',
    canGenerate: true,
    generationTargetType: input.kind === 'coverage_anchor' ? 'coverage_anchor' : 'continuity_asset',
    generationRequestId: null,
    assetHistoryKeys: [],
  }
}

function hierarchyEdge(source: string, target: string): SequenceAnimaticContinuityGraphEdgeView {
  return {
    id: `hierarchy:${source}:${target}`,
    source,
    target,
    kind: 'hierarchy',
    label: 'contains',
  }
}

test('scene graph layout collapses a single set and exposes zone spot POI hints', () => {
  const nodes = [
    graphNode({ id: 'loc_1', label: 'City', kind: 'world_location' }),
    graphNode({ id: 'set_1', label: 'Terminal', kind: 'set', parentId: 'loc_1' }),
    graphNode({ id: 'zone_1', label: 'Gate Hall', kind: 'zone', parentId: 'set_1', assetUrl: 'https://example.test/zone.webp' }),
    graphNode({ id: 'spot_1', label: 'North Door', kind: 'spot', parentId: 'zone_1' }),
    graphNode({ id: 'view_1', label: 'Reverse Angle', kind: 'viewpoint', parentId: 'spot_1', assetUrl: 'https://example.test/view.webp' }),
  ]

  const layout = buildSequenceAnimaticContinuityGraphLayout({
    nodes,
    edges: [
      hierarchyEdge('loc_1', 'set_1'),
      hierarchyEdge('set_1', 'zone_1'),
      hierarchyEdge('zone_1', 'spot_1'),
      hierarchyEdge('spot_1', 'view_1'),
    ],
    mode: 'scene_graph',
  })

  assert.equal(layout.nodes.some((node) => node.node.id === 'set_1'), false)
  assert.equal(layout.edges.some((edge) => edge.source === 'loc_1' && edge.target === 'zone_1'), true)
  const zone = layout.nodes.find((node) => node.node.id === 'zone_1')
  const location = layout.nodes.find((node) => node.node.id === 'loc_1')
  assert.ok(zone)
  assert.ok(location)
  assert.ok(zone.y > location.y)
  assert.equal(zone.displayKindLabel, 'zone')
  assert.equal(zone.poiHints.length, 1)
  assert.equal(zone.poiHints[0].id, 'spot_1')
  const viewpoint = layout.nodes.find((node) => node.node.id === 'view_1')
  assert.equal(viewpoint?.displayKindLabel, 'Camera grid')
})

test('measured scene graph layout prevents node rectangle overlap', () => {
  const nodes = [
    graphNode({ id: 'loc_1', label: 'City', kind: 'world_location' }),
    graphNode({ id: 'set_1', label: 'Terminal A', kind: 'set', parentId: 'loc_1' }),
    graphNode({ id: 'set_2', label: 'Terminal B', kind: 'set', parentId: 'loc_1' }),
    graphNode({ id: 'zone_1', label: 'Gate Hall', kind: 'zone', parentId: 'set_1', assetUrl: 'https://example.test/zone-a.webp' }),
    graphNode({ id: 'zone_2', label: 'Service Tunnel', kind: 'zone', parentId: 'set_2', assetUrl: 'https://example.test/zone-b.webp' }),
    graphNode({ id: 'spot_1', label: 'North Door', kind: 'spot', parentId: 'zone_1', assetUrl: 'https://example.test/spot-a.webp' }),
    graphNode({ id: 'spot_2', label: 'South Door', kind: 'spot', parentId: 'zone_1', assetUrl: 'https://example.test/spot-b.webp' }),
    graphNode({ id: 'spot_3', label: 'Tunnel Bend', kind: 'spot', parentId: 'zone_2', assetUrl: 'https://example.test/spot-c.webp' }),
  ]

  const layout = buildSequenceAnimaticContinuityGraphLayout({
    nodes,
    edges: [],
    mode: 'scene_graph',
  })

  for (let leftIndex = 0; leftIndex < layout.nodes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < layout.nodes.length; rightIndex += 1) {
      const left = layout.nodes[leftIndex]
      const right = layout.nodes[rightIndex]
      const overlaps = left.x < right.x + right.width
        && left.x + left.width > right.x
        && left.y < right.y + right.height
        && left.y + left.height > right.y
      assert.equal(overlaps, false, `${left.node.id} overlaps ${right.node.id}`)
    }
  }
  const parent = layout.nodes.find((node) => node.node.id === 'loc_1')
  const child = layout.nodes.find((node) => node.node.id === 'set_1')
  assert.ok(parent && child)
  assert.ok(child.y > parent.y)
})
