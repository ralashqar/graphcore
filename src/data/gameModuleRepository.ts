import { invokeGame } from './gameRepository'
import { getCurrentSession } from './auth'
import {
  moduleCommandSchema,
  type ModuleCommand,
} from '../domain/game/v2/protocol'
import { runCoalescedRequest, runLimitedRequest } from './requestCoordinator'
import type { Design, Manifest } from '../domain/game/v2/spec'
export type ModuleJob = {
  id: string
  kind: string
  status: string
  phase: string
  error: string | null
}
export type Step = {
  node_id: string
  status: string
  attempt: number
  diagnostic: string | null
  output: unknown
  dependencies: string[]
}
export type ModuleWorkspace = {
  revision: number
  design: Design | null
  activeBuildId: string | null
  publishedBuildId?: string | null
  jobs: ModuleJob[]
  builds: {
    id: string
    status: string
    source_revision: number
    reports: { nodeKey: string; passed: boolean; message: string }[]
  }[]
  pricing: { planCredits: number; assetCredits: number } | null
}
export const readModules = (projectId: string, draftId: string) =>
  runCoalescedRequest({
    key: `module:${draftId}`,
    className: 'edge-function',
    fn: () =>
      invokeGame('get-game-workspace', {
        projectId,
        draftId,
      }) as Promise<ModuleWorkspace>,
  })
export const readSteps = (projectId: string, draftId: string, jobId: string) =>
  runCoalescedRequest({
    key: `module:${jobId}:steps`,
    className: 'edge-function',
    fn: () =>
      invokeGame('get-game-workspace', {
        projectId,
        draftId,
        jobId,
      }) as Promise<{ steps: Step[] }>,
  })
export const readModuleBuild = (
  projectId: string,
  draftId: string,
  buildId: string,
) =>
  runCoalescedRequest({
    key: `module:${buildId}`,
    className: 'edge-function',
    fn: () =>
      invokeGame('get-game-workspace', {
        projectId,
        draftId,
        buildId,
      }) as Promise<{ manifest: Manifest; assetUrls: Record<string, string> }>,
  })
async function pendingKey(projectId: string, draftId: string) {
  const session = await getCurrentSession()
  if (!session) throw new Error('Sign in to build games')
  return `graphcore.module.pending.${session.user.id}.${projectId}.${draftId}`
}
export async function pendingModule(projectId: string, draftId: string) {
  const value = localStorage.getItem(await pendingKey(projectId, draftId))
  if (!value) return null
  try {
    return moduleCommandSchema.parse(JSON.parse(value))
  } catch {
    return null
  }
}
export function sendModule(input: ModuleCommand) {
  return runLimitedRequest({
    className: 'mutation',
    resourceKey: `game:${input.draftId}`,
    fn: async () => {
      const c = moduleCommandSchema.parse(input),
        key = await pendingKey(c.projectId, c.draftId)
      localStorage.setItem(key, JSON.stringify(c))
      try {
        const result = await invokeGame('game-command', c)
        localStorage.removeItem(key)
        return result
      } catch (error) {
        const status = (error as Error & { status?: number }).status
        if (status && status >= 400 && status < 500)
          localStorage.removeItem(key)
        throw error
      }
    },
  })
}
