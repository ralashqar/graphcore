import { useCallback, useMemo } from 'react'

import type {
  OutputArtifact,
  OutputRequest,
  OutputRequestStatusProjection,
  OutputWorkflowNode,
  OutputWorkflowRun,
} from '../../domain/outputWorkflow'
import { buildWorkflowProgressViewModel, type WorkflowProgressViewModel } from '../../domain/workflowProgressView'

function updatedAtMs(value: { updatedAt?: string | null; createdAt?: string | null }) {
  return Date.parse(value.updatedAt || value.createdAt || '') || 0
}

function pushMapEntry<T>(map: Map<string, T[]>, key: string | null | undefined, value: T) {
  if (!key) return
  const entries = map.get(key)
  if (entries) {
    entries.push(value)
  } else {
    map.set(key, [value])
  }
}

export function useWorkflowProgressLookup(input: {
  requests: OutputRequest[]
  runs: OutputWorkflowRun[]
  artifacts: OutputArtifact[]
  nodes: OutputWorkflowNode[]
  projectionForRequest?: (request: OutputRequest) => OutputRequestStatusProjection | null
}) {
  const { artifacts, nodes, projectionForRequest, requests, runs } = input
  const requestById = useMemo(() => new Map(requests.map((request) => [request.id, request])), [requests])
  const runById = useMemo(() => new Map(runs.map((run) => [run.id, run])), [runs])
  const runsByWorkflowId = useMemo(() => {
    const map = new Map<string, OutputWorkflowRun[]>()
    for (const run of runs) pushMapEntry(map, run.workflowId, run)
    for (const runs of map.values()) runs.sort((left, right) => updatedAtMs(right) - updatedAtMs(left))
    return map
  }, [runs])
  const artifactsByWorkflowId = useMemo(() => {
    const map = new Map<string, OutputArtifact[]>()
    for (const artifact of artifacts) pushMapEntry(map, artifact.workflowId, artifact)
    return map
  }, [artifacts])
  const artifactsByRunId = useMemo(() => {
    const map = new Map<string, OutputArtifact[]>()
    for (const artifact of artifacts) pushMapEntry(map, artifact.runId, artifact)
    return map
  }, [artifacts])
  const nodesByWorkflowId = useMemo(() => {
    const map = new Map<string, OutputWorkflowNode[]>()
    for (const node of nodes) pushMapEntry(map, node.workflowId, node)
    return map
  }, [nodes])

  return useCallback((
    requestId: string | null | undefined,
    fallbackTitle?: string,
    fallbackActiveLabel?: string,
  ): WorkflowProgressViewModel | null => {
    const request = requestId ? requestById.get(requestId) ?? null : null
    if (!request) return null
    const run = request.latestRunId
      ? runById.get(request.latestRunId) ?? null
      : request.workflowId
        ? runsByWorkflowId.get(request.workflowId)?.[0] ?? null
        : null
    const artifacts = [
      ...(request.workflowId ? artifactsByWorkflowId.get(request.workflowId) ?? [] : []),
      ...(run?.id ? artifactsByRunId.get(run.id) ?? [] : []),
    ].filter((artifact, index, array) => array.findIndex((candidate) => candidate.id === artifact.id) === index)
    const nodes = request.workflowId ? nodesByWorkflowId.get(request.workflowId) ?? [] : []
    return buildWorkflowProgressViewModel({
      projection: projectionForRequest?.(request) ?? null,
      request,
      run,
      artifacts,
      nodes,
      fallbackTitle,
      fallbackActiveLabel,
    })
  }, [
    artifactsByRunId,
    artifactsByWorkflowId,
    nodesByWorkflowId,
    projectionForRequest,
    requestById,
    runById,
    runsByWorkflowId,
  ])
}
