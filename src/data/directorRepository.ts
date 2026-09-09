import { directorCommandSchema, directorStateSchema, type DirectorCommand, type DirectorState, type DirectorTake } from '../domain/directorWorkspace'
import { supabase } from '../utils/supabase'
import { getCurrentSession } from './auth'
import { runCoalescedRequest, runLimitedRequest } from './requestCoordinator'
export class DirectorRequestError extends Error {
  status?: number
  constructor(message: string,status?: number) {super(message);this.status=status}
}

export async function invokeDirector<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const session = await runCoalescedRequest({ key: 'director-auth', className: 'auth', fn: getCurrentSession })
  if (!session) throw new Error('Sign in to use Vibe Director.')
  const { data, error } = await supabase.functions.invoke(name, { body, headers: { Authorization: `Bearer ${session.access_token}` } })
  if (error) {
    const response = 'context' in error ? error.context : null
    let message = error.message
    if (response instanceof Response) {
      const payload = await response.clone().json().catch(() => null)
      message = payload?.error ?? payload?.message ?? message
    }
    throw new DirectorRequestError(typeof message === 'string' ? message : JSON.stringify(message),response instanceof Response?response.status:undefined)
  }
  return data as T
}
export function loadDirectorState(input: { projectId: string; draftId: string; sessionId?: string; cursor?: string }) {
  return runCoalescedRequest({ key: `director-read:${JSON.stringify(input)}`, className: 'edge-function', fn: async () => directorStateSchema.parse(await invokeDirector('get-director-session', input)) })
}
export function loadDirectorProgress(input:{projectId:string;draftId:string;sessionId:string;revision:number}) {
  return runCoalescedRequest({key:`director-progress:${input.sessionId}:${input.revision}`,className:'edge-function',fn:()=>invokeDirector<{
    needsRefresh:boolean;takes?:Array<Partial<DirectorTake>&{id:string}>;jobs?:DirectorState['jobs'];exports?:DirectorState['exports']
  }>('get-director-session',{...input,progressOnly:true})})
}
export function sendDirectorCommand(command: DirectorCommand) {
  const parsed = directorCommandSchema.parse(command)
  return runLimitedRequest({ className: 'mutation', resourceKey: `director:${parsed.sessionId}`, fn: () => invokeDirector<{ sessionId: string; revision: number; takeId?: string; runId?: string }>('director-command', parsed) })
}
