import type { MotionRecipe } from '../v3/animation.ts'
import { z } from 'zod'
import { hashGameValue } from '../compiler.ts'
import { flexibleProblems,type FlexibleGraph } from './flexible.ts'
import { flexibleMotionPrompt, MOTION_PROMPT_POLICY } from './motionPrompt.ts'
export const PREFLIGHT_VERSION='animation-preflight-1.0.0' as const
const text=z.string().min(1).max(800)
export const capabilitySchema=z.enum(['humanoid_motion','static_contact','locomotion_processing','animated_partner','dynamic_prop','terrain_ik','physics_simulation','non_humanoid_rig'])
const issueSchema=z.object({code:z.enum(['contradictory_motion','ambiguous_motion','continuity_mismatch']),evidence:text,message:text,question:text,suggestions:z.array(text).min(1).max(3)}).strict()
export const semanticReviewSchema=z.object({nodes:z.array(z.object({nodeId:z.string(),requirements:z.array(z.object({capability:capabilitySchema,evidence:text}).strict()).min(1).max(12),issues:z.array(issueSchema).max(8)}).strict()).max(120)}).strict()
export type SemanticReview=z.infer<typeof semanticReviewSchema>
export type Finding={code:string;status:'needs_clarification'|'unsupported';message:string;question:string;suggestions:string[]}
export type NodePreflight={nodeId:string;status:'ready'|'needs_clarification'|'unsupported';findings:Finding[]}
export type Preflight={version:typeof PREFLIGHT_VERSION;fingerprint:string;semantic:SemanticReview;nodes:NodePreflight[]}
const supported=new Set(['humanoid_motion','static_contact','locomotion_processing'])
export function graphIntent(g:FlexibleGraph){return {...g,nodes:g.nodes.map(n=>({...n,clipId:null,contractHash:null})),dependencies:g.dependencies.map(d=>({...d,candidateId:null}))}}
export const preflightFingerprint=(g:FlexibleGraph)=>hashGameValue({version:PREFLIGHT_VERSION,promptPolicy:MOTION_PROMPT_POLICY,graph:graphIntent(g)})
export function deterministicPreflight(g:FlexibleGraph):NodePreflight[]{
 const structural=flexibleProblems(g)
 return g.nodes.filter(n=>n.kind==='clip').map(n=>{
  const findings:Finding[]=structural.map(message=>({code:'invalid_graph',status:'unsupported',message,question:'Correct the graph structure before generating.',suggestions:[]}))
  if(flexibleMotionPrompt(g,n).length>1500)findings.push({code:'prompt_too_long',status:'needs_clarification',message:'The compiled motion prompt exceeds the provider limit. It must not be silently truncated.',question:'Can the action, style and pose descriptions be shortened?',suggestions:['Shorten the descriptions while preserving the motion and continuity requirements.']})
  const position=(anchor:string)=>{const a=g.anchors.find(a=>a.id===anchor),p=g.props.find(p=>p.id===a?.prop);return a?.position.map((v,i)=>v+(p?.position[i]??0))}
  n.contacts.forEach((a,i)=>n.contacts.slice(i+1).forEach(b=>{const pa=position(a.anchor),pb=position(b.anchor);if(a.effector===b.effector&&Math.max(a.start,b.start)<=Math.min(a.end,b.end)&&pa&&pb&&Math.hypot(...pa.map((v,j)=>v-pb[j]))>.005)findings.push({code:'conflicting_contacts',status:'unsupported',message:`${a.effector} is required at two different positions at the same time.`,question:'Which contact should this limb follow?',suggestions:['Sequence the contacts at non-overlapping times.','Keep one contact and remove the conflicting constraint.']})}))
  return {nodeId:n.id,status:findings.some(f=>f.status==='unsupported')?'unsupported':findings.length?'needs_clarification':'ready',findings}
 })
}
export async function assemblePreflight(g:FlexibleGraph,value:unknown):Promise<Preflight>{
 const semantic=semanticReviewSchema.parse(value),nodes=deterministicPreflight(g),ids=new Set(semantic.nodes.map(n=>n.nodeId))
 if(ids.size!==semantic.nodes.length||ids.size!==nodes.length||nodes.some(n=>!ids.has(n.nodeId)))throw Error('Semantic review must cover every clip exactly once')
 const evidence=JSON.stringify(graphIntent(g))
 for(const n of nodes){const review=semantic.nodes.find(r=>r.nodeId===n.nodeId)!
  for(const r of [...review.requirements,...review.issues])if(!evidence.includes(JSON.stringify(r.evidence).slice(1,-1)))throw Error('Semantic review evidence must quote the graph')
  for(const r of review.requirements)if(!supported.has(r.capability))n.findings.push({code:r.capability,status:'unsupported',message:`This request requires ${r.capability.replaceAll('_',' ')}, which this animation pipeline does not provide.`,question:'Can this be represented by one humanoid and static references?',suggestions:['Simplify this motion to one humanoid with static props.','Keep the idea as a placeholder and generate other states.']})
  for(const issue of review.issues)n.findings.push({code:issue.code,status:'needs_clarification',message:issue.message,question:issue.question,suggestions:issue.suggestions})
  n.status=n.findings.some(f=>f.status==='unsupported')?'unsupported':n.findings.length?'needs_clarification':'ready'
 }
 return {version:PREFLIGHT_VERSION,fingerprint:await preflightFingerprint(g),semantic,nodes}
}
// Reports come from service-owned planner checkpoints, never from the generate command.
export async function currentPreflight(g:FlexibleGraph,reports:unknown[]):Promise<Preflight|null>{
 const fingerprint=await preflightFingerprint(g)
 for(const value of reports){const report=value as Partial<Preflight>|null;if(report?.version!==PREFLIGHT_VERSION||report.fingerprint!==fingerprint)continue;try{return await assemblePreflight(g,report.semantic)}catch{}}
 return null
}
export function requireReady(report:Preflight|null,nodeIds:string[]){
 if(!report)throw Error('Run Check generation readiness for the current graph before generating.')
 const blocked=[...new Set(nodeIds)].filter(id=>report.nodes.find(n=>n.nodeId===id)?.status!=='ready')
 if(blocked.length)throw Error(`Resolve generation preflight findings for: ${blocked.join(', ')}`)
}

export async function requireInferencePreflight(recipe:MotionRecipe,receipt:unknown){
 if(recipe.state!=='custom')return
 const value=receipt as {version?:unknown;recipeHash?:unknown}|null
 if(value?.version!==PREFLIGHT_VERSION||value.recipeHash!==await hashGameValue(recipe))throw Error('Flexible inference requires a server-validated preflight for this exact recipe')
}
