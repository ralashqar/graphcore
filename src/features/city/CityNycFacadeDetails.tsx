import {STOREFRONT_MODULE_IDS,TOKYO_MODULE_IDS,studioModules} from '../../domain/cityStudioCatalog';
const ids=new Set(['nyc-pier','nyc-pilaster','nyc-band','nyc-sill','nyc-lintel','nyc-spandrel','nyc-rosette','nyc-sign']);
/** Facade detail modules placed as ornaments: New York details, Blender collection trims, Tokyo trims (awning, fascia, hood)
 * and the storefront pack's awnings, fascias, signs and street objects (docs/city-storefront-kit.md). */
export function CityNycFacadeDetails({selected,choose,version=4,filter}:{version:2|3|4|5;selected:string;choose:(id:string)=>void;filter?:(id:string)=>boolean}){
 return <div className="studio-tray" aria-label="Facade details">{studioModules(version).filter(p=>(ids.has(p.id)||version===5&&(p.id.startsWith('collection-')||TOKYO_MODULE_IDS.has(p.id)||STOREFRONT_MODULE_IDS.has(p.id))&&p.category==='trim')&&(!filter||filter(p.id))).map(p=><button key={p.id} className="studio-tile" aria-pressed={selected===p.id} onClick={()=>choose(p.id)}><img src={`/city/synarc-kit/v${version}/thumbnails/${p.id}.png`} alt="" loading="lazy"/><span>{p.label}</span></button>)}</div>;
}
