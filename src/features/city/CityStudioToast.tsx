import {useEffect,useState} from 'react';
import {ArrowUUpLeft,ArrowUUpRight} from '@phosphor-icons/react';
import type {LandHistoryNotice} from './useCityLand';

/** Brief confirmation of what undo/redo just changed. */
export function CityStudioToast({notice}:{notice:LandHistoryNotice|null}){
 const [shown,setShown]=useState<LandHistoryNotice|null>(null);
 useEffect(()=>{if(!notice)return;setShown(notice);const t=setTimeout(()=>setShown(s=>s?.id===notice.id?null:s),1800);return()=>clearTimeout(t);},[notice]);
 if(!shown)return null;
 return <div key={shown.id} className="studio-toast" role="status" aria-live="polite">{shown.kind==='undo'?<ArrowUUpLeft size={14}/>:<ArrowUUpRight size={14}/>}<span>{shown.kind==='undo'?'Undid':'Redid'}: {shown.label}</span></div>;
}
