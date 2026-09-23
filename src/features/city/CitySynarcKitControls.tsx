import {useState} from 'react';
import {DEFAULT_SYNARC_KIT,SYNARC_KIT_DOORS,SYNARC_KIT_STYLES,SYNARC_KIT_WINDOWS,type KitAssembly,type KitPlacement,type SynarcKitChoice,type SynarcKitPaintId} from '../../domain/citySynarcKit';
import './cityLand.css';

const LABELS:Record<string,string>={
 'warm-brick':'Warm brick','painted-townhouse':'Painted townhouse','modern-office':'Modern office',
 'window-single':'Single recessed','window-detailed':'Decorated recessed','window-paired':'Paired panes',
 'storefront-glazing':'Broad storefront','door-residential':'Residential door','door-shop':'Shop door',
 'door-lobby':'Double lobby door',
};

const bayKey=(p:KitPlacement)=>`${p.floor}:${p.x}:${p.z}:${p.rotation}`;
const isBay=(p:KitPlacement)=>p.scaleX===1&&/\/(?:wall-full|window-[^/]+|storefront-glazing|door-[^/]+)$/.test(p.part);

export function CitySynarcKitControls({value,onChange,disabledReason,assembly}:{value:SynarcKitChoice|undefined;onChange:(next:SynarcKitChoice|undefined)=>void;disabledReason?:string;assembly?:KitAssembly}){
 const kit=value??DEFAULT_SYNARC_KIT;
 const [selectedBay,setSelectedBay]=useState(''),[accent,setAccent]=useState<SynarcKitPaintId>('wall-lamp');
 const bays=assembly?.placements.filter(isBay)??[];
 const bay=bays.find(p=>bayKey(p)===selectedBay)??bays[0];
 const bayPaints=bay?kit.paints.filter(p=>p.floor===bay.floor&&Math.hypot(p.x-bay.x,p.z-bay.z)<.1&&p.nx*Math.sin(bay.rotation)+p.nz*Math.cos(bay.rotation)>.9):[];
 const entrance=!!bay&&!!assembly?.entrance&&Math.hypot(assembly.entrance.x-bay.x,assembly.entrance.z-bay.z)<.1;
 const openingOptions=entrance?SYNARC_KIT_DOORS:['wall-full',...SYNARC_KIT_WINDOWS] as const;
 const opening=bayPaints.find(p=>openingOptions.includes(p.part as never));
 const accents=entrance?['canopy-short','canopy-long','entrance-column','wall-lamp','sign-band']:
  bay?.floor===0?['buttress','wall-lamp','vent','sign-band']:['balcony-slab','ac-unit','wall-lamp','vent'];
 const selectedAccent=accents.includes(accent)?accent:accents[0] as SynarcKitPaintId;
 const updateBay=(part:SynarcKitPaintId|null,removeOpening=false)=>{
  if(!bay||(!removeOpening&&part&&bayPaints.some(p=>p.part===part)))return;
  const nx=Math.sin(bay.rotation),nz=Math.cos(bay.rotation);
  const retained=kit.paints.filter(p=>!(p.floor===bay.floor&&Math.hypot(p.x-bay.x,p.z-bay.z)<.1&&
    p.nx*nx+p.nz*nz>.9&&
    (removeOpening?['wall-full',...SYNARC_KIT_WINDOWS,...SYNARC_KIT_DOORS].includes(p.part):p.part===part)));
  if(part&&retained.length>=64)return;
  onChange({...kit,paints:part?[...retained,{id:crypto.randomUUID(),part,floor:bay.floor,x:bay.x,z:bay.z,nx,nz}]:retained});
 };
 const set=<K extends keyof SynarcKitChoice>(key:K,next:SynarcKitChoice[K])=>onChange({...kit,[key]:next});
 return <fieldset className="city-synarc-kit-controls" disabled={!!disabledReason}>
  <legend>SynArc Tile Kit</legend>
  <label><input type="checkbox" checked={!!value} onChange={event=>onChange(event.target.checked?structuredClone(DEFAULT_SYNARC_KIT):undefined)}/>Use original low-poly kit</label>
  {disabledReason&&<small>{disabledReason}</small>}
  {!!value&&<>
   <div className="city-synarc-kit-styles" role="group" aria-label="Tile kit style">{SYNARC_KIT_STYLES.map(id=><button type="button" key={id} aria-label={LABELS[id]} aria-pressed={kit.style===id} onClick={()=>set('style',id)}><img src={`/city/synarc-kit/v1/${id}.png`} alt="" loading="lazy"/><span>{LABELS[id]}</span></button>)}</div>
   <label>Window bay<select aria-label="Tile kit windows" value={kit.window} onChange={e=>set('window',e.target.value as SynarcKitChoice['window'])}>{SYNARC_KIT_WINDOWS.map(id=><option key={id} value={id}>{LABELS[id]}</option>)}</select></label>
   <label>Entrance<select aria-label="Tile kit entrance" value={kit.door} onChange={e=>set('door',e.target.value as SynarcKitChoice['door'])}>{SYNARC_KIT_DOORS.map(id=><option key={id} value={id}>{LABELS[id]}</option>)}</select></label>
   <label>Canopy<select value={kit.canopy} onChange={e=>set('canopy',e.target.value as SynarcKitChoice['canopy'])}><option value="none">None</option><option value="short">Short</option><option value="long">Long</option></select></label>
   <label><input type="checkbox" checked={kit.plinth} onChange={e=>set('plinth',e.target.checked)}/>Stone base course</label>
   <label><input type="checkbox" checked={kit.cornice} onChange={e=>set('cornice',e.target.checked)}/>Connected roof edge</label>
   <label><input type="checkbox" checked={kit.balconies} onChange={e=>set('balconies',e.target.checked)}/>Upper-floor balconies</label>
   <label><input type="checkbox" checked={kit.buttresses} onChange={e=>set('buttresses',e.target.checked)}/>Ground-floor buttresses</label>
   <label><input type="checkbox" checked={kit.acUnits} onChange={e=>set('acUnits',e.target.checked)}/>Occasional wall AC</label>
   {assembly&&<details className="city-synarc-kit-bays"><summary>Customise individual bays</summary>
    <p>Select a measured wall bay, then replace its opening or add a compatible accent. The entrance bay keeps a door.</p>
    <label>Wall bay<select aria-label="Tile kit wall bay" value={bay?bayKey(bay):''} onChange={e=>setSelectedBay(e.target.value)}>{bays.map((p,i)=><option key={bayKey(p)} value={bayKey(p)}>{`Floor ${p.floor+1} · ${Math.abs(Math.cos(p.rotation))>.7?(Math.cos(p.rotation)>0?'front':'back'):(Math.sin(p.rotation)>0?'right':'left')} · bay ${i+1}`}</option>)}</select></label>
    {bay&&<><label>Opening<select aria-label="Tile kit bay opening" value={opening?.part??''} onChange={e=>updateBay(e.target.value?e.target.value as SynarcKitPaintId:null,true)}><option value="">Use global choice</option>{openingOptions.map(id=><option key={id} value={id}>{LABELS[id]??id.replaceAll('-',' ')}</option>)}</select></label>
     <label>Accent<select aria-label="Tile kit bay accent" value={selectedAccent} onChange={e=>setAccent(e.target.value as SynarcKitPaintId)}>{accents.map(id=><option key={id} value={id}>{id.replaceAll('-',' ')}</option>)}</select></label>
     <button type="button" disabled={kit.paints.length>=64} onClick={()=>updateBay(selectedAccent)}>Add accent</button>
     {bayPaints.filter(p=>!['wall-full',...SYNARC_KIT_WINDOWS,...SYNARC_KIT_DOORS].includes(p.part)).map(p=><div className="city-synarc-kit-painted" key={p.id}><span>{p.part.replaceAll('-',' ')}</span><button type="button" aria-label={`Remove ${p.part}`} onClick={()=>onChange({...kit,paints:kit.paints.filter(item=>item.id!==p.id)})}>Remove</button></div>)}
    </>}
    {!!assembly.inactive.length&&<small>{assembly.inactive.length} painted choice(s) are inactive: {assembly.inactive.map(item=>item.reason).join(' ')}</small>}
   </details>}
   <small>Openings are fitted into whole bays. The kit is generated locally in Blender and shared by this preview and the city.</small>
  </>}
 </fieldset>;
}
