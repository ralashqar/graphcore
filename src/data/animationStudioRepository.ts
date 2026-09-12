import { invokeGame } from './gameRepository'
import { getCurrentSession } from './auth'
import { studioCommandSchema, type StudioCommand } from '../domain/game/animation-studio/protocol'
import type { StudioGraph } from '../domain/game/animation-studio/graph'
import type { ClipRevision } from '../domain/game/v3/animation'
export type StudioWorkspace = { id:string; draft_id:string; revision:number; graph:StudioGraph }
export type StudioData = {
  sources:Array<{id:string;clip:ClipRevision}>;game:{revision:number;actors:Array<{id:string;label:string}>}|null;
  library:StudioWorkspace[];workspace:StudioWorkspace|null;
  jobs:Array<{id:string;status:string;phase:string;error:string|null;nodeId:string|null;graph:StudioGraph|null;sourceRevision:number}>;
  candidates:Array<{id:string;nodeId:string;clip:ClipRevision|null;url:string|null;diagnostics:{accepted:boolean;failures?:string[];boundary?:unknown}}>;
  reviews:Array<{revision:number;evidence:unknown}>;
}
export async function readStudio(projectId:string,draftId:string,workspaceId?:string):Promise<StudioData>{
  return invokeGame('animation-studio',{action:'read',projectId,draftId,workspaceId})
}
export async function sendStudio(command:StudioCommand){
  const session=await getCurrentSession();if(!session)throw Error('Sign in to save animations')
  const key=`synarc.animation.pending.${session.user.id}.${command.workspaceId}`
  const prior=localStorage.getItem(key)
  if(prior&&JSON.stringify(studioCommandSchema.parse(JSON.parse(prior)))!==JSON.stringify(command))throw Error('Recover the pending command before sending another change')
  localStorage.setItem(key,JSON.stringify(studioCommandSchema.parse(command)))
  try{const result=await invokeGame('animation-studio',command);localStorage.removeItem(key);return result}
  catch(error){const status=(error as Error&{status?:number}).status;if(status&&status>=400&&status<500)localStorage.removeItem(key);throw error}
}
export async function recoverStudio(workspaceId:string){
  const session=await getCurrentSession();if(!session)return
  const raw=localStorage.getItem(`synarc.animation.pending.${session.user.id}.${workspaceId}`)
  if(raw)await sendStudio(studioCommandSchema.parse(JSON.parse(raw)))
}
