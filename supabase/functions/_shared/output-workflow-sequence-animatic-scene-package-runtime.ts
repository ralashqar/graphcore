import { z } from 'zod'

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

export const sequenceAnimaticTaggedDialogueRowSchema = z.object({
  id: z.string(),
  sceneId: z.string(),
  speakerName: z.string(),
  speakerRefId: z.string(),
  text: z.string(),
  lineNumber: z.number().int().positive(),
})

export const sequenceAnimaticTaggedSceneGraphAdditionSchema = z.object({
  id: z.string(),
  kind: z.enum(['set', 'zone', 'spot', 'viewpoint']),
  name: z.string(),
  visualBrief: z.string(),
  parentId: z.string().default(''),
  worldLocationRefId: z.string().default(''),
  setId: z.string().default(''),
  zoneId: z.string().default(''),
  spotId: z.string().default(''),
})

export const sequenceAnimaticTaggedScenePackageSchema = z.object({
  sceneId: z.string(),
  index: z.number().int().positive(),
  title: z.string(),
  sourceText: z.string(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  locationRefId: z.string().default(''),
  worldLocationRefId: z.string().default(''),
  setId: z.string().default(''),
  zoneId: z.string().default(''),
  spotIds: z.array(z.string()).default([]),
  dialogueRows: z.array(sequenceAnimaticTaggedDialogueRowSchema).default([]),
  graphAdditionIds: z.array(z.string()).default([]),
  graphAdditions: z.array(sequenceAnimaticTaggedSceneGraphAdditionSchema).default([]),
  relevantReferenceIds: z.array(z.string()).default([]),
})

export const sequenceAnimaticScenePackageOutputSchema = z.object({
  contractVersion: z.enum(['scene_tagged_screenplay_v2', 'scene_graph_assignment_v1']).default('scene_graph_assignment_v1'),
  screenplayScenes: z.array(sequenceAnimaticTaggedScenePackageSchema).default([]),
  scenePackages: z.array(sequenceAnimaticTaggedScenePackageSchema).default([]),
  dialogueRows: z.array(sequenceAnimaticTaggedDialogueRowSchema).default([]),
  sceneGraphDraft: z.object({
    additions: z.array(sequenceAnimaticTaggedSceneGraphAdditionSchema).default([]),
  }).default({ additions: [] }),
  spotRelations: z.array(z.record(z.string(), z.unknown())).default([]),
  warnings: z.array(z.string()).default([]),
  diagnostics: z.array(z.string()).default([]),
})

export type SequenceAnimaticTaggedScenePackage = z.infer<typeof sequenceAnimaticTaggedScenePackageSchema>
export type SequenceAnimaticScenePackageOutput = z.infer<typeof sequenceAnimaticScenePackageOutputSchema>

export const sequenceAnimaticSceneGraphAssignmentSceneSchema = z.object({
  sceneId: z.string(),
  worldLocationRefId: z.string().default(''),
  setId: z.string().default(''),
  zoneId: z.string().default(''),
  spotIds: z.array(z.string()).default([]),
  graphAdditionIds: z.array(z.string()).default([]),
  relevantReferenceIds: z.array(z.string()).default([]),
  rationale: z.string().default(''),
})

export const sequenceAnimaticSceneGraphAssignmentSchema = z.object({
  contractVersion: z.literal('scene_graph_assignment_v1').default('scene_graph_assignment_v1'),
  sceneAssignments: z.array(sequenceAnimaticSceneGraphAssignmentSceneSchema).default([]),
  sceneGraphDraft: z.object({
    additions: z.array(sequenceAnimaticTaggedSceneGraphAdditionSchema).default([]),
  }).default({ additions: [] }),
  spotRelations: z.array(z.record(z.string(), z.unknown())).default([]),
  warnings: z.array(z.string()).default([]),
  diagnostics: z.array(z.string()).default([]),
})

function collectReferenceIdsForSequenceAnimatic(value: unknown, output = new Set<string>(), depth = 0) {
  if (depth > 6 || value == null) return output
  if (Array.isArray(value)) {
    for (const item of value) collectReferenceIdsForSequenceAnimatic(item, output, depth + 1)
    return output
  }
  if (typeof value !== 'object') return output
  const record = asRecord(value)
  for (const key of ['id', 'key', 'refId', 'ref_id', 'entityKey', 'entity_key', 'assetKey', 'asset_key']) {
    const id = readText(record[key])
    if (id) output.add(id)
  }
  for (const nested of Object.values(record)) collectReferenceIdsForSequenceAnimatic(nested, output, depth + 1)
  return output
}

function parseSequenceAnimaticTaggedIdAndTitle(raw: string, fallbackId: string) {
  const cleaned = raw.trim().replace(/^[-*:]+/, '').trim()
  const colonIndex = cleaned.indexOf(':')
  const beforeColon = colonIndex >= 0 ? cleaned.slice(0, colonIndex).trim() : cleaned
  const afterColon = colonIndex >= 0 ? cleaned.slice(colonIndex + 1).trim() : ''
  const firstToken = beforeColon.split(/\s+/)[0]?.trim() || ''
  const looksLikeId = /^[a-z][a-z0-9_-]{1,96}$/i.test(firstToken) && /[_-]|\d/.test(firstToken)
  const id = looksLikeId ? firstToken : fallbackId
  const title = afterColon || (looksLikeId ? beforeColon.slice(firstToken.length).trim() : beforeColon) || fallbackId
  return { id: id.replace(/[^A-Za-z0-9_-]/g, '_'), title }
}

function parseSequenceAnimaticSceneGraphAdditionLine(line: string) {
  const normalized = line.trim().replace(/^\|/, '').replace(/\|$/, '').trim()
  if (!normalized || /^[-|\s]+$/.test(normalized) || /^kind\s*\|/i.test(normalized)) return null
  const parts = normalized.split('|').map((part) => part.trim()).filter(Boolean)
  if (parts.length < 4) return null
  const kind = parts[0].toLowerCase()
  if (!['set', 'zone', 'spot', 'viewpoint'].includes(kind)) return null
  const id = parts[1]
  const parentPart = parts[2] ?? ''
  const name = parts[3] ?? id
  const visualBrief = parts.slice(4).join(' | ') || name
  const keyValues = Object.fromEntries(parentPart
    .split(/[;,]/)
    .map((entry) => entry.trim())
    .map((entry) => {
      const [key, ...rest] = entry.split('=')
      return [key?.trim(), rest.join('=').trim()] as const
    })
    .filter(([key, value]) => key && value))
  const parentId = readText(keyValues.parentId) || readText(keyValues.parent) || parentPart.replace(/^parent(Id)?=/i, '').trim()
  const explicitSpotId = readText(keyValues.spotId)
  const explicitZoneId = readText(keyValues.zoneId)
  const explicitSetId = readText(keyValues.setId)
  const inferredViewpointSpotId = kind === 'viewpoint' && !explicitSpotId && !explicitZoneId && !explicitSetId && /^spot[_-]/i.test(parentId) ? parentId : ''
  const inferredViewpointZoneId = kind === 'viewpoint' && !explicitSpotId && !explicitZoneId && !explicitSetId && /^zone[_-]/i.test(parentId) ? parentId : ''
  const inferredViewpointSetId = kind === 'viewpoint' && !explicitSpotId && !explicitZoneId && !explicitSetId && /^set[_-]/i.test(parentId) ? parentId : ''
  const record = {
    id,
    kind,
    name,
    visualBrief,
    parentId,
    worldLocationRefId: readText(keyValues.worldLocationRefId) || readText(keyValues.location) || (kind === 'set' ? parentId : ''),
    setId: explicitSetId || (kind === 'zone' ? parentId : inferredViewpointSetId),
    zoneId: explicitZoneId || (kind === 'spot' ? parentId : inferredViewpointZoneId),
    spotId: explicitSpotId || inferredViewpointSpotId,
  }
  return sequenceAnimaticTaggedSceneGraphAdditionSchema.parse(record)
}

function validateSequenceAnimaticTaggedSceneGraph(input: {
  additions: z.infer<typeof sequenceAnimaticTaggedSceneGraphAdditionSchema>[]
  scenePackages: SequenceAnimaticTaggedScenePackage[]
  knownReferenceIds: Set<string>
}) {
  const ids = new Set<string>()
  const duplicates = input.additions
    .map((addition) => addition.id)
    .filter((id) => {
      if (ids.has(id)) return true
      ids.add(id)
      return false
    })
  if (duplicates.length > 0) throw new Error(`Tagged screenplay has duplicate scene graph addition IDs: ${[...new Set(duplicates)].join(', ')}.`)
  const setIds = new Set(input.additions.filter((addition) => addition.kind === 'set').map((addition) => addition.id))
  const zoneIds = new Set(input.additions.filter((addition) => addition.kind === 'zone').map((addition) => addition.id))
  const spotIds = new Set(input.additions.filter((addition) => addition.kind === 'spot').map((addition) => addition.id))
  const taggedSetIds = new Set(input.scenePackages.map((scene) => scene.setId).filter(Boolean))
  const taggedZoneIds = new Set(input.scenePackages.map((scene) => scene.zoneId).filter(Boolean))
  const taggedSpotIds = new Set(input.scenePackages.flatMap((scene) => scene.spotIds).filter(Boolean))
  for (const addition of input.additions) {
    if (addition.kind === 'set' && !addition.worldLocationRefId && !addition.parentId) {
      throw new Error(`Scene graph set "${addition.id}" needs a parent world location ref.`)
    }
    if (addition.kind === 'zone' && !setIds.has(addition.setId) && !taggedSetIds.has(addition.setId)) {
      throw new Error(`Scene graph zone "${addition.id}" has unknown parent set "${addition.setId || addition.parentId}".`)
    }
    if (addition.kind === 'spot' && !zoneIds.has(addition.zoneId) && !taggedZoneIds.has(addition.zoneId)) {
      throw new Error(`Scene graph spot "${addition.id}" has unknown parent zone "${addition.zoneId || addition.parentId}".`)
    }
    if (addition.kind === 'viewpoint') {
      if (!addition.spotId && !addition.zoneId && !addition.setId && addition.parentId) {
        if (spotIds.has(addition.parentId) || taggedSpotIds.has(addition.parentId)) addition.spotId = addition.parentId
        else if (zoneIds.has(addition.parentId) || taggedZoneIds.has(addition.parentId)) addition.zoneId = addition.parentId
        else if (setIds.has(addition.parentId) || taggedSetIds.has(addition.parentId)) addition.setId = addition.parentId
      }
      const parent = addition.spotId || addition.zoneId || addition.setId || addition.parentId
      if (addition.spotId && !spotIds.has(addition.spotId) && !taggedSpotIds.has(addition.spotId)) {
        throw new Error(`Scene graph viewpoint "${addition.id}" has unknown parent spot "${parent}".`)
      }
      if (addition.zoneId && !zoneIds.has(addition.zoneId) && !taggedZoneIds.has(addition.zoneId)) {
        throw new Error(`Scene graph viewpoint "${addition.id}" has unknown parent zone "${parent}".`)
      }
      if (addition.setId && !setIds.has(addition.setId) && !taggedSetIds.has(addition.setId)) {
        throw new Error(`Scene graph viewpoint "${addition.id}" has unknown parent set "${parent}".`)
      }
      if (!addition.spotId && !addition.zoneId && !addition.setId) {
        throw new Error(`Scene graph viewpoint "${addition.id}" has unknown parent "${parent}".`)
      }
    }
  }
}

export function buildSequenceAnimaticScenePackageFromTaggedScreenplay(input: {
  screenplayDraft: LooseRecord
  assetPack: LooseRecord
  context: LooseRecord
  contractVersion?: 'scene_tagged_screenplay_v2' | 'scene_graph_assignment_v1'
}) {
  const markdown = readText(input.screenplayDraft.screenplayMarkdown)
    || readText(input.screenplayDraft.markdown)
    || readText(input.screenplayDraft.text)
  if (!markdown) throw new Error('Tagged screenplay package requires screenplay Markdown.')
  const knownReferenceIds = collectReferenceIdsForSequenceAnimatic({
    assetPack: input.assetPack,
    entities: readArray(input.context.entities),
    world: input.context.wiki ?? input.context.worldWiki,
  })
  const lines = markdown.split(/\r?\n/)
  const graphSectionIndex = lines.findIndex((line) => /^##\s*Scene Graph Additions\s*$/i.test(line.trim()))
  const screenplayLines = graphSectionIndex >= 0 ? lines.slice(0, graphSectionIndex) : lines
  const graphLines = graphSectionIndex >= 0 ? lines.slice(graphSectionIndex + 1) : []
  const sceneStarts: Array<{ index: number; id: string; title: string }> = []
  screenplayLines.forEach((line, lineIndex) => {
    const match = line.trim().match(/^#Scene\s+(.+)$/i)
    if (!match) return
    const parsed = parseSequenceAnimaticTaggedIdAndTitle(match[1], `scene_${String(sceneStarts.length + 1).padStart(3, '0')}`)
    sceneStarts.push({ index: lineIndex, id: parsed.id, title: parsed.title })
  })
  if (sceneStarts.length === 0) {
    sceneStarts.push({ index: 0, id: 'scene_001', title: 'Scene 1' })
  }
  const duplicateSceneIds = sceneStarts
    .map((scene) => scene.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index)
  if (duplicateSceneIds.length > 0) {
    throw new Error(`Tagged screenplay has duplicate #Scene IDs: ${[...new Set(duplicateSceneIds)].join(', ')}.`)
  }
  const additions = graphLines
    .map(parseSequenceAnimaticSceneGraphAdditionLine)
    .filter((addition): addition is z.infer<typeof sequenceAnimaticTaggedSceneGraphAdditionSchema> => Boolean(addition))
  const additionsById = new Map(additions.map((addition) => [addition.id, addition] as const))
  const dialogueRows: z.infer<typeof sequenceAnimaticTaggedDialogueRowSchema>[] = []
  const scenePackages = sceneStarts.map((sceneStart, sceneIndex) => {
    const nextStart = sceneStarts[sceneIndex + 1]?.index ?? screenplayLines.length
    const sceneLines = screenplayLines.slice(sceneStart.index, nextStart)
    let worldLocationRefId = ''
    let setId = ''
    let zoneId = ''
    const spotIds: string[] = []
    sceneLines.forEach((line) => {
      const trimmed = line.trim()
      const locationMatch = trimmed.match(/^#Location\s+(.+)$/i)
      const setMatch = trimmed.match(/^#Set\s+(.+)$/i)
      const zoneMatch = trimmed.match(/^#Zone\s+(.+)$/i)
      const spotMatch = trimmed.match(/^#Spot\s+(.+)$/i)
      if (locationMatch) worldLocationRefId = parseSequenceAnimaticTaggedIdAndTitle(locationMatch[1], '').id || locationMatch[1].trim()
      if (setMatch) setId = parseSequenceAnimaticTaggedIdAndTitle(setMatch[1], '').id || setMatch[1].trim()
      if (zoneMatch) zoneId = parseSequenceAnimaticTaggedIdAndTitle(zoneMatch[1], '').id || zoneMatch[1].trim()
      if (spotMatch) {
        const spotId = parseSequenceAnimaticTaggedIdAndTitle(spotMatch[1], '').id || spotMatch[1].trim()
        if (spotId && !spotIds.includes(spotId)) spotIds.push(spotId)
      }
    })
    const sceneDialogueRows = sceneLines.flatMap((line, localIndex) => {
      const trimmed = line.trim()
      const match = trimmed.match(/^([^:\[]+?)\s*\[ref:([^\]]+)\]\s*:\s*(.+)$/)
      if (!match) return []
      const speakerName = match[1].trim()
      const speakerRefId = match[2].trim()
      const text = match[3].trim()
      if (!speakerRefId || !text) return []
      if (knownReferenceIds.size > 0 && !knownReferenceIds.has(speakerRefId) && !/^local_|^temp_/i.test(speakerRefId)) {
        throw new Error(`Dialogue speaker ref "${speakerRefId}" in ${sceneStart.id} was not found in the animatic reference catalog.`)
      }
      return [sequenceAnimaticTaggedDialogueRowSchema.parse({
        id: `${sceneStart.id}_dialogue_${String(dialogueRows.length + localIndex + 1).padStart(3, '0')}`,
        sceneId: sceneStart.id,
        speakerName,
        speakerRefId,
        text,
        lineNumber: sceneStart.index + localIndex + 1,
      })]
    })
    dialogueRows.push(...sceneDialogueRows)
    const graphAdditionIds = [setId, zoneId, ...spotIds].filter((id) => additionsById.has(id))
    const graphAdditions = graphAdditionIds
      .map((id) => additionsById.get(id))
      .filter((addition): addition is z.infer<typeof sequenceAnimaticTaggedSceneGraphAdditionSchema> => Boolean(addition))
    return sequenceAnimaticTaggedScenePackageSchema.parse({
      sceneId: sceneStart.id,
      index: sceneIndex + 1,
      title: sceneStart.title,
      sourceText: sceneLines.join('\n').trim(),
      startLine: sceneStart.index + 1,
      endLine: nextStart,
      locationRefId: worldLocationRefId,
      worldLocationRefId,
      setId,
      zoneId,
      spotIds,
      dialogueRows: sceneDialogueRows,
      graphAdditionIds,
      graphAdditions,
      relevantReferenceIds: [...new Set([
        worldLocationRefId,
        ...sceneDialogueRows.map((row) => row.speakerRefId),
      ].filter(Boolean))],
    })
  })
  validateSequenceAnimaticTaggedSceneGraph({ additions, scenePackages, knownReferenceIds })
  const warnings = scenePackages
    .filter((scene) => !scene.setId && !scene.worldLocationRefId)
    .map((scene) => `Scene ${scene.sceneId} has no #Set or #Location tag; scene planner must bind shots to an existing world location.`)
  return sequenceAnimaticScenePackageOutputSchema.parse({
    contractVersion: input.contractVersion ?? 'scene_graph_assignment_v1',
    screenplayScenes: scenePackages,
    scenePackages,
    dialogueRows,
    sceneGraphDraft: { additions },
    warnings,
    diagnostics: [`Parsed ${scenePackages.length} tagged screenplay scene package${scenePackages.length === 1 ? '' : 's'} and ${additions.length} scene graph addition${additions.length === 1 ? '' : 's'}.`],
  })
}

export function buildFallbackSequenceAnimaticSceneGraphAssignment(parsed: SequenceAnimaticScenePackageOutput) {
  return sequenceAnimaticSceneGraphAssignmentSchema.parse({
    contractVersion: 'scene_graph_assignment_v1',
    sceneAssignments: parsed.scenePackages.map((scene) => ({
      sceneId: scene.sceneId,
      worldLocationRefId: scene.worldLocationRefId,
      setId: scene.setId,
      zoneId: scene.zoneId,
      spotIds: scene.spotIds,
      graphAdditionIds: scene.graphAdditionIds,
      relevantReferenceIds: scene.relevantReferenceIds,
      rationale: scene.worldLocationRefId || scene.setId ? 'Deterministic screenplay tag fallback.' : 'No spatial assignment was available in fallback parsing.',
    })),
    sceneGraphDraft: parsed.sceneGraphDraft,
    spotRelations: parsed.spotRelations,
    warnings: parsed.warnings,
    diagnostics: parsed.diagnostics,
  })
}

export function mergeSequenceAnimaticSceneGraphAssignment(input: {
  parsed: SequenceAnimaticScenePackageOutput
  assignment: z.infer<typeof sequenceAnimaticSceneGraphAssignmentSchema>
  assetPack: LooseRecord
  context: LooseRecord
}) {
  const knownReferenceIds = collectReferenceIdsForSequenceAnimatic({
    assetPack: input.assetPack,
    entities: readArray(input.context.entities),
    world: input.context.wiki ?? input.context.worldWiki,
  })
  const assignmentBySceneId = new Map(input.assignment.sceneAssignments.map((assignment) => [assignment.sceneId, assignment] as const))
  const additions = input.assignment.sceneGraphDraft.additions
  const additionsById = new Map(additions.map((addition) => [addition.id, addition] as const))
  const scenePackages = input.parsed.scenePackages.map((scene) => {
    const assignment = assignmentBySceneId.get(scene.sceneId)
    const worldLocationRefId = readText(assignment?.worldLocationRefId) || scene.worldLocationRefId
    const setId = readText(assignment?.setId) || scene.setId
    const zoneId = readText(assignment?.zoneId) || scene.zoneId
    const spotIds = readStringArray(assignment?.spotIds).length > 0 ? readStringArray(assignment?.spotIds) : scene.spotIds
    const graphAdditionIds = [...new Set([
      ...readStringArray(assignment?.graphAdditionIds),
      setId,
      zoneId,
      ...spotIds,
    ].filter((id) => additionsById.has(id)))]
    const graphAdditions = graphAdditionIds
      .map((id) => additionsById.get(id))
      .filter((addition): addition is z.infer<typeof sequenceAnimaticTaggedSceneGraphAdditionSchema> => Boolean(addition))
    return sequenceAnimaticTaggedScenePackageSchema.parse({
      ...scene,
      locationRefId: worldLocationRefId,
      worldLocationRefId,
      setId,
      zoneId,
      spotIds,
      graphAdditionIds,
      graphAdditions,
      relevantReferenceIds: [...new Set([
        ...scene.relevantReferenceIds,
        ...readStringArray(assignment?.relevantReferenceIds),
        worldLocationRefId,
        ...scene.dialogueRows.map((row) => row.speakerRefId),
      ].filter(Boolean))],
    })
  })
  validateSequenceAnimaticTaggedSceneGraph({ additions, scenePackages, knownReferenceIds })
  const unassignedSceneIds = scenePackages
    .filter((scene) => !scene.setId && !scene.worldLocationRefId)
    .map((scene) => scene.sceneId)
  return sequenceAnimaticScenePackageOutputSchema.parse({
    contractVersion: 'scene_graph_assignment_v1',
    screenplayScenes: scenePackages,
    scenePackages,
    dialogueRows: input.parsed.dialogueRows,
    sceneGraphDraft: { additions },
    spotRelations: input.assignment.spotRelations,
    warnings: [
      ...input.assignment.warnings,
      ...unassignedSceneIds.map((sceneId) => `Scene ${sceneId} has no assigned set or world location; scene planner must bind shots to an existing world location.`),
    ],
    diagnostics: [
      ...input.assignment.diagnostics,
      `Assigned scene graph for ${scenePackages.length} screenplay scene${scenePackages.length === 1 ? '' : 's'} and ${additions.length} graph addition${additions.length === 1 ? '' : 's'}.`,
    ],
  })
}
