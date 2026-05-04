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
    appliesToPurposes: ['chapter_prose', 'chapter_section_plan', 'chapter_section_prose', 'editor_pass', 'front_back_matter', 'ugc_script', 'cinematic_script'],
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
    key: 'cinematic_shot_script',
    name: 'Cinematic Shot Script',
    description: 'Converts story beats into shot-readable screen action.',
    category: 'cinematic',
    modality: 'text',
    appliesToNodeTypes: ['text_llm'],
    appliesToPurposes: ['cinematic_script', 'shot_plan'],
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
    key: 'storyboard_panel_prompting',
    name: 'Storyboard Panel Prompting',
    description: 'Builds clear panel-level image prompts from scripts.',
    category: 'cinematic',
    modality: 'image',
    appliesToNodeTypes: ['text_llm', 'image_generation'],
    appliesToPurposes: ['storyboard_prompt', 'panel_prompt'],
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
    key: 'character_reference_continuity',
    name: 'Character Reference Continuity',
    description: 'Keeps character identity stable across generated visuals.',
    category: 'visual',
    modality: 'image',
    appliesToNodeTypes: ['image_generation', 'video_generation', 'text_llm'],
    appliesToPurposes: ['image_prompt', 'video_prompt', 'storyboard_prompt'],
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
    appliesToPurposes: ['image_prompt', 'storyboard_prompt', 'panel_prompt'],
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
    appliesToNodeTypes: ['image_generation', 'video_generation'],
    appliesToPurposes: ['image_prompt', 'video_prompt', 'composite_reference'],
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
    appliesToNodeTypes: ['image_generation', 'video_generation'],
    appliesToPurposes: ['image_prompt', 'video_prompt', 'composite_reference'],
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
    appliesToPurposes: ['outline', 'chapter_plan', 'chapter_section_plan', 'chapter_prose', 'chapter_section_prose', 'editor_pass', 'front_back_matter', 'image_prompt', 'video_prompt', 'storyboard_prompt', 'ugc_script', 'cinematic_script'],
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
