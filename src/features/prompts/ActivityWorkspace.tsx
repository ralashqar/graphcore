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

  return (
    <div className="focus-layout prompts-layout">
      <aside className="focus-rail">
        <div className="rail-section">
          <span className="section-label">Activity</span>
          <div className="rail-list">
            {patchHistory.map((patch, index) => (
              <button key={`${patch.id}-${index}`} className={index === selectedPatchIndex ? 'rail-button is-active' : 'rail-button'} onClick={() => onSelectPatch(index)} type="button">
                <strong>{patch.requestSummary ?? patch.summary}</strong>
                <span>{patch.status}</span>
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
              {selectedWorldBuild ? <span className="chip">{selectedWorldBuild.jobs.length} jobs</span> : <span className="chip">{selectedPatch.operations.length} operations</span>}
              {selectedPatch.executionPlan ? <span className="chip">{selectedPatch.executionPlan.classification}</span> : null}
            </div>
            {selectedPatch.assistantNotes ? <div className="inline-note">{selectedPatch.assistantNotes}</div> : null}
            {selectedWorldBuild ? (
              <div className="editor-section compact-section">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">World Build Plan</span>
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
            {selectedWorldBuild ? (
              <div className="editor-section compact-section">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">Jobs</span>
                    <h3>{selectedWorldBuild.jobs.length} job{selectedWorldBuild.jobs.length === 1 ? '' : 's'}</h3>
                  </div>
                </div>
                <div className="diagnostic-stack">
                  {selectedWorldBuild.jobs.map((job) => (
                    <div key={job.id} className="inline-note">
                      <strong>{job.kind}</strong>
                      <span> {job.status}{job.errorMessage ? ` - ${job.errorMessage}` : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {selectedWorldBuild ? (
              <div className="editor-section compact-section">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">Batch Diagnostics</span>
                    <h3>{selectedWorldBuild.diagnostics.length} note{selectedWorldBuild.diagnostics.length === 1 ? '' : 's'}</h3>
                  </div>
                </div>
                <div className="diagnostic-stack">
                  {selectedWorldBuild.diagnostics.length === 0 ? <div className="inline-note">No batch diagnostics.</div> : null}
                  {selectedWorldBuild.diagnostics.map((diagnostic, index) => (
                    <div key={`${diagnostic}-${index}`} className="inline-note">{diagnostic}</div>
                  ))}
                </div>
              </div>
            ) : null}
            {selectedPatch.executionPlan ? (
              <div className="editor-section compact-section">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">Execution Plan</span>
                    <h3>{selectedPatch.executionPlan.graphJobCount} graph job{selectedPatch.executionPlan.graphJobCount === 1 ? '' : 's'}</h3>
                  </div>
                </div>
                <div className="diagnostic-stack">
                  <div className="inline-note">Dependencies: {selectedPatch.executionPlan.dependencyKinds.length > 0 ? selectedPatch.executionPlan.dependencyKinds.join(', ') : 'none'}</div>
                  {selectedPatch.executionPlan.graphJobs.map((job, index) => (
                    <div key={`${job.title}-${index}`} className="inline-note">{job.title}: {job.prompt}</div>
                  ))}
                </div>
              </div>
            ) : null}
            {selectedPatch.activityEntries && selectedPatch.activityEntries.length > 0 ? (
              <div className="editor-section compact-section">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">Run Log</span>
                    <h3>{selectedPatch.activityEntries.length} step{selectedPatch.activityEntries.length === 1 ? '' : 's'}</h3>
                  </div>
                </div>
                <div className="diagnostic-stack">
                  {selectedPatch.activityEntries.map((entry, index) => (
                    <div key={`${entry.phase}-${index}`} className="inline-note"><strong>{entry.title}</strong><span> {entry.detail ?? entry.phase}</span></div>
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
            <div className="diagnostic-stack">
              {selectedPatch.diagnostics.length === 0 ? <div className="inline-note">No diagnostics were returned for this activity.</div> : null}
              {selectedPatch.diagnostics.map((diagnostic, index) => <div key={`${diagnostic}-${index}`} className="inline-note">{diagnostic}</div>)}
            </div>
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
