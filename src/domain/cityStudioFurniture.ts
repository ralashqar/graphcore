import catalogue from '../../public/city/furniture/v1/catalogue.json' with {type:'json'};
import polygonClipping, {type MultiPolygon, type Polygon} from 'polygon-clipping';
import type {StudioFurniture,StudioDeck,StudioInteriorLevel,StudioPortal} from './cityStudioTypes.ts';

export const STUDIO_FURNITURE=catalogue.items;
export const FURNITURE_CATEGORIES=['seating','tables','storage','bedroom','kitchen','bathroom','lighting','decor'] as const;
export const FURNITURE_LIMIT=192;
type Rect={x:number;z:number;rotation:number;width:number;depth:number};
export function furnitureFootprint(item:Rect,padding=0):Polygon {
 const c=Math.cos(item.rotation),s=Math.sin(item.rotation),w=item.width/2+padding,d=item.depth/2+padding;
 const points=([[-w,-d],[w,-d],[w,d],[-w,d]] as [number,number][]).map(([x,z]):[number,number]=>[item.x+c*x+s*z,item.z-s*x+c*z]);return [[...points,points[0]]];
}
const area=(polygons:MultiPolygon)=>polygons.reduce((sum,p)=>sum+p.reduce((part,ring,i)=>{const a=Math.abs(ring.reduce((n,v,j)=>{const q=ring[(j+1)%ring.length];return n+v[0]*q[1]-q[0]*v[1];},0))/2;return part+(i?-a:a);},0),0);
export function furnitureOverlaps(a:Rect,b:Rect,padding=.025){
 const pa=furnitureFootprint(a,padding)[0],pb=furnitureFootprint(b)[0];
 for(const r of [a,b])for(const [nx,nz] of [[Math.cos(r.rotation),-Math.sin(r.rotation)],[Math.sin(r.rotation),Math.cos(r.rotation)]]){
  const aa=pa.map(p=>p[0]*nx+p[1]*nz),bb=pb.map(p=>p[0]*nx+p[1]*nz);if(Math.max(...aa)<=Math.min(...bb)+.001||Math.max(...bb)<=Math.min(...aa)+.001)return false;
 }return true;
}
/** Shared by immediate placement ghosts and authoritative worker preparation. */
export function furniturePlacementIssue(item:StudioFurniture,level:StudioInteriorLevel|undefined,decks:StudioDeck[],portals:StudioPortal[],placed:StudioFurniture[]=level?.furniture??[]):string|null {
 const spec=STUDIO_FURNITURE[item.kind];if(!spec||!level)return 'This furnishing needs a covered floor.';
 const rect={...item,...spec},footprint=furnitureFootprint(rect),a=spec.width*spec.depth;
 const room=level.rooms.find(room=>!room.openToBelow&&area(polygonClipping.intersection(footprint,room.polygon as Polygon))>=a-.001);
 if(!room)return 'Place this furnishing inside a covered room, clear of walls.';
 if(spec.blocking&&level.blocks.some(b=>b.kind!=='stair'&&furnitureOverlaps(rect,b,.02)))return 'Keep this furnishing clear of walls and railings.';
 const floors=decks.filter(d=>d.id.startsWith(`interior/${item.floor}/`)&&d.polygon);
 if(!floors.length||area(polygonClipping.intersection(footprint,floors.map(d=>d.polygon!) as MultiPolygon))<a-.001)return 'Keep this furnishing clear of floor openings.';
 const floorY=floors[0].y;
 if(decks.some(d=>(d.id.includes('/ramp')||d.id.endsWith('/upper')||d.id.startsWith('entry/'))&&Math.abs(d.y-floorY)<.65&&furnitureOverlaps(rect,d,.12)))return 'Keep the stair route clear.';
 if(spec.blocking&&portals.some(p=>p.floor===item.floor&&furnitureOverlaps(rect,{...p,depth:1.6},.12)))return 'Leave room for the door to open.';
 if(placed.some(other=>other.id!==item.id&&other.floor===item.floor&&STUDIO_FURNITURE[other.kind].blocking===spec.blocking&&furnitureOverlaps(rect,{...other,...STUDIO_FURNITURE[other.kind]},0)))return 'Keep other furnishings clear.';
 return null;
}
