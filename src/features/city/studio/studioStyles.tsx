// Style filter shared by the opening, decoration, roof-detail, storefront and starting-idea palettes
// (docs/city-studio-ui-v2.md). Styles are read from the catalogues, so new kit packs sort themselves.
import {TOKYO_MODULE_IDS,storefrontModuleStyle,type StorefrontStyle} from '../../../domain/cityStudioCatalog';
import {STAMP_MAP,TOKYO_STAMP_IDS} from '../../../domain/cityStorefrontStamps';
import {STOREFRONT_EXAMPLE_START,TOKYO_EXAMPLE_START} from '../../../domain/cityStudioExamples';
import {STOREFRONT_PRESETS} from '../../../domain/cityStorefrontPresets';

export type StudioStyle='tokyo'|'nyc'|'paris'|'london'|'italian'|'modern'|'classic';
export type StudioStyleFilter='all'|StudioStyle;
export const STYLE_FILTERS:readonly {id:StudioStyleFilter;label:string}[]=[{id:'all',label:'All'},{id:'tokyo',label:'Tokyo'},{id:'nyc',label:'New York'},{id:'paris',label:'Paris'},{id:'london',label:'London'},{id:'italian',label:'Italian'},{id:'modern',label:'Modern'},{id:'classic',label:'Classic'}];
/** Storefront pack styles (catalogue `style`) map onto the filter; `new-york` joins the New York kit pieces. */
const fromStorefront=(style:StorefrontStyle):StudioStyle=>style==='new-york'?'nyc':style;
export const moduleStyle=(id:string):StudioStyle=>{const s=storefrontModuleStyle(id);return s?fromStorefront(s):TOKYO_MODULE_IDS.has(id)||id.startsWith('tokyo-')?'tokyo':id.includes('nyc')?'nyc':'classic';};
export const stampStyle=(id:string):StudioStyle=>{const s=STAMP_MAP.get(id)?.style;return s?fromStorefront(s):TOKYO_STAMP_IDS.has(id)?'tokyo':'classic';};
/** Starting ideas: storefront streets and Tokyo presets follow their start index; New York presets carry kit-v4 previews. */
export const exampleStyle=(index:number,preview?:string):StudioStyle=>index>=STOREFRONT_EXAMPLE_START?fromStorefront(STOREFRONT_PRESETS[index-STOREFRONT_EXAMPLE_START]?.style??'modern'):index>=TOKYO_EXAMPLE_START?'tokyo':preview?.includes('/v4/')?'nyc':'classic';
export const styleMatches=(filter:StudioStyleFilter,style:StudioStyle)=>filter==='all'||filter===style;

export function StyleFilter({value,onChange,label='Style'}:{value:StudioStyleFilter;onChange:(v:StudioStyleFilter)=>void;label?:string}){
 return <div className="studio-segment studio-style-filter" role="group" aria-label={label}>{STYLE_FILTERS.map(f=><button key={f.id} aria-pressed={value===f.id} onClick={()=>onChange(f.id)}>{f.label}</button>)}</div>;
}
