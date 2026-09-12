import { z } from 'zod'
import { hashGameValue } from '../compiler.ts'
import type { StudioGraph } from './graph.ts'

const id=z.string().regex(/^[a-z][a-z0-9_.-]{0,79}$/), text=z.string().max(1500), number=z.number().finite()
const point=z.tuple([number,number,number]), hash=z.string().regex(/^[a-f0-9]{64}$/).nullable()
export const flexNodeSchema=z.object({
 id,label:z.string().min(1).max(120),parent:id.nullable(),kind:z.enum(['clip','machine','blend']),
 description:text,style:id.nullable(),tags:z.array(id).max(12),duration:number.min(.5).max(8),loop:z.boolean(),
 rootMode:z.enum(['in_place','controller_curve','anchor_relative']),entry:id.nullable(),
 axes:z.array(id).max(2),samples:z.array(z.object({node:id,x:number,y:number}).strict()).max(24),
 entryDescription:text,exitDescription:text,
 contacts:z.array(z.object({anchor:id,effector:z.enum(['left_hand','right_hand','left_foot','right_foot']),start:number.nonnegative(),end:number.nonnegative(),hips:point,leftHip:point,rightHip:point}).strict()).max(16),
 clipId:z.string().uuid().nullable(),contractHash:hash,
}).strict()
export const flexTransitionSchema=z.object({id,from:id,to:id,event:id.nullable(),completion:z.boolean(),
 conditions:z.array(z.object({parameter:id,operator:z.enum(['eq','ne','gt','lt','gte','lte']),value:z.union([z.boolean(),number,text])}).strict()).max(8),
 earliest:number.min(0).max(1),latest:number.min(0).max(1),blendSeconds:number.min(0).max(2),priority:z.number().int().min(0).max(100),
}).strict()
const parameterSchema=z.object({id,label:text,type:z.enum(['number','boolean','enum']),initial:z.union([number,z.boolean(),text]),min:number,max:number,options:z.array(text).max(20)}).strict()
const eventSchema=z.object({id,label:text,key:z.string().regex(/^(Key[A-Z]|Space|ShiftLeft)$/).nullable(),bufferSeconds:number.min(0).max(1)}).strict()
const styleSchema=z.object({id,label:text,description:text}).strict()
const propSchema=z.object({id,label:text,shape:z.enum(['box','sphere','cylinder']),position:point,size:point}).strict()
const anchorSchema=z.object({id,prop:id.nullable(),position:point}).strict()
const dependencySchema=z.object({node:id,predecessor:id,candidateId:z.string().uuid().nullable()}).strict()
export const flexibleGraphSchema=z.object({version:z.literal(3),catalog:z.literal('animation-studio-2.0.0'),name:z.string().min(1).max(120),prompt:text,
 rig:z.literal('humanoid.fabric-ybot.v1'),entry:id.nullable(),nodes:z.array(flexNodeSchema).max(120),transitions:z.array(flexTransitionSchema).max(240),
 styles:z.array(styleSchema).max(24),parameters:z.array(parameterSchema).max(32),events:z.array(eventSchema).max(32),
 props:z.array(propSchema).max(16),anchors:z.array(anchorSchema).max(64),dependencies:z.array(dependencySchema).max(120),gaps:z.array(text).max(30),
}).strict()
export type FlexibleGraph=z.infer<typeof flexibleGraphSchema>
export type FlexNode=z.infer<typeof flexNodeSchema>
export type FlexTransition=z.infer<typeof flexTransitionSchema>
export const blankGraph=():FlexibleGraph=>({version:3,catalog:'animation-studio-2.0.0',name:'Untitled motion graph',prompt:'',rig:'humanoid.fabric-ybot.v1',entry:null,nodes:[],transitions:[],styles:[],parameters:[],events:[],props:[],anchors:[],dependencies:[],gaps:[]})
export const clipNode=(name:string,label=name):FlexNode=>({id:name,label,parent:null,kind:'clip',description:`A humanoid performs ${label}.`,style:null,tags:[],duration:3,loop:false,rootMode:'in_place',entry:null,axes:[],samples:[],entryDescription:'',exitDescription:'',contacts:[],clipId:null,contractHash:null})
export function ancestors(g:FlexibleGraph,id:string):string[]{const chain:string[]=[];let n=g.nodes.find(n=>n.id===id);while(n&&!chain.includes(n.id)){chain.push(n.id);n=g.nodes.find(x=>x.id===n!.parent)}return chain}
export function flexibleProblems(g:FlexibleGraph):string[]{
 const errors:string[]=[],nodes=new Map(g.nodes.map(n=>[n.id,n])),params=new Map(g.parameters.map(p=>[p.id,p]))
 for(const field of ['nodes','transitions','styles','parameters','events','props','anchors']as const)if(new Set(g[field].map(x=>x.id)).size!==g[field].length)errors.push(`Duplicate ${field} IDs`)
 if(g.entry!==null&&(!nodes.has(g.entry)||nodes.get(g.entry)?.parent!==null))errors.push('Graph entry must be a root state')
 for(const n of g.nodes){
  if(n.parent!==null&&(nodes.get(n.parent)?.kind!=='machine'||ancestors(g,n.parent).includes(n.id)))errors.push(`${n.id}: invalid or cyclic parent`)
  if(n.style&&!g.styles.some(s=>s.id===n.style))errors.push(`${n.id}: missing style`)
  if(n.kind==='machine'&&(n.entry===null||nodes.get(n.entry)?.parent!==n.id))errors.push(`${n.id}: machine needs a direct child entry`)
  if(n.kind==='blend'){
   if(!n.axes.length||n.axes.some(a=>params.get(a)?.type!=='number')||!n.samples.length)errors.push(`${n.id}: blend needs numeric axes and samples`)
   if(n.samples.some(s=>nodes.get(s.node)?.kind!=='clip'))errors.push(`${n.id}: blend samples must reference clips`)
   if(new Set(n.samples.map(s=>`${s.x}:${n.axes.length===1?0:s.y}`)).size!==n.samples.length)errors.push(`${n.id}: overlapping blend samples`)
  }
  for(const c of n.contacts)if(!g.anchors.some(a=>a.id===c.anchor)||c.start>c.end||c.end>n.duration)errors.push(`${n.id}: invalid contact anchor or time`)
 }
 for(const p of g.parameters)if(p.min>p.max||(p.type==='number'&&(typeof p.initial!=='number'||p.initial<p.min||p.initial>p.max))||(p.type==='boolean'&&typeof p.initial!=='boolean')||(p.type==='enum'&&!p.options.includes(String(p.initial))))errors.push(`${p.id}: invalid parameter default`)
 const keys=g.events.flatMap(e=>e.key?[e.key]:[]);if(new Set(keys).size!==keys.length)errors.push('Event keys must be unique')
 for(const t of g.transitions){
  if(!nodes.has(t.from)||!nodes.has(t.to)||t.earliest>t.latest)errors.push(`${t.id}: invalid endpoints or window`)
  if(t.event&&!g.events.some(e=>e.id===t.event))errors.push(`${t.id}: unknown event`)
  if(!t.event&&!t.completion&&!t.conditions.length)errors.push(`${t.id}: transition needs a trigger`)
  for(const c of t.conditions){const p=params.get(c.parameter);if(!p||(p.type==='number'?typeof c.value!=='number':p.type==='boolean'?typeof c.value!=='boolean':!p.options.includes(String(c.value)))||(p.type!=='number'&&!['eq','ne'].includes(c.operator)))errors.push(`${t.id}: invalid parameter condition`)}
 }
 for(const p of g.props)if(p.size.some(v=>v<=0||v>100)||p.position.some(v=>Math.abs(v)>100))errors.push(`${p.id}: invalid prop dimensions`)
 for(const a of g.anchors)if(a.prop&&!g.props.some(p=>p.id===a.prop))errors.push(`${a.id}: missing prop`)
 const visit=(id:string,path:string[]):boolean=>!path.includes(id)&&g.dependencies.filter(d=>d.node===id).every(d=>nodes.get(d.predecessor)?.kind==='clip'&&visit(d.predecessor,[...path,id]))
 for(const d of g.dependencies)if(nodes.get(d.node)?.kind!=='clip'||!visit(d.node,[]))errors.push('Generation dependencies must be an acyclic graph of clips')
 if(new Set(g.dependencies.map(d=>d.node)).size!==g.dependencies.length)errors.push('Only one entry-pose dependency per clip')
 return [...new Set(errors)]
}
export function parseFlexible(value:unknown){const g=flexibleGraphSchema.parse(value),errors=flexibleProblems(g);if(errors.length)throw Error(errors.join('\n'));return g}
export async function motionFingerprint(g:FlexibleGraph,n:FlexNode){return hashGameValue({version:'flex-motion-1',rig:g.rig,description:n.description,style:g.styles.find(s=>s.id===n.style)?.description??null,duration:n.duration,loop:n.loop,rootMode:n.rootMode,entry:n.entryDescription,exit:n.exitDescription,contacts:n.contacts.map(c=>({...c,anchor:g.anchors.find(a=>a.id===c.anchor),prop:g.props.find(p=>p.id===g.anchors.find(a=>a.id===c.anchor)?.prop)})),dependencies:g.dependencies.filter(d=>d.node===n.id)})}
export async function freezeFlexible(value:unknown){const g=parseFlexible(value);return {...g,nodes:await Promise.all(g.nodes.map(async n=>{const contractHash=n.kind==='clip'?await motionFingerprint(g,n):null;return {...n,contractHash,clipId:n.contractHash===contractHash?n.clipId:null}}))}}
const editsFor=<T extends z.ZodType>(schema:T)=>z.object({upsert:z.array(schema).max(240),remove:z.array(id).max(240)}).strict()
export const graphEditSchema=z.object({summary:text,nodes:editsFor(flexNodeSchema),transitions:editsFor(flexTransitionSchema),styles:editsFor(styleSchema),parameters:editsFor(parameterSchema),events:editsFor(eventSchema),props:editsFor(propSchema),anchors:editsFor(anchorSchema),dependencies:z.array(dependencySchema).max(120).nullable(),name:text.nullable(),entry:id.nullable(),changeEntry:z.boolean(),gaps:z.array(text).max(30).nullable()}).strict()
export type GraphEdit=z.infer<typeof graphEditSchema>
export async function applyGraphEdit(original:FlexibleGraph,edit:GraphEdit,scope:string[]=[]){
 const g=structuredClone(original),allowed=new Set(original.nodes.filter(n=>ancestors(original,n.id).some(id=>scope.includes(id))).map(n=>n.id))
 for(const field of ['nodes','transitions','styles','parameters','events','props','anchors']as const){
  const change=edit[field],items=new Map<string,unknown>(g[field].map(x=>[x.id,x]));for(const id of change.remove)items.delete(id);for(const value of change.upsert)items.set(value.id,value)
  ;(g as unknown as Record<string,unknown>)[field]=[...items.values()]
 }
 if(edit.name!==null)g.name=edit.name;if(edit.changeEntry)g.entry=edit.entry;if(edit.gaps!==null)g.gaps=edit.gaps;if(edit.dependencies!==null)g.dependencies=edit.dependencies
 // The model never selects clips or manufactures accepted fingerprints.
 g.nodes=g.nodes.map(n=>{const old=original.nodes.find(x=>x.id===n.id);return {...n,clipId:old?.clipId??null,contractHash:old?.contractHash??null}})
 const expanded:string[]=[]
 if(scope.length){
  for(const n of original.nodes)if(!allowed.has(n.id)&&JSON.stringify(n)!==JSON.stringify(g.nodes.find(x=>x.id===n.id)))expanded.push(n.id)
  for(const n of g.nodes)if(!original.nodes.some(x=>x.id===n.id)&&!ancestors(g,n.id).some(id=>allowed.has(id)))expanded.push(n.id)
  for(const field of ['styles','parameters','events','props','anchors']as const)if(JSON.stringify(g[field])!==JSON.stringify(original[field]))expanded.push(field)
  const changedEdges=[...original.transitions,...g.transitions].filter(t=>JSON.stringify(original.transitions.find(x=>x.id===t.id))!==JSON.stringify(g.transitions.find(x=>x.id===t.id)))
  if(changedEdges.some(t=>![t.from,t.to].every(id=>allowed.has(id)||g.nodes.some(n=>n.id===id&&ancestors(g,n.id).some(a=>allowed.has(a))))))expanded.push('external transitions')
  if(edit.changeEntry||edit.name!==null||edit.dependencies!==null)expanded.push('shared graph settings')
 }
 return {graph:await freezeFlexible(g),scopeExpansion:[...new Set(expanded)],summary:edit.summary,edits:edit}
}
export function convertLegacy(old:StudioGraph):FlexibleGraph{
 const g=blankGraph();g.name=old.name;g.prompt=old.prompt;g.styles=old.stances.map(s=>({id:s.id,label:s.label,description:s.description}));g.gaps=[...old.gaps];g.entry=old.entry
 g.events=[{id:'attack',label:'Attack',key:old.inputs.attack,bufferSeconds:.35},{id:'toggle_combat',label:'Change stance',key:old.inputs.toggle_combat,bufferSeconds:0}]
 g.nodes=old.nodes.map(n=>({...clipNode(n.id,n.label),description:n.description,style:n.group,tags:[n.role],duration:n.duration,loop:n.loop,entryDescription:n.entry,exitDescription:n.exit}))
 g.transitions=old.transitions.map(t=>({...t,event:t.event==='finished'?null:t.event,completion:t.event==='finished',conditions:[]}))
 g.dependencies=structuredClone(old.dependencies);g.gaps.push('Converted graph needs new motion review; original clips remain in revision history. Locomotion clips are individually selectable until configured in a blend.')
 return g
}
export function generationReadiness(g:FlexibleGraph,n:FlexNode){
 if(n.kind!=='clip')return 'structure'
 if(n.clipId)return 'reviewed'
 if(g.dependencies.some(d=>d.node===n.id&&!d.candidateId))return 'missing dependency'
 return 'ready to generate'
}
