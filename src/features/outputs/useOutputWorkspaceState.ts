import { useCallback, useEffect, useState } from 'react'

import type { ProjectSnapshot } from '../../domain/graphcore'
import type {
  OutputWorkflowRun,
  OutputWorkflowRunScope,
} from '../../domain/outputWorkflow'

export type OutputWorkspaceMode = 'workflows' | 'cinematics'
export type OutputPresetMode = 'ebook' | 'comic'
export type OutputInspectorMode = 'output' | 'script' | 'guidance' | 'usage' | 'metadata'
export type OutputUpgradeMode = 'graph' | 'cover' | 'pdf'
export type OutputImageQualityChoice = 'preset' | 'low' | 'medium' | 'high'
export type OutputImageFormatChoice = 'preset' | 'png' | 'jpeg' | 'webp'

export function useOutputWorkspaceState(snapshot: ProjectSnapshot) {
  const [mode, setMode] = useState<OutputWorkspaceMode>('workflows')
  const [outputPreset, setOutputPreset] = useState<OutputPresetMode>('ebook')
  const [prompt, setPrompt] = useState('Turn this world into a polished ebook PDF with chapters from the sequence units.')
  const [comicPrompt, setComicPrompt] = useState('Create a polished comic issue from the selected sequence unit, with clear page storytelling, readable lettering, and consistent character art.')
  const [selectedComicSequenceKey, setSelectedComicSequenceKey] = useState('')
  const [comicPageCount, setComicPageCount] = useState(8)
  const [requestImageQuality, setRequestImageQuality] = useState<OutputImageQualityChoice>('preset')
  const [requestImageOutputFormat, setRequestImageOutputFormat] = useState<OutputImageFormatChoice>('preset')
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(snapshot.outputRequests[0]?.id ?? null)
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeRunId, setActiveRunId] = useState<string | null>(snapshot.outputWorkflowRuns[0]?.id ?? null)
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null)
  const [inspectorMode, setInspectorMode] = useState<OutputInspectorMode>('output')
  const [usageBreakdownOpen, setUsageBreakdownOpen] = useState(false)
  const [targetedNodeKey, setTargetedNodeKey] = useState<string | null>(null)
  const [targetedNodeKeys, setTargetedNodeKeys] = useState<string[]>([])
  const [targetedRunScope, setTargetedRunScope] = useState<OutputWorkflowRunScope | null>(null)
  const [graphOpen, setGraphOpen] = useState(false)
  const [refreshingGraph, setRefreshingGraph] = useState(false)
  const [downloadingArtifactKey, setDownloadingArtifactKey] = useState<string | null>(null)
  const [upgradeMode, setUpgradeMode] = useState<OutputUpgradeMode | null>(null)
  const [liveRunsById, setLiveRunsById] = useState<Record<string, OutputWorkflowRun>>({})

  useEffect(() => {
    setLiveRunsById((current) => {
      let changed = false
      const next = { ...current }
      for (const run of snapshot.outputWorkflowRuns) {
        const existing = next[run.id]
        if (existing && existing.updatedAt !== run.updatedAt) {
          next[run.id] = run
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [snapshot.outputWorkflowRuns])

  useEffect(() => {
    setTargetedNodeKey((current) => current && targetedNodeKeys.includes(current) ? current : targetedNodeKeys[0] ?? null)
    if (targetedNodeKeys.length === 0) setTargetedRunScope(null)
  }, [targetedNodeKeys])

  const rememberLiveRun = useCallback((run: OutputWorkflowRun) => {
    setLiveRunsById((current) => ({ ...current, [run.id]: run }))
  }, [])

  return {
    activeRunId,
    busy,
    busyRequestId,
    comicPageCount,
    comicPrompt,
    downloadingArtifactKey,
    error,
    graphOpen,
    inspectorMode,
    liveRunsById,
    mode,
    outputPreset,
    prompt,
    refreshingGraph,
    rememberLiveRun,
    requestImageOutputFormat,
    requestImageQuality,
    selectedComicSequenceKey,
    selectedNodeKey,
    selectedRequestId,
    setActiveRunId,
    setBusy,
    setBusyRequestId,
    setComicPageCount,
    setComicPrompt,
    setDownloadingArtifactKey,
    setError,
    setGraphOpen,
    setInspectorMode,
    setMode,
    setOutputPreset,
    setPrompt,
    setRefreshingGraph,
    setRequestImageOutputFormat,
    setRequestImageQuality,
    setSelectedComicSequenceKey,
    setSelectedNodeKey,
    setSelectedRequestId,
    setTargetedNodeKey,
    setTargetedNodeKeys,
    setTargetedRunScope,
    setUpgradeMode,
    setUsageBreakdownOpen,
    targetedNodeKey,
    targetedNodeKeys,
    targetedRunScope,
    upgradeMode,
    usageBreakdownOpen,
  }
}
