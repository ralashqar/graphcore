import type { ReactNode } from 'react'
import type { PatchOperation } from '../../domain/graphcore'
import { describePatchOperation, groupPatchOperations } from '../../domain/patchUtils'
import type { PatchSessionView } from '../../shared/workspace'

type ActivityWorkspaceProps = {
  patchHistory: PatchSessionView[]
  selectedPatch: PatchSessionView | null
  selectedPatchIndex: number
  onSelectPatch: (index: number) => void
}

export function ActivityWorkspace({
  patchHistory,
  selectedPatch,
  selectedPatchIndex,
  onSelectPatch,
}: ActivityWorkspaceProps) {
  const groupedOperations = selectedPatch ? groupPatchOperations(selectedPatch.operations) : null
  const selectedWorldBuild = selectedPatch?.worldBuildBatch ?? null
  const selectedWorldPromptTurn = selectedPatch?.worldPromptTurn ?? null
  const selectedCinematicJob = selectedWorldBuild?.jobs.find((job) => job.kind === 'cinematic_graph') ?? null
  const authoringDiagnosticEntries =
    selectedCinematicJob?.resultContext && typeof selectedCinematicJob.resultContext === 'object' && Array.isArray(selectedCinematicJob.resultContext.authoringDiagnosticEntries)
      ? selectedCinematicJob.resultContext.authoringDiagnosticEntries as Array<{
          scope?: string
          shotId?: string | null
          category?: string
          message?: string
          severity?: string
        }>
      : []
  const groupedAuthoringDiagnosticEntries = Array.from(
    authoringDiagnosticEntries.reduce((map, entry) => {
      const key = entry.shotId ? `shot:${entry.shotId}` : 'graph'
      const current = map.get(key) ?? []
      current.push(entry)
      map.set(key, current)
      return map
    }, new Map<string, typeof authoringDiagnosticEntries>()),
  )

  return (
    <div className="focus-layout prompts-layout">
      <aside className="focus-rail">
        <div className="rail-section">
          <div className="section-heading">
            <span className="section-label">History</span>
            <div className="inline-note">Resume, inspect, or replay prior work without reopening every diagnostic at once.</div>
          </div>
          <div className="rail-list">
            {patchHistory.map((patch, index) => (
              <button key={`${patch.id}-${index}`} className={index === selectedPatchIndex ? 'rail-button is-active' : 'rail-button'} onClick={() => onSelectPatch(index)} type="button">
                <strong>{patch.requestSummary ?? patch.summary}</strong>
                <span>{patch.worldPromptTurn ? 'world prompt' : patch.worldBuildBatch ? 'world build' : patch.status}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>
      <section className="main-surface detail-surface">
        {selectedPatch ? (
          <div className="detail-stack">
            <span className="eyebrow">Activity Entry</span>
            <h2>{selectedPatch.requestSummary ?? selectedPatch.summary}</h2>
            <p className="subtle-line">{selectedPatch.prompt}</p>
            <div className="chip-row">
              <span className="chip">{selectedPatch.status}</span>
              {selectedWorldBuild ? <span className="chip">{selectedWorldBuild.jobs.length} jobs</span> : selectedWorldPromptTurn ? <span className="chip">world prompt</span> : <span className="chip">{selectedPatch.operations.length} operations</span>}
              {selectedPatch.executionPlan ? <span className="chip">{selectedPatch.executionPlan.classification}</span> : null}
            </div>
            {selectedPatch.assistantNotes ? <div className="inline-note">{selectedPatch.assistantNotes}</div> : null}
            {selectedWorldPromptTurn ? (
              <div className="editor-section compact-section">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">World Prompt Turn</span>
                    <h3>{selectedWorldPromptTurn.status}</h3>
                  </div>
                </div>
                <div className="diagnostic-stack">
                  <div className="inline-note"><strong>Model</strong><span> {selectedWorldPromptTurn.model}</span></div>
                  <div className="inline-note"><strong>Approval</strong><span> {selectedWorldPromptTurn.approvalState}</span></div>
                  {selectedWorldPromptTurn.assistantSummary ? <div className="inline-note"><strong>Summary</strong><span> {selectedWorldPromptTurn.assistantSummary}</span></div> : null}
                  {selectedWorldPromptTurn.errorMessage ? <div className="inline-note"><strong>Error</strong><span> {selectedWorldPromptTurn.errorMessage}</span></div> : null}
                </div>
              </div>
            ) : null}
            {selectedWorldBuild ? (
              <div className="editor-section compact-section">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">{selectedWorldBuild.plannerMode === 'direct_asset_generation' ? 'Asset Generation Job' : 'World Build Plan'}</span>
                    <h3>{selectedWorldBuild.planItems.length} item{selectedWorldBuild.planItems.length === 1 ? '' : 's'}</h3>
                  </div>
                </div>
                {selectedWorldBuild.plannerMode === 'cinematic_build' && selectedWorldBuild.cinematicPlan ? (
                  <div className="diagnostic-stack">
                    <div className="inline-note">
                      <strong>Matched existing</strong>
                      <span> {(selectedWorldBuild.cinematicPlan.entityRefs ?? []).filter((entry) => entry.resolution === 'existing').map((entry) => entry.sourceName).join(', ') || 'none'}</span>
                    </div>
                    <div className="inline-note">
                      <strong>Created first</strong>
                      <span> {(selectedWorldBuild.cinematicPlan.entityRefs ?? []).filter((entry) => entry.resolution === 'create').map((entry) => entry.sourceName).join(', ') || 'none'}</span>
                    </div>
                    <div className="inline-note">
                      <strong>Shots</strong>
                      <span> {(selectedWorldBuild.cinematicPlan.shots ?? []).map((entry) => entry.title).join(', ') || 'none'}</span>
                    </div>
                    <div className="inline-note">
                      <strong>Relationships</strong>
                      <span> {(selectedWorldBuild.cinematicPlan.relationshipRefs ?? []).map((entry) => entry.type).join(', ') || 'none'}</span>
                    </div>
                    <div className="inline-note">
                      <strong>Composite refs</strong>
                      <span> {(selectedWorldBuild.cinematicPlan.compositeRefPlans ?? []).map((entry) => entry.title).join(', ') || 'none'}</span>
                    </div>
                    <div className="inline-note">
                      <strong>Storyboard</strong>
                      <span> {selectedWorldBuild.cinematicPlan.storyboardPlan?.mode ?? 'none'}</span>
                    </div>
                    {!selectedWorldBuild.cinematicPlan.scriptDoc ? (
                      <div className="inline-note">
                        <strong>Script</strong>
                        <span> planned as a shot skeleton and authored explicitly later</span>
                      </div>
                    ) : null}
                    {selectedWorldBuild.cinematicPlan.scriptDoc ? (
                      <div className="editor-section compact-section">
                        <div className="section-head">
                          <div>
                            <span className="eyebrow">Script</span>
                            <h3>{selectedWorldBuild.cinematicPlan.scriptDoc.title || 'Generated Script'}</h3>
                          </div>
                        </div>
                        {selectedWorldBuild.cinematicPlan.scriptDoc.logline ? <div className="inline-note">{selectedWorldBuild.cinematicPlan.scriptDoc.logline}</div> : null}
                        <div className="diagnostic-stack">
                          {(selectedWorldBuild.cinematicPlan.scriptDoc.scenes ?? []).map((scene) => (
                            <div key={scene.id} className="inline-note">
                              <strong>{scene.title}</strong>
                              <span> {(scene.shotIds?.length ?? 0)} shot{(scene.shotIds?.length ?? 0) === 1 ? '' : 's'}</span>
                            </div>
                          ))}
                          {(selectedWorldBuild.cinematicPlan.scriptDoc.shots ?? []).map((shot) => (
                            <div key={shot.id} className="inline-note">
                              <strong>{shot.title}</strong>
                              <span> {(shot.dialogue?.length ?? 0)} dialogue, {(shot.actions?.length ?? 0)} action, {(shot.audio?.length ?? 0)} audio cue{(shot.audio?.length ?? 0) === 1 ? '' : 's'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="diagnostic-stack">
                  {selectedWorldBuild.planItems.map((item) => (
                    <div key={item.id} className="inline-note">
                      <strong>{item.name}</strong>
                      <span> {item.kind} {item.enabled ? '' : '(disabled)'}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {!selectedWorldBuild ? (
              <div className="prompt-review-grid">
                {groupedOperations && groupedOperations.graphs.length > 0 ? <PatchGroup title="Graphs" operations={groupedOperations.graphs} /> : null}
                {groupedOperations && groupedOperations.nodesAndEdges.length > 0 ? <PatchGroup title="Nodes and edges" operations={groupedOperations.nodesAndEdges} /> : null}
                {groupedOperations && groupedOperations.definitions.length > 0 ? <PatchGroup title="Definitions" operations={groupedOperations.definitions} /> : null}
              </div>
            ) : null}
            {selectedWorldBuild ? (
              <ActivityDisclosure title="Jobs" summary={`${selectedWorldBuild.jobs.length} background item${selectedWorldBuild.jobs.length === 1 ? '' : 's'}`}>
                <div className="diagnostic-stack">
                  {selectedWorldBuild.jobs.map((job) => (
                    <div key={job.id} className="inline-note">
                      <strong>{job.kind}</strong>
                      <span> {job.status}{job.resultContext && typeof job.resultContext === 'object' && typeof job.resultContext.phase === 'string' ? ` / ${job.resultContext.phase}` : ''}{job.resultContext && typeof job.resultContext === 'object' && Array.isArray(job.resultContext.qualityHardFailures) ? ` / hard ${job.resultContext.qualityHardFailures.length}` : ''}{job.resultContext && typeof job.resultContext === 'object' && Array.isArray(job.resultContext.qualitySoftFailures) ? ` / soft ${job.resultContext.qualitySoftFailures.length}` : ''}{job.errorMessage ? ` - ${job.errorMessage}` : ''}</span>
                    </div>
                  ))}
                </div>
              </ActivityDisclosure>
            ) : null}
            {selectedWorldBuild ? (
              <ActivityDisclosure title="Authorship Diagnostics" summary={`${authoringDiagnosticEntries.length} authored issue${authoringDiagnosticEntries.length === 1 ? '' : 's'}`}>
                <div className="diagnostic-stack">
                  {selectedCinematicJob?.resultContext && typeof selectedCinematicJob.resultContext === 'object' && typeof selectedCinematicJob.resultContext.authorshipModelUsed === 'string' ? (
                    <div className="inline-note">
                      <strong>Authorship model</strong>
                      <span> {selectedCinematicJob.resultContext.authorshipModelUsed}{typeof selectedCinematicJob.resultContext.authorshipModelTier === 'string' ? ` / ${selectedCinematicJob.resultContext.authorshipModelTier}` : ''}{typeof selectedCinematicJob.resultContext.correctedFormatSubtype === 'string' ? ` / subtype ${selectedCinematicJob.resultContext.correctedFormatSubtype}` : ''}</span>
                    </div>
                  ) : null}
                  {authoringDiagnosticEntries.length === 0 ? <div className="inline-note">No authored-script diagnostics.</div> : null}
                  {groupedAuthoringDiagnosticEntries.map(([groupKey, entries]) => (
                    <div key={groupKey} className="inline-note">
                      <strong>{groupKey === 'graph' ? 'Graph' : groupKey.replace(/^shot:/, 'Shot ')}</strong>
                      <span> {entries.map((entry) => `${entry.category ?? 'issue'}${entry.severity ? ` / ${entry.severity}` : ''}: ${entry.message ?? ''}`).join(' | ')}</span>
                    </div>
                  ))}
                </div>
              </ActivityDisclosure>
            ) : null}
            {selectedWorldBuild ? (
              <ActivityDisclosure title="Batch Diagnostics" summary={`${selectedWorldBuild.diagnostics.length} diagnostic note${selectedWorldBuild.diagnostics.length === 1 ? '' : 's'}`}>
                <div className="diagnostic-stack">
                  {selectedWorldBuild.diagnostics.length === 0 ? <div className="inline-note">No batch diagnostics.</div> : null}
                  {selectedWorldBuild.diagnostics.map((diagnostic, index) => (
                    <div key={`${diagnostic}-${index}`} className="inline-note">{diagnostic}</div>
                  ))}
                </div>
              </ActivityDisclosure>
            ) : null}
            {selectedPatch.executionPlan ? (
              <ActivityDisclosure title="Execution Plan" summary={`${selectedPatch.executionPlan.graphJobCount} graph job${selectedPatch.executionPlan.graphJobCount === 1 ? '' : 's'}`}>
                <div className="diagnostic-stack">
                  <div className="inline-note">Dependencies: {selectedPatch.executionPlan.dependencyKinds.length > 0 ? selectedPatch.executionPlan.dependencyKinds.join(', ') : 'none'}</div>
                  {selectedPatch.executionPlan.graphJobs.map((job, index) => (
                    <div key={`${job.title}-${index}`} className="inline-note">{job.title}: {job.prompt}</div>
                  ))}
                </div>
              </ActivityDisclosure>
            ) : null}
            {selectedPatch.activityEntries && selectedPatch.activityEntries.length > 0 ? (
              <ActivityDisclosure title="Run Log" summary={`${selectedPatch.activityEntries.length} streamed step${selectedPatch.activityEntries.length === 1 ? '' : 's'}`}>
                <div className="diagnostic-stack">
                  {selectedPatch.activityEntries.map((entry, index) => (
                    <div key={`${entry.phase}-${index}`} className="inline-note"><strong>{entry.title}</strong><span> {entry.detail ?? entry.phase}</span></div>
                  ))}
                </div>
              </ActivityDisclosure>
            ) : null}
            <ActivityDisclosure title="Diagnostics" summary={selectedPatch.diagnostics.length === 0 ? 'No diagnostics returned' : `${selectedPatch.diagnostics.length} diagnostic item${selectedPatch.diagnostics.length === 1 ? '' : 's'}`}>
              <div className="diagnostic-stack">
                {selectedPatch.diagnostics.length === 0 ? <div className="inline-note">No diagnostics were returned for this activity.</div> : null}
                {selectedPatch.diagnostics.map((diagnostic, index) => <div key={`${diagnostic}-${index}`} className="inline-note">{diagnostic}</div>)}
              </div>
            </ActivityDisclosure>
          </div>
        ) : null}
      </section>
    </div>
  )
}

function PatchGroup({ operations, title }: { operations: PatchOperation[]; title: string }) {
  return (
    <div className="editor-section compact-section">
      <div className="section-head">
        <div>
          <span className="eyebrow">{title}</span>
          <h3>{operations.length} change{operations.length === 1 ? '' : 's'}</h3>
        </div>
      </div>
      <div className="diagnostic-stack">
        {operations.map((operation, index) => <div key={`${operation.op}-${index}`} className="inline-note">{describePatchOperation(operation)}</div>)}
      </div>
    </div>
  )
}

function ActivityDisclosure({
  children,
  summary,
  title,
}: {
  children: ReactNode
  summary: string
  title: string
}) {
  return (
    <details className="activity-disclosure">
      <summary className="activity-disclosure-summary">
        <div>
          <span className="eyebrow">Details</span>
          <h3>{title}</h3>
        </div>
        <span>{summary}</span>
      </summary>
      <div className="activity-disclosure-body">
        {children}
      </div>
    </details>
  )
}
