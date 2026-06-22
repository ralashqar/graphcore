import {
  sanitizeSequenceAnimaticSpatialNodeFields,
  sequenceAnimaticSpatialForbiddenNamesFromShots,
  sequenceAnimaticSpatialPromptPolicyVersion,
} from '../../../src/domain/sequenceAnimaticSpatialPrompt.ts'

type LooseRecord = Record<string, unknown>

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as LooseRecord : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown) {
  return readArray(value).map(readText).filter(Boolean)
}

function normalizeAnchorName(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleFromRefLike(value: string) {
  return normalizeAnchorName(value)
    .split(' ')
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function compactSequenceAnimaticText(value: unknown, maxLength = 900) {
  const text = readText(value).replace(/\s+/g, ' ')
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text
}

function compactSequenceAnimaticCamera(shot: LooseRecord) {
  const camera = asRecord(shot.camera)
  return {
    framing: compactSequenceAnimaticText(camera.framing ?? shot.framing, 220),
    angle: compactSequenceAnimaticText(camera.angle ?? shot.cameraAngle, 220),
    movement: compactSequenceAnimaticText(camera.movement ?? shot.cameraMovement, 260),
  }
}

export function buildSequenceAnimaticAnchorAtlasPrompt(input: {
  anchorType: 'prop' | 'location_spot' | 'character'
  anchors: LooseRecord[]
  layout: { rows: number; columns: number; panelCount: number }
  assetPack: LooseRecord
}) {
  const kindLabel = input.anchorType === 'character'
    ? 'temporary supporting character continuity reference atlas'
    : input.anchorType === 'prop'
      ? 'prop continuity reference atlas'
      : 'location spot and angle continuity reference atlas'
  const cellLines = input.anchors.map((anchor, index) => {
    const cell = index + 1
    const continuitySubtype = readText(anchor.continuitySubtype)
    const anchorType = readText(anchor.anchorType)
    const subtype = continuitySubtype && continuitySubtype !== anchorType ? ` (${continuitySubtype.replace(/_/g, ' ')})` : ''
    const reason = readText(anchor.persistenceReason) ? ` Persistence: ${readText(anchor.persistenceReason)}` : ''
    return `Cell ${cell}: ${readText(anchor.name)}${subtype}. ${readText(anchor.visualBrief)}${reason}`
  })
  return [
    `Create one ${kindLabel} as a fixed ${input.layout.rows} row x ${input.layout.columns} column grid.`,
    'Fill cells left-to-right, top-to-bottom. Leave unused cells cleanly blank. Do not add labels, numbers, arrows, borders, captions, UI, watermarks, or handwritten notes.',
    input.anchorType === 'character'
      ? 'Each populated cell should show one temporary supporting character reference in neutral pose, consistent project art style, clear species/body shape/wardrobe/silhouette, no action scene, no duplicate poses, no labels.'
      : input.anchorType === 'prop'
        ? 'Each populated cell should show one isolated reusable prop/object reference in neutral cinematic lighting, consistent with the project art style, with enough detail for later storyboard continuity.'
        : 'Each populated cell should show one reusable cinematic set, room, sub-location, or camera-facing angle inside the base location. No characters, no crowds, no actor silhouettes unless scale is essential; prioritize entrances, surfaces, sightlines, landmarks, screen direction, and lighting direction.',
    '',
    ...cellLines,
  ].filter(Boolean).join('\n')
}

export function buildSequenceAnimaticContinuityAssetPrompt(input: {
  targetNode: LooseRecord
  assetKind: string
  generationPolicy?: string
  worldLocationVisualGuide?: string
  zoneMapPoiLines?: string[]
  relevantShots: LooseRecord[]
  referenceAssetKeys: string[]
  visualCanonGuard?: string
}) {
  const spatialAsset = input.assetKind === 'location_set'
    || input.assetKind === 'location_zone'
    || input.assetKind === 'location_spot'
    || input.assetKind === 'location_angle'
    || input.assetKind === 'location_viewpoint'
    || input.assetKind === 'spot_camera_grid'
  const forbiddenNames = sequenceAnimaticSpatialForbiddenNamesFromShots(input.relevantShots)
  const sanitizedSpatialNode = spatialAsset
    ? sanitizeSequenceAnimaticSpatialNodeFields(input.targetNode, { forbiddenNames })
    : null
  const targetName = sanitizedSpatialNode?.name || readText(input.targetNode.name) || titleFromRefLike(readText(input.targetNode.id))
  const visualBrief = sanitizedSpatialNode?.brief || readText(input.targetNode.visualBrief) || readText(input.targetNode.summary)
  const generationPolicy = readText(input.generationPolicy)
  const zoneSpatialMapPolicy = input.assetKind === 'location_zone' || generationPolicy.startsWith('zone_spatial_map')
  const worldLocationVisualGuide = compactSequenceAnimaticText(input.worldLocationVisualGuide, 900)
  const locationEvidenceLines: string[] = worldLocationVisualGuide ? [`Parent world location guide: ${worldLocationVisualGuide}`] : []
  if (input.assetKind === 'location_zone' && zoneSpatialMapPolicy) {
    const prompt = [
      `Zone continuity board: ${targetName}`,
      'Purpose: Create one large production continuity board for this zone. It must combine a readable annotated zone map with square cinematic spot-detail cells in the same generated image.',
      worldLocationVisualGuide ? `Parent location:\n${worldLocationVisualGuide}` : '',
      visualBrief ? `Zone brief:\n${visualBrief}` : '',
      input.referenceAssetKeys.length > 0
        ? 'Reference image usage: Use attached parent set/location image as the style, material, lighting, scale, geography, palette, and design-language anchor.'
        : 'Reference image usage: No parent image is attached. Use the parent world location guide, zone brief, known spots/POIs, and project style for materials, palette, weather, and lighting logic.',
      'Required board layout: Make the zone map the largest element. Draw it as a rendered bird-eye or 3/4 orthographic map with the full zone boundary, entrances/exits, walkable routes, thresholds, sightlines, main surfaces, landmarks, set pieces, elevation changes, light/weather direction, and material continuity.',
      input.zoneMapPoiLines && input.zoneMapPoiLines.length > 0
        ? `Known spots with visual placement notes:\n${input.zoneMapPoiLines.slice(0, 12).map((line) => `- ${line}`).join('\n')}`
        : '',
      input.zoneMapPoiLines && input.zoneMapPoiLines.length > 0
        ? 'Map annotations: Use the known spot visual notes to place each marker in a believable, specific part of the zone. Above or beside each marker, add a short readable spot-name label, limited to the spot name or a 1-3 word abbreviation. These map labels are required so downstream spot generation can identify the correct area.'
        : 'Map annotations: Add a few clean symbolic markers for important implied POIs. Above or beside each marker, add a short readable 1-3 word label so downstream spot generation has spatial anchors.',
      input.zoneMapPoiLines && input.zoneMapPoiLines.length > 0
        ? 'Spot-detail cells: For every known spot, also draw one square cinematic inset cell inside the overall board. Each square cell should focus on that exact spot from ground level, eye level, slight 3/4, or another clear cinematic angle. Show the local entrances, surfaces, foreground/background depth, nearby landmarks, and the main bottleneck/feature shape. Caption each square cell with the spot name so the spot can be matched visually to the map marker.'
        : 'Spot-detail cells: Add 2-4 square cinematic inset cells for the most important implied POIs. Each square cell should expand one labeled map marker into a local ground-level or slight 3/4 environment view, with a short POI caption.',
      'Consistency rule: The spot-detail cells must match the map exactly. Do not invent different architecture, materials, weather, lighting direction, routes, or landmarks for the cells.',
      'Style: Rendered production board in the project art style. Clear geography first, cinematic polish second.',
      readText(input.visualCanonGuard) ? `Project canon guard:\n${readText(input.visualCanonGuard)}` : '',
      '',
      'Avoid: people, character silhouettes, crowds, long readable paragraphs, UI chrome, watermarks, dialogue, action beats, or unrelated text. Short spot-name labels on map markers and spot-detail cell captions are allowed and required.',
      'Output: one large 3840x2560 zone continuity board with clean readable geography, one dominant annotated map, and square cinematic spot-detail cells.',
    ].filter(Boolean).join('\n\n')
    return {
      prompt,
      sanitizedTargetNode: sanitizedSpatialNode ? {
        ...input.targetNode,
        name: sanitizedSpatialNode.name,
        visualBrief: sanitizedSpatialNode.brief || readText(input.targetNode.visualBrief),
        summary: sanitizedSpatialNode.brief || readText(input.targetNode.summary),
        spatialPromptKindLabel: sanitizedSpatialNode.kindLabel,
      } : input.targetNode,
      locationEvidenceLines,
      promptDiagnostics: {
        policyVersion: sequenceAnimaticSpatialPromptPolicyVersion,
        sanitized: Boolean(sanitizedSpatialNode?.changed || locationEvidenceLines.length > 0),
        removedTerms: sanitizedSpatialNode?.diagnostics ?? [],
        visualCanonGuard: readText(input.visualCanonGuard),
      },
    }
  }
  if (input.assetKind === 'location_spot') {
    const prompt = [
      `Draw the spot "${targetName}" in large from the attached zone map.`,
      'Use the attached zone map as the only visual reference. Find the matching marker/label for this spot and expand that exact area into a local environment view. Respect the reference image map and structure well.',
      'Stage it with a camera angle that captures the spot clearly: medium-wide or wide, eye level or slight 3/4 angle, readable entrances, surfaces, foreground/background depth, and the main landmark or bottleneck shape.',
      'If the attached zone map is missing, do not generate this spot asset.',
    ].filter(Boolean).join('\n\n')
    return {
      prompt,
      sanitizedTargetNode: sanitizedSpatialNode ? {
        ...input.targetNode,
        name: sanitizedSpatialNode.name,
        visualBrief: sanitizedSpatialNode.brief || readText(input.targetNode.visualBrief),
        summary: sanitizedSpatialNode.brief || readText(input.targetNode.summary),
        spatialPromptKindLabel: sanitizedSpatialNode.kindLabel,
      } : input.targetNode,
      locationEvidenceLines,
      promptDiagnostics: {
        policyVersion: sequenceAnimaticSpatialPromptPolicyVersion,
        sanitized: Boolean(sanitizedSpatialNode?.changed || locationEvidenceLines.length > 0),
        removedTerms: sanitizedSpatialNode?.diagnostics ?? [],
        visualCanonGuard: readText(input.visualCanonGuard),
        spotPromptStyle: 'simple_zone_map_expand',
      },
    }
  }
  const shotLines = spatialAsset ? [] : input.relevantShots.slice(0, 8).map((shot) => {
    const camera = compactSequenceAnimaticCamera(shot)
    return [
      readText(shot.title),
      compactSequenceAnimaticText(readText(shot.action) || readText(shot.description), 240),
      [camera.framing, camera.angle, camera.movement].filter(Boolean).join(' / '),
    ].filter(Boolean).join(': ')
  })
  const kindInstruction = input.assetKind === 'temporary_character'
    ? 'Create one neutral temporary supporting-character continuity reference sheet. Show body shape, silhouette, wardrobe, face/species cues, and scale clearly. No action scene, no text, no captions.'
    : input.assetKind === 'prop'
      ? 'Create one isolated reusable prop continuity reference sheet. Show the object clearly with material, shape, wear, function, and a clean cinematic close-up. No labels, no UI, no text.'
      : input.assetKind === 'location_set'
        ? 'Create one broad reusable set environment continuity reference. Preserve overall layout, architecture, surfaces, entrances, landmarks, material palette, weather, and lighting logic. No people, no characters, no silhouettes, no labels, no UI.'
      : input.assetKind === 'spot_camera_grid'
        ? 'Create one reusable camera-angle coverage grid for this specific spot. Use the attached parent zone map and spot reference as continuity locks. Show 2 rows x 3 columns of distinct camera views around the same spot: wide establishing, over-shoulder/reverse axis, side/profile, low angle, high/overhead, and tight insert/detail. Keep the same architecture, landmarks, entrances, surfaces, lighting direction, weather, palette, and screen-direction logic in every cell. No people, no characters, no silhouettes, no readable labels, no UI.'
      : input.assetKind === 'location_zone'
        ? zoneSpatialMapPolicy
          ? 'Create one large zone continuity board, not a single cinematic shot: make the annotated bird-eye or 3/4 orthographic zone map the dominant element, and include square cinematic spot-detail cells for known spots inside the same board. The cells must expand the matching map markers into local ground-level or slight 3/4 views while preserving the exact map architecture, routes, materials, weather, lighting direction, and landmarks. Short spot-name map labels and spot-cell captions are allowed and required. No people, characters, crowds, silhouettes, paragraph labels, UI chrome, or watermarks.'
          : 'Create one reusable zone environment continuity reference inside the set. Preserve sub-area geography, sightlines, access paths, landmarks, surfaces, weather, and lighting continuity. No people, no characters, no silhouettes, no labels, no UI.'
      : input.assetKind === 'location_angle'
        ? 'Create one camera-facing spatial angle reference. Preserve architecture, visible landmarks, screen direction, light direction, entrances, and depth cues. No people, no characters, no silhouettes, no labels, no UI.'
        : 'Create one reusable local staging reference for this specific spot inside the parent zone. If a zone map is attached, find the marker/label for this spot and generate the local environment at that exact marked position. Show the spot clearly at human eye level or slight 3/4 view, wide enough to understand staging, entrances, usable surfaces, foreground/background depth, and where characters could stand later. This is not a scene shot; no people, no characters, no silhouettes, no labels, no UI.'
  const prompt = [
    `Continuity asset: ${targetName}`,
    spatialAsset ? `Asset kind: ${sanitizedSpatialNode?.kindLabel || 'spatial continuity reference'}` : `Asset kind: ${input.assetKind || 'continuity_asset'}`,
    visualBrief ? `Visual brief: ${visualBrief}` : '',
    kindInstruction,
    input.assetKind === 'location_spot'
      ? `Parent zone reference: Use the attached zone map as the spatial source of truth. Find the marker/label for "${targetName}" and generate the local environment at that exact marked spot. If no parent zone image is attached, do not generate this spot asset.`
      : '',
    input.assetKind === 'spot_camera_grid'
      ? 'Reference image usage: Use the attached zone map to preserve the parent geography and use the attached spot reference to preserve the exact local staging point. The grid should explore camera positions around that same spot, not invent a new location.'
      : '',
    input.assetKind === 'spot_camera_grid'
      ? 'Camera coverage requirements: Each cell must be a clean shot-reference angle with a stable horizon, readable staging depth, consistent landmarks, and no character action. The result is a reusable reference board for later keyframe generation.'
      : '',
    input.assetKind === 'location_spot'
      ? 'Spatial continuity requirements: Preserve the zone map entrances, nearby landmarks, surfaces, light direction, weather, palette, materials, route direction, and relative position to adjacent spots.'
      : '',
    input.assetKind === 'location_spot'
      ? 'No action: This is not a shot from the scene. Do not include characters, crowds, silhouettes, dialogue, action, or story beats.'
      : '',
    input.referenceAssetKeys.length > 0
      ? 'Attached image references are continuity locks. Match their style, materials, palette, lighting logic, architecture, scale, and design language without copying visible layout artifacts.'
      : spatialAsset
        ? 'No prior continuity asset references are available. Use only the spatial node brief and project visual style.'
        : 'No prior continuity asset references are available. Ground the image in the written shot evidence and project visual style.',
    readText(input.visualCanonGuard) ? `Project canon guard:\n${readText(input.visualCanonGuard)}` : '',
    '',
    shotLines.length > 0 ? `Shot evidence:\n${shotLines.join('\n')}` : '',
    input.assetKind === 'spot_camera_grid'
      ? 'Provider requirements: one finished square or wide production reference board containing a clean 2x3 camera-angle grid, no visible text, no labels, no borders, no watermarks.'
      : zoneSpatialMapPolicy
      ? 'Provider requirements: one finished large zone continuity board image with a dominant annotated map plus square cinematic spot-detail cells, clean readable geography, short spot-name labels/captions only, no paragraph labels, no UI chrome, no watermarks.'
      : 'Provider requirements: one finished square production reference image, clean composition, no visible text, no labels, no borders, no watermarks.',
  ].filter(Boolean).join('\n\n')
  return {
    prompt,
    sanitizedTargetNode: sanitizedSpatialNode ? {
      ...input.targetNode,
      name: sanitizedSpatialNode.name,
      visualBrief: sanitizedSpatialNode.brief || readText(input.targetNode.visualBrief),
      summary: sanitizedSpatialNode.brief || readText(input.targetNode.summary),
      spatialPromptKindLabel: sanitizedSpatialNode.kindLabel,
    } : input.targetNode,
    locationEvidenceLines,
    promptDiagnostics: {
      policyVersion: sequenceAnimaticSpatialPromptPolicyVersion,
      sanitized: Boolean(sanitizedSpatialNode?.changed || locationEvidenceLines.length > 0),
      removedTerms: sanitizedSpatialNode?.diagnostics ?? [],
      visualCanonGuard: readText(input.visualCanonGuard),
    },
  }
}

export function buildSequenceAnimaticContinuityBatchPrompt(input: {
  batch: LooseRecord
  targetNodes: LooseRecord[]
  relevantShots: LooseRecord[]
  referenceAssetKeys: string[]
  worldLocationVisualGuide?: string
  visualCanonGuard?: string
}) {
  const batchKind = readText(input.batch.batchKind) || 'single_hero_ref'
  const layout = asRecord(input.batch.layout)
  const rows = Math.max(1, Number(layout.rows ?? 1) || 1)
  const columns = Math.max(1, Number(layout.columns ?? 1) || 1)
  const cellRoles = readStringArray(input.batch.cellRoles ?? input.batch.cell_roles)
  const spatialBatch = batchKind === 'angle_grid'
    || batchKind === 'viewpoint_grid'
    || batchKind === 'spot_camera_grid'
    || batchKind === 'parent_child_scaffold_grid'
    || batchKind === 'spot_grid'
    || batchKind === 'spot_atlas_grid'
    || batchKind === 'viewpoint_atlas_grid'
    || batchKind === 'location_zone_board'
    || batchKind === 'single_hero_ref'
  const generationPolicy = readText(input.batch.generationPolicy)
  const spotAtlasGridPolicy = batchKind === 'spot_atlas_grid' || batchKind === 'viewpoint_atlas_grid' || generationPolicy.startsWith('spot_atlas_grid')
  const spotAngleCoveragePolicy = generationPolicy === 'spot_angle_coverage_v1' || generationPolicy === 'spot_camera_grid_v1'
  const spotAtlasImageSize = {
    width: Math.max(1024, Math.min(4096, columns * 1024)),
    height: Math.max(1024, Math.min(4096, rows * 1024)),
  }
  const imageSize = spotAtlasGridPolicy ? spotAtlasImageSize : { width: 2048, height: 2048 }
  const imageShapeLabel = imageSize.width === imageSize.height ? 'square' : 'rectangular'
  const forbiddenNames = sequenceAnimaticSpatialForbiddenNamesFromShots(input.relevantShots)
  const sanitizedTargets = input.targetNodes.slice(0, rows * columns).map((node) => spatialBatch
    ? sanitizeSequenceAnimaticSpatialNodeFields(node, { forbiddenNames })
    : null)
  const cellLines = input.targetNodes.slice(0, rows * columns).map((node, index) => {
    const row = Math.floor(index / columns) + 1
    const column = (index % columns) + 1
    const role = cellRoles[index] || 'target'
    const sanitized = sanitizedTargets[index]
    return [
      `Cell ${index + 1} (row ${row}, column ${column}, ${role}):`,
      sanitized?.name || readText(node.name) || titleFromRefLike(readText(node.id)),
      sanitized?.kindLabel || readText(node.assetKind) || readText(node.nodeKind),
      sanitized?.brief || readText(node.visualBrief) || readText(node.summary),
    ].filter(Boolean).join(' ')
  })
  const worldLocationVisualGuide = compactSequenceAnimaticText(input.worldLocationVisualGuide, 900)
  const locationEvidenceLines: string[] = worldLocationVisualGuide ? [`Parent world location guide: ${worldLocationVisualGuide}`] : []
  const shotLines = spatialBatch ? [] : input.relevantShots.slice(0, 8).map((shot) => [
    readText(shot.title),
    compactSequenceAnimaticText(readText(shot.action) || readText(shot.description), 220),
  ].filter(Boolean).join(': '))
  const kindInstruction = batchKind === 'spot_atlas_grid' || batchKind === 'viewpoint_atlas_grid'
    ? 'Create a local reference atlas using the single attached zone spatial map as the only visual reference. For each cell, find the matching spot marker/label in the zone map and generate that exact local staging position, sub-location, or camera-facing viewpoint. Match the zone map topology, entrances, adjacent landmarks, route direction, surfaces, weather, palette, light direction, and screen-direction logic. The generated cells themselves should be clean local references with no people, no characters, no silhouettes, no visible labels, no map overlays, and no UI.'
    : batchKind === 'spot_camera_grid'
    ? 'Create a reusable spot camera-angle grid around one specific spot. Use attached references as hierarchy locks: parent zone map first for topology and labeled spot location, then spot/local reference for nearby surfaces, landmarks, materials, scale, and lighting. Each populated cell must show a distinct canonical camera-facing view around the same spot for shot selection: wide establishing, approach, reverse, side/profile, high, low, insert/detail, threshold, or deep-background view as assigned. Every cell must clearly be the same spot. Preserve local landmarks, entrances, adjacent paths, depth, light direction, screen direction, materials, palette, and scale. No people, no characters, no silhouettes, no labels, no captions, no arrows, no UI.'
    : spotAngleCoveragePolicy
    ? 'Each populated cell must show a distinct reusable canonical camera-facing angle for the same spot. Use attached references as geometry locks: zone map for global topology and labeled spot location, and spot atlas/local crop for local surfaces, entrances, landmarks, scale, light direction, and screen direction. No people, no characters, no silhouettes, no labels, no UI.'
    : batchKind === 'angle_grid' || batchKind === 'viewpoint_grid'
    ? 'Each populated cell must show a distinct reusable camera-facing viewpoint from the same set, zone, or spot. Preserve architecture, landmarks, light direction, screen direction, entrances, materials, and depth. No characters, no labels, no UI.'
    : batchKind === 'parent_child_scaffold_grid'
      ? 'Create a mixed parent-child spatial scaffold grid. Cell 1 is the parent set/zone/spot environment reference; following cells are child physical staging positions or viewpoints inside that exact parent. Make the children visibly inherit the parent architecture, materials, light direction, landmarks, entrances, geography, and scale. Each cell must be a clean standalone production reference for its assigned node. No people, no characters, no silhouettes, no labels, no UI.'
    : batchKind === 'spot_grid'
      ? 'Each populated cell must show one reusable physical staging position or architectural sub-location inside the same zone. Preserve local surfaces, landmarks, entrances, sightlines, material continuity, set-piece placement, and lighting. No people, no characters, no silhouettes, no labels, no UI.'
      : batchKind === 'temp_character_grid'
        ? 'Each populated cell must show one temporary supporting character or crowd/faction member in neutral pose. Make silhouettes, wardrobe, body shape, face/species cues, and scale readable. No action scene, no labels.'
        : batchKind === 'prop_grid'
          ? 'Each populated cell must show one reusable prop or item in clean cinematic lighting. Make material, shape, wear, function, and scale readable. No labels, no UI.'
          : batchKind === 'location_zone_board'
            ? 'Create one clean environment production board for a specific set or zone. Show usable cinematic spatial information: architecture, entrances, landmarks, light direction, material palette, and camera-friendly surfaces. No characters, no labels, no maps, no UI.'
            : 'Create one high-detail hero continuity reference. It must be reusable across storyboard and shot-video generation. No labels, no borders, no UI, no watermarks.'
  const prompt = [
    `Continuity reference batch: ${batchKind}`,
    `Grid: ${rows} rows x ${columns} columns on one ${imageShapeLabel} ${imageSize.width}x${imageSize.height} image. Fill the entire canvas with equal cells left-to-right, top-to-bottom; do not center a smaller square grid, do not add outer margins, and do not leave broad whitespace around the grid. Leave unused cells clean and empty inside the same equal-cell grid only.`,
    kindInstruction,
    worldLocationVisualGuide ? `Parent world location guide: ${worldLocationVisualGuide}` : '',
    input.referenceAssetKeys.length > 0
      ? batchKind === 'spot_atlas_grid' || batchKind === 'viewpoint_atlas_grid'
        ? 'Attached image reference: the parent zone spatial map only. Treat it as the global topology lock for every cell. Use its baked spot labels and markers to locate the correct source spot for each cell; do not reproduce the labels in the generated cells.'
      : batchKind === 'spot_camera_grid'
        ? 'Attached images are hierarchy locks: parent zone map first, then spot/local reference. Treat the zone map as topology and labeled spot-location source of truth, and treat the spot reference as local surface/staging identity; do not introduce characters, shot action, readable text, labels, or UI marks.'
      : spotAngleCoveragePolicy
        ? 'Attached images are hierarchy locks: parent zone map first, then spot atlas/local spot reference. Preserve topology, local surfaces, landmarks, depth, light direction, screen direction, materials, and palette.'
        : 'Attached images are hierarchy/dependency references. Preserve their project style, lighting logic, materials, design language, and spatial continuity.'
      : spatialBatch
        ? 'No parent image references are available. Use only the cell assignments and project visual style; do not use shot action, character blocking, or dialogue as visual content.'
        : 'No parent image references are available. Ground the batch in shot evidence and project visual style.',
    readText(input.visualCanonGuard) ? `Project canon guard:\n${readText(input.visualCanonGuard)}` : '',
    cellLines.length > 0 ? `Cell assignments:\n${cellLines.join('\n')}` : '',
    locationEvidenceLines.length > 0 ? `Location evidence:\n${locationEvidenceLines.join('\n')}` : '',
    shotLines.length > 0 ? `Shot evidence:\n${shotLines.join('\n')}` : '',
    'Provider requirements: one finished image only, exact cell order, no visible text, no captions, no labels, no arrows, no UI, no watermarks. Use clean spacing or subtle gutters only; every populated cell must crop cleanly as its own equal-sized reference.',
  ].filter(Boolean).join('\n\n')
  return {
    prompt,
    sanitizedTargetNodes: input.targetNodes.map((node, index) => {
      const sanitized = sanitizedTargets[index]
      if (!sanitized) return node
      return {
        ...node,
        name: sanitized.name,
        visualBrief: sanitized.brief || readText(node.visualBrief),
        summary: sanitized.brief || readText(node.summary),
        spatialPromptKindLabel: sanitized.kindLabel,
      }
    }),
    locationEvidenceLines,
    promptDiagnostics: {
      policyVersion: sequenceAnimaticSpatialPromptPolicyVersion,
      sanitized: sanitizedTargets.some((target) => target?.changed) || locationEvidenceLines.length > 0,
      removedTerms: [...new Set(sanitizedTargets.flatMap((target) => target?.diagnostics ?? []))],
      visualCanonGuard: readText(input.visualCanonGuard),
    },
  }
}
