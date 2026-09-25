import {studioModules} from '../../domain/cityStudioCatalog';
const ids=new Set(['nyc-pier','nyc-pilaster','nyc-band','nyc-sill','nyc-lintel','nyc-spandrel','nyc-rosette','nyc-sign']);
export function CityNycFacadeDetails({selected,choose,version=4}:{version:2|3|4|5;selected:string;choose:(id:string)=>void}){
 return <div className="studio-tray" aria-label="Facade details">{studioModules(version).filter(p=>ids.has(p.id)||version===5&&p.id.startsWith('collection-')&&p.category==='trim').map(p=><button key={p.id} className="studio-tile" aria-pressed={selected===p.id} onClick={()=>choose(p.id)}><img src={`/city/synarc-kit/v${version}/thumbnails/${p.id}.png`} alt=""/><span>{p.label}</span></button>)}</div>;
}
