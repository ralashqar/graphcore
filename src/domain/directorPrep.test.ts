import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDirectorPrepGraphRows, directorPrepNodeKeys, stableDirectorPrepHash, summarizeDirectorPrepRun } from './directorPrep.ts'

const base = { workflowId: 'wf', draftId: 'draft', sessionId: 'sess' }

test('prep graph fans out one sheet node per cast member without a reference and gates the frame behind them', () => {
  const { nodes, edges, sheetKeys } = buildDirectorPrepGraphRows({
    ...base,
    cast: [
      { entityKey: 'hero', name: 'Hero', referenceAssetKey: 'sheet_hero', force: false },
      { entityKey: 'kell', name: 'Kell', referenceAssetKey: null, force: false },
      { entityKey: 'observatory', name: 'Observatory', referenceAssetKey: 'thumb', force: true },
    ],
    frame: { prompt: 'p', aspectRatio: '16:9', assetKey: 'frame_1', storagePath: 'generated/x.webp', referenceEntityKeys: ['hero', 'kell'] },
  })
  assert.deepEqual(sheetKeys, [directorPrepNodeKeys.sheet('kell'), directorPrepNodeKeys.sheet('observatory')])
  assert.deepEqual(nodes.map((n) => n.key), ['director_prep_context', 'director_cast_sheet__kell', 'director_cast_sheet__observatory', 'director_frame_compose', 'director_prep_ready'])
  const pairs = edges.map((e) => `${e.source_node_key}>${e.target_node_key}`)
  assert.deepEqual(pairs, [
    'director_prep_context>director_cast_sheet__kell',
    'director_prep_context>director_cast_sheet__observatory',
    'director_cast_sheet__kell>director_frame_compose',
    'director_cast_sheet__observatory>director_frame_compose',
    'director_frame_compose>director_prep_ready',
  ])
  const sheet = nodes[1]
  assert.equal((sheet.config as Record<string, unknown>).purpose, 'director_cast_sheet')
  assert.deepEqual((sheet.config as { execution: unknown }).execution, { resourceClass: 'image', groupKey: 'director_cast_sheets', maxConcurrency: 4 })
  assert.equal(typeof (sheet.metadata as { compileHash: string }).compileHash, 'string')
})

test('prep graph with nothing to generate still yields context → ready', () => {
  const { nodes, edges } = buildDirectorPrepGraphRows({ ...base, cast: [{ entityKey: 'hero', name: 'Hero', referenceAssetKey: 'sheet', force: false }] })
  assert.deepEqual(nodes.map((n) => n.key), ['director_prep_context', 'director_prep_ready'])
  assert.deepEqual(edges.map((e) => e.key), ['director_prep_context__director_prep_ready'])
})

test('compile hash is stable across key order and changes with config', () => {
  assert.equal(stableDirectorPrepHash({ a: 1, b: { c: 2, d: 3 } }), stableDirectorPrepHash({ b: { d: 3, c: 2 }, a: 1 }))
  assert.notEqual(stableDirectorPrepHash({ a: 1 }), stableDirectorPrepHash({ a: 2 }))
})

test('run summary orders steps, reads readiness outputs and the composed frame', () => {
  const { nodes } = buildDirectorPrepGraphRows({
    ...base,
    cast: [{ entityKey: 'kell', name: 'Kell', referenceAssetKey: null, force: false }],
    frame: { prompt: 'p', aspectRatio: '16:9', assetKey: 'frame_1', storagePath: 'x', referenceEntityKeys: ['kell'] },
  })
  const summary = summarizeDirectorPrepRun({
    run: {
      status: 'completed',
      steps: [
        { nodeKey: 'director_prep_ready', label: 'Take readiness', status: 'completed', outputs: { ready: true, cast: [{ entityKey: 'kell', assetKey: 'sheet_kell' }], referenceAssetKeys: ['sheet_kell'], firstFrameAssetKey: 'frame_1' } },
        { nodeKey: 'director_cast_sheet__kell', label: 'Reference sheet · Kell', status: 'completed', outputs: { entityKey: 'kell', assetKey: 'sheet_kell' } },
        { nodeKey: 'director_frame_compose', label: 'Compose start frame', status: 'completed', outputs: { assetKey: 'frame_1' } },
        { nodeKey: 'director_prep_context', label: 'Cast & scene context', status: 'completed' },
      ],
    },
    nodes: nodes.map((n) => ({ key: n.key, label: String(n.label), config: n.config as Record<string, unknown> })),
  })
  assert.deepEqual(summary.steps.map((s) => s.kind), ['context', 'sheet', 'frame', 'ready'])
  assert.equal(summary.terminal, true)
  assert.equal(summary.frameAssetKey, 'frame_1')
  assert.deepEqual(summary.ready?.referenceAssetKeys, ['sheet_kell'])
  assert.equal(summary.completed, 4)
  const waiting = summarizeDirectorPrepRun({ run: { status: 'running', steps: [{ nodeKey: 'director_cast_sheet__kell', label: 'x', status: 'running', outputs: { waiting: true } }] }, nodes: nodes.map((n) => ({ key: n.key, label: String(n.label), config: n.config as Record<string, unknown> })) })
  assert.equal(waiting.steps.find((s) => s.kind === 'sheet')?.waiting, true)
  assert.equal(waiting.ready, null)
})
