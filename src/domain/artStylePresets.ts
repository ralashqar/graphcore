export const ART_STYLE_PRESET_GROUPS = [
  'Premium 3D',
  'Stylized 3D',
  'Cartoon & Anime',
  'Photoreal UGC',
  'Photoreal CG',
  'Photoreal People',
  'Photoreal Product',
  'Illustration',
  'Retro & Minimal',
  'Custom',
] as const

export type ArtStylePresetGroup = (typeof ART_STYLE_PRESET_GROUPS)[number]
export type ArtStylePresetModality = 'cg' | 'photo' | 'illustration'
export type ArtStylePresetSensitivity = 'low' | 'medium' | 'high'

export type ArtStylePresetDefinition = {
  id: string
  label: string
  promptLabel: string
  group: ArtStylePresetGroup
  description: string
  modality: ArtStylePresetModality
  sensitivity: ArtStylePresetSensitivity
  bestFor: string
  captureMedium?: string
  cameraProfile?: string
  lensProfile?: string
  lightingProfile?: string
  textureProfile?: string
  colorProfile?: string
  negativeGuardrails?: readonly string[]
}

export type ArtStylePresetResolution = {
  presetId: ArtStylePresetId
  source: 'node' | 'graph' | 'inferred' | 'project' | 'recommended' | 'default'
  reason: string
  recommendedPresetId: ArtStylePresetId | null
}

export const ART_STYLE_PRESETS: readonly ArtStylePresetDefinition[] = [
  {
    id: 'premium_stylized_3d',
    label: 'Premium 3D',
    promptLabel: 'premium 3D game concept art, polished high-end CG, premium materials, production-ready lighting',
    group: 'Premium 3D',
    description: 'High-end premium CG for flagship game content, hero assets, and polished marketing-ready visuals.',
    modality: 'cg',
    sensitivity: 'low',
    bestFor: 'hero game worlds, polished premium cinematics, flagship key art',
    captureMedium: 'final-frame premium CG render',
    cameraProfile: 'clean hero-camera staging with controlled composition and production polish',
    lightingProfile: 'premium cinematic lighting with controlled separation and readable materials',
    textureProfile: 'high-end surfacing, premium materials, and intentional finish quality',
  },
  {
    id: 'stylized_hero_3d',
    label: 'Stylized Hero 3D',
    promptLabel: 'stylized 3D hero game art, bold silhouettes, clean materials, readable forms',
    group: 'Stylized 3D',
    description: 'Readable stylized game CG with bold shapes, clean surfacing, and strong gameplay clarity.',
    modality: 'cg',
    sensitivity: 'low',
    bestFor: 'stylized game characters, world-building, readable hero assets',
    captureMedium: 'stylized final-frame CG render',
    cameraProfile: 'graphic hero framing with readable silhouette and clean staging',
    lightingProfile: 'clean readable key lighting with shape-first contrast',
  },
  {
    id: 'cartoon_3d',
    label: 'Cartoon 3D',
    promptLabel: 'cartoon 3D render, playful materials, colorful lighting, simplified forms',
    group: 'Stylized 3D',
    description: 'Playful 3D cartoon look suited to family-friendly worlds, mascots, and approachable brands.',
    modality: 'cg',
    sensitivity: 'low',
    bestFor: 'mascots, playful worlds, approachable branded characters',
    captureMedium: 'cartoon 3D render',
    cameraProfile: 'simple readable framing with playful scale and clean silhouette',
    lightingProfile: 'bright appealing lighting with colorful bounce and simple material separation',
  },
  {
    id: 'anime_cg',
    label: 'Anime CG',
    promptLabel: 'anime-inspired 3D render, cel-accented shading, expressive stylized forms',
    group: 'Cartoon & Anime',
    description: 'Anime-influenced CG with graphic shading and expressive shapes for cast-driven content.',
    modality: 'cg',
    sensitivity: 'medium',
    bestFor: 'cast-driven anime-inspired scenes and stylized cinematic story beats',
    captureMedium: 'anime-inspired final-frame CG',
    cameraProfile: 'dynamic anime-like staging with readable faces and graphic composition',
    lightingProfile: 'graphic highlight control and clean silhouette separation',
  },
  {
    id: 'toon_illustration',
    label: 'Toon Illustration',
    promptLabel: 'toon-shaded illustration, clean outlines, graphic color blocking',
    group: 'Cartoon & Anime',
    description: 'Graphic toon style with strong outlines and simple bold color separation.',
    modality: 'illustration',
    sensitivity: 'low',
    bestFor: 'graphic branded storytelling, simple editorial scenes, stylized explainers',
    captureMedium: 'graphic illustration',
    cameraProfile: 'poster-clear composition with strong shape language',
    lightingProfile: 'simple graphic light and shadow blocking',
  },
  {
    id: 'photoreal_game_cg',
    label: 'Photoreal Game CG',
    promptLabel: 'photoreal game CG, realistic materials, cinematic lighting, production render',
    group: 'Photoreal CG',
    description: 'Realistic in-engine style suited to grounded characters, props, and cinematic game worlds.',
    modality: 'cg',
    sensitivity: 'medium',
    bestFor: 'grounded game cinematics, realistic characters, realistic props and environments',
    captureMedium: 'photoreal CG render',
    cameraProfile: 'cinematic game camera with realistic physical framing and controlled continuity',
    lightingProfile: 'grounded cinematic lighting with realistic bounce and material behavior',
    textureProfile: 'realistic materials and believable rendering without ad-photo gloss',
  },
  {
    id: 'ugc_lifestyle_people',
    label: 'UGC Lifestyle People',
    promptLabel: 'photoreal UGC-style people photography, natural lighting, authentic brand lifestyle framing',
    group: 'Photoreal UGC',
    description: 'Authentic social-first people imagery for lifestyle, creator, and brand storytelling.',
    modality: 'photo',
    sensitivity: 'high',
    bestFor: 'creator-native lifestyle shots, broad UGC people coverage, authentic social content',
    captureMedium: 'modern smartphone social capture',
    cameraProfile: 'native handheld or lightly stabilized creator framing with casual authenticity',
    lensProfile: 'smartphone-native perspective with believable phone-camera field of view and non-cinematic framing',
    lightingProfile: 'soft daylight or practical interior light, never luxury campaign glam',
    textureProfile: 'real skin texture, natural hair detail, believable consumer-camera sharpness',
    colorProfile: 'neutral phone-camera color with restrained contrast and realistic white balance',
    negativeGuardrails: [
      'avoid cinematic rim light',
      'avoid poreless skin or beauty-filter finish',
      'avoid impossible shallow depth of field',
      'avoid luxury campaign polish',
    ],
  },
  {
    id: 'ugc_phone_selfie_soft_daylight',
    label: 'UGC Selfie Soft Daylight',
    promptLabel: 'photoreal selfie UGC, iPhone 15 quality, soft daylight, native social framing, realistic skin texture',
    group: 'Photoreal UGC',
    description: 'Selfie-facing creator capture with soft window light and believable phone-native intimacy.',
    modality: 'photo',
    sensitivity: 'high',
    bestFor: 'creator validation, creator reframe, intimate confession, direct-to-camera advice',
    captureMedium: 'front-facing smartphone selfie capture',
    cameraProfile: 'arm-length eye-level selfie framing with slight handheld realism and native creator intimacy',
    lensProfile: 'wide smartphone selfie field of view with natural mild face distortion, vertical social framing',
    lightingProfile: 'soft window light or open shade, gentle falloff, no studio glam',
    textureProfile: 'real skin texture, flyaways, small imperfections, believable phone sharpening',
    colorProfile: 'neutral mobile HDR feel with restrained contrast and natural warmth',
    negativeGuardrails: [
      'avoid cinematic anamorphic look',
      'avoid poreless skin',
      'avoid luxury retouching',
      'avoid dramatic movie lighting',
    ],
  },
  {
    id: 'ugc_phone_rear_28_home_demo',
    label: 'UGC Rear Camera Home Demo',
    promptLabel: 'photoreal home UGC demo, iPhone 15 rear camera quality, 28mm smartphone look, soft practical daylight, authentic creator framing',
    group: 'Photoreal UGC',
    description: 'Rear-camera home demo profile for person-plus-product shots with the safest phone-native perspective.',
    modality: 'photo',
    sensitivity: 'high',
    bestFor: 'creator problem-solution, direct-response UGC ads, home demos, app and product recommendations',
    captureMedium: 'rear-camera smartphone demo capture',
    cameraProfile: 'modern smartphone rear camera, iPhone 15 or iPhone 15 Pro-like image quality, native vertical creator framing',
    lensProfile: '28mm-equivalent main-camera perspective for flattering but believable person-plus-product framing',
    lightingProfile: 'soft daylight or home practicals with natural falloff and no studio key-light look',
    textureProfile: 'real skin, consumer-camera detail, honest product texture, no CG-perfect surfaces',
    colorProfile: 'clean smartphone color science, restrained saturation, realistic indoor white balance',
    negativeGuardrails: [
      'avoid commercial studio polish',
      'avoid extreme bokeh',
      'avoid glamour beauty lighting',
      'avoid hyper-symmetric CG faces',
    ],
  },
  {
    id: 'ugc_phone_35_testimonial',
    label: 'UGC 35mm Testimonial',
    promptLabel: 'photoreal UGC testimonial, smartphone 35mm equivalent look, flattering natural perspective, soft interior light, authentic creator delivery',
    group: 'Photoreal UGC',
    description: 'More flattering phone-style testimonial framing for confessionals, founder clips, and social story ads.',
    modality: 'photo',
    sensitivity: 'high',
    bestFor: 'testimonials, confessional story ads, founder clips, beauty and wellness creator content',
    captureMedium: 'smartphone rear camera testimonial capture',
    cameraProfile: 'stable vertical talking-head framing with natural creator posture and intimate social distance',
    lensProfile: '35mm-equivalent phone main-lens crop for reduced facial distortion and stronger subject focus',
    lightingProfile: 'soft interior daylight or gentle practical fill with natural skin transitions',
    textureProfile: 'realistic skin pore detail and believable hair texture without beauty-filter softness',
    colorProfile: 'clean natural color with moderate contrast and credible consumer-camera rendering',
    negativeGuardrails: [
      'avoid filmic teal-orange grade',
      'avoid pore blur',
      'avoid fashion-editorial polish',
      'avoid impossible studio background separation',
    ],
  },
  {
    id: 'ugc_car_confessional_soft',
    label: 'UGC Car Confessional',
    promptLabel: 'photoreal car confessional UGC, smartphone quality, soft windshield daylight, intimate testimonial framing',
    group: 'Photoreal UGC',
    description: 'Car-seat confessional profile with realistic windshield light and spontaneous social-native energy.',
    modality: 'photo',
    sensitivity: 'high',
    bestFor: 'storytime confessionals, direct-response testimonials, emotionally candid creator moments',
    captureMedium: 'parked-car smartphone capture',
    cameraProfile: 'dashboard or hand-held phone angle from the front seats with believable car interior staging',
    lensProfile: 'smartphone-wide or normal phone crop with natural dashboard-distance perspective',
    lightingProfile: 'soft windshield daylight with real car-shadow falloff and no glam fill',
    textureProfile: 'real skin and car interior materials with honest consumer-camera detail',
    negativeGuardrails: [
      'avoid studio lighting inside the car',
      'avoid luxury car-commercial polish',
      'avoid over-clean glossy surfaces',
    ],
  },
  {
    id: 'ugc_bathroom_mirror_get_ready',
    label: 'UGC Bathroom Mirror',
    promptLabel: 'photoreal bathroom mirror UGC, smartphone mirror-shot feel, practical vanity light, get-ready realism',
    group: 'Photoreal UGC',
    description: 'Mirror-shot preset for beauty, skincare, hair, and get-ready social content.',
    modality: 'photo',
    sensitivity: 'high',
    bestFor: 'beauty UGC, skincare demos, hair content, morning or night routines',
    captureMedium: 'bathroom mirror smartphone capture',
    cameraProfile: 'mirror-shot vertical framing with believable hand position and casual bathroom staging',
    lensProfile: 'smartphone mirror perspective with realistic room geometry and mild wide-angle distortion',
    lightingProfile: 'practical vanity or bathroom light with soft spill and true indoor highlights',
    textureProfile: 'real skin and hair texture, real bathroom materials, non-commercial finish',
    negativeGuardrails: [
      'avoid luxury hotel-bathroom ad polish',
      'avoid impossible set-design perfection',
      'avoid heavy retouching',
    ],
  },
  {
    id: 'ugc_creator_desk_windowlight',
    label: 'UGC Desk Windowlight',
    promptLabel: 'photoreal creator desk setup, smartphone or compact camera realism, soft window light, native social workspace framing',
    group: 'Photoreal UGC',
    description: 'Soft desk-side creator setup for education, productivity, app explainers, and founder content.',
    modality: 'photo',
    sensitivity: 'high',
    bestFor: 'productivity creators, app explainers, founder advice, desk-native creator ads',
    captureMedium: 'desk-side creator capture',
    cameraProfile: 'native vertical desk framing with laptop, phone, or notebook support and credible creator posture',
    lensProfile: '28mm to 35mm-equivalent perspective for desk plus face balance',
    lightingProfile: 'soft window key with gentle room fill and realistic monitor or desk practical spill',
    textureProfile: 'real desktop materials and skin texture with non-studio realism',
    negativeGuardrails: [
      'avoid cinematic office scene lighting',
      'avoid sterile corporate stock-photo polish',
      'avoid impossible desk minimalism',
    ],
  },
  {
    id: 'ugc_tabletop_daylight_demo',
    label: 'UGC Tabletop Daylight Demo',
    promptLabel: 'photoreal tabletop UGC demo, natural daylight, smartphone realism, clean product readability',
    group: 'Photoreal UGC',
    description: 'Faceless tabletop profile for product, packaging, unboxing, and utility demonstrations.',
    modality: 'photo',
    sensitivity: 'high',
    bestFor: 'faceless demo, unboxing, product proof, packaging and utility videos',
    captureMedium: 'smartphone tabletop demo capture',
    cameraProfile: 'overhead or high three-quarter tabletop framing with native social readability',
    lensProfile: 'smartphone main-camera perspective with honest tabletop scale and object proportions',
    lightingProfile: 'soft daylight or soft practical bounce for readable labels, materials, and hands',
    textureProfile: 'real product materials, fingerprints, paper texture, and believable consumer-camera detail',
    negativeGuardrails: [
      'avoid luxury studio packshot lighting',
      'avoid floating objects',
      'avoid synthetic-perfect edges',
    ],
  },
  {
    id: 'ugc_app_demo_over_shoulder_phone',
    label: 'UGC App Demo Over Shoulder',
    promptLabel: 'photoreal over-shoulder phone app demo, smartphone realism, readable screen framing, soft ambient light',
    group: 'Photoreal UGC',
    description: 'Over-shoulder app-demo preset for productized screen interactions and mobile UI proof.',
    modality: 'photo',
    sensitivity: 'high',
    bestFor: 'app installs, product walkthroughs, over-shoulder tutorials, screen-led UGC ads',
    captureMedium: 'over-shoulder smartphone app demo capture',
    cameraProfile: 'observer-style over-shoulder framing with readable hand interaction and phone posture',
    lensProfile: 'smartphone or compact-camera normal field of view that keeps the phone legible without distortion',
    lightingProfile: 'soft interior ambient light with enough screen contrast to read the device naturally',
    textureProfile: 'real hand texture, real screen reflections, believable glass and casing materials',
    negativeGuardrails: [
      'avoid floating phone mockup look',
      'avoid CGI-clean screen reflections',
      'avoid luxury product-commercial staging',
    ],
  },
  {
    id: 'ugc_receipt_proof_countertop',
    label: 'UGC Receipt Proof Countertop',
    promptLabel: 'photoreal receipt and proof UGC, countertop realism, smartphone close-up, practical daylight',
    group: 'Photoreal UGC',
    description: 'Close-up proof preset for receipts, totals, price comparisons, and other trust-building evidence shots.',
    modality: 'photo',
    sensitivity: 'high',
    bestFor: 'direct-response proof, receipts, totals, comparison evidence, conversion shots',
    captureMedium: 'smartphone close-up proof capture',
    cameraProfile: 'tight countertop close-up with paper, packaging, phone, or hands as the proof anchor',
    lensProfile: 'smartphone main-camera close perspective with believable near-focus behavior',
    lightingProfile: 'practical daylight or overhead kitchen light with readable paper texture and numbers',
    textureProfile: 'real paper grain, ink, reflections, and hand detail without luxury ad cleanup',
    negativeGuardrails: [
      'avoid premium studio packshot finish',
      'avoid unrealistic macro depth of field',
      'avoid spotless synthetic surfaces',
    ],
  },
  {
    id: 'ugc_founder_softbox_clean',
    label: 'UGC Founder Softbox',
    promptLabel: 'photoreal founder video frame, softbox-lit but still native, clean modern testimonial, smartphone or creator-camera realism',
    group: 'Photoreal UGC',
    description: 'Clean founder or spokesperson preset that stays social-native while allowing a more controlled setup.',
    modality: 'photo',
    sensitivity: 'high',
    bestFor: 'founder ads, spokesperson explainers, polished testimonial clips, higher-control native ads',
    captureMedium: 'creator studio-lite capture',
    cameraProfile: 'stable vertical creator framing with cleaner setup but still native social staging',
    lensProfile: '35mm-equivalent creator-camera perspective with flattering face geometry and believable background depth',
    lightingProfile: 'soft single-source key or softbox with natural falloff, never premium commercial gloss',
    textureProfile: 'real skin texture and natural fabric detail with restrained cleanup only',
    negativeGuardrails: [
      'avoid luxury campaign polish',
      'avoid beauty-commercial skin finish',
      'avoid heavy dramatic background lighting',
    ],
  },
  {
    id: 'ugc_unboxing_handheld_home',
    label: 'UGC Unboxing Handheld',
    promptLabel: 'photoreal handheld unboxing UGC, home realism, smartphone capture, natural daylight and practical clutter',
    group: 'Photoreal UGC',
    description: 'Handheld unboxing preset with real home texture, hands, packaging, and casual vertical framing.',
    modality: 'photo',
    sensitivity: 'high',
    bestFor: 'unboxing, package arrivals, creator mail moments, tactile product reveals',
    captureMedium: 'handheld smartphone unboxing capture',
    cameraProfile: 'casual vertical handheld framing with visible hands and slight movement realism',
    lensProfile: 'smartphone main-camera perspective with honest package scale and room context',
    lightingProfile: 'soft daylight mixed with practical home fill, not clean studio white sweep lighting',
    textureProfile: 'real packaging edges, tape, paper, fingerprints, and casual home surfaces',
    negativeGuardrails: [
      'avoid e-commerce studio packshot treatment',
      'avoid sterile perfect backgrounds',
      'avoid impossible product cleanliness',
    ],
  },
  {
    id: 'brand_advertising_people',
    label: 'Brand Advertising People',
    promptLabel: 'photoreal brand campaign photography, polished studio-commercial lighting, premium human subjects',
    group: 'Photoreal People',
    description: 'Clean premium people-focused brand visuals with controlled lighting and ad-ready polish.',
    modality: 'photo',
    sensitivity: 'medium',
    bestFor: 'premium people campaigns, polished brand landing pages, controlled campaign stills',
    captureMedium: 'commercial people photography',
    cameraProfile: 'controlled brand-camera framing with deliberate polish and high subject clarity',
    lightingProfile: 'premium commercial key, fill, and separation lighting',
    textureProfile: 'clean polished finish with controlled retouching and premium material rendering',
  },
  {
    id: 'product_packshot',
    label: 'Product Packshot',
    promptLabel: 'photoreal product packshot, premium studio lighting, clean commercial background',
    group: 'Photoreal Product',
    description: 'Studio product rendering for premium ecommerce, packshots, and clean merchandising visuals.',
    modality: 'photo',
    sensitivity: 'medium',
    bestFor: 'ecommerce, clean product catalogs, polished packshots',
    captureMedium: 'studio product photography',
    cameraProfile: 'controlled hero product framing with centered commercial readability',
    lightingProfile: 'clean studio softboxes and edge control for shape and material clarity',
    textureProfile: 'high material fidelity with controlled reflections and clean commercial finish',
  },
  {
    id: 'product_advertising',
    label: 'Product Advertising',
    promptLabel: 'photoreal product advertising render, premium commercial composition, luxury lighting',
    group: 'Photoreal Product',
    description: 'Product-led advertising visuals with elevated commercial framing and premium lighting.',
    modality: 'photo',
    sensitivity: 'medium',
    bestFor: 'product hero ads, premium feature callouts, polished launch visuals',
    captureMedium: 'commercial product advertising image',
    cameraProfile: 'elevated hero-camera composition with strong foreground-background design',
    lightingProfile: 'luxury commercial lighting with controlled highlights and premium drama',
    textureProfile: 'premium product finish and dramatic surface rendering',
  },
  {
    id: 'storybook_illustration',
    label: 'Storybook Illustration',
    promptLabel: 'storybook illustration',
    group: 'Illustration',
    description: 'Warm illustrative storytelling with painterly charm and readable narrative composition.',
    modality: 'illustration',
    sensitivity: 'low',
    bestFor: 'narrative worlds, whimsical scenes, illustrative storytelling',
    captureMedium: 'storybook illustration',
    cameraProfile: 'clear narrative composition with picture-book readability',
  },
  {
    id: 'stylized_fantasy',
    label: 'Stylized Fantasy',
    promptLabel: 'stylized fantasy concept art',
    group: 'Illustration',
    description: 'Painterly fantasy concept direction for worlds, characters, and magical props.',
    modality: 'illustration',
    sensitivity: 'low',
    bestFor: 'fantasy environments, magical props, painterly concept frames',
    captureMedium: 'painterly fantasy concept illustration',
    cameraProfile: 'concept-art composition with mood-forward environmental staging',
  },
  {
    id: 'dark_fantasy_painting',
    label: 'Dark Fantasy Painting',
    promptLabel: 'dark fantasy painted concept art',
    group: 'Illustration',
    description: 'Moody, dramatic fantasy painting with darker palettes and weightier atmosphere.',
    modality: 'illustration',
    sensitivity: 'low',
    bestFor: 'dark fantasy worlds, gothic scenes, heavy atmosphere',
    captureMedium: 'dark fantasy illustration',
    cameraProfile: 'dramatic painterly staging with mood and silhouette control',
  },
  {
    id: 'western_comic',
    label: 'Western Comic',
    promptLabel: 'western comic book art',
    group: 'Illustration',
    description: 'Graphic comic-book energy with punchy contrast and stylized line-driven forms.',
    modality: 'illustration',
    sensitivity: 'low',
    bestFor: 'comic storytelling, punchy heroic scenes, graphic editorial energy',
    captureMedium: 'western comic illustration',
    cameraProfile: 'panel-like composition with strong action readability',
  },
  {
    id: 'pixel_art',
    label: 'Pixel Art',
    promptLabel: 'pixel art game asset render',
    group: 'Retro & Minimal',
    description: 'Retro pixel-art direction for low-resolution stylized worlds, characters, and items.',
    modality: 'illustration',
    sensitivity: 'low',
    bestFor: 'retro worlds, low-resolution stylized assets, nostalgic interfaces',
    captureMedium: 'pixel-art render',
    cameraProfile: 'simple sprite-like or low-resolution scene composition',
  },
  {
    id: 'minimal_flat',
    label: 'Minimal Flat',
    promptLabel: 'minimal flat illustration, reduced detail, clean geometric forms',
    group: 'Retro & Minimal',
    description: 'Clean reduced-detail style for simplified products, diagrams, and lightweight worlds.',
    modality: 'illustration',
    sensitivity: 'low',
    bestFor: 'diagrams, clean UI illustration, lightweight branded worlds',
    captureMedium: 'minimal flat illustration',
    cameraProfile: 'simple front-facing or isometric graphic composition',
  },
  {
    id: 'custom',
    label: 'Custom',
    promptLabel: 'custom art direction',
    group: 'Custom',
    description: 'Use the custom notes as the main source of truth for the art direction.',
    modality: 'illustration',
    sensitivity: 'medium',
    bestFor: 'projects with a bespoke style language not captured by the standard preset catalog',
    captureMedium: 'custom',
  },
] as const

export type ArtStylePresetId = (typeof ART_STYLE_PRESETS)[number]['id']

export const DEFAULT_ART_STYLE_PRESET: ArtStylePresetId = 'premium_stylized_3d'

export const artStylePresetMap = new Map(ART_STYLE_PRESETS.map((preset) => [preset.id, preset]))

export function getArtStylePreset(presetId: string | null | undefined): ArtStylePresetDefinition {
  return artStylePresetMap.get((presetId ?? DEFAULT_ART_STYLE_PRESET) as ArtStylePresetId)
    ?? artStylePresetMap.get(DEFAULT_ART_STYLE_PRESET)
    ?? ART_STYLE_PRESETS[0]
}

export function getArtStylePresetLabel(presetId: string | null | undefined) {
  return getArtStylePreset(presetId)?.label ?? 'Premium 3D'
}

export function getArtStylePromptLabel(presetId: string | null | undefined) {
  return getArtStylePreset(presetId)?.promptLabel
    ?? 'premium 3D game concept art'
}

export function getArtStylePresetDescription(presetId: string | null | undefined) {
  return getArtStylePreset(presetId)?.description ?? 'High-end premium CG for flagship game content and polished visuals.'
}

export function getArtStylePresetBestFor(presetId: string | null | undefined) {
  return getArtStylePreset(presetId)?.bestFor ?? ''
}

export function getArtStylePresetPromptDirectives(presetId: string | null | undefined) {
  const preset = getArtStylePreset(presetId)
  return [
    preset?.promptLabel ? `Style target: ${preset.promptLabel}.` : null,
    preset?.description ? `Preset direction: ${preset.description}.` : null,
    preset?.captureMedium ? `Capture medium: ${preset.captureMedium}.` : null,
    preset?.cameraProfile ? `Camera profile: ${preset.cameraProfile}.` : null,
    preset?.lensProfile ? `Lens and framing: ${preset.lensProfile}.` : null,
    preset?.lightingProfile ? `Lighting profile: ${preset.lightingProfile}.` : null,
    preset?.textureProfile ? `Texture and realism: ${preset.textureProfile}.` : null,
    preset?.colorProfile ? `Color profile: ${preset.colorProfile}.` : null,
    preset?.negativeGuardrails?.length ? `Avoid: ${preset.negativeGuardrails.join('; ')}.` : null,
  ].filter((entry): entry is string => Boolean(entry))
}

function getRecommendedArtStylePresetForFormatSubtype(formatSubtype: string | null | undefined): ArtStylePresetId | null {
  switch (formatSubtype) {
    case 'creator_validation':
    case 'creator_reframe':
      return 'ugc_phone_selfie_soft_daylight'
    case 'creator_problem_solution':
      return 'ugc_phone_rear_28_home_demo'
    case 'creator_serialized_drama':
      return 'ugc_phone_35_testimonial'
    case 'ad_problem_solution':
    case 'ad_mechanism_proof':
    case 'ad_before_after':
    case 'ad_comparison':
      return 'ugc_phone_rear_28_home_demo'
    case 'ad_trojan_horse_drama':
      return 'ugc_phone_35_testimonial'
    case 'faceless_demo':
    case 'faceless_process':
      return 'ugc_tabletop_daylight_demo'
    case 'faceless_explainer':
      return 'ugc_app_demo_over_shoulder_phone'
    case 'faceless_serialized_drama':
      return 'cartoon_3d'
    default:
      return null
  }
}

export function getRecommendedArtStylePresetForCinematic(input: {
  presetFamily?: string | null
  formatSubtype?: string | null
}): ArtStylePresetId | null {
  const subtypeRecommendation = getRecommendedArtStylePresetForFormatSubtype(input.formatSubtype)
  if (subtypeRecommendation) return subtypeRecommendation

  switch (input.presetFamily) {
    case 'ugc_creator':
      return 'ugc_phone_rear_28_home_demo'
    case 'ugc_direct_response_ad':
      return 'ugc_phone_rear_28_home_demo'
    case 'ugc_faceless_format':
      return 'ugc_tabletop_daylight_demo'
    default:
      return null
  }
}

export function resolveArtStylePresetForCinematic(input: {
  nodeArtStylePreset?: string | null | undefined
  graphArtStylePreset?: string | null | undefined
  inferredGraphArtStylePreset?: string | null | undefined
  projectArtStylePreset?: string | null | undefined
  presetFamily?: string | null | undefined
  formatSubtype?: string | null | undefined
  useInferredArtStyle?: boolean | null | undefined
}): ArtStylePresetResolution {
  const nodePresetId = input.nodeArtStylePreset?.trim() || null
  const graphPresetId = input.graphArtStylePreset?.trim() || null
  const inferredGraphPresetId = input.inferredGraphArtStylePreset?.trim() || null
  const projectPresetId = input.projectArtStylePreset?.trim() || null
  const allowInferredPreset = input.useInferredArtStyle !== false
  const recommendedPresetId = getRecommendedArtStylePresetForCinematic({
    presetFamily: input.presetFamily ?? null,
    formatSubtype: input.formatSubtype ?? null,
  })

  if (nodePresetId) {
    return {
      presetId: getArtStylePreset(nodePresetId).id as ArtStylePresetId,
      source: 'node',
      reason: 'Using the node-level cinematic art style override.',
      recommendedPresetId,
    }
  }

  if (graphPresetId) {
    return {
      presetId: getArtStylePreset(graphPresetId).id as ArtStylePresetId,
      source: 'graph',
      reason: 'Using the graph-level cinematic art style override.',
      recommendedPresetId,
    }
  }

  if (allowInferredPreset && inferredGraphPresetId) {
    return {
      presetId: getArtStylePreset(inferredGraphPresetId).id as ArtStylePresetId,
      source: 'inferred',
      reason: 'Using the graph-level inferred cinematic capture profile for this preset and subtype.',
      recommendedPresetId,
    }
  }

  if (projectPresetId && !recommendedPresetId) {
    return {
      presetId: getArtStylePreset(projectPresetId).id as ArtStylePresetId,
      source: 'project',
      reason: 'Using the project art style because this cinematic flow does not need a subtype-specific capture override.',
      recommendedPresetId: null,
    }
  }

  if (projectPresetId && recommendedPresetId) {
    const projectPreset = getArtStylePreset(projectPresetId)
    const recommendedPreset = getArtStylePreset(recommendedPresetId)
    if (!allowInferredPreset || projectPreset.group === recommendedPreset.group) {
      return {
        presetId: projectPreset.id as ArtStylePresetId,
        source: 'project',
        reason: !allowInferredPreset
          ? 'Using the project art style because inferred cinematic capture overrides are disabled for this graph.'
          : `Using the project art style because it already matches the recommended ${recommendedPreset.label} capture family.`,
        recommendedPresetId,
      }
    }
  }

  if (allowInferredPreset && recommendedPresetId) {
    return {
      presetId: recommendedPresetId,
      source: 'recommended',
      reason: 'Using a cinematic preset-specific capture profile so the generated shots match the selected UGC format more closely.',
      recommendedPresetId,
    }
  }

  return {
    presetId: getArtStylePreset(projectPresetId).id as ArtStylePresetId,
    source: projectPresetId ? 'project' : 'default',
    reason: projectPresetId
      ? 'Using the project art style.'
      : 'Using the default project art style because no project override or cinematic recommendation was available.',
    recommendedPresetId: null,
  }
}

export function getArtStylePresetsByGroup() {
  return ART_STYLE_PRESET_GROUPS.map((group) => ({
    group,
    presets: ART_STYLE_PRESETS.filter((preset) => preset.group === group),
  })).filter((entry) => entry.presets.length > 0)
}
