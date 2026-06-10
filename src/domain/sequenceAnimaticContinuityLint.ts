/**
 * Continuity lint: deterministic, text-only validation of film grammar over a
 * sequence-animatic director plan (shots + coverage setups), run before any
 * image generation is paid for.
 *
 * Checks: unknown/dangling coverage references, 180-degree line / screen
 * direction flips, reverse-angle eyeline pairing, OTS subject pairing, speaker
 * coverage, missing establishing coverage, setup/subject mismatches, scene
 * binding mismatches, framing monotony, and same-setup jump-cut runs.
 *
 * Every rule is tolerant of missing data: a check only fires when the fields
 * it needs are present and contradictory, so sparse plans produce no noise.
 */

export type SequenceAnimaticContinuityLintSeverity = 'error' | 'warning' | 'info'

export type SequenceAnimaticContinuityLintFinding = {
  code: string
  severity: SequenceAnimaticContinuityLintSeverity
  message: string
  suggestion: string
  shotIds: string[]
  coverageSetupIds: string[]
  blockId: string | null
}

export type SequenceAnimaticContinuityLintReport = {
  version: 'sequence_animatic_continuity_lint_v1'
  findings: SequenceAnimaticContinuityLintFinding[]
  errorCount: number
  warningCount: number
  infoCount: number
  checkedShotCount: number
  checkedSetupCount: number
}

type LooseRecord = Record<string, unknown>

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as LooseRecord : {}
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(readText).filter(Boolean) : []
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Heuristic screen-direction normalization. Conservative: only resolves when
 * the text clearly indicates an orientation; otherwise returns null so no
 * false positives fire on ambiguous prose.
 */
export function normalizeScreenDirection(value: unknown): 'ltr' | 'rtl' | null {
  const text = readText(value).toLowerCase()
  if (!text) return null
  if (/\bl\s*(?:to|->|→|-)\s*r\b|\bltr\b/.test(text)) return 'ltr'
  if (/\br\s*(?:to|->|→|-)\s*l\b|\brtl\b/.test(text)) return 'rtl'
  const leftIndex = text.search(/\bleft\b/)
  const rightIndex = text.search(/\bright\b/)
  if (leftIndex >= 0 && rightIndex >= 0) return leftIndex < rightIndex ? 'ltr' : 'rtl'
  if (rightIndex >= 0) return 'ltr'
  if (leftIndex >= 0) return 'rtl'
  return null
}

type LintShot = {
  id: string
  index: number
  blockId: string
  setupId: string
  setId: string
  bindingSetId: string
  framing: string
  direction: 'ltr' | 'rtl' | null
  visibleCharacterRefIds: string[]
  speakerRefIds: string[]
  dialogueSpeakerRefIds: string[]
  continuityLinkMode: string
  continuityLinkFromShotId: string
  continuityLinkFromSetupId: string
}

type LintSetup = {
  id: string
  setupKind: string
  setId: string
  characterRefIds: string[]
  direction: 'ltr' | 'rtl' | null
  continuityMode: string
  continuityFromSetupId: string
}

function normalizeShot(raw: LooseRecord, fallbackIndex: number, setupById: Map<string, LintSetup>): LintShot {
  const camera = asRecord(raw.camera)
  const refs = asRecord(raw.refs)
  const sceneBinding = asRecord(raw.sceneBinding ?? raw.scene_binding)
  const continuityLink = asRecord(raw.continuityLink ?? raw.continuity_link)
  const setupId = readText(raw.coverageSetupId ?? raw.coverage_setup_id)
  const setup = setupById.get(setupId) ?? null
  const shotDirection = normalizeScreenDirection(camera.screenDirectionRule ?? camera.screen_direction_rule)
  return {
    id: readText(raw.id),
    index: readNumber(raw.index) ?? fallbackIndex,
    blockId: readText(raw.blockId ?? raw.storyboardBlockId ?? raw.storyboard_block_id),
    setupId,
    setId: readText(sceneBinding.setId ?? sceneBinding.set_id) || (setup?.setId ?? ''),
    bindingSetId: readText(sceneBinding.setId ?? sceneBinding.set_id),
    framing: readText(camera.framing).toLowerCase(),
    direction: shotDirection ?? setup?.direction ?? null,
    visibleCharacterRefIds: [
      ...readStringArray(refs.visibleCharacterRefIds ?? refs.visible_character_ref_ids),
      ...readStringArray(raw.visibleCharacterRefIds),
    ],
    speakerRefIds: [
      ...readStringArray(refs.speakerRefIds ?? refs.speaker_ref_ids),
      ...readStringArray(raw.speakerRefIds),
    ],
    dialogueSpeakerRefIds: Array.isArray(raw.dialogue)
      ? raw.dialogue.map((line) => readText(asRecord(line).speakerRefId ?? asRecord(line).speaker_ref_id)).filter(Boolean)
      : [],
    continuityLinkMode: readText(continuityLink.mode) || (typeof (raw.continuityLink ?? raw.continuity_link) === 'string' ? readText(raw.continuityLink ?? raw.continuity_link) : ''),
    continuityLinkFromShotId: readText(continuityLink.fromShotId ?? continuityLink.from_shot_id),
    continuityLinkFromSetupId: readText(continuityLink.fromSetupId ?? continuityLink.from_setup_id),
  }
}

function normalizeSetup(raw: LooseRecord): LintSetup {
  const camera = asRecord(raw.camera)
  return {
    id: readText(raw.id),
    setupKind: readText(raw.setupKind ?? raw.setup_kind).toLowerCase(),
    setId: readText(raw.setId ?? raw.set_id),
    characterRefIds: readStringArray(raw.characterRefIds ?? raw.character_ref_ids),
    direction: normalizeScreenDirection(raw.screenDirection ?? raw.screen_direction)
      ?? normalizeScreenDirection(camera.screenDirectionRule ?? camera.screen_direction_rule),
    continuityMode: readText(raw.continuityMode ?? raw.continuity_mode).toLowerCase(),
    continuityFromSetupId: readText(raw.continuityFromSetupId ?? raw.continuity_from_setup_id),
  }
}

const AXIS_NEUTRAL_SETUP_KINDS = new Set(['wide_master', 'insert', 'movement', 'viewpoint'])
const AXIS_RESET_CONTINUITY_MODES = new Set(['new_scene', 'blocking_change', 'match_action'])
const WIDE_FRAMING_PATTERN = /wide|establish|master|full|long shot|extreme long/

export function lintSequenceAnimaticContinuity(input: {
  shots: ReadonlyArray<LooseRecord>
  coverageSetups: ReadonlyArray<LooseRecord>
}): SequenceAnimaticContinuityLintReport {
  const findings: SequenceAnimaticContinuityLintFinding[] = []
  const add = (finding: Omit<SequenceAnimaticContinuityLintFinding, 'shotIds' | 'coverageSetupIds' | 'blockId'> & {
    shotIds?: string[]
    coverageSetupIds?: string[]
    blockId?: string | null
  }) => {
    findings.push({
      shotIds: finding.shotIds ?? [],
      coverageSetupIds: finding.coverageSetupIds ?? [],
      blockId: finding.blockId ?? null,
      code: finding.code,
      severity: finding.severity,
      message: finding.message,
      suggestion: finding.suggestion,
    })
  }

  const setups = input.coverageSetups.map((raw) => normalizeSetup(asRecord(raw))).filter((setup) => setup.id)
  const setupById = new Map(setups.map((setup) => [setup.id, setup] as const))
  const shots = input.shots
    .map((raw, index) => normalizeShot(asRecord(raw), index + 1, setupById))
    .filter((shot) => shot.id)
    .sort((left, right) => left.index - right.index)
  const shotIds = new Set(shots.map((shot) => shot.id))

  // --- Reference integrity ---
  for (const shot of shots) {
    if (shot.setupId && !setupById.has(shot.setupId)) {
      add({
        code: 'unknown_coverage_setup',
        severity: 'error',
        message: `Shot ${shot.id} references coverage setup "${shot.setupId}" which does not exist in the plan.`,
        suggestion: 'Re-derive the continuity plan or assign the shot to an existing coverage setup.',
        shotIds: [shot.id],
        coverageSetupIds: [shot.setupId],
        blockId: shot.blockId || null,
      })
    }
    if (shot.continuityLinkFromShotId && !shotIds.has(shot.continuityLinkFromShotId)) {
      add({
        code: 'dangling_continuity_reference',
        severity: 'warning',
        message: `Shot ${shot.id} declares a continuity link from shot "${shot.continuityLinkFromShotId}" which is not in the plan.`,
        suggestion: 'Fix the continuity link or remove it; the keyframe will otherwise lose its intended motion/state carryover.',
        shotIds: [shot.id],
        blockId: shot.blockId || null,
      })
    }
    if (shot.continuityLinkFromSetupId && !setupById.has(shot.continuityLinkFromSetupId)) {
      add({
        code: 'dangling_continuity_reference',
        severity: 'warning',
        message: `Shot ${shot.id} declares a continuity link from setup "${shot.continuityLinkFromSetupId}" which is not in the plan.`,
        suggestion: 'Fix the continuity link to reference an existing coverage setup.',
        shotIds: [shot.id],
        coverageSetupIds: [shot.continuityLinkFromSetupId],
        blockId: shot.blockId || null,
      })
    }
  }
  for (const setup of setups) {
    if (setup.continuityFromSetupId && !setupById.has(setup.continuityFromSetupId)) {
      add({
        code: 'dangling_continuity_reference',
        severity: 'warning',
        message: `Coverage setup ${setup.id} continues from setup "${setup.continuityFromSetupId}" which is not in the plan.`,
        suggestion: 'Fix the setup linkage so reverse angles and matched coverage stay paired.',
        coverageSetupIds: [setup.id, setup.continuityFromSetupId],
      })
    }
  }

  // --- 180-degree line / screen-direction flips between adjacent shots ---
  for (let index = 1; index < shots.length; index += 1) {
    const previous = shots[index - 1]
    const current = shots[index]
    if (!previous.direction || !current.direction) continue
    if (previous.direction === current.direction) continue
    if (!previous.setId || !current.setId || previous.setId !== current.setId) continue
    const currentSetup = setupById.get(current.setupId)
    const previousSetup = setupById.get(previous.setupId)
    if (currentSetup && AXIS_NEUTRAL_SETUP_KINDS.has(currentSetup.setupKind)) continue
    if (previousSetup && AXIS_NEUTRAL_SETUP_KINDS.has(previousSetup.setupKind)) continue
    if (currentSetup && AXIS_RESET_CONTINUITY_MODES.has(currentSetup.continuityMode)) continue
    if (currentSetup && currentSetup.continuityMode === 'reverse_angle') continue
    add({
      code: 'screen_direction_flip',
      severity: 'warning',
      message: `Shots ${previous.id} → ${current.id} flip screen direction (${previous.direction} → ${current.direction}) within the same set without a neutral or re-blocking shot — possible 180° line cross.`,
      suggestion: 'Insert a neutral shot (wide, insert, or on-axis movement), mark the setup as a blocking change, or align the screen direction of both setups.',
      shotIds: [previous.id, current.id],
      coverageSetupIds: [previous.setupId, current.setupId].filter(Boolean),
      blockId: current.blockId || null,
    })
  }

  // --- Reverse-angle pairs should mirror screen direction and share subjects ---
  for (const setup of setups) {
    if (setup.continuityMode !== 'reverse_angle' || !setup.continuityFromSetupId) continue
    const source = setupById.get(setup.continuityFromSetupId)
    if (!source) continue
    if (setup.direction && source.direction && setup.direction === source.direction) {
      add({
        code: 'reverse_angle_direction_match',
        severity: 'warning',
        message: `Reverse-angle setup ${setup.id} has the same screen direction as its source setup ${source.id}; reverse coverage should mirror direction so eyelines match across the cut.`,
        suggestion: 'Flip the screen direction of the reverse setup (or of its source) so the two subjects look toward each other.',
        coverageSetupIds: [setup.id, source.id],
      })
    }
    if (setup.characterRefIds.length > 0 && source.characterRefIds.length > 0) {
      const overlap = setup.characterRefIds.some((id) => source.characterRefIds.includes(id))
      if (!overlap) {
        add({
          code: 'reverse_angle_subject_mismatch',
          severity: 'warning',
          message: `Reverse-angle setup ${setup.id} shares no subjects with its source setup ${source.id}.`,
          suggestion: 'Reverse coverage should frame the other side of the same conversation; check the character assignments.',
          coverageSetupIds: [setup.id, source.id],
        })
      }
    }
  }

  // --- OTS pairs (a_to_b / b_to_a) should cover the same two subjects ---
  const otsSetups = setups.filter((setup) => setup.setupKind === 'ots_a_to_b' || setup.setupKind === 'ots_b_to_a')
  for (const setup of otsSetups) {
    const counterpart = setup.continuityFromSetupId ? setupById.get(setup.continuityFromSetupId) : null
    if (!counterpart) continue
    if (counterpart.setupKind !== 'ots_a_to_b' && counterpart.setupKind !== 'ots_b_to_a') continue
    if (setup.characterRefIds.length > 0 && counterpart.characterRefIds.length > 0) {
      const overlap = setup.characterRefIds.some((id) => counterpart.characterRefIds.includes(id))
      if (!overlap) {
        add({
          code: 'ots_pair_subject_mismatch',
          severity: 'warning',
          message: `OTS pair ${counterpart.id} / ${setup.id} do not share any subjects; over-the-shoulder pairs should cover the same two characters.`,
          suggestion: 'Check the character assignments of both OTS setups.',
          coverageSetupIds: [setup.id, counterpart.id],
        })
      }
    }
  }

  // --- Speaker coverage ---
  const speakersByBlock = new Map<string, Set<string>>()
  const visibleByBlock = new Map<string, Set<string>>()
  for (const shot of shots) {
    const blockId = shot.blockId || 'unassigned'
    const speakers = speakersByBlock.get(blockId) ?? new Set<string>()
    const visible = visibleByBlock.get(blockId) ?? new Set<string>()
    for (const id of [...shot.speakerRefIds, ...shot.dialogueSpeakerRefIds]) speakers.add(id)
    for (const id of shot.visibleCharacterRefIds) visible.add(id)
    speakersByBlock.set(blockId, speakers)
    visibleByBlock.set(blockId, visible)
  }
  for (const [blockId, speakers] of speakersByBlock) {
    const visible = visibleByBlock.get(blockId) ?? new Set<string>()
    if (visible.size === 0) continue
    for (const speakerId of speakers) {
      if (!visible.has(speakerId)) {
        add({
          code: 'speaker_never_covered',
          severity: 'warning',
          message: `Speaker "${speakerId}" has dialogue in block ${blockId} but is never visible in any of its shots.`,
          suggestion: 'Add a single or OTS covering the speaker, or mark the line as off-screen intentionally.',
          blockId: blockId === 'unassigned' ? null : blockId,
        })
      }
    }
  }

  // --- Missing establishing coverage per set ---
  const shotsBySet = new Map<string, LintShot[]>()
  for (const shot of shots) {
    if (!shot.setId) continue
    const list = shotsBySet.get(shot.setId) ?? []
    list.push(shot)
    shotsBySet.set(shot.setId, list)
  }
  for (const [setId, setShots] of shotsBySet) {
    if (setShots.length < 3) continue
    const distinctCharacters = new Set(setShots.flatMap((shot) => shot.visibleCharacterRefIds))
    if (distinctCharacters.size < 2) continue
    const hasWide = setShots.some((shot) => {
      const setup = setupById.get(shot.setupId)
      return (setup && (setup.setupKind === 'wide_master' || setup.setupKind === 'two_shot'))
        || WIDE_FRAMING_PATTERN.test(shot.framing)
    })
    if (!hasWide) {
      add({
        code: 'scene_missing_establishing',
        severity: 'info',
        message: `Set "${setId}" plays ${setShots.length} shots with ${distinctCharacters.size} characters but never shows a wide/master; viewers may lose spatial orientation.`,
        suggestion: 'Consider adding a wide master or two-shot early in the scene.',
        shotIds: setShots.slice(0, 6).map((shot) => shot.id),
      })
    }
  }

  // --- Setup subject + scene binding mismatches ---
  for (const shot of shots) {
    const setup = setupById.get(shot.setupId)
    if (!setup) continue
    if (setup.characterRefIds.length > 0 && shot.visibleCharacterRefIds.length > 0) {
      const overlap = setup.characterRefIds.some((id) => shot.visibleCharacterRefIds.includes(id))
      if (!overlap) {
        add({
          code: 'setup_subject_mismatch',
          severity: 'warning',
          message: `Shot ${shot.id} uses setup ${setup.id} whose subjects (${setup.characterRefIds.join(', ')}) do not appear among the shot's visible characters.`,
          suggestion: 'Reassign the shot to a matching coverage setup or fix the visible character list.',
          shotIds: [shot.id],
          coverageSetupIds: [setup.id],
          blockId: shot.blockId || null,
        })
      }
    }
    if (shot.bindingSetId && setup.setId && shot.bindingSetId !== setup.setId) {
      add({
        code: 'scene_binding_setup_mismatch',
        severity: 'warning',
        message: `Shot ${shot.id} is bound to set "${shot.bindingSetId}" but its coverage setup ${setup.id} lives in set "${setup.setId}".`,
        suggestion: 'Align the shot scene binding and its coverage setup; mixed sets break location continuity for the keyframe.',
        shotIds: [shot.id],
        coverageSetupIds: [setup.id],
        blockId: shot.blockId || null,
      })
    }
  }

  // --- Rhythm: framing monotony and same-setup runs ---
  let framingRun: LintShot[] = []
  const flushFramingRun = () => {
    if (framingRun.length >= 4) {
      add({
        code: 'framing_monotony',
        severity: 'info',
        message: `${framingRun.length} consecutive shots share the framing "${framingRun[0].framing}"; the cut may feel flat.`,
        suggestion: 'Vary shot size (insert, reaction, wider/closer coverage) to give the sequence rhythm.',
        shotIds: framingRun.map((shot) => shot.id),
        blockId: framingRun[0].blockId || null,
      })
    }
    framingRun = []
  }
  for (const shot of shots) {
    if (shot.framing && framingRun.length > 0 && framingRun[0].framing === shot.framing) framingRun.push(shot)
    else {
      flushFramingRun()
      framingRun = shot.framing ? [shot] : []
    }
  }
  flushFramingRun()

  let setupRun: LintShot[] = []
  const flushSetupRun = () => {
    if (setupRun.length >= 3) {
      add({
        code: 'same_setup_run',
        severity: 'info',
        message: `${setupRun.length} consecutive shots reuse coverage setup ${setupRun[0].setupId}; back-to-back identical setups read as jump cuts.`,
        suggestion: 'Intercut with reaction or insert coverage, or merge the shots.',
        shotIds: setupRun.map((shot) => shot.id),
        coverageSetupIds: [setupRun[0].setupId],
        blockId: setupRun[0].blockId || null,
      })
    }
    setupRun = []
  }
  for (const shot of shots) {
    if (shot.setupId && setupRun.length > 0 && setupRun[0].setupId === shot.setupId) setupRun.push(shot)
    else {
      flushSetupRun()
      setupRun = shot.setupId ? [shot] : []
    }
  }
  flushSetupRun()

  return {
    version: 'sequence_animatic_continuity_lint_v1',
    findings,
    errorCount: findings.filter((finding) => finding.severity === 'error').length,
    warningCount: findings.filter((finding) => finding.severity === 'warning').length,
    infoCount: findings.filter((finding) => finding.severity === 'info').length,
    checkedShotCount: shots.length,
    checkedSetupCount: setups.length,
  }
}
