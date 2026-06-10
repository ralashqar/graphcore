import assert from 'node:assert/strict'
import { test } from 'node:test'

import { lintSequenceAnimaticContinuity, normalizeScreenDirection } from './sequenceAnimaticContinuityLint.ts'

function shot(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'shot_001',
    index: 1,
    blockId: 'block_1',
    camera: { framing: '', angle: '', lens: '', movement: '', screenDirectionRule: '' },
    refs: { visibleCharacterRefIds: [], speakerRefIds: [], propRefIds: [], locationRefIds: [] },
    sceneBinding: { setId: 'set_1' },
    coverageSetupId: '',
    dialogue: [],
    ...overrides,
  }
}

function setup(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'setup_1',
    setupKind: 'clean_single',
    setId: 'set_1',
    characterRefIds: [],
    screenDirection: '',
    continuityMode: 'new_setup',
    continuityFromSetupId: '',
    camera: { framing: '', screenDirectionRule: '' },
    ...overrides,
  }
}

test('normalizeScreenDirection handles common phrasings', () => {
  assert.equal(normalizeScreenDirection('left to right'), 'ltr')
  assert.equal(normalizeScreenDirection('moves right to left across frame'), 'rtl')
  assert.equal(normalizeScreenDirection('facing right'), 'ltr')
  assert.equal(normalizeScreenDirection('looking left'), 'rtl')
  assert.equal(normalizeScreenDirection('L-R'), 'ltr')
  assert.equal(normalizeScreenDirection('handheld push in'), null)
  assert.equal(normalizeScreenDirection(''), null)
})

test('empty plan produces no findings', () => {
  const report = lintSequenceAnimaticContinuity({ shots: [], coverageSetups: [] })
  assert.equal(report.findings.length, 0)
})

test('sparse plan without grammar fields produces no noise', () => {
  const report = lintSequenceAnimaticContinuity({
    shots: [shot({ id: 's1' }), shot({ id: 's2', index: 2 })],
    coverageSetups: [],
  })
  assert.equal(report.findings.length, 0)
})

test('unknown coverage setup is an error', () => {
  const report = lintSequenceAnimaticContinuity({
    shots: [shot({ id: 's1', coverageSetupId: 'missing_setup' })],
    coverageSetups: [],
  })
  assert.equal(report.errorCount, 1)
  assert.equal(report.findings[0].code, 'unknown_coverage_setup')
})

test('screen direction flip within a set is flagged', () => {
  const report = lintSequenceAnimaticContinuity({
    shots: [
      shot({ id: 's1', index: 1, coverageSetupId: 'a', camera: { framing: 'medium', screenDirectionRule: 'left to right' } }),
      shot({ id: 's2', index: 2, coverageSetupId: 'b', camera: { framing: 'medium', screenDirectionRule: 'right to left' } }),
    ],
    coverageSetups: [
      setup({ id: 'a' }),
      setup({ id: 'b' }),
    ],
  })
  const finding = report.findings.find((entry) => entry.code === 'screen_direction_flip')
  assert.ok(finding)
  assert.deepEqual(finding?.shotIds, ['s1', 's2'])
})

test('direction flip is allowed across a wide/neutral setup or reverse angle', () => {
  const reportNeutral = lintSequenceAnimaticContinuity({
    shots: [
      shot({ id: 's1', index: 1, coverageSetupId: 'a', camera: { screenDirectionRule: 'left to right' } }),
      shot({ id: 's2', index: 2, coverageSetupId: 'wide', camera: { screenDirectionRule: 'right to left' } }),
    ],
    coverageSetups: [setup({ id: 'a' }), setup({ id: 'wide', setupKind: 'wide_master' })],
  })
  assert.equal(reportNeutral.findings.filter((entry) => entry.code === 'screen_direction_flip').length, 0)

  const reportReverse = lintSequenceAnimaticContinuity({
    shots: [
      shot({ id: 's1', index: 1, coverageSetupId: 'a', camera: { screenDirectionRule: 'left to right' } }),
      shot({ id: 's2', index: 2, coverageSetupId: 'b', camera: { screenDirectionRule: 'right to left' } }),
    ],
    coverageSetups: [
      setup({ id: 'a', setupKind: 'ots_a_to_b' }),
      setup({ id: 'b', setupKind: 'ots_b_to_a', continuityMode: 'reverse_angle', continuityFromSetupId: 'a' }),
    ],
  })
  assert.equal(reportReverse.findings.filter((entry) => entry.code === 'screen_direction_flip').length, 0)
})

test('reverse angle with same screen direction warns', () => {
  const report = lintSequenceAnimaticContinuity({
    shots: [],
    coverageSetups: [
      setup({ id: 'a', screenDirection: 'left to right', characterRefIds: ['hero', 'villain'] }),
      setup({ id: 'b', screenDirection: 'left to right', continuityMode: 'reverse_angle', continuityFromSetupId: 'a', characterRefIds: ['hero', 'villain'] }),
    ],
  })
  assert.equal(report.findings.filter((entry) => entry.code === 'reverse_angle_direction_match').length, 1)
})

test('speaker never covered in block warns; covered speaker does not', () => {
  const report = lintSequenceAnimaticContinuity({
    shots: [
      shot({
        id: 's1',
        refs: { visibleCharacterRefIds: ['hero'], speakerRefIds: ['hero'] },
        dialogue: [{ speakerRefId: 'hero', text: 'Hello.' }],
      }),
      shot({
        id: 's2',
        index: 2,
        refs: { visibleCharacterRefIds: ['hero'], speakerRefIds: ['villain'] },
        dialogue: [{ speakerRefId: 'villain', text: 'Goodbye.' }],
      }),
    ],
    coverageSetups: [],
  })
  const findings = report.findings.filter((entry) => entry.code === 'speaker_never_covered')
  assert.equal(findings.length, 1)
  assert.ok(findings[0].message.includes('villain'))
})

test('missing establishing shot is an info finding', () => {
  const shots = ['s1', 's2', 's3'].map((id, index) => shot({
    id,
    index: index + 1,
    coverageSetupId: 'single',
    camera: { framing: 'close-up' },
    refs: { visibleCharacterRefIds: index % 2 === 0 ? ['hero'] : ['villain'] },
  }))
  const report = lintSequenceAnimaticContinuity({ shots, coverageSetups: [setup({ id: 'single' })] })
  assert.equal(report.findings.filter((entry) => entry.code === 'scene_missing_establishing').length, 1)

  const withWide = lintSequenceAnimaticContinuity({
    shots: [...shots, shot({ id: 's4', index: 4, coverageSetupId: 'master', refs: { visibleCharacterRefIds: ['hero', 'villain'] } })],
    coverageSetups: [setup({ id: 'single' }), setup({ id: 'master', setupKind: 'wide_master' })],
  })
  assert.equal(withWide.findings.filter((entry) => entry.code === 'scene_missing_establishing').length, 0)
})

test('setup subject mismatch warns', () => {
  const report = lintSequenceAnimaticContinuity({
    shots: [shot({ id: 's1', coverageSetupId: 'a', refs: { visibleCharacterRefIds: ['sidekick'] } })],
    coverageSetups: [setup({ id: 'a', characterRefIds: ['hero'] })],
  })
  assert.equal(report.findings.filter((entry) => entry.code === 'setup_subject_mismatch').length, 1)
})

test('framing monotony and same-setup runs are info findings', () => {
  const shots = ['s1', 's2', 's3', 's4'].map((id, index) => shot({
    id,
    index: index + 1,
    coverageSetupId: 'a',
    camera: { framing: 'medium close-up' },
  }))
  const report = lintSequenceAnimaticContinuity({ shots, coverageSetups: [setup({ id: 'a' })] })
  assert.equal(report.findings.filter((entry) => entry.code === 'framing_monotony').length, 1)
  assert.equal(report.findings.filter((entry) => entry.code === 'same_setup_run').length, 1)
  assert.equal(report.infoCount >= 2, true)
})

test('dangling continuity references warn', () => {
  const report = lintSequenceAnimaticContinuity({
    shots: [shot({ id: 's1', continuityLink: { mode: 'match_action', fromShotId: 'ghost_shot' } })],
    coverageSetups: [setup({ id: 'a', continuityFromSetupId: 'ghost_setup', continuityMode: 'reverse_angle' })],
  })
  assert.equal(report.findings.filter((entry) => entry.code === 'dangling_continuity_reference').length, 2)
})
