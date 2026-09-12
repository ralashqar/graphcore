import type { ProjectSnapshot } from '../../domain/graphcore'
import { directorSettingsSchema } from '../../domain/directorWorkspace'
import { parseVibeDirectorSession } from '../../domain/vibeDirector'

const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const text = (v: unknown) => typeof v === 'string' ? v : ''

export type DirectorSourceKind = 'shot' | 'output' | 'sequence'
export type DirectorSource = {
  id: string
  kind: DirectorSourceKind
  title: string
  /** Short secondary line for cards: scene name, request title or sequence type. */
  subtitle: string
  script: string
  sequenceKey?: string
  requestId?: string
  shotId?: string
  sceneId?: string
}

function artifactScript(value: unknown): string {
  const m = record(value)
  for (const key of ['screenplay', 'text', 'markdown', 'scriptText', 'script']) if (typeof m[key] === 'string' && m[key]) return m[key] as string
  for (const key of ['screenplayDraft', 'creativeScreenplay', 'scriptArtifact']) {
    const child = record(m[key])
    const found = text(child.text) || text(child.markdown) || text(child.screenplay)
    if (found) return found
  }
  return ''
}

/** First ~2 lines of a script for card previews. */
export function sourceExcerpt(script: string, max = 180) {
  const compact = script.replace(/\s+/g, ' ').trim()
  return compact.length > max ? `${compact.slice(0, max - 1).trimEnd()}…` : compact
}

export function directorSources(snapshot: ProjectSnapshot): DirectorSource[] {
  const sequences: DirectorSource[] = snapshot.worldEntities
    .filter((e) => e.nodeType === 'sequence_unit')
    .map((e) => ({ id: `sequence:${e.key}`, kind: 'sequence', title: e.name, subtitle: 'Story sequence', script: [e.summary, text(record(e.metadata).synopsis)].filter(Boolean).join('\n'), sequenceKey: e.key }))
  const outputs: DirectorSource[] = snapshot.outputRequests
    .filter((r) => r.outputKind.includes('cinematic') || r.targetFormat === 'video')
    .map((r) => ({
      id: `output:${r.id}`,
      kind: 'output',
      title: r.title,
      subtitle: 'Cinematic screenplay',
      requestId: r.id,
      script: snapshot.outputArtifacts.filter((a) => a.workflowId === r.workflowId).map((a) => artifactScript(a.metadata)).find(Boolean) || artifactScript(r.metadata) || r.prompt,
    }))
  const shots: DirectorSource[] = []
  for (const artifact of snapshot.outputArtifacts) {
    const metadata = record(artifact.metadata)
    const plan = record(metadata.shotPlan ?? metadata.directorPlan ?? metadata.scenePlan)
    const entries = Array.isArray(plan.shots) ? plan.shots : Array.isArray(metadata.shots) ? metadata.shots : []
    const request = snapshot.outputRequests.find((r) => r.workflowId === artifact.workflowId)
    for (const value of entries) {
      const shot = record(value)
      const id = text(shot.id) || text(shot.shotId)
      if (!id || shots.some((s) => s.shotId === id)) continue
      const sceneId = text(shot.sceneId) || text(metadata.sceneId) || id.replace(/_shot_\d+$/i, '')
      shots.push({
        id: `shot:${artifact.id}:${id}`,
        kind: 'shot',
        title: text(shot.title) || `Shot ${id}`,
        subtitle: [text(shot.sceneTitle) || (sceneId && sceneId !== id ? sceneId.replace(/[_-]+/g, ' ') : ''), request?.title].filter(Boolean).join(' · ') || 'Shot',
        shotId: id,
        sceneId: sceneId || undefined,
        requestId: request?.id,
        script: [text(shot.action), text(shot.description), text(shot.dialogue), text(shot.camera)].filter(Boolean).join('\n'),
      })
    }
  }
  return [...shots, ...outputs, ...sequences]
}

export function sourceFromSession(sources: DirectorSource[], source: Record<string, unknown> | undefined) {
  if (!source) return undefined
  const shotId = text(source.shotId)
  const requestId = text(source.requestId)
  const sequenceKey = text(source.sequenceKey)
  return sources.find((s) => (shotId ? s.shotId === shotId : requestId ? s.kind === 'output' && s.requestId === requestId : sequenceKey ? s.sequenceKey === sequenceKey : false))
}

export function legacyDirectorImport(snapshot: ProjectSnapshot) {
  let local: unknown = null
  try { local = JSON.parse(localStorage.getItem(`graphcore:vibe-director:${snapshot.project.id}:${snapshot.draft.id}`) ?? 'null') } catch { /* malformed local preferences are not imported */ }
  const candidate = parseVibeDirectorSession(record(snapshot.draft.metadata).vibeDirector) ?? parseVibeDirectorSession(local)
  if (!candidate) return null
  return {
    title: 'Previous directing session',
    source: { sequenceKey: candidate.selectedSequenceUnitKey ?? undefined, requestId: candidate.cinematicMasterRequestId ?? undefined, script: candidate.premise, legacyImported: true },
    entityKeys: candidate.approvedReferenceEntityKeys.filter((key) => snapshot.worldEntities.some((e) => e.key === key)),
    settings: directorSettingsSchema.parse({}),
    direction: candidate.directingNotes.global || candidate.premise,
  }
}
