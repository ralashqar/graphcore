import type {StudioAssembly,StudioBay,StudioPiece} from '../../domain/cityStudioTypes';

export type StudioFloorView={mode:'whole'|'cutaway'|'floor';floor:number};
const defaultView:StudioFloorView={mode:'whole',floor:0};
const views=new Map<string,StudioFloorView>(),listeners=new Map<string,Set<()=>void>>();
export function studioFloorView(id:string){return views.get(id)??defaultView;}
export function subscribeStudioFloorView(id:string,listener:()=>void){const set=listeners.get(id)??new Set<()=>void>();set.add(listener);listeners.set(id,set);return()=>{set.delete(listener);if(!set.size)listeners.delete(id);};}
export function setStudioFloorView(id:string,view:StudioFloorView){views.set(id,view);listeners.get(id)?.forEach(fn=>fn());}
export function clearStudioFloorView(id:string){views.delete(id);listeners.get(id)?.forEach(fn=>fn());}

/** Use authored bay ownership first; mesh origins near a storey line are not reliable floor IDs. */
export function studioPieceFloor(piece:StudioPiece,bays:StudioBay[],floors:{floor:number;bottom:number}[],assemblies:StudioAssembly[]){
 const bay=bays.find(candidate=>piece.id===candidate.id||piece.id.startsWith(candidate.id+'/')||piece.id===`terrace/${candidate.id}`);
 if(bay)return piece.id===`terrace/${bay.id}`?bay.anchor.floor+1:bay.anchor.floor;
 const assembly=assemblies.find(candidate=>candidate.kind!=='stair'&&(piece.id===candidate.id||piece.id.startsWith(candidate.id+'/')));
 if(assembly)return assembly.anchors[0].floor;
 return floors.findLast(level=>piece.y>=level.bottom-.001)?.floor??0;
}
