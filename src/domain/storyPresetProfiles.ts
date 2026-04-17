import type {
  CinematicHookRole,
  CinematicStoryLanguagePreset,
  CinematicStoryScenePreset,
} from './cinematics.ts'

type StoryPromptDirectiveSet = {
  plannerDirectives: string[]
  authorshipDirectives: string[]
  repairDirectives: string[]
}

export type StoryScreenwritingContract = StoryPromptDirectiveSet & {
  label: string
  creativePrinciples: string[]
}

export type StoryScenePresetProfile = StoryPromptDirectiveSet & {
  scenePreset: CinematicStoryScenePreset
  label: string
  dramaticPurpose: string
  shotRoleSequence: CinematicHookRole[]
  targetSceneDurationRangeSeconds: readonly [number, number]
  targetShotCountRange: readonly [number, number]
  idealShotDurationRangeSeconds: readonly [number, number]
  revealDeadlineShotIndex: number | null
  dialogueDensityGuidance: string
  blockingGuidance: string
  coverageStrategy: string
  continuityStrategy: string
  soundSilenceStrategy: string
  endingShape: string
  maxDialogueWordsPerShot: number | null
  maxActionBeatsPerShot: number | null
  maxActionMicroBeatsPerShot: number | null
  actionExchangeBundling: 'strict' | 'moderate' | 'aggressive'
  actionDensityBias: 'low' | 'medium' | 'high'
  storyboardPanelDensityBias: 'low' | 'medium' | 'high'
  promptKeywords: readonly string[]
}

export type StoryLanguagePresetProfile = StoryPromptDirectiveSet & {
  languagePreset: CinematicStoryLanguagePreset
  label: string
  cameraBehaviorRules: string
  lensBias: string
  rhythmGuidance: string
  continuityStyle: string
  promptKeywords: readonly string[]
}

export type StoryRuntimeContract = {
  scenePreset: CinematicStoryScenePreset
  languagePreset: CinematicStoryLanguagePreset
  sceneLabel: string
  languageLabel: string
  dramaticPurpose: string
  shotRoleSequence: CinematicHookRole[]
  targetSceneDurationRangeSeconds: readonly [number, number]
  targetShotCountRange: readonly [number, number]
  idealShotDurationRangeSeconds: readonly [number, number]
  revealDeadlineShotIndex: number | null
  dialogueDensityGuidance: string
  blockingGuidance: string
  coverageStrategy: string
  cameraBehaviorRules: string
  lensBias: string
  rhythmGuidance: string
  continuityStrategy: string
  continuityStyle: string
  soundSilenceStrategy: string
  endingShape: string
  maxDialogueWordsPerShot: number | null
  maxActionBeatsPerShot: number | null
  maxActionMicroBeatsPerShot: number | null
  actionExchangeBundling: 'strict' | 'moderate' | 'aggressive'
  actionDensityBias: 'low' | 'medium' | 'high'
  storyboardPanelDensityBias: 'low' | 'medium' | 'high'
  plannerDirectives: string[]
  authorshipDirectives: string[]
  repairDirectives: string[]
}

export const DEFAULT_STORY_SCENE_PRESET: CinematicStoryScenePreset = 'dialogue_two_hander'
export const DEFAULT_STORY_LANGUAGE_PRESET: CinematicStoryLanguagePreset = 'grounded_naturalist'

const STORY_SCREENWRITING_CONTRACT: StoryScreenwritingContract = {
  label: 'Movie / TV Screenwriting Contract',
  creativePrinciples: [
    'Enter the scene late and leave early once the dramatic turn has landed.',
    'Every beat should change tension, information, leverage, or emotional temperature.',
    'Prefer specific physical behavior, staging, and consequence over abstract explanation.',
    'Dialogue should sound character-specific and playable, not generic, placeholder, or purely expositional.',
    'Escalation should feel uneven and alive rather than mechanically stepped.',
    'Cuts and coverage changes must earn something: new information, new pressure, new alignment, or a clearer dramatic turn.',
    'Each scene should land at least one memorable image, reversal, or emotional consequence.',
  ],
  plannerDirectives: [
    'Treat the selected story scene and language presets as biases, not rigid templates. Preserve room for original scene writing inside those guardrails.',
    'Plan scenes around dramatic turns, escalation, and memorable images rather than evenly filling a fixed preset formula.',
    'Enter the dramatic situation as late as possible while preserving clarity, and avoid spending shots repeating information the audience already understands.',
  ],
  authorshipDirectives: [
    'Write like a strong film or television scene: specific, playable, visual, and character-shaped rather than schematic.',
    'Prefer concrete staging, action, behavior, silence, and reaction over explanatory prose about what the scene means.',
    'Keep dialogue sharp, character-specific, and necessary. Cut filler, placeholder taunts, and generic scene-summary lines.',
    'Let escalation stay jagged and surprising instead of making every beat the same size or function.',
  ],
  repairDirectives: [
    'If the scene feels templated, restore irregular escalation, stronger character-specific choices, and a more memorable visual turn.',
    'If the scene feels over-explained, replace summary language with concrete action, staging, reaction, or consequence.',
    'If coverage feels mechanical, merge redundant beats and save cuts for genuine changes in tension, information, leverage, or perspective.',
  ],
}

const STORY_SCENE_PROFILES: Record<CinematicStoryScenePreset, StoryScenePresetProfile> = {
  dialogue_two_hander: {
    scenePreset: 'dialogue_two_hander',
    label: 'Dialogue Two-Hander',
    dramaticPurpose: 'Two characters negotiate, probe, or reveal emotion through performance, eye-lines, and incremental power shifts.',
    shotRoleSequence: ['hook', 'setup', 'proof', 'payoff'],
    targetSceneDurationRangeSeconds: [25, 55],
    targetShotCountRange: [4, 8],
    idealShotDurationRangeSeconds: [3, 8],
    revealDeadlineShotIndex: 4,
    dialogueDensityGuidance: 'Dialogue can carry the scene, but each shot should pivot status, subtext, or emotional temperature.',
    blockingGuidance: 'Keep both characters readable in shared geography, then isolate the current power holder or listener.',
    coverageStrategy: 'Begin with shared spatial orientation, then alternate singles, over-shoulders, and selective reaction holds.',
    continuityStrategy: 'Preserve eyelines, screen direction, and seat or standing geography so reverses feel continuous.',
    soundSilenceStrategy: 'Let silence between lines and listener reactions shape the scene as much as the spoken text.',
    endingShape: 'End on the line or reaction that changes the relationship dynamic.',
    maxDialogueWordsPerShot: 50,
    maxActionBeatsPerShot: 2,
    maxActionMicroBeatsPerShot: 2,
    actionExchangeBundling: 'strict',
    actionDensityBias: 'low',
    storyboardPanelDensityBias: 'low',
    promptKeywords: ['conversation', 'dialogue', 'two people', 'two-hander', 'argue quietly', 'talk across', 'private scene', 'tense talk'],
    plannerDirectives: [
      'Anchor the first shot in shared geography before isolating viewpoints.',
      'Track who holds power in each beat and make the turn visible in framing or reaction timing.',
    ],
    authorshipDirectives: [
      'Write blocking and coverage so the listener matters as much as the speaker.',
      'Keep the scene playable: dialogue, pauses, and reactions should all change the emotional temperature.',
    ],
    repairDirectives: [
      'If the scene feels flat, strengthen the visible power shift in the key reverse or reaction shot.',
      'If coverage feels generic, reintroduce shared geography or a listener hold that clarifies subtext.',
    ],
  },
  interrogation_pressure_cooker: {
    scenePreset: 'interrogation_pressure_cooker',
    label: 'Interrogation Pressure Cooker',
    dramaticPurpose: 'Sustain asymmetry, suspicion, and incremental pressure until a crack, reveal, or tactical reversal lands.',
    shotRoleSequence: ['hook', 'setup', 'proof', 'proof', 'payoff'],
    targetSceneDurationRangeSeconds: [30, 60],
    targetShotCountRange: [5, 9],
    idealShotDurationRangeSeconds: [3, 7],
    revealDeadlineShotIndex: 5,
    dialogueDensityGuidance: 'Dialogue should probe, corner, and expose. Leave room for silence, hesitation, and controlled repetition.',
    blockingGuidance: 'Keep interrogator and subject in a power-imbalanced geometry. Use posture, distance, and stillness to make pressure visible.',
    coverageStrategy: 'Prefer controlled coverage, selective push-ins, and held reaction shots over restless cutting.',
    continuityStrategy: 'Maintain table position, eyelines, and who occupies the visual advantage in frame.',
    soundSilenceStrategy: 'Silence, room tone, and small chair or breath sounds should heighten pressure before the reveal.',
    endingShape: 'End on the revealed truth, the visible crack, or a reversal that changes who now has control.',
    maxDialogueWordsPerShot: 42,
    maxActionBeatsPerShot: 2,
    maxActionMicroBeatsPerShot: 2,
    actionExchangeBundling: 'strict',
    actionDensityBias: 'low',
    storyboardPanelDensityBias: 'low',
    promptKeywords: ['interrogation', 'questioning', 'interview room', 'detective', 'suspect', 'pressure cooker', 'confession'],
    plannerDirectives: [
      'Open on asymmetry, suspicion, or a visible imbalance of control.',
      'Keep the reveal or crack before the final beat so the ending can play the consequence.',
    ],
    authorshipDirectives: [
      'Incrementally tighten coverage as the subject loses room to maneuver.',
      'Use silence and reaction shots as part of the attack, not as filler.',
    ],
    repairDirectives: [
      'If pressure plateaus, add a stronger reaction beat or a more decisive incremental push-in before the reveal.',
      'If the reveal lands too late, move the crack earlier and let the final beat play aftermath or reversal.',
    ],
  },
  procedural_discovery: {
    scenePreset: 'procedural_discovery',
    label: 'Procedural Discovery',
    dramaticPurpose: 'Make analysis, investigation, or discovery legible through escalating clues and stepwise realization.',
    shotRoleSequence: ['hook', 'setup', 'proof', 'proof', 'payoff'],
    targetSceneDurationRangeSeconds: [24, 50],
    targetShotCountRange: [4, 8],
    idealShotDurationRangeSeconds: [3, 6],
    revealDeadlineShotIndex: 4,
    dialogueDensityGuidance: 'Keep dialogue efficient and discovery-led. Prefer concise functional exchange over speeches.',
    blockingGuidance: 'Stage attention around evidence surfaces, workstations, or spatial reveals that can be clearly tracked.',
    coverageStrategy: 'Use inserts, procedural mediums, and decisive singles that clarify each new clue or realization.',
    continuityStrategy: 'Preserve the chain of evidence, screen direction, and work-surface geography so the reasoning stays legible.',
    soundSilenceStrategy: 'Use restrained ambience and selective quiet to sharpen the moment a clue clicks into place.',
    endingShape: 'End on the discovery becoming undeniable or on the next move it forces.',
    maxDialogueWordsPerShot: 34,
    maxActionBeatsPerShot: 3,
    maxActionMicroBeatsPerShot: 3,
    actionExchangeBundling: 'strict',
    actionDensityBias: 'low',
    storyboardPanelDensityBias: 'low',
    promptKeywords: ['investigate', 'discovery', 'forensic', 'analyze', 'evidence', 'procedural', 'lab', 'clue'],
    plannerDirectives: [
      'Make each shot advance the chain of discovery through one clear new clue, process step, or realization.',
      'Bias toward legibility over mood-first abstraction.',
    ],
    authorshipDirectives: [
      'Treat inserts and readable surfaces as core dramatic beats, not filler coverage.',
      'Clarify what is newly understood in every beat.',
    ],
    repairDirectives: [
      'If the scene feels vague, replace atmospheric beats with a clearer clue, insert, or spatial reveal.',
      'If the discovery is muddy, simplify dialogue and strengthen the evidence surface framing.',
    ],
  },
  reveal_then_reversal: {
    scenePreset: 'reveal_then_reversal',
    label: 'Reveal Then Reversal',
    dramaticPurpose: 'Deliver a clear reveal, then immediately destabilize it with a counter-beat that changes interpretation or control.',
    shotRoleSequence: ['hook', 'setup', 'proof', 'payoff', 'cta'],
    targetSceneDurationRangeSeconds: [25, 50],
    targetShotCountRange: [4, 7],
    idealShotDurationRangeSeconds: [3, 7],
    revealDeadlineShotIndex: 4,
    dialogueDensityGuidance: 'Keep dialogue pointed and strategic. The reveal should be legible before the reversal reframes it.',
    blockingGuidance: 'Stage the reveal cleanly, then let the reversal disrupt eyelines, distance, or who occupies the frame.',
    coverageStrategy: 'Build toward a clearly readable reveal frame, then cut or reframe decisively for the reversal.',
    continuityStrategy: 'Preserve enough visual continuity that the reversal feels caused by the reveal, not disconnected from it.',
    soundSilenceStrategy: 'Use silence or a dropped-out bed around the reveal so the reversal lands with force.',
    endingShape: 'End on the new unstable truth, not the original reveal alone.',
    maxDialogueWordsPerShot: 40,
    maxActionBeatsPerShot: 2,
    maxActionMicroBeatsPerShot: 2,
    actionExchangeBundling: 'strict',
    actionDensityBias: 'low',
    storyboardPanelDensityBias: 'low',
    promptKeywords: ['reveal', 'twist', 'reversal', 'double cross', 'turns out', 'unexpected response', 'countermove'],
    plannerDirectives: [
      'Separate reveal and reversal into distinct beats; do not collapse them into the same shot unless the prompt explicitly demands it.',
      'The reveal should read clearly before the counter-beat changes its meaning.',
    ],
    authorshipDirectives: [
      'Author one clean reveal image, then a sharper reversal image that changes alignment or stakes.',
      'Keep the reversal visible in performance and staging, not just in dialogue content.',
    ],
    repairDirectives: [
      'If the reversal feels weak, give it its own stronger frame or reaction beat.',
      'If the reveal and reversal blur together, simplify the reveal shot and move the counter-beat later.',
    ],
  },
  dread_build_reveal: {
    scenePreset: 'dread_build_reveal',
    label: 'Dread Build Reveal',
    dramaticPurpose: 'Accumulate unease, anticipation, and partial information until a reveal releases the built tension.',
    shotRoleSequence: ['hook', 'setup', 'setup', 'proof', 'payoff'],
    targetSceneDurationRangeSeconds: [28, 60],
    targetShotCountRange: [5, 9],
    idealShotDurationRangeSeconds: [4, 8],
    revealDeadlineShotIndex: 5,
    dialogueDensityGuidance: 'Keep dialogue sparse. Let glances, movement, and withheld information do more of the work than speech.',
    blockingGuidance: 'Use cautious movement, thresholds, negative space, and delayed entry into key reveals.',
    coverageStrategy: 'Favor suspenseful holds, selective withholds, and motivated reveals over explanatory coverage.',
    continuityStrategy: 'Track spatial progression clearly so the audience feels the approach toward the reveal.',
    soundSilenceStrategy: 'Silence, low ambience, and isolated cues should carry tension. Avoid talk that drains dread.',
    endingShape: 'End on the reveal image or the immediate reaction it forces.',
    maxDialogueWordsPerShot: 24,
    maxActionBeatsPerShot: 2,
    maxActionMicroBeatsPerShot: 2,
    actionExchangeBundling: 'strict',
    actionDensityBias: 'low',
    storyboardPanelDensityBias: 'low',
    promptKeywords: ['dread', 'ominous', 'slow reveal', 'suspense', 'creeping', 'unsettling', 'horror', 'what is behind'],
    plannerDirectives: [
      'Delay full information until late, but keep tension escalating through new visual uncertainty.',
      'Build toward the reveal through space, silence, and controlled withholding.',
    ],
    authorshipDirectives: [
      'Use negative space, slow movement, and offscreen implication to sustain dread.',
      'Do not over-explain the ominous beat with dialogue.',
    ],
    repairDirectives: [
      'If the scene is too talky, remove or compress dialogue and let suspense beats breathe.',
      'If the reveal is not earned, add one more escalation beat of uncertainty before it lands.',
    ],
  },
  family_argument_power_shift: {
    scenePreset: 'family_argument_power_shift',
    label: 'Family Argument Power Shift',
    dramaticPurpose: 'Stage a relational conflict where authority, vulnerability, or moral advantage changes hands in visible beats.',
    shotRoleSequence: ['hook', 'setup', 'proof', 'proof', 'payoff'],
    targetSceneDurationRangeSeconds: [30, 65],
    targetShotCountRange: [5, 9],
    idealShotDurationRangeSeconds: [4, 8],
    revealDeadlineShotIndex: 5,
    dialogueDensityGuidance: 'Dialogue can be dense, but each beat must clearly shift blame, leverage, or emotional footing.',
    blockingGuidance: 'Use distance, interruptions, sit-stand asymmetry, and intrusion into shared space to make the power shift visible.',
    coverageStrategy: 'Begin with unstable shared coverage, then isolate the emotional winner and loser as the scene turns.',
    continuityStrategy: 'Keep household geography coherent so movement between rooms, counters, or doors tracks escalating control.',
    soundSilenceStrategy: 'Use overlapping room tone, breaths, and the aftermath of raised voices; let the post-argument silence register.',
    endingShape: 'End on the person newly exposed, newly in control, or emotionally abandoned.',
    maxDialogueWordsPerShot: 48,
    maxActionBeatsPerShot: 2,
    maxActionMicroBeatsPerShot: 2,
    actionExchangeBundling: 'strict',
    actionDensityBias: 'low',
    storyboardPanelDensityBias: 'low',
    promptKeywords: ['family argument', 'parents and child', 'domestic conflict', 'kitchen argument', 'power shift', 'fight at home'],
    plannerDirectives: [
      'Make the turning point a visible change in who owns the room or the emotional truth.',
      'Use blocking to show alliance, exclusion, or distance changing over the scene.',
    ],
    authorshipDirectives: [
      'Keep the scene emotionally jagged rather than evenly heated throughout.',
      'Give the strongest reaction or silence to the character who loses or gains power.',
    ],
    repairDirectives: [
      'If the argument feels one-note, add a clearer midpoint shift in leverage or vulnerability.',
      'If the staging is flat, use distance or room geography to dramatize the new power balance.',
    ],
  },
  duel_showdown: {
    scenePreset: 'duel_showdown',
    label: 'Duel Showdown',
    dramaticPurpose: 'Stage a focused one-on-one confrontation where momentum, threat, and tactical advantage visibly trade hands.',
    shotRoleSequence: ['hook', 'proof', 'proof', 'proof', 'payoff'],
    targetSceneDurationRangeSeconds: [18, 42],
    targetShotCountRange: [3, 6],
    idealShotDurationRangeSeconds: [2, 5],
    revealDeadlineShotIndex: 4,
    dialogueDensityGuidance: 'Keep dialogue extremely sparse and specific. Use at most one or two short tactical or character-revealing lines; avoid generic taunts and let the fight speak through action.',
    blockingGuidance: 'Track distance, circling, feints, entries, binds, forced retreats, and reversals of advantage so the duel geography stays legible while the exchange keeps moving.',
    coverageStrategy: 'Establish shared combat geography once, then get into contact quickly. Favor tactical mediums, impact framings, bind breaks, and decisive reversals over repeated setup beats.',
    continuityStrategy: 'Preserve facing direction, weapon-hand continuity, and distance changes so the viewer can track advantage clearly.',
    soundSilenceStrategy: 'Let breaths, footwork, metal, cloth, and impact rhythms carry the tension between brief spoken beats.',
    endingShape: 'End on the strike, disarm, mercy beat, or stare-down that clearly changes who controls the fight.',
    maxDialogueWordsPerShot: 14,
    maxActionBeatsPerShot: 5,
    maxActionMicroBeatsPerShot: 6,
    actionExchangeBundling: 'moderate',
    actionDensityBias: 'high',
    storyboardPanelDensityBias: 'high',
    promptKeywords: ['duel', 'showdown', 'face off', 'fight', 'versus', 'vs', 'clash', 'swordfight', 'one on one combat'],
    plannerDirectives: [
      'Establish geography once, then force first contact quickly instead of spending multiple shots on posture or approach.',
      'Make every turn of advantage visible through a concrete physical event such as a jam, bind break, knockback, stumble, forced retreat, or disarm.',
      'One shot may contain several linked combat beats when the exchange is continuous.',
      'Do not split every sword clash into its own shot. Cut on feint, counter, disarm, reversal, or decisive distance change.',
      'After the first attack begins, most remaining shots should contain actual combat interaction or its immediate physical consequence.',
    ],
    authorshipDirectives: [
      'Write action as chained tactical exchanges with hard physical verbs such as crash, jam, wrench, tear, slip, drive, stagger, or break.',
      'Avoid abstract phrasing like "the balance shifts" unless that shift is shown through a concrete combat event in the same beat.',
      'Let brief threat lines or reaction beats sharpen the fight instead of turning it into a conversation scene, and avoid generic lines like "come on," "too slow," or "this is not over."',
      'Bundle linked sword or melee beats into one readable exchange before cutting to the next tactical turn.',
    ],
    repairDirectives: [
      'If the duel feels mushy, simplify the geography and isolate one cleaner reversal of advantage.',
      'If the action feels repetitive, give one combat beat a clearer tactical intention such as bait, counter, disarm, or finish.',
      'If the duel is over-cut, merge tiny clash-only shots into fewer exchanges and save cuts for tactical turns.',
      'If the scene feels talky or generic, remove filler taunts and replace them with stronger physical action or one sharper line of character-specific threat.',
    ],
  },
  chase_escape_fragmented: {
    scenePreset: 'chase_escape_fragmented',
    label: 'Chase Escape Fragmented',
    dramaticPurpose: 'Sustain urgent pursuit through directional movement, near-misses, obstacles, and changing proximity between hunter and quarry.',
    shotRoleSequence: ['hook', 'setup', 'setup', 'proof', 'payoff'],
    targetSceneDurationRangeSeconds: [20, 45],
    targetShotCountRange: [5, 10],
    idealShotDurationRangeSeconds: [2, 5],
    revealDeadlineShotIndex: 5,
    dialogueDensityGuidance: 'Dialogue should be scarce and breath-driven. Use shouts, warnings, or clipped commands only when they sharpen pursuit.',
    blockingGuidance: 'Make direction of travel, obstacles, and moments of lost or regained distance easy to follow.',
    coverageStrategy: 'Fragment coverage around movement pressure, cutaways to pursuit gaps, and decisive obstacle beats.',
    continuityStrategy: 'Even when the scene is fragmented, preserve directional logic so the viewer always knows who is chasing and who is escaping.',
    soundSilenceStrategy: 'Footfalls, engines, breath, crowd wash, and collision cues should drive momentum more than speech.',
    endingShape: 'End on escape, capture, or a sudden route change that flips immediate control.',
    maxDialogueWordsPerShot: 12,
    maxActionBeatsPerShot: 4,
    maxActionMicroBeatsPerShot: 5,
    actionExchangeBundling: 'moderate',
    actionDensityBias: 'high',
    storyboardPanelDensityBias: 'high',
    promptKeywords: ['chase', 'escape', 'pursuit', 'runs from', 'hunted through', 'get away', 'flee', 'race through'],
    plannerDirectives: [
      'Treat obstacles and route changes as structural beats, not filler motion.',
      'Keep the relative distance between pursuer and pursued legible as it tightens or loosens.',
      'Do not cut on every stride or impact. Let one shot carry several linked movement beats until the obstacle or route changes.',
    ],
    authorshipDirectives: [
      'Use movement-driven cuts and changing vantage to keep urgency high without losing orientation.',
      'Reserve the biggest editorial spike for the near-capture, breakthrough, or escape turn.',
      'Bundle continuous running, vaulting, and recovery into the same shot when the pursuit vector stays clear.',
    ],
    repairDirectives: [
      'If the chase feels repetitive, add a clearer obstacle or route change that alters advantage.',
      'If orientation is breaking down, restore one stronger anchor shot that resets direction of travel.',
      'If the chase is too chopped up, merge tiny travel beats until each cut lands on an obstacle, near-capture, or direction change.',
    ],
  },
  ambush_counterambush: {
    scenePreset: 'ambush_counterambush',
    label: 'Ambush Counter-Ambush',
    dramaticPurpose: 'Deliver an attack from concealment, then rapidly expose the scramble or strategy that turns the trap back on the attackers.',
    shotRoleSequence: ['hook', 'setup', 'proof', 'proof', 'payoff'],
    targetSceneDurationRangeSeconds: [22, 48],
    targetShotCountRange: [5, 9],
    idealShotDurationRangeSeconds: [2, 5],
    revealDeadlineShotIndex: 5,
    dialogueDensityGuidance: 'Keep dialogue sparse and functional. Warnings, signals, and brief commands should ride the action.',
    blockingGuidance: 'Make lines of fire, cover, concealment, and the break in the trap visually clear.',
    coverageStrategy: 'Open with concealment or false calm, spike into attack beats, then clarify the counter-move cleanly.',
    continuityStrategy: 'Preserve attack vectors, cover positions, and who controls the terrain after the counter-turn.',
    soundSilenceStrategy: 'Use the rupture from quiet into impact, then let command barks and weapon or collision cues define the counterattack.',
    endingShape: 'End on the sprung counter, regained control, or exposed vulnerability that changes the tactical balance.',
    maxDialogueWordsPerShot: 14,
    maxActionBeatsPerShot: 5,
    maxActionMicroBeatsPerShot: 6,
    actionExchangeBundling: 'moderate',
    actionDensityBias: 'high',
    storyboardPanelDensityBias: 'high',
    promptKeywords: ['ambush', 'trap', 'springs the trap', 'surrounded', 'counterambush', 'attack from cover', 'hidden attackers'],
    plannerDirectives: [
      'The audience should understand both the original trap and the moment it fails or is inverted.',
      'Use one clean reveal beat to show how the counter-ambush changes the field.',
      'Let one shot hold several linked attack beats when the same tactical burst is still unfolding.',
    ],
    authorshipDirectives: [
      'Write the attack beat with immediate sensory clarity, then shift into tactical readability for the counter.',
      'Do not let the counter-turn happen only in dialogue; it must be visible in blocking and movement.',
      'Cut on the tactical inversion, not on every impact inside the same burst of violence.',
    ],
    repairDirectives: [
      'If the trap is unclear, strengthen concealment before the strike and clarify the attack vector.',
      'If the counter-turn feels arbitrary, add one cleaner tactical beat that motivates it on screen.',
      'If the ambush is over-segmented, merge single-hit fragments into one coherent burst before the counter-turn.',
    ],
  },
  battlefield_push_and_collapse: {
    scenePreset: 'battlefield_push_and_collapse',
    label: 'Battlefield Push and Collapse',
    dramaticPurpose: 'Track a force driving forward, seeming to seize momentum, then losing coherence under pressure, scale, or overwhelming opposition.',
    shotRoleSequence: ['hook', 'setup', 'proof', 'proof', 'payoff'],
    targetSceneDurationRangeSeconds: [35, 75],
    targetShotCountRange: [6, 11],
    idealShotDurationRangeSeconds: [3, 7],
    revealDeadlineShotIndex: 6,
    dialogueDensityGuidance: 'Use shouted orders, calls, and fragments only when they clarify the shifting battle state. Action and scale should do most of the storytelling.',
    blockingGuidance: 'Show the line pushing, the local win, then the rupture where order breaks or momentum collapses.',
    coverageStrategy: 'Alternate between local character-scale struggle and wider momentum beats that reveal the changing state of the field.',
    continuityStrategy: 'Preserve front direction, unit orientation, and the chain from advance to break so the collapse feels earned.',
    soundSilenceStrategy: 'Layer crowd pressure, impacts, distant battle beds, and shouted commands into a readable escalation pattern.',
    endingShape: 'End on the broken push, retreat, or overwhelmed frame that makes the collapse undeniable.',
    maxDialogueWordsPerShot: 18,
    maxActionBeatsPerShot: 4,
    maxActionMicroBeatsPerShot: 5,
    actionExchangeBundling: 'moderate',
    actionDensityBias: 'high',
    storyboardPanelDensityBias: 'high',
    promptKeywords: ['battlefield', 'battle', 'war', 'army', 'armies', 'front line', 'skirmish', 'warband', 'charge'],
    plannerDirectives: [
      'Make the scene progress from local confidence to visible disintegration or overmatch.',
      'Use wider scale beats sparingly but decisively to show the push becoming a collapse.',
      'Do not isolate every clash. Let each shot hold a pocket of battlefield action until the line shifts or breaks.',
    ],
    authorshipDirectives: [
      'Balance battlefield scale with a few readable human anchors so the collapse has emotional weight.',
      'Write the turning point as a visual loss of formation, position, or command coherence.',
      'Bundle local strikes, pushes, and recoveries into one continuous exchange when they belong to the same battlefield lane.',
    ],
    repairDirectives: [
      'If the battle feels shapeless, clarify the initial push before showing the break.',
      'If scale overwhelms readability, reduce the number of simultaneous actions and strengthen one human anchor beat.',
      'If the battle is over-cut, merge small clash fragments until cuts land on breach, collapse, or command loss.',
    ],
  },
  heroic_arrival_reversal: {
    scenePreset: 'heroic_arrival_reversal',
    label: 'Heroic Arrival Reversal',
    dramaticPurpose: 'Build toward rescue or reinforcement, then use the arrival to reverse imminent defeat, fear, or hopeless odds.',
    shotRoleSequence: ['hook', 'setup', 'proof', 'payoff', 'cta'],
    targetSceneDurationRangeSeconds: [24, 55],
    targetShotCountRange: [5, 8],
    idealShotDurationRangeSeconds: [3, 7],
    revealDeadlineShotIndex: 4,
    dialogueDensityGuidance: 'Keep dialogue concise and charged. The arrival should land visually before characters explain it.',
    blockingGuidance: 'Stage the pre-arrival desperation clearly, then let the entrant seize frame geography and redirect the scene.',
    coverageStrategy: 'Delay the clearest hero image until the arrival turn, then pivot into frames that show morale or power flipping.',
    continuityStrategy: 'Preserve the threatened geometry so the arrival reads as an intervention in the same space, not a disconnected entrance.',
    soundSilenceStrategy: 'Use a pressure bed or near-defeat quiet, then give the arrival a strong sonic break, impact, or reaction swell.',
    endingShape: 'End on the new advantage, the changed morale, or the counterattack the arrival makes possible.',
    maxDialogueWordsPerShot: 24,
    maxActionBeatsPerShot: 5,
    maxActionMicroBeatsPerShot: 6,
    actionExchangeBundling: 'moderate',
    actionDensityBias: 'medium',
    storyboardPanelDensityBias: 'medium',
    promptKeywords: ['heroic arrival', 'arrives in time', 'reinforcements arrive', 'rescue arrives', 'saves them', 'turns the tide'],
    plannerDirectives: [
      'Spend enough time on the losing state that the arrival genuinely feels like a reversal.',
      'Let the first clear arrival image do the dramatic work before layering aftermath.',
      'A single shot can carry several linked rescue or combat beats if the momentum shift is continuous.',
    ],
    authorshipDirectives: [
      'Write strong reaction beats around the arrival so the emotional and tactical reversal registers immediately.',
      'Avoid flattening the arrival into generic spectacle; the new advantage must become concrete.',
      'Cut on the arrival turn and the new advantage, not on every strike that follows the entrance.',
    ],
    repairDirectives: [
      'If the arrival feels unearned, strengthen the pre-arrival danger and delay the reveal slightly.',
      'If the reversal is weak, add a clearer frame showing how the entrant changes control of the scene.',
      'If the arrival section feels too choppy, merge linked rescue beats and keep the strongest cut for the reversal image.',
    ],
  },
  siege_last_stand: {
    scenePreset: 'siege_last_stand',
    label: 'Siege Last Stand',
    dramaticPurpose: 'Stage defenders holding a threshold under overwhelming pressure until the defense cracks, holds, or exacts a final cost.',
    shotRoleSequence: ['hook', 'setup', 'proof', 'proof', 'payoff'],
    targetSceneDurationRangeSeconds: [35, 80],
    targetShotCountRange: [6, 10],
    idealShotDurationRangeSeconds: [4, 8],
    revealDeadlineShotIndex: 6,
    dialogueDensityGuidance: 'Use brief commands, vows, or shouted calls. The scene should feel held together by resolve, not speeches.',
    blockingGuidance: 'Make the defended threshold, chokepoint, or wall legible, then track how pressure erodes space and stamina.',
    coverageStrategy: 'Return to the defended line repeatedly so each new breach, hold, or sacrifice reads against the same spatial anchor.',
    continuityStrategy: 'Maintain threshold geography and defender positions so losses, breaches, and holds register clearly.',
    soundSilenceStrategy: 'Use sustained pressure beds, impacts, strain, and ragged commands; let any quiet beat feel like the eye of a siege storm.',
    endingShape: 'End on the threshold holding at cost, finally breaking, or the defender\'s last decisive act.',
    maxDialogueWordsPerShot: 20,
    maxActionBeatsPerShot: 4,
    maxActionMicroBeatsPerShot: 5,
    actionExchangeBundling: 'moderate',
    actionDensityBias: 'high',
    storyboardPanelDensityBias: 'high',
    promptKeywords: ['siege', 'last stand', 'hold the line', 'hold the gate', 'defend the wall', 'final defense', 'gate breach'],
    plannerDirectives: [
      'Keep returning to the defended threshold so the audience feels mounting pressure against one clear line.',
      'Escalate through breaches, dwindling options, or mounting cost rather than generic repetition.',
      'Let one shot absorb several linked hold-the-line beats before cutting to the next breach, sacrifice, or loss of ground.',
    ],
    authorshipDirectives: [
      'Write the stand as endurance under pressure, not just as interchangeable combat beats.',
      'Make the final hold, breach, or sacrifice visible in the blocking and damage to the defended space.',
      'Bundle repeated strikes, shields, and staggered recovery into one exchange when the threshold has not yet changed.',
    ],
    repairDirectives: [
      'If the siege feels repetitive, add a more decisive breach or narrowing of options.',
      'If the last-stand feeling is weak, strengthen exhaustion, attrition, or the sense of dwindling space.',
      'If the defense is over-cut, merge small hold-and-hit fragments until cuts land on a breach or sacrifice.',
    ],
  },
}

const STORY_LANGUAGE_PROFILES: Record<CinematicStoryLanguagePreset, StoryLanguagePresetProfile> = {
  grounded_naturalist: {
    languagePreset: 'grounded_naturalist',
    label: 'Grounded Naturalist',
    cameraBehaviorRules: 'Keep camera behavior observational, restrained, and motivated by performance rather than display.',
    lensBias: 'Bias toward normal or slightly wide naturalistic lenses that preserve spatial truth and believable proximity.',
    rhythmGuidance: 'Let performance and reaction timing set the rhythm. Avoid over-cutting or ornamental camera flourishes.',
    continuityStyle: 'Protect eyelines, screen direction, and physical geography with unobtrusive continuity.',
    promptKeywords: ['grounded', 'naturalistic', 'observational', 'realistic', 'subtle', 'quiet drama'],
    plannerDirectives: [
      'Prefer coverage that feels observed rather than overtly designed.',
      'Keep compositions clean and performance-led.',
    ],
    authorshipDirectives: [
      'Use restrained camera language and believable lens choices.',
      'Do not stylize the scene beyond what the performances can support.',
    ],
    repairDirectives: [
      'If the camera feels showy, simplify it into cleaner observational coverage.',
      'If the scene feels over-cut, restore a stronger hold or reaction beat.',
    ],
  },
  precision_procedural: {
    languagePreset: 'precision_procedural',
    label: 'Precision Procedural',
    cameraBehaviorRules: 'Use controlled, deliberate framing with exact inserts, clean axes, and disciplined push-ins only when information tightens.',
    lensBias: 'Bias toward tidy medium and longer lenses for controlled isolation, with clear inserts when evidence or process matters.',
    rhythmGuidance: 'Cut with procedural clarity. Every shot should either clarify a step, sharpen suspicion, or land a reveal cleanly.',
    continuityStyle: 'Continuity should feel engineered: stable screen direction, clean match cuts, and tightly managed evidence geography.',
    promptKeywords: ['procedural precision', 'finely controlled', 'fincher', 'precise', 'clinical', 'surveillance precision'],
    plannerDirectives: [
      'Favor exact coverage and readable evidence or information flow.',
      'Treat inserts and controlled push-ins as structural beats, not decoration.',
    ],
    authorshipDirectives: [
      'Keep frames and transitions exact; do not loosen the camera without a reason tied to the scene turn.',
      'Let the camera tighten only when certainty or pressure increases.',
    ],
    repairDirectives: [
      'If the scene feels messy, reduce handheld drift and sharpen the chain of visual information.',
      'If the reveal lacks force, land it in a cleaner, more exact frame.',
    ],
  },
  lyrical_intimate: {
    languagePreset: 'lyrical_intimate',
    label: 'Lyrical Intimate',
    cameraBehaviorRules: 'Use soft, emotionally attentive camera language that privileges closeness, texture, and felt hesitation.',
    lensBias: 'Bias toward intimate medium-close coverage and selective longer-lens isolation for emotional subjectivity.',
    rhythmGuidance: 'Let the rhythm breathe. Favor tender holds, emotionally loaded cutaways, and gradual shifts rather than abrupt editorial punctuation.',
    continuityStyle: 'Continuity may be slightly elastic if it preserves emotional truth and intimacy.',
    promptKeywords: ['lyrical', 'intimate', 'tender', 'yearning', 'romantic', 'poetic', 'softly emotional'],
    plannerDirectives: [
      'Prioritize emotional proximity and gentle visual transitions.',
      'Let the frame linger when a feeling is changing.',
    ],
    authorshipDirectives: [
      'Write camera and composition so the scene feels emotionally inhabited, not merely covered.',
      'Use reaction holds and soft transitions to preserve tenderness or ache.',
    ],
    repairDirectives: [
      'If the scene feels cold, hold longer on the emotional listener or the fragile reaction.',
      'If intimacy is missing, move closer and reduce unnecessary coverage changes.',
    ],
  },
  handheld_chaos: {
    languagePreset: 'handheld_chaos',
    label: 'Handheld Chaos',
    cameraBehaviorRules: 'Use unstable, reactive handheld language that feels caught in the moment and pressured by motion or rupture.',
    lensBias: 'Bias toward wider handheld lenses that keep spatial urgency, bodies, and sudden movement in play.',
    rhythmGuidance: 'Use shorter, more volatile beats and allow abrupt reframes or rougher cuts when the scene spikes.',
    continuityStyle: 'Continuity can be rougher, but the viewer must still understand direction of movement and the source of pressure.',
    promptKeywords: ['handheld', 'chaotic', 'volatile', 'panic', 'urgent', 'fragmented', 'raw'],
    plannerDirectives: [
      'Treat instability as a response to pressure, not as generic style.',
      'Keep the viewer oriented even when the frame is unstable.',
    ],
    authorshipDirectives: [
      'Use reactive camera adjustments, abrupt re-frames, and pressured proximity when the scene destabilizes.',
      'Do not smooth over the scene turn with polished coverage.',
    ],
    repairDirectives: [
      'If the scene feels too composed for the intended pressure, roughen the camera response around the key turn.',
      'If chaos becomes unreadable, simplify geography while keeping the instability.',
    ],
  },
  tactical_combat: {
    languagePreset: 'tactical_combat',
    label: 'Tactical Combat',
    cameraBehaviorRules: 'Use combat coverage that privileges readable spacing, entries, counters, impacts, and shifting advantage over generic frenzy.',
    lensBias: 'Bias toward readable medium-wides for geography, then tighter impact or weapon inserts only when they clarify a turn.',
    rhythmGuidance: 'Cut on tactical changes such as feint, counter, breach, pursuit shift, or finishing opportunity rather than arbitrary motion.',
    continuityStyle: 'Protect combat axis, body orientation, and direction of force so the viewer can track who is winning the exchange.',
    promptKeywords: ['tactical combat', 'fight', 'duel', 'combat', 'melee', 'sword', 'parry', 'counter', 'martial'],
    plannerDirectives: [
      'Prioritize legible action geography before stylized fragmentation, then stay close to the cause-and-effect of the exchange.',
      'Treat each combat beat as a tactical decision that changes advantage through contact, evasion, bind, break, pursuit, or forced retreat.',
    ],
    authorshipDirectives: [
      'Write action coverage around readable cause and effect in the exchange, not around vague momentum summaries.',
      'Do not mistake constant motion for clarity; let one decisive combat beat read fully, but keep chained beats inside the same shot when they belong to one continuous exchange.',
      'Favor specific physical verbs and visible consequences over generic combat description or ornamental camera language.',
    ],
    repairDirectives: [
      'If the fight feels muddy, restore cleaner geography and isolate one clearer tactical exchange.',
      'If impacts feel weightless, cut closer only on the decisive contact or reversal beat.',
      'If the scene feels too safe, replace explanatory beats with a harder contact beat, clearer breach, or more forceful displacement.',
    ],
  },
  operatic_epic: {
    languagePreset: 'operatic_epic',
    label: 'Operatic Epic',
    cameraBehaviorRules: 'Use large-scale, deliberate visual language that privileges sweep, silhouette, and the feeling of destiny or consequence.',
    lensBias: 'Bias toward wider epic lenses, bold horizon lines, and occasional imposing longer-lens isolations for decisive hero or villain beats.',
    rhythmGuidance: 'Let scale, build, and release determine rhythm. Use bigger editorial punctuation at turns of fate, arrival, or collapse.',
    continuityStyle: 'Continuity should feel stately and intentional even when scenes move through large spaces or spectacle.',
    promptKeywords: ['operatic', 'epic', 'grand', 'sweeping', 'legendary', 'heroic scale', 'massive'],
    plannerDirectives: [
      'Use a few bigger scale frames to mark fate-changing beats rather than overspending spectacle on every shot.',
      'Keep the scene emotionally legible inside the scale.',
    ],
    authorshipDirectives: [
      'Write camera and composition so the scene feels monumental without losing the central dramatic turn.',
      'Favor strong silhouettes, horizon control, and decisive visual punctuation around reversals.',
    ],
    repairDirectives: [
      'If the scene feels small for the intended scale, add one stronger widescale beat or silhouette frame.',
      'If spectacle overwhelms clarity, simplify the shot order around the core reversal.',
    ],
  },
  war_immersion: {
    languagePreset: 'war_immersion',
    label: 'War Immersion',
    cameraBehaviorRules: 'Use embedded, pressure-soaked coverage that keeps the viewer inside confusion, attrition, and battlefield weight while preserving basic orientation.',
    lensBias: 'Bias toward embedded wider combat lenses with occasional compressed glimpses of command, impact, or collapse through smoke and distance.',
    rhythmGuidance: 'Rhythm should surge with bursts of pressure, near misses, command fragments, and moments of overwhelmed regrouping.',
    continuityStyle: 'Continuity can be rough and battered, but the scene must still track where pressure is coming from and what is failing.',
    promptKeywords: ['war', 'battlefield', 'front line', 'trench', 'soldier', 'platoon', 'artillery', 'mud', 'combat zone'],
    plannerDirectives: [
      'Keep the viewer inside the pressure of the field while giving enough directional information to understand collapse or advance.',
      'Use attrition and environment damage as part of the storytelling, not just character motion.',
    ],
    authorshipDirectives: [
      'Write the scene as sustained pressure with localized human anchors inside a larger field of violence.',
      'Do not over-clean the battle into elegant action coverage; let exhaustion and impact accumulate.',
    ],
    repairDirectives: [
      'If war pressure is missing, add stronger environmental attrition, command fragments, or overwhelmed movement beats.',
      'If the field becomes unreadable, give one clearer anchor on the threatened line or unit position.',
    ],
  },
  mythic_tableau: {
    languagePreset: 'mythic_tableau',
    label: 'Mythic Tableau',
    cameraBehaviorRules: 'Use iconic, sculptural compositions that make characters and clashes feel legendary, fated, or larger than ordinary realism.',
    lensBias: 'Bias toward composed wides, centered hero-villain alignments, and selective monumental close framings with strong silhouette logic.',
    rhythmGuidance: 'Let the rhythm breathe around iconic poses, ominous reveals, and fate-loaded gestures rather than restless cutting.',
    continuityStyle: 'Continuity may be stylized if it protects symbolic clarity, iconic positioning, and the scene’s mythic readability.',
    promptKeywords: ['mythic', 'legendary', 'tableau', 'iconic', 'prophecy', 'ancient', 'godlike', 'myth'],
    plannerDirectives: [
      'Favor a small number of iconic compositions that feel memorable and fate-charged.',
      'Use movement sparingly when a tableau can carry the beat more powerfully.',
    ],
    authorshipDirectives: [
      'Write compositions that feel sculpted and symbolic rather than purely observational.',
      'Treat entrances, confrontations, and reveals as iconic images first, then fill in motion around them.',
    ],
    repairDirectives: [
      'If the mythic quality is weak, strengthen silhouette, alignment, or the iconic confrontation frame.',
      'If the scene feels too busy, reduce cuts and let one composed image carry more dramatic weight.',
    ],
  },
}

function normalizePrompt(prompt: string) {
  return prompt.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function countKeywordMatches(prompt: string, keywords: readonly string[]) {
  return keywords.reduce((count, keyword) => {
    const normalizedKeyword = normalizePrompt(keyword)
    return normalizedKeyword && prompt.includes(normalizedKeyword) ? count + 1 : count
  }, 0)
}

export function getDefaultStoryScenePreset() {
  return DEFAULT_STORY_SCENE_PRESET
}

export function getDefaultStoryLanguagePreset() {
  return DEFAULT_STORY_LANGUAGE_PRESET
}

export function getStoryScreenwritingContract() {
  return STORY_SCREENWRITING_CONTRACT
}

export function getStoryScenePresetProfile(
  storyScenePreset: CinematicStoryScenePreset | null | undefined,
) {
  return STORY_SCENE_PROFILES[storyScenePreset ?? DEFAULT_STORY_SCENE_PRESET] ?? STORY_SCENE_PROFILES[DEFAULT_STORY_SCENE_PRESET]
}

export function getStoryLanguagePresetProfile(
  storyLanguagePreset: CinematicStoryLanguagePreset | null | undefined,
) {
  return STORY_LANGUAGE_PROFILES[storyLanguagePreset ?? DEFAULT_STORY_LANGUAGE_PRESET] ?? STORY_LANGUAGE_PROFILES[DEFAULT_STORY_LANGUAGE_PRESET]
}

export function getStoryScenePresetLabel(storyScenePreset: CinematicStoryScenePreset | null | undefined) {
  return getStoryScenePresetProfile(storyScenePreset).label
}

export function getStoryLanguagePresetLabel(storyLanguagePreset: CinematicStoryLanguagePreset | null | undefined) {
  return getStoryLanguagePresetProfile(storyLanguagePreset).label
}

export function inferStoryScenePresetFromPromptText(prompt: string): CinematicStoryScenePreset {
  const normalized = normalizePrompt(prompt)
  if (!normalized) return DEFAULT_STORY_SCENE_PRESET

  if (/\bsiege|last stand|hold the gate|hold the line|defend the wall|final defense|gate breach\b/.test(normalized)) return 'siege_last_stand'
  if (/\bheroic arrival|arrives in time|reinforcements? arriv|rescue arriv|saves? them|turns the tide\b/.test(normalized)) return 'heroic_arrival_reversal'
  if (/\bambush|counter ambush|counterambush|springs? the trap|trap is sprung|attack from cover|surrounded\b/.test(normalized)) return 'ambush_counterambush'
  if (/\bchase|escape|pursuit|flee|get away|hunt down|runs? from\b/.test(normalized)) return 'chase_escape_fragmented'
  if (/\bbattlefield|front line|war\b|armies|army|skirmish|warband|charge into battle|battle scene\b/.test(normalized)) return 'battlefield_push_and_collapse'
  if (/\bduel|showdown|face off|faces off|fight|versus|\bvs\b|swordfight|one on one combat|clashes? with\b/.test(normalized)) return 'duel_showdown'
  if (/\binterrogat|confess|questioning|detective|suspect|interview room\b/.test(normalized)) return 'interrogation_pressure_cooker'
  if (/\bforensic|investigat|discovery|clue|evidence|lab|procedural\b/.test(normalized)) return 'procedural_discovery'
  if (/\breversal|double cross|twist|countermove|turns out\b/.test(normalized)) return 'reveal_then_reversal'
  if (/\bdread|ominous|suspense|creeping|unsettling|horror|something behind\b/.test(normalized)) return 'dread_build_reveal'
  if (/\bfamily argument|domestic fight|kitchen fight|parents and child|at home\b/.test(normalized)) return 'family_argument_power_shift'

  let bestPreset = DEFAULT_STORY_SCENE_PRESET
  let bestScore = 0
  for (const profile of Object.values(STORY_SCENE_PROFILES)) {
    const score = countKeywordMatches(normalized, profile.promptKeywords)
    if (score > bestScore) {
      bestScore = score
      bestPreset = profile.scenePreset
    }
  }
  return bestPreset
}

export function inferStoryLanguagePresetFromPromptText(prompt: string): CinematicStoryLanguagePreset {
  const normalized = normalizePrompt(prompt)
  if (!normalized) return DEFAULT_STORY_LANGUAGE_PRESET

  if (/\bwar|battlefield|front line|trench|soldier|platoon|artillery|mud|combat zone\b/.test(normalized)) return 'war_immersion'
  if (/\bmythic|legendary|tableau|iconic|prophecy|ancient|godlike|myth\b/.test(normalized)) return 'mythic_tableau'
  if (/\boperatic|epic|grand|sweeping|heroic scale|massive\b/.test(normalized)) return 'operatic_epic'
  if (/\bhandheld|chaos|raw|urgent|volatile|panic|fragmented\b/.test(normalized)) return 'handheld_chaos'
  if (/\bprecision|procedural|clinical|controlled|fincher|surveillance\b/.test(normalized)) return 'precision_procedural'
  if (/\btactical|fight|duel|combat|melee|sword|parry|counter|martial\b/.test(normalized)) return 'tactical_combat'
  if (/\blyrical|intimate|tender|yearning|poetic|romantic\b/.test(normalized)) return 'lyrical_intimate'

  let bestPreset = DEFAULT_STORY_LANGUAGE_PRESET
  let bestScore = 0
  for (const profile of Object.values(STORY_LANGUAGE_PROFILES)) {
    const score = countKeywordMatches(normalized, profile.promptKeywords)
    if (score > bestScore) {
      bestScore = score
      bestPreset = profile.languagePreset
    }
  }
  return bestPreset
}

export function resolveStoryRuntimeContract(input: {
  storyScenePreset?: CinematicStoryScenePreset | null
  storyLanguagePreset?: CinematicStoryLanguagePreset | null
}) {
  const sceneProfile = getStoryScenePresetProfile(input.storyScenePreset)
  const languageProfile = getStoryLanguagePresetProfile(input.storyLanguagePreset)
  return {
    scenePreset: sceneProfile.scenePreset,
    languagePreset: languageProfile.languagePreset,
    sceneLabel: sceneProfile.label,
    languageLabel: languageProfile.label,
    dramaticPurpose: sceneProfile.dramaticPurpose,
    shotRoleSequence: sceneProfile.shotRoleSequence,
    targetSceneDurationRangeSeconds: sceneProfile.targetSceneDurationRangeSeconds,
    targetShotCountRange: sceneProfile.targetShotCountRange,
    idealShotDurationRangeSeconds: sceneProfile.idealShotDurationRangeSeconds,
    revealDeadlineShotIndex: sceneProfile.revealDeadlineShotIndex,
    dialogueDensityGuidance: sceneProfile.dialogueDensityGuidance,
    blockingGuidance: sceneProfile.blockingGuidance,
    coverageStrategy: sceneProfile.coverageStrategy,
    cameraBehaviorRules: languageProfile.cameraBehaviorRules,
    lensBias: languageProfile.lensBias,
    rhythmGuidance: languageProfile.rhythmGuidance,
    continuityStrategy: sceneProfile.continuityStrategy,
    continuityStyle: languageProfile.continuityStyle,
    soundSilenceStrategy: sceneProfile.soundSilenceStrategy,
    endingShape: sceneProfile.endingShape,
    maxDialogueWordsPerShot: sceneProfile.maxDialogueWordsPerShot,
    maxActionBeatsPerShot: sceneProfile.maxActionBeatsPerShot,
    maxActionMicroBeatsPerShot: sceneProfile.maxActionMicroBeatsPerShot,
    actionExchangeBundling: sceneProfile.actionExchangeBundling,
    actionDensityBias: sceneProfile.actionDensityBias,
    storyboardPanelDensityBias: sceneProfile.storyboardPanelDensityBias,
    plannerDirectives: [...sceneProfile.plannerDirectives, ...languageProfile.plannerDirectives],
    authorshipDirectives: [...sceneProfile.authorshipDirectives, ...languageProfile.authorshipDirectives],
    repairDirectives: [...sceneProfile.repairDirectives, ...languageProfile.repairDirectives],
  } satisfies StoryRuntimeContract
}
