import {useState} from 'react';
import {COLLECTION_PRESETS} from '../../domain/cityCollectionPresets';
import {NYC_PRESETS} from '../../domain/cityNycPresets';
import {BLENDER_EXAMPLE_START} from '../../domain/cityStudioExamples';
const groups=['All','Houses','Shops & Dining','Civic','City & Towers','New York'] as const;
export function CityPresetCollection({choose}:{choose:(index:number)=>void}){
 const [group,setGroup]=useState<string>('All');
 const entries=[...NYC_PRESETS.map((p,i)=>({...p,group:'New York',description:'Street shops, masonry bays and a detailed roof.',version:4,index:BLENDER_EXAMPLE_START+i})),...COLLECTION_PRESETS.map((p,i)=>({...p,version:5,index:BLENDER_EXAMPLE_START+NYC_PRESETS.length+i}))];
 return <div className="studio-collection"><div className="studio-collection-heading"><strong>Blender collection</strong><span>30 complete buildings · editable parts, finishes and roofs included</span></div><div className="studio-segment" aria-label="Building collection categories">{groups.map(g=><button key={g} aria-pressed={group===g} onClick={()=>setGroup(g)}>{g}</button>)}</div><div className="studio-collection-grid">{entries.filter(p=>group==='All'||p.group===group).map(p=><button className="studio-collection-card" key={p.id} onClick={()=>choose(p.index)}><img loading="lazy" src={`/city/synarc-kit/v${p.version}/presets/${p.id}.png`} alt=""/><strong>{p.name}</strong><span>{p.description}</span><small>{p.floors} storeys · {p.width} × {p.depth} m</small></button>)}</div></div>;
}
