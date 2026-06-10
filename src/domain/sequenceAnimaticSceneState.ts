/**
 * Scene-state conditioning for sequence-animatic keyframes.
 *
 * Instead of relying on the previous keyframe's pixels to carry continuity
 * (which serializes generation and accumulates drift), we derive an explicit,
 * structured scene-state record per shot from the director plan: where the
 * shot plays, who is present, which props are in play / already established,
 * the inherited lighting and time of day, and how the shot continues from
 * prior coverage. The record is embedded in the keyframe prompt as text, so
 * shots can be generated in parallel per coverage setup while staying
 * consistent.
 */

export type SequenceAnimaticSceneState = {
  shotId: string
  /** Location chain for the shot (ids from the continuity graph). */
  setId: string
  zoneId: string
  spotId: string
  /** Lighting brief in effect — inherited from earlier shots in the same set when the shot has none. */
  lighting: string
  /** Parsed from the lighting/action text when present: dawn/day/dusk/night/interior etc. */
  timeOfDayHint: string
  /** Characters visible in this shot. */
  presentCharacterRefIds: string[]
  /** Characters speaking in this shot. */
  speakingCharacterRefIds: string[]
  /** Props referenced by this shot. */
  activePropRefIds: string[]
  /** Props introduced by earlier shots in the same set and still established in the scene. */
  establishedPropRefIds: string[]
  /** Effective screen direction text for the shot (from shot rule or its coverage setup). */
  screenDirection: string
  /** Immediate predecessor in editorial order (empty for the first shot). */
  previousShotId: string
  /** Most recent earlier shot using the same coverage setup (strongest look reference). */
  previousSameSetupShotId: string
  /** Shot id the inherited lighting came from (empty when the shot defines its own). */
  carriedLightingFromShotId: string
  /** Continuity mode linking this shot to prior coverage (same_setup, reverse_angle, ...). */
  continuityMode: string
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

function uniqueStrings(values: Iterable<string>): string[] {
  return [...new Set(values)].filter(Boolean)
}

const TIME_OF_DAY_PATTERNS: Array<[RegExp, string]> = [
  [/\bgolden hour\b|\bsunset\b|\bdusk\b|\btwilight\b/i, 'dusk'],
  [/\bsunrise\b|\bdawn\b|\bfirst light\b/i, 'dawn'],
  [/\bnight\b|\bmoonlit\b|\bmoonlight\b|\bmidnight\b/i, 'night'],
  [/\bmidday\b|\bnoon\b|\bdaylight\b|\bday\b|\bsunny\b|\bovercast\b/i, 'day'],
]

export function readTimeOfDayHint(text: string): string {
  for (const [pattern, hint] of TIME_OF_DAY_PATTERNS) {
    if (pattern.test(text)) return hint
  }
  return ''
}

/**
 * Derives one scene-state record per shot, walking shots in editorial order.
 * Tolerant of sparse plans: missing fields simply produce empty state fields.
 */
export function deriveSequenceAnimaticSceneStates(input: {
  shots: ReadonlyArray<LooseRecord>
  coverageSetups: ReadonlyArray<LooseRecord>
}): Map<string, SequenceAnimaticSceneState> {
  const setupById = new Map(
    input.coverageSetups
      .map(asRecord)
      .map((setup) => [readText(setup.id), setup] as const)
      .filter(([id]) => id),
  )

  const orderedShots = input.shots
    .map((raw, position) => ({ raw: asRecord(raw), position }))
    .filter((entry) => readText(entry.raw.id))
    .sort((left, right) => {
      const li = typeof left.raw.index === 'number' ? left.raw.index : left.position + 1
      const ri = typeof right.raw.index === 'number' ? right.raw.index : right.position + 1
      return li - ri
    })

  const states = new Map<string, SequenceAnimaticSceneState>()
  const lightingBySet = new Map<string, { lighting: string; fromShotId: string }>()
  const establishedPropsBySet = new Map<string, Set<string>>()
  const lastShotIdBySetup = new Map<string, string>()
  let previousShotId = ''

  for (const { raw } of orderedShots) {
    const shotId = readText(raw.id)
    const camera = asRecord(raw.camera)
    const refs = asRecord(raw.refs)
    const sceneBinding = asRecord(raw.sceneBinding ?? raw.scene_binding)
    const continuityLink = asRecord(raw.continuityLink ?? raw.continuity_link)
    const setupId = readText(raw.coverageSetupId ?? raw.coverage_setup_id)
    const setup = setupById.get(setupId) ?? {}

    const setId = readText(sceneBinding.setId ?? sceneBinding.set_id) || readText(setup.setId ?? setup.set_id)
    const zoneId = readText(sceneBinding.zoneId ?? sceneBinding.zone_id) || readText(setup.zoneId ?? setup.zone_id)
    const spotId = readText(sceneBinding.spotId ?? sceneBinding.spot_id) || readText(setup.primarySpotId ?? setup.primary_spot_id)

    const ownLighting = readText(raw.lighting) || readText(setup.lighting)
    const carried = setId ? lightingBySet.get(setId) ?? null : null
    const lighting = ownLighting || (carried?.lighting ?? '')
    const carriedLightingFromShotId = ownLighting ? '' : (carried?.fromShotId ?? '')
    if (setId && ownLighting) lightingBySet.set(setId, { lighting: ownLighting, fromShotId: shotId })

    const activeProps = uniqueStrings([
      ...readStringArray(refs.propRefIds ?? refs.prop_ref_ids),
      ...readStringArray(raw.propRefIds),
    ])
    const establishedSet = setId
      ? (establishedPropsBySet.get(setId) ?? new Set<string>())
      : new Set<string>()
    const establishedProps = [...establishedSet].filter((id) => !activeProps.includes(id))
    if (setId) {
      for (const id of activeProps) establishedSet.add(id)
      establishedPropsBySet.set(setId, establishedSet)
    }

    const presentCharacters = uniqueStrings([
      ...readStringArray(refs.visibleCharacterRefIds ?? refs.visible_character_ref_ids),
      ...readStringArray(raw.visibleCharacterRefIds),
    ])
    const speakingCharacters = uniqueStrings([
      ...readStringArray(refs.speakerRefIds ?? refs.speaker_ref_ids),
      ...readStringArray(raw.speakerRefIds),
      ...(Array.isArray(raw.dialogue)
        ? raw.dialogue.map((line) => readText(asRecord(line).speakerRefId ?? asRecord(line).speaker_ref_id))
        : []),
    ])

    const screenDirection = readText(camera.screenDirectionRule ?? camera.screen_direction_rule)
      || readText(setup.screenDirection ?? setup.screen_direction)
    const timeOfDayHint = readTimeOfDayHint(`${lighting} ${readText(raw.action)}`)

    states.set(shotId, {
      shotId,
      setId,
      zoneId,
      spotId,
      lighting,
      timeOfDayHint,
      presentCharacterRefIds: presentCharacters,
      speakingCharacterRefIds: speakingCharacters,
      activePropRefIds: activeProps,
      establishedPropRefIds: establishedProps,
      screenDirection,
      previousShotId,
      previousSameSetupShotId: setupId ? (lastShotIdBySetup.get(setupId) ?? '') : '',
      carriedLightingFromShotId,
      continuityMode: readText(continuityLink.mode)
        || readText(setup.continuityMode ?? setup.continuity_mode),
    })

    if (setupId) lastShotIdBySetup.set(setupId, shotId)
    previousShotId = shotId
  }

  return states
}

/** Formats a scene-state record as compact prompt lines (skips empty fields). */
export function formatSequenceAnimaticSceneStateForPrompt(state: Partial<SequenceAnimaticSceneState> | null | undefined): string {
  if (!state) return ''
  const lines: string[] = []
  const location = [state.setId, state.zoneId, state.spotId].filter(Boolean).join(' > ')
  if (location) lines.push(`Location continuity: ${location}`)
  if (state.lighting) {
    lines.push(`Lighting continuity: ${state.lighting}${state.carriedLightingFromShotId ? ` (carried over from shot ${state.carriedLightingFromShotId})` : ''}`)
  }
  if (state.timeOfDayHint) lines.push(`Time of day: ${state.timeOfDayHint}`)
  if (state.presentCharacterRefIds?.length) lines.push(`Characters in frame: ${state.presentCharacterRefIds.join(', ')}`)
  if (state.activePropRefIds?.length) lines.push(`Props in play: ${state.activePropRefIds.join(', ')}`)
  if (state.establishedPropRefIds?.length) lines.push(`Props already established in this scene (keep consistent if visible): ${state.establishedPropRefIds.join(', ')}`)
  if (state.screenDirection) lines.push(`Screen direction: ${state.screenDirection}`)
  if (state.continuityMode) lines.push(`Continuity from prior coverage: ${state.continuityMode.replace(/_/g, ' ')}`)
  return lines.join('\n')
}
