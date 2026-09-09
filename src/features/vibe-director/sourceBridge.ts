import type { ProjectSnapshot } from '../../domain/graphcore'
import { directorSettingsSchema } from '../../domain/directorWorkspace'
import { parseVibeDirectorSession } from '../../domain/vibeDirector'

const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const text = (v: unknown) => typeof v === 'string' ? v : ''
export type DirectorSource = { id: string; title: string; script: string; sequenceKey?: string; requestId?: string; shotId?: string }
function artifactScript(value: unknown): string {
  const m = record(value)
  for (const key of ['screenplay', 'text', 'markdown', 'scriptText', 'script']) if (typeof m[key] === 'string' && m[key]) return m[key] as string
  for (const key of ['screenplayDraft', 'creativeScreenplay', 'scriptArtifact']) {
    const child = record(m[key]); const found = text(child.text) || text(child.markdown) || text(child.screenplay)
    if (found) return found
  }
  return ''
}
export function directorSources(snapshot: ProjectSnapshot): DirectorSource[] {
  const sequences = snapshot.worldEntities.filter(e => e.nodeType === 'sequence_unit').map(e => ({ id: `sequence:${e.key}`, title: e.name, script: [e.summary, text(record(e.metadata).synopsis)].filter(Boolean).join('\n'), sequenceKey: e.key }))
  const outputs = snapshot.outputRequests.filter(r => r.outputKind.includes('cinematic') || r.targetFormat === 'video').map(r => ({ id: `output:${r.id}`, title: r.title, requestId: r.id, script: snapshot.outputArtifacts.filter(a => a.workflowId === r.workflowId).map(a => artifactScript(a.metadata)).find(Boolean) || artifactScript(r.metadata) || r.prompt }))
  const shots: DirectorSource[] = []
  for (const artifact of snapshot.outputArtifacts) {
    const metadata = record(artifact.metadata)
    const plan = record(metadata.shotPlan ?? metadata.directorPlan ?? metadata.scenePlan)
    const entries = Array.isArray(plan.shots) ? plan.shots : Array.isArray(metadata.shots) ? metadata.shots : []
    for (const value of entries) {
      const shot = record(value); const id = text(shot.id) || text(shot.shotId)
      if (!id || shots.some(s => s.shotId === id)) continue
      const request = snapshot.outputRequests.find(r => r.workflowId === artifact.workflowId)
      shots.push({ id: `shot:${artifact.id}:${id}`, title: text(shot.title) || `Shot ${id}`, shotId: id, requestId: request?.id, script: [text(shot.action), text(shot.description), text(shot.dialogue), text(shot.camera)].filter(Boolean).join('\n') })
    }
  }
  return [...shots, ...outputs, ...sequences]
}
export function legacyDirectorImport(snapshot: ProjectSnapshot) {
  let local: unknown = null
  try { local = JSON.parse(localStorage.getItem(`graphcore:vibe-director:${snapshot.project.id}:${snapshot.draft.id}`) ?? 'null') } catch { /* malformed local preferences are not imported */ }
  const candidate = parseVibeDirectorSession(record(snapshot.draft.metadata).vibeDirector) ?? parseVibeDirectorSession(local)
  if (!candidate) return null
  return { title: 'Previous directing session', source: { sequenceKey: candidate.selectedSequenceUnitKey ?? undefined, requestId: candidate.cinematicMasterRequestId ?? undefined, script: candidate.premise, legacyImported: true }, entityKeys: candidate.approvedReferenceEntityKeys.filter(key => snapshot.worldEntities.some(e => e.key === key)), settings: directorSettingsSchema.parse({}), direction: candidate.directingNotes.global || candidate.premise }
}
