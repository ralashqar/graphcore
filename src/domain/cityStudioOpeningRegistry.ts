/**
 * Canonical opening pieces known to this thread, by key (cityStudioOpeningPieces). Dependency-free, so the main
 * thread can register pieces received from workers without loading the geometry modules.
 */
export type OpeningPieceGeometry={positions:Float32Array;normals:Float32Array;colors:Float32Array;slots:Float32Array;indices:Uint16Array|Uint32Array;near:number;farStart:number;far:number;sphere:[number,number,number,number]};
/** `farRect`: the far representation is exactly one rectangle fill at the glazing plane, from the piece origin (a
 * rectangular window: glass, or a dark aperture fill when unglazed), so far instances can share one unit quad. */
export type OpeningPiece={key:string;painted?:OpeningPieceGeometry;glass?:OpeningPieceGeometry;triangles:{near:number;far:number};farRect?:{kind:'glass'|'aperture';width:number;height:number;z:number}};
export const openingPieceRegistry=new Map<string,OpeningPiece>();
/** Main thread: pieces received from a worker (the same key is the same geometry wherever it was built). */
export function registerOpeningPieces(list:readonly OpeningPiece[]|undefined){for(const p of list??[])if(!openingPieceRegistry.has(p.key))openingPieceRegistry.set(p.key,p);}
export const lookupOpeningPiece=(key:string)=>openingPieceRegistry.get(key);
