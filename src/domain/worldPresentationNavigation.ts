import type { WorldView } from './worldGraph.ts'
import type { WorldThread } from './worldThread.ts'
import { getWorldViewSemanticMetadata } from './worldViewDerivation.ts'

export type WorldPresentationMode = 'world' | 'story'

export type WorldBreadcrumbSegment = {
  id: string
  label: string
  tone: 'mode' | 'view' | 'thread' | 'focus'
}

function sanitizeKeys(values: string[] | undefined | null) {
  return Array.from(new Set((values ?? []).filter((value): value is string => typeof value === 'string' && value.trim().length > 0)))
}

function scoreThreadPriority(priority: WorldThread['priority']) {
  switch (priority) {
    case 'primary':
      return 3
    case 'secondary':
      return 2
    case 'background':
      return 1
  }
}

export function sanitizePinnedNodeKeys(values: string[] | undefined | null) {
  return sanitizeKeys(values)
}

export function buildWorldBreadcrumbSegments(input: {
  mode: WorldPresentationMode
  baseViewName: string
  activeThreadTitle?: string | null
  focusLabels?: string[]
}) {
  const segments: WorldBreadcrumbSegment[] = [
    {
      id: `mode:${input.mode}`,
      label: input.mode === 'story' ? 'Story' : 'World',
      tone: 'mode',
    },
    {
      id: `view:${input.baseViewName}`,
      label: input.baseViewName,
      tone: 'view',
    },
  ]

  if (input.mode === 'story' && input.activeThreadTitle?.trim()) {
    segments.push({
      id: `thread:${input.activeThreadTitle}`,
      label: input.activeThreadTitle.trim(),
      tone: 'thread',
    })
  }

  for (const label of sanitizeKeys(input.focusLabels)) {
    segments.push({
      id: `focus:${label}`,
      label,
      tone: 'focus',
    })
  }

  return segments
}

export function chooseStoryModeThreadView(input: {
  worldViews: WorldView[]
  worldThreads: WorldThread[]
  selectedViewKey: string | null
  selectedThreadKey?: string | null
  focusRootKey?: string | null
}) {
  const openThreads = [...input.worldThreads]
    .filter((thread) => thread.status === 'open')
    .sort((left, right) => (
      scoreThreadPriority(right.priority) - scoreThreadPriority(left.priority)
      || new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    ))

  const threadViews = input.worldViews
    .filter((view) => getWorldViewSemanticMetadata(view).viewKind === 'thread_focus')

  const threadViewByThreadKey = new Map<string, WorldView>()
  for (const view of threadViews) {
    const metadata = getWorldViewSemanticMetadata(view)
    for (const threadKey of metadata.sourceThreadKeys) {
      if (!threadViewByThreadKey.has(threadKey)) {
        threadViewByThreadKey.set(threadKey, view)
      }
    }
  }

  const selectedView = input.selectedViewKey
    ? input.worldViews.find((view) => view.key === input.selectedViewKey) ?? null
    : null
  if (selectedView) {
    const metadata = getWorldViewSemanticMetadata(selectedView)
    if (metadata.viewKind === 'thread_focus') {
      const selectedThread = openThreads.find((thread) => metadata.sourceThreadKeys.includes(thread.key)) ?? null
      if (selectedThread) {
        return {
          thread: selectedThread,
          view: selectedView,
        }
      }
    }
  }

  if (input.selectedThreadKey) {
    const selectedThread = openThreads.find((thread) => thread.key === input.selectedThreadKey) ?? null
    const selectedThreadView = selectedThread ? threadViewByThreadKey.get(selectedThread.key) ?? null : null
    if (selectedThread && selectedThreadView) {
      return {
        thread: selectedThread,
        view: selectedThreadView,
      }
    }
  }

  if (input.focusRootKey) {
    const focusedThread = openThreads.find((thread) => thread.linkedEntityKeys.includes(input.focusRootKey!)) ?? null
    const focusedThreadView = focusedThread ? threadViewByThreadKey.get(focusedThread.key) ?? null : null
    if (focusedThread && focusedThreadView) {
      return {
        thread: focusedThread,
        view: focusedThreadView,
      }
    }
  }

  const fallbackThread = openThreads.find((thread) => threadViewByThreadKey.has(thread.key)) ?? null
  return {
    thread: fallbackThread,
    view: fallbackThread ? threadViewByThreadKey.get(fallbackThread.key) ?? null : null,
  }
}
