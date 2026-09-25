import {studioEnabled} from '../../domain/cityStudioTypes';
import {upgradeStudio} from '../../domain/cityStudio';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {CityProperty} from '../../domain/city';
import {createLandWorld,LocalLandRepository,initialLandDraft,fitLandDesign,type LandDraft,type LandPlot,type LandWorld} from '../../domain/cityLand';
import {reprojectSculptTiles} from '../../domain/citySculpt';
import {continuousInputGroup,recordLandHistory,type LandHistoryEntry} from '../../domain/cityLandHistory';
export type LandEditRecord=boolean|{label?:string;group?:string};
export type LandHistoryNotice={kind:'undo'|'redo';label:string;id:number};
export type LandPhase='exploring'|'staging'|'inspection'|'purchasing'|'celebration'|'construction'|'walkthrough';
export function useCityLand(enabled:boolean,properties:CityProperty[],capacity:number,size:24|48){
 const [presetRevision,setPresetRevision]=useState(0);
 const [previewStatus,setPreview]=useState({pending:false,error:null as string|null}),[previewRetry,setPreviewRetry]=useState(0);
 const setPreviewStatus=useCallback((next:{pending:boolean;error:string|null})=>setPreview(old=>old.pending===next.pending&&old.error===next.error?old:next),[]);
 const initial=useMemo(()=>createLandWorld(properties,capacity,size),[enabled,size,capacity]);
 const repository=useMemo(()=>new LocalLandRepository({getItem:k=>localStorage.getItem(k),setItem:(k,v)=>localStorage.setItem(k,v)},initial),[initial]);
 const [world,setWorld]=useState<LandWorld|null>(null),[phase,setPhase]=useState<LandPhase>('exploring'),[selected,setSelected]=useState<LandPlot|null>(null),[selectedVolume,setSelectedVolume]=useState<string|null>(null),[draft,setDraft]=useState<LandDraft|null>(null),[error,setError]=useState(''),[saving,setSaving]=useState(false),[dirty,setDirty]=useState(false),[history,setHistory]=useState<LandHistoryEntry[]>([]),[future,setFuture]=useState<LandHistoryEntry[]>([]),[notice,setNotice]=useState<LandHistoryNotice|null>(null);
 const selectedRef=useRef(selected),draftRef=useRef(draft),pending=useRef<Promise<boolean>>(Promise.resolve(true)),requestId=useRef(''),editVersion=useRef(0),savedVersion=useRef(0);
 selectedRef.current=selected;draftRef.current=draft;
 const apply=(p:LandPlot)=>{selectedRef.current=p;setSelected(p);setWorld(w=>w?{...w,plots:w.plots.map(old=>old.id===p.id?p:old)}:w);};
 const load=()=>repository.list().then(w=>{setWorld(w);setError('');}).catch(e=>setError(String(e.message||e)));
 useEffect(()=>{if(enabled)void load();},[enabled,repository]);
 useEffect(()=>{if(!enabled)return;const refresh=(e:StorageEvent)=>{if(e.key===initial.id&&phase==='exploring')void load();};window.addEventListener('storage',refresh);return()=>window.removeEventListener('storage',refresh);},[enabled,initial.id,phase]);
 const persist=(finish=false)=>{
  const execute=async()=>{const p=selectedRef.current,d=draftRef.current,version=editVersion.current;if(!p||!d)return true;if(!finish&&version===savedVersion.current)return true;setSaving(true);
   try{const result=await (finish?repository.finish(p.id,p.revision,d):repository.saveDraft(p.id,p.revision,d));apply(result);savedVersion.current=version;setDirty(editVersion.current!==version);setError('');return true;}catch(e){setError(e instanceof Error?e.message:String(e));return false;}finally{setSaving(false);}
  };const task=pending.current.then(execute,execute);pending.current=task;return task;
 };
 useEffect(()=>{if(!dirty||phase!=='construction'&&phase!=='walkthrough')return;const t=setTimeout(()=>void persist(),600);return()=>clearTimeout(t);},[draft,dirty,phase]);
 useEffect(()=>{if(!dirty)return;const handler=(e:BeforeUnloadEvent)=>{e.preventDefault();};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[dirty]);
 const edit=(next:LandDraft,record:LandEditRecord=true)=>{const p=selectedRef.current;if(!p)return;const previous=draftRef.current;next={...next,design:fitLandDesign(next.design,p.rotation)};if((next.sculpt?.version===4||next.sculpt?.version===5||next.sculpt?.version===6)&&next.design.synarcKit){const oldAnchors=(previous?.sculpt?.version===4||previous?.sculpt?.version===5||previous?.sculpt?.version===6)?previous.sculpt.tileAnchors??[]:[],kept=new Set(next.sculpt.tileAnchors?.map(a=>a.id)),removed=new Set(oldAnchors.filter(a=>!kept.has(a.id)).map(a=>a.id));const kit={...next.design.synarcKit,paints:next.design.synarcKit.paints.filter(p=>!removed.has(p.id))};next={...next,design:{...next.design,synarcKit:reprojectSculptTiles(next.sculpt,kit,next.design)}};}if(record&&previous){const options=typeof record==='object'?record:{},entry={label:options.label,group:options.group??continuousInputGroup(typeof window!=='undefined'?window.event:undefined),at:performance.now()},recorded=next;setHistory(h=>recordLandHistory(h,previous,recorded,entry));setFuture([]);}editVersion.current++;draftRef.current=next;setDraft(next);setDirty(true);};
 const open=(p:LandPlot)=>{selectedRef.current=p;setSelected(p);setSelectedVolume(null);const d=structuredClone(p.draft||p.finished||initialLandDraft(p));draftRef.current=d;setDraft(d);setHistory([]);setFuture([]);setNotice(null);editVersion.current=0;savedVersion.current=0;setDirty(false);setError('');requestId.current=crypto.randomUUID();setPhase('staging');};
 const close=async()=>{if(phase==='purchasing'||saving)return;if(dirty&&!await persist())return;setPhase('exploring');setSelected(null);setDraft(null);};
 const purchase=async()=>{if(!selectedRef.current||phase!=='inspection')return;setPhase('purchasing');setError('');try{apply(await repository.purchase(selectedRef.current.id,selectedRef.current.revision,requestId.current));setPhase('celebration');}catch(e){setError(e instanceof Error?e.message:String(e));setPhase('inspection');}};
 const beginConstruction=()=>{if(studioEnabled()&&!selectedRef.current?.draft&&draftRef.current&&selectedRef.current){const next=upgradeStudio(draftRef.current,selectedRef.current.size);if(next)edit(next);}setPhase('construction');if(!selectedRef.current?.draft){editVersion.current++;setDirty(true);}};
 const finish=async()=>{if(await persist(true)){setPhase('exploring');setSelected(null);setDraft(null);}};
 const undo=()=>{if(!history.length||!draft)return;const prev=history[history.length-1];setHistory(h=>h.slice(0,-1));setFuture(f=>[{draft,label:prev.label,at:prev.at},...f]);setNotice(n=>({kind:'undo',label:prev.label,id:(n?.id??0)+1}));edit(prev.draft,false);};
 const redo=()=>{if(!future.length||!draft)return;const next=future[0];setFuture(f=>f.slice(1));setHistory(h=>[...h,{draft,label:next.label,at:next.at}]);setNotice(n=>({kind:'redo',label:next.label,id:(n?.id??0)+1}));edit(next.draft,false);};
 const reopen=async()=>{try{await pending.current;const w=await repository.list(),p=w.plots.find(p=>p.id===selectedRef.current?.id);setWorld(w);if(p){open(p);setPhase(p.owner?'construction':'inspection');}else{setPhase('exploring');setSelected(null);setDraft(null);}}catch(e){setError(e instanceof Error?e.message:String(e));}};
 const reset=async()=>{try{await pending.current;setWorld(await repository.reset());setSelected(null);setDraft(null);setDirty(false);setPhase('exploring');setError('');}catch(e){setError(e instanceof Error?e.message:String(e));}};
 return {presetRevision,editPreset:(next:LandDraft)=>{setPresetRevision(n=>n+1);edit(next);},previewStatus,setPreviewStatus,previewRetry,retryPreview:()=>setPreviewRetry(n=>n+1),enabled,world,phase,selected,selectedVolume,setSelectedVolume,draft,getDraft:()=>draftRef.current,error,saving,dirty,history,future,notice,edit,open,close,purchase,beginConstruction,finish,undo,redo,reset,reopen,retry:()=>dirty?persist():load(),setPhase};
}
export type CityLandController=ReturnType<typeof useCityLand>;
