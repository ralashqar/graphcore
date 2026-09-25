import {Plus} from '@phosphor-icons/react';
import type {StudioFloorView} from './cityStudioView';

const VIEW_LABELS:Record<StudioFloorView['mode'],[string,string]>={whole:['Whole building','All'],cutaway:['Cutaway view','Cut'],floor:['This floor view','Floor']};

/** Sims-style storey rail. The active storey is shared by every tool: shapes are drawn on it,
 * rooms and furniture edit it, and the walls view isolates it. */
export function CityStudioFloorRail({storeys,floor,choose,canAdd,add,viewMode,setViewMode,viewsEnabled,slab}:{storeys:number;floor:number;choose:(floor:number)=>void;canAdd:boolean;add:()=>void;viewMode:StudioFloorView['mode'];setViewMode:(mode:StudioFloorView['mode'])=>void;viewsEnabled:boolean;slab?:{open:boolean;toggle:()=>void}}){
 const levels=Array.from({length:Math.max(1,storeys)},(_,level)=>level).reverse();
 return <aside className="studio-rail" aria-label="Storeys">
  <button className="studio-rail-add" aria-label="Add floor" title="Add a storey on top" disabled={!canAdd} onClick={add}><Plus size={15}/></button>
  <nav aria-label="Choose floor">{levels.map(level=><button key={level} aria-label={`Floor ${level+1}`} title={level===0?'Ground floor · PgUp/PgDn':`Floor ${level+1} · PgUp/PgDn`} aria-pressed={floor===level} onClick={()=>choose(level)}>{level===0?'G':level+1}</button>)}</nav>
  <hr/>
  <div className="studio-rail-views" role="group" aria-label="Walls">{(['whole','cutaway','floor'] as const).map(mode=><button key={mode} disabled={!viewsEnabled} aria-label={VIEW_LABELS[mode][0]} title={viewsEnabled?VIEW_LABELS[mode][0]:'Add interiors to see inside'} aria-pressed={viewMode===mode} onClick={()=>setViewMode(mode)}>{VIEW_LABELS[mode][1]}</button>)}</div>
  {slab&&<button className="studio-rail-slab" aria-label={slab.open?'Restore floor slab':'Remove this floor slab'} aria-pressed={!slab.open} title={slab.open?'Open to below · add floor surface':'Floor covered · open to below'} onClick={slab.toggle}>{slab.open?'Open':'Slab'}</button>}
 </aside>;
}
