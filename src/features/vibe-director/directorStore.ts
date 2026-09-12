import { create } from 'zustand'
import { directorSettingsSchema, type DirectorSettings } from '../../domain/directorWorkspace'

export type DirectorRailTab = 'scene' | 'cast' | 'frames'
export type DirectorModal = { kind: 'entities' } | { kind: 'frame'; slot: 'first' | 'end' } | { kind: 'new-entity' } | null

type DirectorUiState = {
  sessionId: string | undefined
  takeId: string | null
  direction: string
  /** Direction/settings/cast changed since the last `direct`/`generate` command persisted them. */
  dirty: boolean
  settings: DirectorSettings
  entityKeys: string[]
  error: string | null
  notice: string | null
  busy: boolean
  seek: { time: number; nonce: number } | null
  railTab: DirectorRailTab
  modal: DirectorModal
  /** Direction text before the assistant rewrote it, for one-step undo. */
  assistUndo: string | null
  patch: (values: Partial<Omit<DirectorUiState, 'patch' | 'reset'>>) => void
  reset: () => void
}

const initial = () => ({
  sessionId: undefined,
  takeId: null,
  direction: '',
  dirty: false,
  settings: directorSettingsSchema.parse({}),
  entityKeys: [] as string[],
  error: null,
  notice: null,
  busy: false,
  seek: null,
  railTab: 'scene' as DirectorRailTab,
  modal: null as DirectorModal,
  assistUndo: null,
})

export const useDirectorStore = create<DirectorUiState>(set => ({ ...initial(), patch: values => set(values), reset: () => set(initial()) }))
