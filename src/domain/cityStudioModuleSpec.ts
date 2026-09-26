/**
 * Kit pieces as opening types (unified facades, docs/city-unified-facades.md).
 *
 * A free opening with `module` hosts one Blender kit window, door or wall module in a generated wall. The
 * kit tiles are 0.3 m slabs centred on the wall line whose `wall` channel is four boxes around a rectangular
 * aperture (the catalogue's measured `opening`, identical for "arched" modules: the arch is trim). So:
 *  - aperture modules (windows, doors, the garage): the generated wall is cut at the measured aperture and the
 *    module is drawn without its `wall` channel; the wall's own reveal and wear shader frame the hole;
 *  - panel modules (rusticated or panelled walls): no hole; the module's relief (trim channel) sits on the wall;
 *  - blind modules (plain wall tiles): no hole and nothing drawn; the opening only reserves its span.
 * Module openings keep the tile's native size (`width`/`height` = catalogue size) and sit on a storey floor.
 */
import {STUDIO_MODULE_MAP} from './cityStudioCatalog.ts';

export type ModuleOpeningKind='aperture'|'panel'|'blind';
/** Tile size and the aperture (relative to the tile's bottom centre: x from -w/2 to w/2, y from 0). */
export type ModuleOpeningSpec={id:string;category:'window'|'door'|'wall';kind:ModuleOpeningKind;width:number;height:number;aperture?:{x0:number;x1:number;y0:number;y1:number}};
/** Rhythm pool ids that stand for a kit module. */
export const MODULE_POOL_PREFIX='module:';
/** Kit modules whose only geometry is the plain wall slab. */
const PLAIN_WALLS=new Set(['wall-full','wall-half','wall-quarter','wall-nyc-brick']);
const cache=new Map<string,ModuleOpeningSpec|null>();
/** Opening spec of a kit module, or null when it cannot host an opening (not a window/door/wall tile, corners, curve). */
export function moduleOpeningSpec(id:string|undefined):ModuleOpeningSpec|null{
 if(!id)return null;const hit=cache.get(id);if(hit!==undefined)return hit;
 const part=STUDIO_MODULE_MAP.get(id);let spec:ModuleOpeningSpec|null=null;
 if(part&&['window','door','wall'].includes(part.category)&&!/^corner-|^wall-curve$/.test(id)){
  const [width,height]=part.size,o=(part as unknown as {opening?:{width:number;bottom:number;top:number}}).opening;
  spec={id,category:part.category as ModuleOpeningSpec['category'],width,height,kind:o?'aperture':PLAIN_WALLS.has(id)?'blind':'panel',...(o?{aperture:{x0:-o.width/2,x1:o.width/2,y0:o.bottom,y1:o.top}}:{})};
 }
 cache.set(id,spec);return spec;
}
/** The module of a rhythm pool id (`module:<id>`), or null. */
export const poolModule=(poolId:string)=>poolId.startsWith(MODULE_POOL_PREFIX)?poolId.slice(MODULE_POOL_PREFIX.length):null;
