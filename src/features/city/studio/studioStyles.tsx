// Style filter shared by the opening, decoration, roof-detail, storefront and starting-idea palettes
// (docs/city-studio-ui-v2.md). Styles are read from the catalogues, so new kit packs sort themselves.
import {TOKYO_MODULE_IDS} from '../../../domain/cityStudioCatalog';
import {TOKYO_STAMP_IDS} from '../../../domain/cityStorefrontStamps';
import {TOKYO_EXAMPLE_START} from '../../../domain/cityStudioExamples';

export type StudioStyle='tokyo'|'nyc'|'classic';
export type StudioStyleFilter='all'|StudioStyle;
export const STYLE_FILTERS:readonly {id:StudioStyleFilter;label:string}[]=[{id:'all',label:'All'},{id:'tokyo',label:'Tokyo'},{id:'nyc',label:'New York'},{id:'classic',label:'Classic'}];
export const moduleStyle=(id:string):StudioStyle=>TOKYO_MODULE_IDS.has(id)||id.startsWith('tokyo-')?'tokyo':id.includes('nyc')?'nyc':'classic';
export const stampStyle=(id:string):StudioStyle=>TOKYO_STAMP_IDS.has(id)?'tokyo':'classic';
/** Starting ideas: Tokyo presets follow TOKYO_EXAMPLE_START; New York presets carry kit-v4 previews. */
export const exampleStyle=(index:number,preview?:string):StudioStyle=>index>=TOKYO_EXAMPLE_START?'tokyo':preview?.includes('/v4/')?'nyc':'classic';
export const styleMatches=(filter:StudioStyleFilter,style:StudioStyle)=>filter==='all'||filter===style;

export function StyleFilter({value,onChange,label='Style'}:{value:StudioStyleFilter;onChange:(v:StudioStyleFilter)=>void;label?:string}){
 return <div className="studio-segment studio-style-filter" role="group" aria-label={label}>{STYLE_FILTERS.map(f=><button key={f.id} aria-pressed={value===f.id} onClick={()=>onChange(f.id)}>{f.label}</button>)}</div>;
}
