import { BoxGeometry, PlaneGeometry, MeshLambertMaterial, type BufferGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { architecture } from "../../domain/cityArchitecture";
import { BUILDING_RECIPES } from "../../domain/cityLayout";
import type { Piece } from "./CityInstances";

/** Metre-sized facade geometry is baked once per preset, never stretched per wing. */
export function createCityArchitecture() {
  const result = new Map<string, Piece[]>();
  const walls = [new MeshLambertMaterial({color:"#b9a58d"}), new MeshLambertMaterial({color:"#65716d"})];
  const glass = new MeshLambertMaterial({color:"#354a4b"});
  const roof = new MeshLambertMaterial({color:"#555c56"});
  const box = (x:number,y:number,z:number,w:number,h:number,d:number) => new BoxGeometry(w,h,d).toNonIndexed().translate(x,y,z);
  function merge(parts: BufferGeometry[]) {
    const merged = mergeGeometries(parts)!;
    parts.forEach(part=>part.dispose());
    return merged;
  }
  for(let tier=0;tier<BUILDING_RECIPES.length;tier++) for(let variant=0;variant<2;variant++) for(const near of [true,false]) {
    const plan=architecture(tier,variant,near);
    const masses:BufferGeometry[]=[], caps:BufferGeometry[]=[], windows:BufferGeometry[]=[];
    for(const w of plan.wings) {
      masses.push(box(w.x,w.height/2,w.z,w.width,w.height,w.depth));
      caps.push(box(w.x,w.height+0.1,w.z,w.width,0.2,w.depth));
    }
    for(const w of plan.windows) windows.push(new PlaneGeometry(w.width,w.height).toNonIndexed().rotateY(w.rotation).translate(w.x,w.y,w.z));
    // Grounded entrance at the main camera-facing frontage; no miniature mullions or brick maps.
    windows.push(new PlaneGeometry(1.8,2.4).toNonIndexed().rotateY(plan.rotation)
      .translate(Math.sin(plan.rotation)*7.54,1.2,Math.cos(plan.rotation)*7.54));
    result.set(`Building_${tier}_${variant}_${near ? "near" : "far"}`, [
      {geometry:merge(masses),material:walls[variant]},
      {geometry:merge(caps),material:roof},
      {geometry:merge(windows),material:glass},
    ]);
  }
  return result;
}
