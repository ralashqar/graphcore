// Free-opening wall material (rendered per building by CityStudioDetailBatches).
import {Color} from 'three';
import {attribute,float,floor,fract,hash,materialColor,max,mix,mx_noise_float,positionWorld,smoothstep,step,uv,vec3} from 'three/tsl';
import {citySurfaceMaterial} from './CitySurfaceMaterial';
import type {CityTextureId} from '../../domain/cityTexturePresets';
import type {StudioFreeFace} from '../../domain/cityStudioFreeFaces';

const lin=(hex:string)=>{const c=new Color(hex);return vec3(c.r,c.g,c.b);};
/**
 * Wall surface worn by nearby openings, Tiny Glade style: the per-vertex
 * `openingDistance` (metres to the nearest opening edge) reveals coursed stone
 * through the plaster within a noisy ~0.35 m band. Node material, so it runs on
 * WebGPU and on the WebGL2 node backend alike.
 */
export function freeWallMaterial(color:string,texture:CityTextureId){
 const m=citySurfaceMaterial(false,texture);m.color.set(color);
 const base=(m.colorNode??materialColor) as unknown as ReturnType<typeof vec3>,rough=(m.roughnessNode??float(m.roughness)) as unknown as ReturnType<typeof float>,d=attribute('openingDistance','float'),p=positionWorld;
 const n=mx_noise_float(p.mul(1.6)).mul(.6).add(mx_noise_float(p.mul(5.1)).mul(.25));
 const reach=float(.4).add(n.mul(.22)),wear=float(1).sub(smoothstep(reach.sub(.07),reach,d));
 const row=floor(p.y.div(.26)),along=uv().x.div(.46).add(row.mul(.5)),tone=hash(row.mul(71).add(floor(along).mul(13))).mul(.26).add(.8);
 const joint=max(step(fract(p.y.div(.26)),.07),step(fract(along),.05));
 const stone=mix(lin('#c9bda5').mul(tone),lin('#7c7468'),joint);
 // Mottled plaster away from openings, a thin grime line right at the edge.
 const mottled=base.mul(float(.95).add(n.mul(.05)));
 m.colorNode=mix(mottled,stone,wear).mul(float(.82).add(smoothstep(0,.06,d).mul(.18)));
 m.roughnessNode=mix(rough,float(.94),wear);
 return m;
}
export const freeFaceTexture=(face:StudioFreeFace):CityTextureId=>(face.finishes.wall?.texture as CityTextureId|undefined)??'none';
