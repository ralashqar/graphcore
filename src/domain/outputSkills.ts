import { z } from 'zod'

const looseRecordSchema = z.record(z.string(), z.unknown())

export const outputSkillModalitySchema = z.enum(['text', 'image', 'video', 'document', 'workflow'])
export const outputGuidanceModeSchema = z.enum(['append', 'strict', 'reference'])

export const outputSkillSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  category: z.string().min(1),
  modality: outputSkillModalitySchema,
  appliesToNodeTypes: z.array(z.string().min(1)).default([]),
  appliesToPurposes: z.array(z.string().min(1)).default([]),
  guidance: z.array(z.string().min(1)).default([]),
  avoid: z.array(z.string().min(1)).default([]),
  structuredDirectives: looseRecordSchema.default({}),
  priority: z.number().int().default(0),
  tokenBudget: z.number().int().positive().default(240),
  version: z.string().min(1).default('1.0.0'),
  tags: z.array(z.string().min(1)).default([]),
})

export const outputGuidanceBundleSchema = z.object({
  skillKeys: z.array(z.string()).default([]),
  skillVersions: z.record(z.string(), z.string()).default({}),
  guidanceHash: z.string().default(''),
  guidanceMode: outputGuidanceModeSchema.default('append'),
  guidance: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([]),
  structuredDirectives: looseRecordSchema.default({}),
  resolvedGuidancePreview: z.string().default(''),
  skills: z.array(outputSkillSchema.pick({
    key: true,
    name: true,
    category: true,
    modality: true,
    version: true,
    tags: true,
  })).default([]),
  diagnostics: z.array(z.string()).default([]),
})

export type OutputSkill = z.infer<typeof outputSkillSchema>
export type OutputGuidanceBundle = z.infer<typeof outputGuidanceBundleSchema>
export type OutputGuidanceMode = z.infer<typeof outputGuidanceModeSchema>

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(',')}}`
}

function stableHash(value: unknown) {
  const input = stableStringify(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export const OUTPUT_SKILL_REGISTRY: readonly OutputSkill[] = [
  {
    key: 'fiction_prose_voice',
    name: 'Fiction Prose Voice',
    description: 'Literary prose guidance for chapter drafts.',
    category: 'writing',
    modality: 'text',
    appliesToNodeTypes: ['text_llm'],
    appliesToPurposes: ['chapter_prose', 'chapter_section_prose', 'front_back_matter'],
    guidance: [
      'Write with concrete sensory detail, specific verbs, and clean sentence rhythm that follows the emotional pressure of the scene.',
      'Let character desire, conflict, and consequence shape every paragraph.',
      'Use interiority sparingly but precisely, anchored in action and perception.',
      'Prefer plain, exact physical description over decorative language; keep most sentences direct and let tension come from action, stakes, and subtext.',
      'Use at most one fresh figurative image in a paragraph, and only when it reveals character perception or changes the reader understanding of the moment.',
    ],
    avoid: [
      'Avoid generic inspirational narration, summary-heavy exposition, and repetitive emotional labels.',
      'Avoid explaining themes directly when they can be expressed through choice, image, or consequence.',
      'Avoid purple prose, stacked adjectives, melodramatic weather, ornate metaphors, and similes that call attention to the writing.',
      'Avoid stock noir or dystopian imagery such as rain in thick sheets, neon bleeding, towers clawing at the sky, hearts thumping like drums, or whispers trembling in shadows.',
      'Avoid loading a single sentence with multiple sensory effects, abstractions, or emotional intensifiers.',
    ],
    structuredDirectives: {
      proseDensity: 'scene_forward',
      voice: 'literary_grounded',
      styleRestraint: 'high',
      metaphorBudget: 'sparse_character_revealing_only',
      adjectivePolicy: 'minimal_exact_nonstacked',
    },
    priority: 90,
    tokenBudget: 320,
    version: '1.0.1',
    tags: ['fiction_prose', 'chapter', 'voice'],
  },
  {
    key: 'nonfiction_clear_ebook_voice',
    name: 'Clear Nonfiction Ebook Voice',
    description: 'Plain-spoken nonfiction guidance for educational ebook chapters.',
    category: 'writing',
    modality: 'text',
    appliesToNodeTypes: ['text_llm'],
    appliesToPurposes: ['chapter_prose', 'chapter_section_prose', 'front_back_matter'],
    guidance: [
      'Lead with the reader problem, then explain one useful idea at a time with crisp examples.',
      'Use short sections, concrete takeaways, and transitions that make the argument easy to follow.',
      'Prefer clarity and usefulness over flourish.',
    ],
    avoid: [
      'Avoid padded thought-leadership phrasing, vague frameworks, and overpromising outcomes.',
    ],
    structuredDirectives: { proseDensity: 'clear_practical', voice: 'direct_nonfiction' },
    priority: 86,
    tokenBudget: 220,
    version: '1.0.0',
    tags: ['nonfiction', 'ebook', 'clarity'],
  },
  {
    key: 'anti_ai_telltales',
    name: 'Anti AI Telltales',
    description: 'Reduces common synthetic phrasing and repetitive model habits.',
    category: 'quality',
    modality: 'text',
    appliesToNodeTypes: ['text_llm'],
    appliesToPurposes: ['chapter_prose', 'chapter_section_plan', 'chapter_section_prose', 'editor_pass', 'front_back_matter', 'ugc_script', 'cinematic_script', 'comic_script', 'comic_entity_selector'],
    guidance: [
      'Use varied sentence shapes and scene-specific language instead of reusable templates.',
      'Prefer exact nouns and actions over abstract adjectives.',
      'Keep transitions invisible unless a structural shift needs to be clear.',
      'Keep prose human-scaled: concrete action first, then only the amount of atmosphere the reader needs to understand place, danger, or mood.',
      'When revising a sentence, remove the weakest adjective, metaphor, or intensifier before adding anything new.',
    ],
    avoid: [
      'Avoid phrases like "little did they know", "a testament to", "in a world where", "not just X but Y", and forced rhetorical symmetry.',
      'Avoid overusing em dashes, triads, and paragraph endings that restate the obvious.',
      'Avoid adjective chains, cinematic over-description, generic ominous atmosphere, and body-sensation cliches such as racing hearts, breath catching, blood turning cold, or stomachs knotting unless handled plainly.',
      'Avoid metaphor piles where weather, architecture, light, sound, and emotion all become figurative in the same paragraph.',
    ],
    structuredDirectives: {
      antiPatterns: ['template_phrasing', 'generic_intensity', 'forced_symmetry', 'purple_prose', 'stacked_adjectives', 'metaphor_pileups'],
      revisionRule: 'cut_decorative_language_first',
    },
    priority: 100,
    tokenBudget: 280,
    version: '1.0.1',
    tags: ['anti_ai_tells', 'quality', 'voice'],
  },
  {
    key: 'chapter_scene_structure',
    name: 'Chapter Scene Structure',
    description: 'Keeps chapter prose grounded in dramatic movement.',
    category: 'writing',
    modality: 'text',
    appliesToNodeTypes: ['text_llm'],
    appliesToPurposes: ['outline', 'chapter_prose', 'chapter_section_plan', 'chapter_section_prose', 'chapter_plan'],
    guidance: [
      'Shape each chapter around a pressure, a choice, a reversal, and a changed situation.',
      'Open close to a live problem and close with a consequence or sharpened question.',
      'Make exposition arrive through conflict, discovery, or decision.',
      'Let scene structure carry intensity; do not compensate for weak action with heightened adjectives or ornamental description.',
    ],
    avoid: [
      'Avoid chapters that only explain lore or summarize what the outline already says.',
      'Avoid opening sections with generic weather, skyline, or mood-painting unless those details create an immediate problem for the character.',
    ],
    structuredDirectives: { chapterBeats: ['pressure', 'choice', 'reversal', 'changed_state'], intensitySource: 'action_and_consequence' },
    priority: 88,
    tokenBudget: 250,
    version: '1.0.1',
    tags: ['fiction_prose', 'chapter', 'structure'],
  },
  {
    key: 'fiction_pov_balance',
    name: 'Fiction POV Balance',
    description: 'Controls narration point of view, focal character, and scene texture balance.',
    category: 'writing',
    modality: 'text',
    appliesToNodeTypes: ['text_llm'],
    appliesToPurposes: ['chapter_prose', 'chapter_section_prose', 'editor_pass'],
    guidance: [
      'Honor the project narration POV exactly, including first person, third limited, close third, or rotating limited when specified.',
      'Use the sequence unit POV character as the focal consciousness for the chapter unless the chapter brief explicitly states otherwise.',
      'Keep internal reflection tied to what the POV character perceives, wants, fears, decides, or misunderstands in the present scene.',
      'Balance the chapter texture across concrete action, dialogue/subtext, and selective internal reflection; do not let any one mode dominate for long.',
      'Reveal exposition through the POV character pressure, observation, dialogue, conflict, and consequence instead of detached explanation.',
    ],
    avoid: [
      'Avoid head-hopping, omniscient summary, narrator knowledge the POV character could not know, and sudden POV shifts inside a scene.',
      'Avoid pages of action with no interior response, pages of reflection with no external pressure, or dialogue that floats without physical behavior.',
      'Avoid announcing feelings abstractly when the POV can show them through attention, choice, interruption, hesitation, or what they refuse to say.',
    ],
    structuredDirectives: {
      pov: 'project_level_exact',
      focalCharacter: 'sequence_unit',
      sceneTexture: ['action', 'dialogue', 'interiority'],
      headHopping: false,
    },
    priority: 98,
    tokenBudget: 300,
    version: '1.0.0',
    tags: ['fiction_prose', 'pov', 'interiority', 'dialogue', 'chapter'],
  },
  {
    key: 'continuity_editor',
    name: 'Continuity Editor',
    description: 'Preserves canon and smooths joins after parallel generation.',
    category: 'editing',
    modality: 'text',
    appliesToNodeTypes: ['text_llm'],
    appliesToPurposes: ['editor_pass', 'front_back_matter'],
    guidance: [
      'Preserve names, chronology, relationships, open loops, and outcomes from the source world graph.',
      'Smooth chapter transitions without changing canon facts.',
      'Resolve repeated phrasing and tonal drift introduced by independent chapter generation.',
    ],
    avoid: [
      'Avoid inventing new canon, changing outcomes, or flattening distinct chapter voices into one generic register.',
    ],
    structuredDirectives: { editPass: 'continuity_consistency' },
    priority: 94,
    tokenBudget: 260,
    version: '1.0.0',
    tags: ['editor', 'continuity', 'canon'],
  },
  {
    key: 'story_bible_structure',
    name: 'Story Bible Structure',
    description: 'Organizes world canon into readable reference-document sections.',
    category: 'reference',
    modality: 'document',
    appliesToNodeTypes: ['text_llm', 'utility_transform', 'document_render'],
    appliesToPurposes: ['bible_section_plan', 'bible_section', 'bible_assembly', 'story_bible_document_render'],
    guidance: [
      'Write as a reference handbook, not as fiction prose or marketing copy.',
      'Use clear headings, short paragraphs, bullets where useful, and consistent section order.',
      'Separate confirmed canon from gaps, assumptions, and useful next-development notes.',
      'Curate and synthesize the strongest canon for each section instead of exporting every graph field.',
      'Use an editorial production-bible voice: structured, selective, visual where useful, and easy to scan.',
    ],
    avoid: [
      'Avoid scene-writing, chapter prose, invented filler lore, vague inspirational summaries, and long atmospheric openings.',
      'Avoid dumping raw world context, repeating the same synopsis across sections, or listing every entity when a grouped summary is clearer.',
    ],
    structuredDirectives: { documentMode: 'reference', sectioned: true, canonOnly: true },
    priority: 96,
    tokenBudget: 260,
    version: '1.0.0',
    tags: ['reference_document', 'story_bible', 'canon'],
  },
  {
    key: 'canon_reference_voice',
    name: 'Canon Reference Voice',
    description: 'Keeps reference outputs concise, factual, and editorially useful.',
    category: 'reference',
    modality: 'text',
    appliesToNodeTypes: ['text_llm', 'utility_transform'],
    appliesToPurposes: ['bible_section_plan', 'bible_section', 'bible_assembly'],
    guidance: [
      'Use direct, specific language that helps a writer, artist, or producer understand the current canon quickly.',
      'Prefer exact names, roles, relationships, outcomes, constraints, and unresolved gaps over decorative phrasing.',
      'When canon is thin, say "Not yet defined in canon" and name what information is missing.',
      'Pick and arrange details by usefulness to the requested output, not by database order.',
    ],
    avoid: [
      'Avoid treating missing information as permission to invent facts.',
      'Avoid fictional scene narration, purple prose, and generic encyclopedia padding.',
      'Avoid duplicating the same captions or descriptions around visual reference images.',
    ],
    structuredDirectives: { voice: 'concise_reference', missingCanonPolicy: 'state_gap_do_not_invent' },
    priority: 98,
    tokenBudget: 260,
    version: '1.0.0',
    tags: ['reference_document', 'canon', 'clarity'],
  },
  {
    key: 'continuity_documentation',
    name: 'Continuity Documentation',
    description: 'Surfaces sequence order, causes, relationships, contradictions, and open loops.',
    category: 'reference',
    modality: 'text',
    appliesToNodeTypes: ['text_llm', 'utility_transform'],
    appliesToPurposes: ['bible_section_plan', 'bible_section', 'bible_assembly', 'story_bible_document_render'],
    guidance: [
      'Track cause and effect, chronology, character-state changes, unresolved loops, and canon constraints.',
      'Call out contradictions or weak continuity as notes instead of silently smoothing them away.',
      'Preserve sequence-unit outcomes and relationship direction exactly.',
    ],
    avoid: [
      'Avoid rewriting canon to fix continuity and avoid hiding uncertainty behind confident prose.',
    ],
    structuredDirectives: { continuityNotes: true, preserveSequenceOutcomes: true },
    priority: 94,
    tokenBudget: 250,
    version: '1.0.0',
    tags: ['reference_document', 'continuity', 'canon'],
  },
  {
    key: 'world_lore_clarity',
    name: 'World Lore Clarity',
    description: 'Explains lore, rules, groups, places, and visual tone without overbuilding.',
    category: 'reference',
    modality: 'text',
    appliesToNodeTypes: ['text_llm'],
    appliesToPurposes: ['bible_section', 'bible_section_plan'],
    guidance: [
      'Explain lore through defined entities, rules, relationships, and consequences already present in the world graph.',
      'Group related places, factions, objects, concepts, motifs, and sequence beats so the reader can scan them.',
      'Keep visual style and tone actionable for future writing, image, comic, or video outputs.',
    ],
    avoid: [
      'Avoid lore inflation, vague mythology, and treating mood words as a substitute for concrete canon.',
    ],
    structuredDirectives: { lorePolicy: 'explain_defined_material', overbuild: false },
    priority: 90,
    tokenBudget: 260,
    version: '1.0.0',
    tags: ['reference_document', 'lore', 'world_bible'],
  },
  {
    key: 'cinematic_shot_script',
    name: 'Cinematic Shot Script',
    description: 'Converts story beats into shot-readable screen action.',
    category: 'cinematic',
    modality: 'text',
    appliesToNodeTypes: ['text_llm'],
    appliesToPurposes: ['cinematic_script', 'shot_plan', 'comic_scene_script', 'comic_script'],
    guidance: [
      'Write in visual, shootable beats with clear subject, action, camera intent, and transition logic.',
      'Keep dialogue and narration tied to visible behavior or audio purpose.',
      'Preserve continuity of place, wardrobe, props, and emotional state across shots.',
    ],
    avoid: [
      'Avoid unfilmable inner-state prose, vague camera adjectives, and shots that cannot be staged from available references.',
    ],
    structuredDirectives: { scriptFormat: 'shot_readable', continuity: true },
    priority: 90,
    tokenBudget: 260,
    version: '1.0.0',
    tags: ['cinematic', 'shot_script', 'story'],
  },
  {
    key: 'cinematic_screenwriting_craft',
    name: 'Cinematic Screenwriting Craft',
    description: 'Authors V2 cinematic story material as a focused screenplay or shot-readable treatment before technical planning.',
    category: 'cinematic',
    modality: 'text',
    appliesToNodeTypes: ['text_llm'],
    appliesToPurposes: ['cinematic_v2_screenplay_author', 'cinematic_v3_screenplay_author'],
    guidance: [
      'Write the dramatic scene first: objective, conflict, escalation, visible action, concise dialogue when needed, and a clear emotional turn.',
      'Use screenplay/treatment language that can be directed shot by shot, with concrete behavior and subtext rather than exposition.',
      'Let runtime follow story density and user intent; do not force a 15-second total unless explicitly requested.',
    ],
    avoid: [
      'Avoid provider names, @Image labels, graph/workflow fields, image prompts, video prompts, shot-plan JSON, or execution metadata.',
    ],
    structuredDirectives: { scriptFirst: true, creativeOnly: true, noProviderInstructions: true },
    priority: 100,
    tokenBudget: 360,
    version: '1.0.0',
    tags: ['cinematic_v2', 'screenplay', 'screenwriting'],
  },
  {
    key: 'cinematic_sequence_structure',
    name: 'Cinematic Sequence Structure',
    description: 'Authors and compiles cinematic prompts into directed shot scripts with dynamic takes, escalation, and continuity.',
    category: 'cinematic',
    modality: 'text',
    appliesToNodeTypes: ['text_llm'],
    appliesToPurposes: ['cinematic_entity_selector', 'cinematic_script_authoring', 'cinematic_sequence_compile', 'cinematic_sequence_plan', 'cinematic_block_script', 'cinematic_v2_reference_select', 'cinematic_v2_screenplay_author', 'cinematic_v2_script_parse', 'cinematic_v2_scene_compile', 'cinematic_v2_layout_plan', 'cinematic_v2_shot_plan', 'cinematic_v3_reference_select', 'cinematic_v3_screenplay_author', 'cinematic_v3_shot_parse'],
    guidance: [
      'Author the full directed script first, then let the compiler group shots into natural 4-15 second takes.',
      'Do not pad runtime or force a predetermined block count; shot count and total duration should follow the prompt, world context, and dramatic complexity.',
      'Use world context as canon: preserve selected sequence outcomes, entity identities, relationship pressure, and established visual style.',
    ],
    avoid: [
      'Avoid open-ended outlines, unbounded runtimes, new canon invented for convenience, or block plans that cannot be rendered as short clips.',
    ],
    structuredDirectives: { takeRuntime: { minSeconds: 4, maxSeconds: 15 }, scriptFirst: true, continuity: true },
    priority: 97,
    tokenBudget: 300,
    version: '1.0.0',
    tags: ['cinematic', 'sequence_plan', 'timing'],
  },
  {
    key: 'cinematic_directorial_language',
    name: 'Cinematic Directorial Language',
    description: 'Turns screenplay material into disciplined blocking, camera language, and emotional coverage.',
    category: 'cinematic',
    modality: 'text',
    appliesToNodeTypes: ['text_llm'],
    appliesToPurposes: ['cinematic_v2_scene_compile', 'cinematic_v2_layout_plan', 'cinematic_v2_shot_plan', 'cinematic_v3_shot_parse', 'cinematic_v3_shot_parse_group'],
    guidance: [
      'Direct the scene through camera placement, lens, blocking, eyeline, light direction, pace, reveal order, and actor behavior.',
      'Tie each shot choice to the emotional turn of the scene and preserve screen direction across adjacent shots.',
      'Translate emotional intent into performance direction: valence, arousal, confidence, dominance, body language, expression, gaze, gesture, and voice energy.',
      'Prefer a few purposeful setups over generic coverage; every shot needs one job.',
    ],
    avoid: [
      'Avoid vague cinematic adjectives without visible blocking/camera choices, game UI language, or unmotivated camera changes.',
    ],
    structuredDirectives: { cameraLanguage: true, blockingContinuity: true, motivatedCoverage: true },
    priority: 98,
    tokenBudget: 300,
    version: '1.0.0',
    tags: ['cinematic_v2', 'directing', 'blocking', 'camera'],
  },
  {
    key: 'cinematic_shot_direction',
    name: 'Cinematic Shot Direction',
    description: 'Turns each beat into subject, action, camera, composition, and audio direction.',
    category: 'cinematic',
    modality: 'text',
    appliesToNodeTypes: ['text_llm', 'video_generation'],
    appliesToPurposes: ['cinematic_script_authoring', 'cinematic_block_script', 'cinematic_video_prompt', 'cinematic_block_video', 'cinematic_v2_video_prompt', 'cinematic_v2_shot_video', 'cinematic_v3_shot_parse', 'cinematic_v3_shot_parse_group', 'cinematic_v3_storyboard_group_video_prompt', 'cinematic_v3_storyboard_group_video'],
    guidance: [
      'For every shot, specify one dominant subject, one visible action, one camera move or framing choice, and the continuity state at the start and end.',
      'Make timestamps usable by video generation: start and end times must be ordered and fit inside the block duration.',
      'Describe what should be seen and heard, not abstract intent or production commentary.',
    ],
    avoid: [
      'Avoid stacking multiple unrelated actions into one shot, contradictory camera moves, invisible emotions, or references to internal workflow fields.',
    ],
    structuredDirectives: { shotFields: ['subject', 'action', 'camera', 'composition', 'audio'], timestamped: true },
    priority: 96,
    tokenBudget: 280,
    version: '1.0.0',
    tags: ['cinematic', 'shot_direction', 'video_prompt'],
  },
  {
    key: 'storyboard_panel_accuracy',
    name: 'Storyboard Panel Accuracy',
    description: 'Constrains V2 storyboard panels to the expected subjects, refs, and shot composition.',
    category: 'cinematic',
    modality: 'image',
    appliesToNodeTypes: ['utility_transform', 'image_generation'],
    appliesToPurposes: ['cinematic_v2_storyboard_prompt', 'cinematic_v2_storyboard_sheet', 'cinematic_v3_storyboard_prompt', 'cinematic_v3_storyboard_sheet'],
    guidance: [
      'Each panel must show only the required listed subjects unless the prompt explicitly allows extras.',
      'Use per-panel character/location/prop requirements as hard casting notes; do not swap identities or duplicate a character.',
      'Storyboard panels are composition anchors, not final identity truth; keep them readable and free of captions, borders, UI, and labels.',
    ],
    avoid: [
      'Avoid extra unlisted characters, background lookalikes, swapped cast, duplicate subjects, panel text, and decorative comic-page language.',
    ],
    structuredDirectives: { panelCasting: 'strict', storyboardAsCompositionAnchor: true },
    priority: 99,
    tokenBudget: 280,
    version: '1.0.0',
    tags: ['cinematic_v2', 'storyboard', 'panel_accuracy'],
  },
  {
    key: 'storyboard_grid_direction',
    name: 'Storyboard Grid Direction',
    description: 'Legacy planning-sheet guidance for readable storyboard grids on short video blocks.',
    category: 'cinematic',
    modality: 'image',
    appliesToNodeTypes: ['utility_transform', 'image_generation'],
    appliesToPurposes: ['cinematic_storyboard_prompt', 'cinematic_storyboard', 'cinematic_v2_storyboard_prompt', 'cinematic_v2_storyboard_sheet', 'cinematic_v3_storyboard_prompt', 'cinematic_v3_storyboard_sheet'],
    guidance: [
      'Use storyboard sheets as the default cinematic continuity/timing reference when cinematicReferenceMode is storyboard_sheet.',
      'Each panel should read as a clean shot thumbnail with consistent character identity, environment continuity, and clear camera framing.',
      'Keep panels visually readable and avoid dense notes, tables, watermarks, or UI clutter.',
    ],
    avoid: [
      'Avoid poster art, full comic pages, speech bubbles, unreadable tiny details, and inconsistent character designs across panels.',
    ],
    structuredDirectives: { promptKind: 'storyboard_grid', planningOnly: true, defaultVideoReference: true },
    priority: 70,
    tokenBudget: 240,
    version: '1.1.0',
    tags: ['storyboard', 'grid', 'image_prompt', 'planning_only'],
  },
  {
    key: 'cinematic_beat_sheet_planning',
    name: 'Cinematic Beat Sheet Planning',
    description: 'Creates timed beat-sheet images for cinematic take planning and QA.',
    category: 'cinematic',
    modality: 'image',
    appliesToNodeTypes: ['utility_transform', 'image_generation'],
    appliesToPurposes: ['cinematic_beat_sheet_prompt', 'cinematic_beat_sheet', 'cinematic_v2_storyboard_prompt', 'cinematic_v2_storyboard_sheet', 'cinematic_v3_storyboard_prompt', 'cinematic_v3_storyboard_sheet'],
    guidance: [
      'Create a clean black-canvas beat sheet with timed cinematic panels and short caption bands for planning and default Seedance continuity reference.',
      'Use 12 beats for a 15-second take when appropriate; use fewer panels for shorter takes while preserving exact timing.',
      'Caption what the viewer sees in short plain-English lines; do not include camera notes, SFX columns, director notes, title banners, footer lines, or UI tables.',
      'Preserve world/entity visual identity, individual reference-sheet assets, palette, wardrobe, environment logic, and lighting continuity across every panel.',
    ],
    avoid: [
      'Avoid long text columns, speech bubbles, ornate borders, empty placeholder panels, or anything that would encourage Seedance to reproduce UI/grid artifacts.',
    ],
    structuredDirectives: { promptKind: 'cinematic_beat_sheet', planningOnly: true, usedAsVideoReferenceByDefault: true, captionBands: true },
    priority: 99,
    tokenBudget: 320,
    version: '1.0.0',
    tags: ['cinematic', 'beat_sheet', 'storyboard', 'planning_only'],
  },
  {
    key: 'cinematic_direction_sheet_planning',
    name: 'Cinematic Direction Sheet Planning',
    description: 'Creates director/DP shot reference sheets for cinematic take planning and Seedance visual continuity.',
    category: 'cinematic',
    modality: 'image',
    appliesToNodeTypes: ['utility_transform', 'image_generation'],
    appliesToPurposes: ['cinematic_beat_sheet_prompt', 'cinematic_beat_sheet', 'cinematic_v2_storyboard_prompt', 'cinematic_v2_storyboard_sheet'],
    guidance: [
      'For shot_reference_sheet mode, build one production-board image per compiled take with a hero frame, timed shot strip, top-down floor map, camera layout, lighting/mood/style notes, and continuity anchors.',
      'Keep the sheet visual-first and sparse: show subject blocking, movement arrows, camera cones, practical light sources, palette, atmosphere, and key environment geometry.',
      'Use appearance-only entity anchors from visual descriptions, visual traits, and reference-sheet images; do not include backstory summaries or spoken dialogue.',
    ],
    avoid: [
      'Avoid dense paragraphs, screenplay columns, audio notes, provider wording, UI clutter, decorative posters, or labels that should appear in the final video.',
    ],
    structuredDirectives: { promptKind: 'cinematic_direction_sheet', planningOnly: true, usedAsVideoReferenceByDefault: true },
    priority: 100,
    tokenBudget: 340,
    version: '1.0.0',
    tags: ['cinematic', 'direction_sheet', 'shot_reference_sheet', 'floor_map', 'camera_layout', 'planning_only'],
  },
  {
    key: 'cinematic_keyframe_reference_repair',
    name: 'Cinematic Keyframe Reference Repair',
    description: 'Repairs rough storyboard panels into final keyframes using shot-scoped entity references as the identity truth.',
    category: 'cinematic',
    modality: 'image',
    appliesToNodeTypes: ['utility_transform', 'image_generation'],
    appliesToPurposes: ['cinematic_v2_keyframe_prompt', 'cinematic_v2_shot_keyframe'],
    guidance: [
      'Treat the cropped storyboard panel as blocking/composition only; entity reference sheets and visual descriptions are the source of truth for identity.',
      'Correct malformed logos, badges, wardrobe details, faces, silhouettes, props, and environmental features from the shot asset pack.',
      'Remove storyboard artifacts and prevent duplicate characters, background lookalikes, swapped identities, and extra unlisted subjects.',
    ],
    avoid: [
      'Avoid copying panel borders, captions, reference-sheet layout, generic background people that resemble principal cast, or inaccurate signature details.',
    ],
    structuredDirectives: { referenceTruth: 'shot_asset_pack', panelRole: 'composition_only', identityRepair: true },
    priority: 100,
    tokenBudget: 320,
    version: '1.0.0',
    tags: ['cinematic_v2', 'keyframe', 'reference_repair', 'identity_lock'],
  },
  {
    key: 'cinematic_keyframe_prompting',
    name: 'Cinematic Keyframe Prompting',
    description: 'Derives clean opening, midpoint, and ending GPT Image 2 keyframes from a compiled take.',
    category: 'cinematic',
    modality: 'image',
    appliesToNodeTypes: ['utility_transform', 'image_generation'],
    appliesToPurposes: ['cinematic_keyframe_prompt_pack', 'cinematic_keyframe', 'cinematic_v2_keyframe_prompt', 'cinematic_v2_shot_keyframe'],
    guidance: [
      'Produce three standalone cinematic still prompts: @Image1 opening look, @Image2 midpoint composition, and @Image3 ending composition.',
      'Each keyframe must include the same identity, wardrobe/object, world/environment lock, framing/lens language, lighting, palette, mood, and clean background logic.',
      'Keyframes must be clean still images only: no panels, no collage, no caption bands, no UI, no watermark, and no visible text unless requested as scene content.',
    ],
    avoid: [
      'Avoid motion instructions that cannot be seen in a still image, dense storyboard tables, or prompts that ask GPT Image 2 to render long paragraphs.',
    ],
    structuredDirectives: { promptKind: 'cinematic_keyframes', count: 3, visualOnly: true },
    priority: 99,
    tokenBudget: 320,
    version: '1.0.0',
    tags: ['cinematic', 'keyframe', 'image_prompt', 'seedance_reference'],
  },
  {
    key: 'seedance_truth_source_modes',
    name: 'Seedance Truth Source Modes',
    description: 'Locks each clip to one reality mode before the timestamped timeline is written.',
    category: 'provider',
    modality: 'video',
    appliesToNodeTypes: ['utility_transform', 'video_generation'],
    appliesToPurposes: ['cinematic_video_prompt', 'cinematic_block_video', 'cinematic_script_authoring', 'cinematic_v2_video_prompt', 'cinematic_v2_shot_video', 'cinematic_v3_storyboard_group_video_prompt', 'cinematic_v3_storyboard_group_video'],
    guidance: [
      'Pick one truth source per clip: cinematic, broadcast, UGC/phone, or animation. Use it as the law for camera behavior, texture, color, and audio.',
      'Do not average modes unless the user explicitly asks for a hybrid; broadcast should feel like broadcast, phone footage should feel like phone footage, and cinematic should feel like staged film.',
    ],
    avoid: [
      'Avoid vague "make it cinematic" instructions without lens, camera behavior, lighting, resolution, and audio discipline.',
    ],
    structuredDirectives: { promptBlock: 'truth_source', modeDiscipline: true },
    priority: 98,
    tokenBudget: 220,
    version: '1.0.0',
    tags: ['seedance', 'truth_source', 'camera_mode'],
  },
  {
    key: 'seedance_reference_legend_contract',
    name: 'Seedance Reference Legend Contract',
    description: 'Defines ordered reference duties and continuity locks for Seedance 2.',
    category: 'provider',
    modality: 'video',
    appliesToNodeTypes: ['utility_transform', 'video_generation'],
    appliesToPurposes: ['cinematic_video_prompt', 'cinematic_block_video', 'cinematic_v2_video_prompt', 'cinematic_v2_shot_video', 'cinematic_v3_storyboard_group_video_prompt', 'cinematic_v3_storyboard_group_video'],
    guidance: [
      'Write the reference legend from the actual submitted provider reference order. Only name @ImageN, @VideoN, or @AudioN references that are attached in that order.',
      'Give each reference one job: storyboard keyframes, shot keyframe, character/variant identity, shot-location environment, prop continuity, motion reference, or audio reference.',
      'Do not claim @Image1 is a storyboard unless the first submitted image is actually the storyboard sheet.',
      'Do not re-describe faces or designs against the reference; state what each reference locks and what must not drift.',
    ],
    avoid: [
      'Avoid stale @ImageN numbering, contradictory reference duties, excessive visual bloat, or asking Seedance to reproduce caption bands, borders, gutters, UI, or grid layout as on-screen content.',
    ],
    structuredDirectives: { promptBlock: 'reference_legend', exactProviderOrder: true },
    priority: 98,
    tokenBudget: 220,
    version: '1.0.0',
    tags: ['seedance', 'reference_legend', 'continuity_lock'],
  },
  {
    key: 'seedance_timeline_call_sheet',
    name: 'Seedance Timeline Call Sheet',
    description: 'Writes timestamped Seedance timelines with camera, action, physics, and audio on the same clock.',
    category: 'provider',
    modality: 'video',
    appliesToNodeTypes: ['utility_transform', 'video_generation'],
    appliesToPurposes: ['cinematic_video_prompt', 'cinematic_block_video', 'cinematic_v2_video_prompt', 'cinematic_v2_shot_video', 'cinematic_v3_storyboard_group_video_prompt', 'cinematic_v3_storyboard_group_video'],
    guidance: [
      'Use a compact call sheet: intent line, exact reference legend, storyboard/keyframe instruction when relevant, timestamped shot ranges, identity/speaker guide, and positive constraints.',
      'Each timeline cell should carry one shot range, camera/framing, visible action, physics/material behavior, transition note when useful, and audio cue when audio is enabled.',
      'State continuous-take versus cut-forward mode clearly when it matters.',
    ],
    avoid: [
      'Avoid long prose summaries, contradictory camera moves, unscheduled punchlines, and more actions than the clip can follow.',
    ],
    structuredDirectives: { promptBlock: 'timeline_second_by_second', timestamped: true },
    priority: 98,
    tokenBudget: 260,
    version: '1.0.0',
    tags: ['seedance', 'timeline', 'call_sheet'],
  },
  {
    key: 'seedance_reference_video_prompting',
    name: 'Seedance Reference Video Prompting',
    description: 'Prepares reference-to-video prompts for Seedance 2 with ordered @Image references.',
    category: 'provider',
    modality: 'video',
    appliesToNodeTypes: ['utility_transform', 'video_generation'],
    appliesToPurposes: ['cinematic_video_prompt', 'cinematic_block_video', 'cinematic_v2_video_prompt', 'cinematic_v2_shot_video', 'cinematic_v3_storyboard_group_video_prompt', 'cinematic_v3_storyboard_group_video'],
    guidance: [
      'For V3 storyboard-block videos, prefer the storyboard sheet first, then selected character/location/prop variant references, then optional video/audio references.',
      'For V2 keyframe videos, preserve the shot keyframe as @Image1 and put supporting entity/location/prop references after it.',
      'Keep the clip prompt focused on the attached storyboard/keyframe progression, timestamped shot call sheet, block duration, aspect ratio, and continuity constraints.',
      'Use reference images as anchors rather than asking the model to redesign characters, locations, products, or brand surfaces.',
      'Use Laban movement language only for high-physicality action such as fights, martial arts, chase, parkour, staff/sword work, impacts, and aerial motion.',
    ],
    avoid: [
      'Avoid stale @Image references after fallback, long scene summaries, repeated artifact bans, multiple camera styles in one clip, or prompts that exceed the provider reference limits.',
    ],
    structuredDirectives: { provider: 'fal', modelFamily: 'seedance_2_reference_to_video', maxImages: 9, maxVideos: 3, maxAudio: 3, maxFiles: 12 },
    priority: 98,
    tokenBudget: 240,
    version: '1.0.0',
    tags: ['seedance', 'reference_to_video', 'video_prompt', 'provider_hygiene'],
  },
  {
    key: 'shortform_hook_retention',
    name: 'Shortform Hook Retention',
    description: 'Shapes short videos around a fast visual hook and rhythmic payoff.',
    category: 'ugc',
    modality: 'text',
    appliesToNodeTypes: ['text_llm', 'video_generation'],
    appliesToPurposes: ['cinematic_script_authoring', 'cinematic_sequence_plan', 'cinematic_block_script', 'cinematic_video_prompt', 'cinematic_block_video', 'ugc_script'],
    guidance: [
      'Make the first 1.5-2 seconds visually specific, legible without context, and tied to the promised payoff.',
      'Use quick escalation, proof, reveal, or contrast rather than generic hype.',
      'End each block with a clean visual handoff, payoff beat, or reason to continue.',
    ],
    avoid: [
      'Avoid slow setup, vague mystery, empty intensity, engagement-bait wording, or hooks that do not match the final payoff.',
    ],
    structuredDirectives: { hookWindowSeconds: 2, retentionShape: ['hook', 'proof_or_escalation', 'payoff_or_handoff'] },
    priority: 94,
    tokenBudget: 220,
    version: '1.0.0',
    tags: ['ugc', 'shortform', 'hook', 'retention'],
  },
  {
    key: 'brand_ugc_proof_structure',
    name: 'Brand UGC Proof Structure',
    description: 'Structures brand and UGC videos around problem, proof, payoff, and CTA.',
    category: 'ugc',
    modality: 'text',
    appliesToNodeTypes: ['text_llm', 'video_generation'],
    appliesToPurposes: ['cinematic_script_authoring', 'cinematic_sequence_plan', 'cinematic_block_script', 'cinematic_video_prompt', 'cinematic_block_video', 'ugc_script'],
    guidance: [
      'When the prompt is brand, product, app, or ad-oriented, make the proof surface visible: screen, product, result, before/after, testimonial, or demonstration.',
      'Organize the sequence around problem, proof, payoff, and a restrained CTA only when a CTA is requested or clearly implied.',
      'Keep creator-style delivery concrete and believable instead of polished brand manifesto copy.',
    ],
    avoid: [
      'Avoid unsupported claims, invisible benefits, overproduced ad language, fake metrics, and CTAs that overpower the visual proof.',
    ],
    structuredDirectives: { brandStructure: ['problem', 'proof', 'payoff', 'cta'], claimsPolicy: 'supported_or_omit' },
    priority: 91,
    tokenBudget: 220,
    version: '1.0.0',
    tags: ['ugc', 'brand', 'proof', 'cta'],
  },
  {
    key: 'comic_scene_dramatization',
    name: 'Comic Scene Dramatization',
    description: 'Adapts sequence canon into a dramatic, visual comic scene treatment.',
    category: 'comic',
    modality: 'text',
    appliesToNodeTypes: ['text_llm'],
    appliesToPurposes: ['comic_scene_script', 'comic_page_plan', 'comic_script'],
    guidance: [
      'Build the adaptation around a concrete objective, obstacle, reversal, consequence, and final change in the situation.',
      'Make pressure visible through behavior, blocking, interruption, reveals, and choices rather than summary.',
      'Give each major character a readable want, tactic, and reaction inside the scene.',
    ],
    avoid: [
      'Avoid outline placeholders, repeated beats, generic danger, and scene summaries that do not create playable comic moments.',
    ],
    structuredDirectives: { adaptationStage: 'dramatic_scene', beatShape: ['objective', 'conflict', 'reversal', 'consequence'] },
    priority: 96,
    tokenBudget: 320,
    version: '1.0.0',
    tags: ['comic', 'adaptation', 'scene_script'],
  },
  {
    key: 'comic_page_pacing',
    name: 'Comic Page Pacing',
    description: 'Shapes scene material into page turns, escalation, and issue rhythm.',
    category: 'comic',
    modality: 'text',
    appliesToNodeTypes: ['text_llm'],
    appliesToPurposes: ['comic_page_plan', 'comic_script'],
    guidance: [
      'Treat each page as a distinct story movement with a clear function and a final image, reveal, question, or turn.',
      'Escalate pressure across the page sequence instead of restating the same beat with different staging.',
      'Use compression deliberately: merge or omit secondary material when it does not serve the page count.',
    ],
    avoid: [
      'Avoid spending multiple pages on the same setup, flattening the final page, or preserving every prose beat at the cost of comic rhythm.',
    ],
    structuredDirectives: { pacing: 'page_turns', compression: true },
    priority: 95,
    tokenBudget: 280,
    version: '1.0.0',
    tags: ['comic', 'page_plan', 'pacing'],
  },
  {
    key: 'comic_panel_storytelling',
    name: 'Comic Panel Storytelling',
    description: 'Guides readable panel actions, staging, and panel-to-panel continuity.',
    category: 'comic',
    modality: 'text',
    appliesToNodeTypes: ['text_llm'],
    appliesToPurposes: ['comic_page_plan', 'comic_script', 'comic_page_prompt'],
    guidance: [
      'Make every panel one readable moment with subject, action, setting, expression, and story change.',
      'Vary panel scale and rhythm across each page: establish, focus, reaction, action, reveal, or aftermath as needed.',
      'Keep panel-to-panel continuity clear for position, eyelines, props, injuries, wardrobe, and emotional state.',
    ],
    avoid: [
      'Avoid multi-moment panel descriptions, invisible motivation as action, and panels that only restate the page premise.',
    ],
    structuredDirectives: { panelMoment: 'single_readable_beat', continuity: true },
    priority: 94,
    tokenBudget: 280,
    version: '1.0.0',
    tags: ['comic', 'panel', 'storytelling'],
  },
  {
    key: 'comic_dialogue_lettering',
    name: 'Comic Dialogue and Lettering',
    description: 'Keeps comic dialogue, captions, and lettering short and useful.',
    category: 'comic',
    modality: 'text',
    appliesToNodeTypes: ['text_llm'],
    appliesToPurposes: ['comic_scene_script', 'comic_page_plan', 'comic_script'],
    guidance: [
      'Write dialogue as brief, character-specific pressure speech with subtext, interruption, or decision.',
      'Use captions only when they add time, viewpoint, contrast, or compression that the art cannot carry alone.',
      'Keep balloon text short enough to fit inside panels without overwhelming the image.',
    ],
    avoid: [
      'Avoid speechifying, exposition dumps, repeated captions, and dialogue that explains what the panel already shows.',
    ],
    structuredDirectives: { lettering: 'short_balloon_text', captions: 'purposeful' },
    priority: 92,
    tokenBudget: 240,
    version: '1.0.0',
    tags: ['comic', 'dialogue', 'lettering'],
  },
  {
    key: 'comic_adaptation_compression',
    name: 'Comic Adaptation Compression',
    description: 'Preserves the core sequence while fitting the requested comic page budget.',
    category: 'comic',
    modality: 'text',
    appliesToNodeTypes: ['text_llm'],
    appliesToPurposes: ['comic_scene_script', 'comic_page_plan', 'comic_script'],
    guidance: [
      'Preserve the selected sequence unit outcome, dramatic question, core conflict, and required entity continuity.',
      'Choose what to omit, merge, or imply so the comic reads cleanly at the requested page count.',
      'Keep the emotional logic of the sequence even when compressing events.',
    ],
    avoid: [
      'Avoid introducing new canon to patch pacing, skipping the sequence outcome, or cramming too many beats into one page.',
    ],
    structuredDirectives: { compression: 'preserve_core_omit_secondary', canonOutcome: true },
    priority: 93,
    tokenBudget: 260,
    version: '1.0.0',
    tags: ['comic', 'adaptation', 'compression'],
  },
  {
    key: 'storyboard_panel_prompting',
    name: 'Storyboard Panel Prompting',
    description: 'Builds clear panel-level image prompts from scripts.',
    category: 'cinematic',
    modality: 'image',
    appliesToNodeTypes: ['text_llm', 'image_generation'],
    appliesToPurposes: ['storyboard_prompt', 'panel_prompt', 'comic_page_plan', 'comic_script', 'comic_page_prompt', 'comic_page'],
    guidance: [
      'Describe one readable moment per panel with subject, action, environment, composition, lens feel, and lighting.',
      'Keep prompts visual-only and tied to the preceding script beat.',
      'Use reference images for identity and continuity rather than restating internal lore.',
    ],
    avoid: [
      'Avoid schema terms, hidden motivations, camera impossibilities, and multi-moment prompts inside one panel.',
    ],
    structuredDirectives: { promptKind: 'storyboard_panel', visualOnly: true },
    priority: 88,
    tokenBudget: 240,
    version: '1.0.0',
    tags: ['cinematic_storyboard', 'image_prompt', 'visual_only'],
  },
  {
    key: 'entity_reference_sheet_layout',
    name: 'Entity Reference Sheet Layout',
    description: 'Creates clean production-board reference sheets for entity continuity.',
    category: 'visual',
    modality: 'image',
    appliesToNodeTypes: ['image_generation', 'text_llm'],
    appliesToPurposes: ['entity_reference_sheet', 'character_sheet', 'concept_art_image'],
    guidance: [
      'Use a clean technical production-board layout with readable English labels and sparse captions.',
      'Apply project art style to subject visuals only; keep board typography, spacing, and background neutral.',
      'Include a cinematic close-up/profile panel as a reusable identity anchor.',
    ],
    avoid: [
      'Avoid poster layouts, dense text blocks, tiny labels, UI clutter, watermarks, and replacing neutral identity with temporary action states.',
    ],
    structuredDirectives: { boardStyle: 'technical_reference_sheet', closeupRequired: true },
    priority: 94,
    tokenBudget: 220,
    version: '1.0.0',
    tags: ['reference_sheet', 'entity_continuity', 'image_prompt'],
  },
  {
    key: 'character_master_reference_sheet',
    name: 'Character Master Reference Sheet',
    description: 'Character model-sheet guidance for identity, expressions, posture, and detail continuity.',
    category: 'visual',
    modality: 'image',
    appliesToNodeTypes: ['image_generation', 'text_llm'],
    appliesToPurposes: ['entity_reference_sheet', 'character_sheet'],
    guidance: [
      'Dominant main section shows front, 3/4, side, and back full-body views with stable proportions.',
      'Include expression progression, head closeups, posture variations, wardrobe/accessory callouts, optional prop, hand gestures, palette, and cinematic close-up.',
    ],
    avoid: [
      'Avoid T-pose-only sheets, action poses, injury states, outfit drift, facial drift, and loose mood-board interpretation.',
    ],
    structuredDirectives: { sheetKind: 'character', views: ['front', '3/4', 'side', 'back'] },
    priority: 94,
    tokenBudget: 260,
    version: '1.0.0',
    tags: ['reference_sheet', 'character', 'continuity'],
  },
  {
    key: 'location_environment_sheet',
    name: 'Location Environment Sheet',
    description: 'Location visual-bible guidance for views, maps, landmarks, materials, and lighting.',
    category: 'visual',
    modality: 'image',
    appliesToNodeTypes: ['image_generation', 'text_llm'],
    appliesToPurposes: ['entity_reference_sheet'],
    guidance: [
      'Show establishing view, threshold view, key zones, material/lighting callouts, landmark closeups, scale cues, palette, and cinematic hero profile.',
      'Use top-down or isometric map views for spatial locations; use visual-zone diagrams for abstract places.',
    ],
    avoid: [
      'Avoid tourism posters, random collage, impossible floorplans, dense lore text, and inconsistent architecture.',
    ],
    structuredDirectives: { sheetKind: 'location', mapWhenSpatial: true },
    priority: 92,
    tokenBudget: 240,
    version: '1.0.0',
    tags: ['reference_sheet', 'environment', 'location'],
  },
  {
    key: 'group_faction_design_sheet',
    name: 'Group Faction Design Sheet',
    description: 'Group identity-system guidance for factions, organizations, and social groups.',
    category: 'visual',
    modality: 'image',
    appliesToNodeTypes: ['image_generation', 'text_llm'],
    appliesToPurposes: ['entity_reference_sheet'],
    guidance: [
      'Focus on emblem, dress code, representative silhouettes, role archetypes, territory/base cue, key banner/object/vehicle, palette, materials, and a cinematic symbol/member close-up.',
      'Represent the group as a reusable visual system rather than a roster of every member.',
    ],
    avoid: [
      'Avoid crowded group shots, unreadable rank charts, random faces, and symbols that do not match the established world style.',
    ],
    structuredDirectives: { sheetKind: 'group', identitySystem: true },
    priority: 90,
    tokenBudget: 220,
    version: '1.0.0',
    tags: ['reference_sheet', 'group', 'faction'],
  },
  {
    key: 'item_prop_design_sheet',
    name: 'Item Prop Design Sheet',
    description: 'Prop and object design-sheet guidance for construction, scale, use, and material continuity.',
    category: 'visual',
    modality: 'image',
    appliesToNodeTypes: ['image_generation', 'text_llm'],
    appliesToPurposes: ['entity_reference_sheet'],
    guidance: [
      'Show hero render, rotation views, scale reference, silhouette, material/function callouts, optional stable effect states, in-use view, palette, and cinematic close-up.',
      'Keep proportions, markings, material logic, and construction identical across all views.',
    ],
    avoid: [
      'Avoid inventory-card UI, ad layouts, random extra props, temporary action effects, and contradictory object mechanics.',
    ],
    structuredDirectives: { sheetKind: 'item', rotationViews: true },
    priority: 90,
    tokenBudget: 220,
    version: '1.0.0',
    tags: ['reference_sheet', 'item', 'prop'],
  },
  {
    key: 'character_reference_continuity',
    name: 'Character Reference Continuity',
    description: 'Keeps character identity stable across generated visuals.',
    category: 'visual',
    modality: 'image',
    appliesToNodeTypes: ['image_generation', 'video_generation', 'text_llm'],
    appliesToPurposes: ['image_prompt', 'video_prompt', 'storyboard_prompt', 'comic_entity_selector', 'comic_atlas_prompt', 'comic_style_atlas', 'comic_page_prompt', 'comic_page', 'cinematic_entity_selector', 'cinematic_atlas_prompt', 'cinematic_reference_atlas', 'cinematic_storyboard', 'cinematic_beat_sheet', 'cinematic_keyframe', 'cinematic_block_video', 'cinematic_v2_storyboard_sheet', 'cinematic_v2_shot_keyframe', 'cinematic_v2_keyframe_qa', 'cinematic_v2_shot_video', 'cinematic_v3_storyboard_sheet', 'cinematic_v3_storyboard_group_video'],
    guidance: [
      'Treat character reference images and entity visual descriptions as identity constraints.',
      'Preserve face, silhouette, wardrobe anchors, color cues, and role-specific props unless the node explicitly changes them.',
    ],
    avoid: [
      'Avoid changing age, facial structure, signature costume elements, or culturally specific identity details without explicit instruction.',
    ],
    structuredDirectives: { referenceFidelity: 'identity_locked' },
    priority: 92,
    tokenBudget: 220,
    version: '1.0.0',
    tags: ['reference_continuity', 'character', 'image'],
  },
  {
    key: 'image_prompt_visual_only',
    name: 'Visual-Only Image Prompt',
    description: 'Keeps image prompts free of internal or non-visual wording.',
    category: 'visual',
    modality: 'image',
    appliesToNodeTypes: ['image_generation', 'text_llm'],
    appliesToPurposes: ['image_prompt', 'concept_art_prompt', 'concept_art_image', 'poster_prompt', 'poster_image', 'ebook_cover_prompt', 'ebook_cover_image', 'storyboard_prompt', 'panel_prompt', 'comic_atlas_prompt', 'comic_style_atlas', 'comic_page_prompt', 'comic_page', 'cinematic_atlas_prompt', 'cinematic_reference_atlas', 'cinematic_storyboard', 'cinematic_beat_sheet', 'cinematic_keyframe', 'cinematic_v2_storyboard_sheet', 'cinematic_v2_shot_keyframe', 'cinematic_v2_keyframe_qa', 'cinematic_v3_storyboard_sheet'],
    guidance: [
      'Write prompts as visible subject, action, environment, composition, lighting, material, and camera qualities.',
      'Convert lore and abstract themes into visible production design choices.',
    ],
    avoid: [
      'Avoid GraphCore wording, schema labels, node IDs, unseen backstory, and instructions about what the image should symbolize.',
    ],
    structuredDirectives: { visualOnly: true },
    priority: 96,
    tokenBudget: 200,
    version: '1.0.0',
    tags: ['visual_only', 'image_prompt', 'provider_hygiene'],
  },
  {
    key: 'ugc_scroll_hook',
    name: 'UGC Scroll Hook',
    description: 'Social-first opening beat guidance for UGC videos.',
    category: 'ugc',
    modality: 'text',
    appliesToNodeTypes: ['text_llm'],
    appliesToPurposes: ['ugc_script', 'cinematic_script'],
    guidance: [
      'Start with a concrete tension, behavior, confession, mistake, or visual interruption within the first beat.',
      'Make the viewer understand why this matters before explaining the product or mechanism.',
    ],
    avoid: [
      'Avoid generic openers, brand-first intros, and slow context setup before the hook lands.',
    ],
    structuredDirectives: { hookDeadlineSeconds: 2 },
    priority: 94,
    tokenBudget: 220,
    version: '1.0.0',
    tags: ['ugc_hook', 'ugc', 'shortform'],
  },
  {
    key: 'ugc_problem_proof_payoff',
    name: 'UGC Problem Proof Payoff',
    description: 'Structures UGC around problem, proof, and emotional payoff.',
    category: 'ugc',
    modality: 'text',
    appliesToNodeTypes: ['text_llm'],
    appliesToPurposes: ['ugc_script', 'cinematic_script'],
    guidance: [
      'Move from problem recognition to visible proof, then to a payoff the viewer can feel or verify.',
      'Use proof as behavior, demonstration, contrast, or social evidence rather than claims alone.',
    ],
    avoid: [
      'Avoid unsupported superlatives, vague transformation claims, and proof that appears after the CTA.',
    ],
    structuredDirectives: { beatOrder: ['problem', 'proof', 'payoff'] },
    priority: 90,
    tokenBudget: 230,
    version: '1.0.0',
    tags: ['ugc', 'proof', 'payoff'],
  },
  {
    key: 'ugc_direct_response_cta',
    name: 'UGC Direct Response CTA',
    description: 'CTA guidance for conversion-oriented UGC.',
    category: 'ugc',
    modality: 'text',
    appliesToNodeTypes: ['text_llm'],
    appliesToPurposes: ['ugc_script', 'cinematic_script'],
    guidance: [
      'Make the CTA a natural next action from the proof, not a separate sales slogan.',
      'Tie the action to the viewer problem, desired outcome, and format-specific platform behavior.',
    ],
    avoid: [
      'Avoid desperate urgency, fake scarcity, and CTAs that require too much explanation.',
    ],
    structuredDirectives: { ctaStyle: 'proof_led' },
    priority: 84,
    tokenBudget: 180,
    version: '1.0.0',
    tags: ['ugc', 'direct_response', 'cta'],
  },
  {
    key: 'ugc_faceless_demo_structure',
    name: 'UGC Faceless Demo Structure',
    description: 'Guides faceless demos, overlays, and product-forward shortform.',
    category: 'ugc',
    modality: 'video',
    appliesToNodeTypes: ['text_llm', 'video_generation'],
    appliesToPurposes: ['ugc_script', 'video_prompt'],
    guidance: [
      'Use hands, screen recordings, product surfaces, overlays, and before/after contrast as the primary performers.',
      'Keep narration or captions synchronized to what is visible on screen.',
    ],
    avoid: [
      'Avoid relying on talking-head charisma, invisible claims, or shots that do not show the mechanism.',
    ],
    structuredDirectives: { faceless: true, proofSurface: true },
    priority: 86,
    tokenBudget: 220,
    version: '1.0.0',
    tags: ['ugc', 'faceless', 'demo'],
  },
  {
    key: 'entity_reference_fidelity',
    name: 'Entity Reference Fidelity',
    description: 'Uses world-entity visual references as durable output constraints.',
    category: 'visual',
    modality: 'image',
    appliesToNodeTypes: ['text_llm', 'image_generation', 'video_generation'],
    appliesToPurposes: ['image_prompt', 'image_reference_selector', 'concept_art_prompt', 'concept_art_image', 'poster_prompt', 'poster_image', 'ebook_cover_image', 'video_prompt', 'composite_reference', 'comic_entity_selector', 'comic_atlas_prompt', 'comic_style_atlas', 'comic_page', 'cinematic_entity_selector', 'cinematic_atlas_prompt', 'cinematic_reference_atlas', 'cinematic_storyboard', 'cinematic_beat_sheet', 'cinematic_keyframe', 'cinematic_block_video', 'cinematic_v2_reference_select', 'cinematic_v2_screenplay_author', 'cinematic_v2_storyboard_sheet', 'cinematic_v2_shot_keyframe', 'cinematic_v2_keyframe_qa', 'cinematic_v2_video_prompt', 'cinematic_v2_shot_video', 'cinematic_v3_reference_select', 'cinematic_v3_screenplay_author', 'cinematic_v3_storyboard_sheet', 'cinematic_v3_storyboard_group_video_prompt', 'cinematic_v3_storyboard_group_video'],
    guidance: [
      'Preserve entity identity, material, silhouette, and visible role cues from source references.',
      'Use source entity keys and visual descriptions as provenance anchors for generated assets.',
    ],
    avoid: [
      'Avoid replacing distinctive entity traits with generic genre defaults.',
    ],
    structuredDirectives: { entityFidelity: true },
    priority: 92,
    tokenBudget: 200,
    version: '1.0.0',
    tags: ['entity_reference', 'image', 'video'],
  },
  {
    key: 'environment_staging',
    name: 'Environment Staging',
    description: 'Places characters and objects into coherent environments.',
    category: 'visual',
    modality: 'image',
    appliesToNodeTypes: ['text_llm', 'image_generation', 'video_generation'],
    appliesToPurposes: ['image_prompt', 'concept_art_prompt', 'concept_art_image', 'poster_prompt', 'poster_image', 'ebook_cover_image', 'video_prompt', 'composite_reference', 'comic_atlas_prompt', 'comic_style_atlas', 'comic_page', 'cinematic_atlas_prompt', 'cinematic_reference_atlas', 'cinematic_storyboard', 'cinematic_block_video', 'cinematic_v2_storyboard_sheet', 'cinematic_v2_shot_keyframe', 'cinematic_v2_keyframe_qa', 'cinematic_v2_shot_video', 'cinematic_v3_storyboard_sheet', 'cinematic_v3_storyboard_group_video'],
    guidance: [
      'Stage subject scale, light direction, surface contact, and spatial depth so references feel physically present in the same place.',
      'Use environment references for architecture, palette, weather, and atmosphere.',
    ],
    avoid: [
      'Avoid pasted-on subjects, inconsistent shadows, and environment descriptions that conflict with supplied references.',
    ],
    structuredDirectives: { staging: 'environment_integrated' },
    priority: 84,
    tokenBudget: 220,
    version: '1.0.0',
    tags: ['environment', 'staging', 'composite'],
  },
  {
    key: 'wardrobe_item_composite',
    name: 'Wardrobe / Item Composite',
    description: 'Combines character, wardrobe, and item references cleanly.',
    category: 'visual',
    modality: 'image',
    appliesToNodeTypes: ['image_generation'],
    appliesToPurposes: ['composite_reference', 'image_prompt'],
    guidance: [
      'When equipping wardrobe or items, preserve the character identity while adapting fit, scale, hand contact, and material behavior.',
      'Treat wardrobe and props as worn or held, not floating separate reference objects.',
    ],
    avoid: [
      'Avoid changing the character to match the item reference model or losing the item silhouette.',
    ],
    structuredDirectives: { compositeMode: 'equip_or_wear' },
    priority: 88,
    tokenBudget: 220,
    version: '1.0.0',
    tags: ['composite', 'wardrobe', 'item'],
  },
  {
    key: 'provider_prompt_hygiene',
    name: 'Provider Prompt Hygiene',
    description: 'Keeps prompts compact, provider-safe, and artifact-focused.',
    category: 'quality',
    modality: 'workflow',
    appliesToNodeTypes: ['text_llm', 'image_generation', 'video_generation'],
    appliesToPurposes: ['outline', 'chapter_plan', 'chapter_section_plan', 'chapter_prose', 'chapter_section_prose', 'editor_pass', 'front_back_matter', 'bible_section_plan', 'bible_section', 'bible_assembly', 'story_bible_document_render', 'image_prompt', 'image_reference_selector', 'concept_art_prompt', 'concept_art_image', 'poster_prompt', 'poster_image', 'ebook_cover_prompt', 'ebook_cover_image', 'video_prompt', 'storyboard_prompt', 'ugc_script', 'cinematic_script', 'cinematic_entity_selector', 'cinematic_script_authoring', 'cinematic_sequence_compile', 'cinematic_dynamic_take_fanout', 'cinematic_sequence_plan', 'cinematic_block_script', 'cinematic_atlas_prompt', 'cinematic_reference_atlas', 'cinematic_storyboard_prompt', 'cinematic_storyboard', 'cinematic_beat_sheet_prompt', 'cinematic_beat_sheet', 'cinematic_keyframe_prompt_pack', 'cinematic_keyframe', 'cinematic_video_prompt', 'cinematic_block_video', 'cinematic_v2_reference_select', 'cinematic_v2_screenplay_author', 'cinematic_v2_script_parse', 'cinematic_v2_scene_compile', 'cinematic_v2_layout_plan', 'cinematic_v2_shot_plan', 'cinematic_v2_dynamic_shot_fanout', 'cinematic_v2_storyboard_prompt', 'cinematic_v2_storyboard_sheet', 'cinematic_v2_keyframe_prompt', 'cinematic_v2_shot_keyframe', 'cinematic_v2_keyframe_qa', 'cinematic_v2_video_prompt', 'cinematic_v2_shot_video', 'cinematic_v2_timeline_assemble', 'cinematic_v3_reference_select', 'cinematic_v3_screenplay_author', 'cinematic_v3_shot_parse', 'cinematic_v3_shot_parse_group', 'cinematic_v3_dynamic_storyboard_fanout', 'cinematic_v3_storyboard_prompt', 'cinematic_v3_storyboard_sheet', 'cinematic_v3_storyboard_group_video_prompt', 'cinematic_v3_storyboard_group_video', 'cinematic_v3_timeline_assemble', 'comic_entity_selector', 'comic_scene_script', 'comic_page_plan', 'comic_script', 'comic_atlas_prompt', 'comic_style_atlas', 'comic_page_prompt', 'comic_page'],
    guidance: [
      'Keep provider-facing prompts compact, declarative, and focused on the artifact the node must produce.',
      'Separate canon facts, style guidance, and output requirements so they do not blur together.',
    ],
    avoid: [
      'Avoid leaking internal IDs unless needed for provenance, implementation notes, or schema names into creative prompts.',
    ],
    structuredDirectives: { providerPrompt: 'compact_sections' },
    priority: 80,
    tokenBudget: 180,
    version: '1.0.0',
    tags: ['provider_hygiene', 'quality'],
  },
]

export function validateOutputSkillRegistry(skills: readonly OutputSkill[] = OUTPUT_SKILL_REGISTRY) {
  const diagnostics: string[] = []
  const seen = new Set<string>()
  for (const rawSkill of skills) {
    const parsed = outputSkillSchema.safeParse(rawSkill)
    if (!parsed.success) {
      diagnostics.push(`Invalid output skill "${String((rawSkill as { key?: unknown }).key ?? 'unknown')}": ${parsed.error.message}`)
      continue
    }
    if (seen.has(parsed.data.key)) diagnostics.push(`Duplicate output skill key "${parsed.data.key}".`)
    seen.add(parsed.data.key)
  }
  return { ok: diagnostics.length === 0, diagnostics }
}

const registryValidation = validateOutputSkillRegistry()
if (!registryValidation.ok) {
  throw new Error(registryValidation.diagnostics.join(' '))
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : []
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function mergeStructuredDirectives(skills: OutputSkill[]) {
  return skills.reduce<Record<string, unknown>>((merged, skill) => ({
    ...merged,
    [skill.key]: skill.structuredDirectives,
  }), {})
}

function skillAppliesToNode(input: {
  skill: OutputSkill
  nodeType: string
  purpose: string
}) {
  if (input.nodeType === 'skill_context_query') return true
  const appliesToNode = input.skill.appliesToNodeTypes.length === 0 || input.skill.appliesToNodeTypes.includes(input.nodeType)
  const appliesToPurpose = !input.purpose || input.skill.appliesToPurposes.length === 0 || input.skill.appliesToPurposes.includes(input.purpose)
  return appliesToNode && appliesToPurpose
}

export function resolveOutputSkillsForNode(input: {
  nodeType: string
  purpose?: string
  explicitSkillKeys?: string[]
  autoSkillTags?: string[]
  presetSkillKeys?: string[]
  worldWiki?: unknown
}) {
  const purpose = input.purpose ?? ''
  const explicitSkillKeys = input.explicitSkillKeys ?? []
  const presetSkillKeys = input.presetSkillKeys ?? []
  const autoSkillTags = new Set(input.autoSkillTags ?? [])
  const selectedKeys = new Set([...presetSkillKeys, ...explicitSkillKeys])
  const diagnostics: string[] = []
  const skillsByKey = new Map(OUTPUT_SKILL_REGISTRY.map((skill) => [skill.key, outputSkillSchema.parse(skill)]))

  for (const key of selectedKeys) {
    if (!skillsByKey.has(key)) diagnostics.push(`Unknown output skill "${key}".`)
  }

  for (const skill of skillsByKey.values()) {
    if (!skillAppliesToNode({ skill, nodeType: input.nodeType, purpose })) continue
    if (skill.tags.some((tag) => autoSkillTags.has(tag))) selectedKeys.add(skill.key)
  }

  const skills = [...selectedKeys]
    .map((key) => skillsByKey.get(key))
    .filter((skill): skill is OutputSkill => Boolean(skill))
    .filter((skill) => {
      const applies = skillAppliesToNode({ skill, nodeType: input.nodeType, purpose })
      if (!applies && (explicitSkillKeys.includes(skill.key) || presetSkillKeys.includes(skill.key))) {
        diagnostics.push(`Output skill "${skill.key}" does not apply to ${input.nodeType}${purpose ? `:${purpose}` : ''}.`)
      }
      return applies
    })
    .sort((left, right) => right.priority - left.priority || left.key.localeCompare(right.key))

  const wiki = input.worldWiki && typeof input.worldWiki === 'object' && !Array.isArray(input.worldWiki)
    ? input.worldWiki as Record<string, unknown>
    : {}
  const contextualGuidance = [
    readString(wiki.genre) ? `Genre context: ${readString(wiki.genre)}.` : '',
    readString(wiki.narrationPov) ? `Project narration POV: ${readString(wiki.narrationPov)}.` : '',
    readStringArray(wiki.toneTags).length > 0 ? `Tone tags: ${readStringArray(wiki.toneTags).join(', ')}.` : '',
    readString(wiki.artStyleDescription) ? `Visual/style context: ${readString(wiki.artStyleDescription)}.` : '',
  ].filter(Boolean)

  return { skills, diagnostics, contextualGuidance }
}

export function buildOutputGuidanceBundle(input: {
  skills: OutputSkill[]
  guidanceMode?: OutputGuidanceMode
  contextualGuidance?: string[]
  diagnostics?: string[]
}) {
  const guidanceMode = input.guidanceMode ?? 'append'
  const guidance = [
    ...(input.contextualGuidance ?? []),
    ...input.skills.flatMap((skill) => skill.guidance),
  ].slice(0, 40)
  const avoid = input.skills.flatMap((skill) => skill.avoid).slice(0, 32)
  const skills = input.skills.map((skill) => ({
    key: skill.key,
    name: skill.name,
    category: skill.category,
    modality: skill.modality,
    version: skill.version,
    tags: skill.tags,
  }))
  const bundleWithoutHash = {
    skillKeys: input.skills.map((skill) => skill.key),
    skillVersions: Object.fromEntries(input.skills.map((skill) => [skill.key, skill.version])),
    guidanceMode,
    guidance,
    avoid,
    structuredDirectives: mergeStructuredDirectives(input.skills),
    resolvedGuidancePreview: [
      ...guidance.slice(0, 5),
      ...avoid.slice(0, 3).map((entry) => `Avoid: ${entry}`),
    ].join(' '),
    skills,
    diagnostics: input.diagnostics ?? [],
  }
  return outputGuidanceBundleSchema.parse({
    ...bundleWithoutHash,
    guidanceHash: hashOutputGuidanceBundle(bundleWithoutHash),
  })
}

export function hashOutputGuidanceBundle(bundle: unknown) {
  const parsed = bundle && typeof bundle === 'object'
    ? { ...(bundle as Record<string, unknown>), guidanceHash: undefined }
    : bundle
  return stableHash(parsed)
}
