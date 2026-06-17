import { useCallback, useMemo, useState } from 'react'

import { workspaceService } from '../../application/services/workspaceService'
import type { ProjectSnapshot } from '../../domain/graphcore'
import type { WorkflowCommandInput, WorkflowCommandProxyResponse } from '../../domain/workflowCommandRegistry'

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function commandBusyKey(command: Omit<WorkflowCommandInput, 'projectId' | 'draftId'>) {
  const scope = command.scope
  const shotIds = readStringArray(scope.shotIds)
  const nodeIds = readStringArray(scope.nodeIds)
  return [
    command.family,
    command.action,
    scope.masterRequestId,
    scope.sceneId ?? '',
    scope.zoneId ?? scope.setId ?? scope.scopeNodeId ?? '',
    scope.shotId ?? shotIds.join(','),
    nodeIds.join(','),
  ].join(':')
}

export function useWorkflowCommand(input: {
  snapshot: ProjectSnapshot
  onStarted?: (response: WorkflowCommandProxyResponse) => void
  onError?: (error: Error) => void
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const startCommand = useCallback(async (command: Omit<WorkflowCommandInput, 'projectId' | 'draftId'>) => {
    const key = commandBusyKey(command)
    setBusyKey(key)
    setError(null)
    try {
      const response = await workspaceService.startWorkflowCommand(input.snapshot, command)
      input.onStarted?.(response)
      return response
    } catch (caught) {
      const normalized = caught instanceof Error ? caught : new Error(String(caught))
      setError(normalized.message)
      input.onError?.(normalized)
      throw normalized
    } finally {
      setBusyKey((current) => current === key ? null : current)
    }
  }, [input])

  return useMemo(() => ({
    busy: Boolean(busyKey),
    busyKey,
    error,
    startCommand,
  }), [busyKey, error, startCommand])
}
