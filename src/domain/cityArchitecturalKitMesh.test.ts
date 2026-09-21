import { test } from "node:test";
import assert from "node:assert/strict";
import { NodeIO } from "@gltf-transform/core";
import {
  BoxGeometry,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
} from "three";
import { newDesign, normalizeV3, resolveV3 } from "./cityBuildingV3.ts";
const document = await new NodeIO().read(
  "public/city/decorators/decorators.glb",
);
const library = new Map(
  document.getRoot().listNodes().filter((n) => n.getMesh()).map(
    (n) => [n.getName(), n.getMesh()!],
  ),
);
const material = new MeshBasicMaterial({ side: DoubleSide });
function mesh(
  asset: string,
  position: number[],
  rotation: number,
  scale: number[],
) {
  return library.get(asset)!.listPrimitives().map((p) => {
    const g = new BufferGeometry();
    g.setAttribute(
      "position",
      new Float32BufferAttribute(p.getAttribute("POSITION")!.getArray()!, 3),
    );
    if (p.getIndices()) g.setIndex(Array.from(p.getIndices()!.getArray()!));
    const m = new Mesh(g, material);
    m.position.set(...position as [number, number, number]);
    m.rotation.y = rotation;
    m.scale.set(...scale as [number, number, number]);
    m.updateMatrixWorld();
    return m;
  });
}
test("exported slate assembly closes the entire rectangular roof, including corners and dormer joins", () => {
  for (const width of [8, 14, 18]) {
    const d = normalizeV3({
      ...newDesign("roof-mesh"),
      blueprint: "office",
      width,
      depth: 10,
      middleFloors: 1,
      crown: "none",
      finish: "facade",
      architecturalKit: { roof: "slate-dormers" },
    });
    const r = resolveV3(d, "#888888"), top = r.masses.at(-1)!;
    const meshes = r.attachments.filter((a) => a.role === "roof").flatMap((a) =>
      mesh(
        a.asset,
        a.position,
        a.rotation,
        a.axisScale || [a.scale, a.scale, a.scale],
      )
    );
    for (
      const p of r.parts.filter((p) => p.color === "#596268" && !p.fallback)
    ) {
      const m = new Mesh(new BoxGeometry(...p.size), material);
      m.position.set(...p.position);
      m.updateMatrixWorld();
      meshes.push(m);
    }
    const ray = new Raycaster(), missing: string[] = [];
    for (
      let x = top.x - top.width / 2 + .07;
      x < top.x + top.width / 2 - .07;
      x += .23
    ) {
      for (
        let z = top.z - top.depth / 2 + .07;
        z < top.z + top.depth / 2 - .07;
        z += .23
      ) {
        ray.set(
          new Vector3(x, top.y + top.height + 5, z),
          new Vector3(0, -1, 0),
        );
        if (!ray.intersectObjects(meshes, false).length) {
          missing.push(`${x.toFixed(2)},${z.toFixed(2)}`);
        }
      }
    }
    assert.deepEqual(missing, [], `roof ${width} has uncovered points`);
    for (const m of meshes) m.geometry.dispose();
  }
});

test("native cornice profiles stay continuous along the front roofline",()=>{
 for(const roofline of ["restrained","classical","industrial"] as const){
 const d=normalizeV3({...newDesign("cornice-mesh"),blueprint:"office",width:14,depth:10,middleFloors:1,crown:"none",finish:"facade",nativeFacade:"brick-classic",architecturalKit:{roofline}});
 const r=resolveV3(d,"#888888"),top=r.masses.at(-1)!;
 const meshes=r.attachments.filter(a=>a.role==="cornice").flatMap(a=>mesh(a.asset,a.position,a.rotation,a.axisScale||[a.scale,a.scale,a.scale]));
 const ray=new Raycaster();ray.far=4;const misses:string[]=[];
 for(let x=top.x-top.width/2+.1;x<top.x+top.width/2-.1;x+=.11){
  ray.set(new Vector3(x,top.y+top.height+.12,top.z+top.depth/2+3),new Vector3(0,0,-1));
  if(!ray.intersectObjects(meshes,false).length)misses.push(x.toFixed(3));
 }
 assert.deepEqual(misses,[],roofline+" cornice gaps");
 for(const m of meshes)m.geometry.dispose();
 }
});
