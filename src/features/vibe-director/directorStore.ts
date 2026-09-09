import { create } from 'zustand'
import { directorSettingsSchema, type DirectorSettings } from '../../domain/directorWorkspace'
type DirectorUiState = {
  sessionId: string | undefined; takeId: string | null; playhead: number; direction: string; settings: DirectorSettings;
  entityKeys: string[]; error: string | null; busy: boolean; inspector: boolean; seek: { time: number; nonce: number } | null;
  patch: (values: Partial<Omit<DirectorUiState, 'patch' | 'reset'>>) => void; reset: () => void;
}
const initial = () => ({ sessionId: undefined, takeId: null, playhead: 0, direction: '', settings: directorSettingsSchema.parse({}), entityKeys: [], error: null, busy: false, inspector: false, seek: null })
export const useDirectorStore = create<DirectorUiState>(set => ({ ...initial(), patch: values => set(values), reset: () => set(initial()) }))
