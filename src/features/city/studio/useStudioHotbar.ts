// Hotbar quick slots (1–9): the most recent brush items, remembered on this device (docs/city-studio-ui-v2.md).
import {useState} from 'react';
import {STUDIO_COLORS} from '../../../domain/cityStudioCatalog';
import {HOTBAR_SLOTS,pushHotbar,type HotbarItem} from '../studioRail';
export type {HotbarItem};
const KEY='city-studio-hotbar-v1';
const SEED:HotbarItem[]=[...STUDIO_COLORS.slice(0,4).map(c=>({id:`color:${c}`,target:'material' as const,label:c,color:c})),{id:'texture:brick',target:'material',label:'Brick',texture:'brick'},{id:'free:window',target:'openings',label:'Window',free:'window'},{id:'free:arch',target:'openings',label:'Arch',free:'arch'}];
const load=():HotbarItem[]=>{try{const raw=localStorage.getItem(KEY),list=raw?JSON.parse(raw):null;return Array.isArray(list)?list.filter(x=>x&&typeof x.id==='string'&&typeof x.target==='string').slice(0,HOTBAR_SLOTS):SEED;}catch{return SEED;}};
export function useStudioHotbar(){
 const [items,setItems]=useState<HotbarItem[]>(load);
 const record=(item:HotbarItem)=>setItems(list=>{if(list.some(x=>x.id===item.id))return list;const next=pushHotbar(list,item);try{localStorage.setItem(KEY,JSON.stringify(next));}catch{/* private mode: slots stay for this session */}return next;});
 return {items,record};
}
