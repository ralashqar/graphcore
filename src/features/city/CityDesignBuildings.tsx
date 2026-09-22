import { useCityReflection } from "./cityReflections";
import { CityBuildingGrounding } from "./CityBuildingGrounding";
import { spiralRailPositions, spiralTreadPositions } from "../../domain/citySpiralStair";
import { usePreparedCity } from "./usePreparedCity";
import { CITY_LIGHT_MODE } from "./cityRenderMode";
import { borderTexture } from "../../domain/cityTexturePresets";
import { useThree } from "@react-three/fiber";
import type { CityTextureId } from "../../domain/cityTexturePresets";
import { bevelCityGeometry } from "./CityBevelGeometry";
import { citySurfaceMaterial } from "./CitySurfaceMaterial";
import { type CityDetail } from "../../domain/cityStreaming";
import { CityVisibility } from "./CityVisibility";
import { cachedCityDesign } from "./cityDesignCache";
import { pitchedRoofPositions } from "../../domain/cityBuildingSurfaces";
import { useEffect, useMemo, useState } from "react";
import {
  Shape,
  ExtrudeGeometry,
  BoxGeometry,
  CylinderGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  IcosahedronGeometry,
  MeshLambertMaterial,
} from "three";
import { type DecoratorPack, loadDecorators } from "./CityDecorators";
import { CityDesignSigns } from "./CityDesignSigns";
import { buildingParts } from "../../domain/cityBuildingDesign";
import type { CityProperty } from "../../domain/city";
import { Batch, type Instance } from "./CityInstances";
import { useCityMapLayout } from "./CityMapLayout";

/** Shared by the editor and world. Procedural primitives and each curated geometry/material are instanced across properties. */
function BuildingBatches(
  {
    properties,
    onSelect,
    reduced = true,
    matchIds,
    selectedId,
    center,
  }: {
    properties: CityProperty[];
    onSelect?: (property: CityProperty) => void;
    reduced?: boolean;
    matchIds?: Set<string>;
    selectedId?: string;
    center?: { x: number; z: number };
    zoom?: number;
  },
) {
  const invalidate=useThree(s=>s.invalidate);
  const reflection=useCityReflection();
  const { plotAxis, plotSize } = useCityMapLayout();
  const [pack, setPack] = useState<DecoratorPack | null>(null);
  const needsPack = !CITY_LIGHT_MODE && properties.some((p) =>
    !p.profile.buildingArt &&
    p.profile.buildingDesign && p.profile.buildingDesign.version !== 1 &&
    !(p.profile.buildingDesign.version === 3 && p.profile.buildingDesign.generatorRevision === "city-office-4") &&
    (p.profile.buildingDesign.finish !== "procedural" || (p.profile.buildingDesign.version === 3 && p.profile.buildingDesign.stairExtension === "fire-escape"))
  );
  useEffect(() => {
    let live = true;
    if (needsPack && !pack) {
      void loadDecorators().then((p) => {
        if (live) setPack(p);
      }).catch(() => {});
    }
    return () => {
      live = false;
    };
  }, [needsPack, pack]);
  const resources = useMemo(
    () => ({
      archedPane: (()=>{const shape=new Shape();shape.moveTo(-.5,-.5);shape.lineTo(.5,-.5);shape.lineTo(.5,0);shape.absarc(0,0,.5,0,Math.PI,false);shape.closePath();return new ExtrudeGeometry(shape,{depth:1,bevelEnabled:false,curveSegments:CITY_LIGHT_MODE?4:12}).translate(0,0,-.5);})(),
      archInfill: (()=>{const shape=new Shape();shape.moveTo(-.5,0);shape.lineTo(-.5,.5);shape.lineTo(.5,.5);shape.lineTo(.5,0);shape.absarc(0,0,.5,0,Math.PI,false);shape.closePath();return new ExtrudeGeometry(shape,{depth:1,bevelEnabled:false,curveSegments:CITY_LIGHT_MODE?4:12}).translate(0,0,-.5);})(),
      box: bevelCityGeometry(new BoxGeometry(1, 1, 1)),
      pane: new BoxGeometry(1, 1, 1),
      tree: new IcosahedronGeometry(1, 1),
      mansard: (() => { const g = new BufferGeometry(); g.setAttribute("position", new Float32BufferAttribute(pitchedRoofPositions("mansard"), 3)); g.computeVertexNormals(); return bevelCityGeometry(g); })(),
      hip: (() => { const g = new BufferGeometry(); g.setAttribute("position", new Float32BufferAttribute(pitchedRoofPositions("hip"), 3)); g.computeVertexNormals(); return bevelCityGeometry(g); })(),
      shed: (() => { const g = new BufferGeometry(); g.setAttribute("position", new Float32BufferAttribute(pitchedRoofPositions("shed"), 3)); g.computeVertexNormals(); return bevelCityGeometry(g); })(),
      stairRail: (()=>{const g=new BufferGeometry();g.setAttribute("position",new Float32BufferAttribute(spiralRailPositions(),3));g.computeVertexNormals();return g;})(),
      stairTread: (()=>{const g=new BufferGeometry();g.setAttribute("position",new Float32BufferAttribute(spiralTreadPositions(),3));g.computeVertexNormals();return g;})(),
      column: new CylinderGeometry(.5, .5, 1, 12),
      pediment: (() => {
        const g = new BufferGeometry();
        g.setAttribute("position", new Float32BufferAttribute(pitchedRoofPositions(), 3));
        g.rotateY(Math.PI / 2);
        g.computeVertexNormals();
        return bevelCityGeometry(g);
      })(),
      roof: (() => {
        const g = new BufferGeometry();
        g.setAttribute(
          "position",
          new Float32BufferAttribute(pitchedRoofPositions(), 3),
        );
        g.computeVertexNormals();
        return bevelCityGeometry(g);
      })(),
      custom: new Map<string,BufferGeometry>(),
      textured: new Map<string, ReturnType<typeof citySurfaceMaterial>>(),
      material: citySurfaceMaterial(),
      glass: citySurfaceMaterial(true),
    }),
    [],
  );
  useEffect(() => () => {
    resources.archInfill.dispose();
    resources.archedPane.dispose();
    resources.mansard.dispose();
    resources.custom.forEach(g=>g.dispose());
    resources.stairTread.dispose();
    resources.stairRail.dispose();
    resources.box.dispose();
    resources.pane.dispose();
    resources.column.dispose();
    resources.hip.dispose();
    resources.shed.dispose();
    resources.pediment.dispose();
    resources.tree.dispose();
    resources.roof.dispose();
    resources.textured.forEach(m=>m.dispose());
    resources.material.dispose();
    resources.glass.dispose();
  }, [resources]);
  useEffect(()=>{resources.glass.envMap=reflection;resources.glass.needsUpdate=true;invalidate();},[reflection,resources,invalidate]);
  const batches = useMemo(() => {
    const out: Record<string, Instance[]> = { box: [], tree: [], roof: [], column: [], pediment: [], hip: [], shed: [] };
    for (const p of properties) {
     for (const representation of (CITY_LIGHT_MODE ? ["simple"] as const : center ? ["full", "simple"] as const : ["full"] as const)) {
      const d = p.profile.buildingDesign;
      if (!d || p.profile.buildingArt) continue;
      const scale = plotSize / 24,
        angle = d.rotation * Math.PI / 2,
        c = Math.cos(angle),
        s = Math.sin(angle);
      const dim = matchIds && !matchIds.has(p.id) && p.id !== selectedId;
      const simple = representation === "simple";
      const lod: CityDetail = simple && (center || d.version!==3 || (d.generatorRevision!=="city-connected-3" && d.generatorRevision!=="city-office-4")) ? "medium" : "near";
      const resolved = d.version !== 1
        ? cachedCityDesign(d, p.profile.color, lod, simple)
        : null;
      const kit = !CITY_LIGHT_MODE && !simple && pack && d.version !== 1 && (lod === "near" || (d.version === 3 && lod === "medium")) && (d.finish !== "procedural" || (d.version === 3 && d.stairExtension === "fire-escape"));
      const legacyComplete = kit && resolved?.attachments.every(a => pack.has(a.asset));
      (resolved ? resolved.parts : buildingParts(d, p.profile.color)).forEach(
        (part, index) => {
          if (kit && "fallback" in part && part.fallback &&
            ("fallbackAssets" in part && Array.isArray(part.fallbackAssets) ? part.fallbackAssets.every(asset=>pack.has(asset)) : "fallbackAsset" in part && typeof part.fallbackAsset === "string" ? pack.has(part.fallbackAsset) : legacyComplete)) return;
          const [x, y, z] = part.position;
          // Unit-box chamfers grow with instance length and pull long rail/trim ends
          // away from their adjoining pieces. Keep slender connectors square-ended.
          const dimensions = [...part.size].sort((a, b) => b - a);
          const connector = part.kind === "box" && (dimensions[0] > dimensions[1] * 10 || ("squareEdges" in part && part.squareEdges));
          let key = d.version !== 1 && part.kind === "box" && part.color === d.palette.glass ? "glassBox" : connector ? "joinedBox" : part.kind;
          if(part.kind==="mesh" && part.vertices){
            let hash=2166136261,second=5381;for(const v of part.vertices){const n=Math.round(v*1e6);hash=Math.imul(hash^n,16777619);second=Math.imul(second,33)^n;}
            key=`mesh:${hash>>>0}:${second>>>0}:${part.vertices.length}`;
            if(!resources.custom.has(key)){const g=new BufferGeometry();g.setAttribute("position",new Float32BufferAttribute(part.vertices,3));g.computeVertexNormals();resources.custom.set(key,g);}
          }
          if (simple && key === "box") key = "joinedBox";
          const texture = d.version === 3 && key !== "glassBox" && key !== "archedPane" ? ("textureRole" in part && part.textureRole === "none" ? undefined : "textureRole" in part && part.textureRole === "roof" ? d.textures?.roof : "textureRole" in part && part.textureRole === "wall" ? d.textures?.wall : "textureRole" in part && part.textureRole === "groundBorder" ? borderTexture(d.textures,"ground") : part.position[1]<.6 ? d.textures?.ground : part.color===d.palette.roof ? d.textures?.roof : part.color===d.palette.wall ? d.textures?.wall : undefined) : undefined;
          if(texture && texture!=="none") key+="|"+texture;
          (out[key] ||= []).push({
            detail: center ? representation : undefined,
            key: `${p.id}:${index}`,
            property: p,
            x: plotAxis(p.x) + (x * c + z * s) * scale,
            y: y * scale,
            z: plotAxis(p.z) + (z * c - x * s) * scale,
            scale: part.size.map((v) => v * scale) as [number, number, number],
            rotation: angle + (part.rotation || 0),
            color: texture && texture!=="none" ? (dim ? "#8c8c8c" : "#ffffff") : dim
              ? `#${new Color(part.color).multiplyScalar(.55).getHexString()}`
              : part.color,
          });
        },
      );
      if (kit && resolved) {
        for (const [index, a] of resolved.attachments.entries()) {
          if (!pack.has(a.asset)) {
            continue;
          }
          const [x, y, z] = a.position;
          pack.get(a.asset)!.forEach((piece, partIndex) => {
            let key = "asset|" + a.asset + "|" + partIndex;
            const role = (piece.material as MeshLambertMaterial).userData
              .cityPalette as "wall" | "trim" | "glass";
            const texture=d.version===3 ? ((a.role==="floor" || a.role==="roof") ? d.textures?.roof : a.role==="paving" ? (role==="trim" ? borderTexture(d.textures,"ground") : d.textures?.ground) : role==="trim" ? (["facade","cornice","column","band"].includes(a.role) ? borderTexture(d.textures,"wall") : undefined) : (role==="wall" || (a.role==="facade" && role!=="glass")) ? d.textures?.wall : undefined) : undefined;
            if(texture && texture!=="none") key+="|"+texture;
            const tint = d.palette[a.role === "paving" ? "trim" : role];
          (out[key] ||= []).push({
            detail: center ? representation : undefined,
              key: `${p.id}:asset:${index}`,
              property: p,
              x: plotAxis(p.x) + (x * c + z * s) * scale,
              y: y * scale,
              z: plotAxis(p.z) + (z * c - x * s) * scale,
              rotation: angle + a.rotation,
              scale: (a.axisScale || [a.scale,a.scale,a.scale]).map(v=>v*scale) as [number,number,number],
              color: (texture && texture!=="none") || piece.material.userData.cityNativeTexture ? (dim ? "#8c8c8c" : "#ffffff") : dim
                ? `#${new Color(tint).multiplyScalar(.55).getHexString()}`
                : tint,
            });
          });
        }
      }
     }
    }
    return out;
  }, [
    properties,
    plotAxis,
    plotSize,
    matchIds,
    selectedId,
    pack,
    !!center,
  ]);
  useEffect(()=>{
    const used=new Set(Object.keys(batches).map(k=>k.split("|")[0]));
    resources.custom.forEach((geometry,key)=>{if(!used.has(key)){geometry.dispose();resources.custom.delete(key);}});
  },[batches,resources]);
  const textureMaterial=(id:string)=>{
    if(!resources.textured.has(id))resources.textured.set(id,citySurfaceMaterial(false,id as CityTextureId,invalidate));
    return resources.textured.get(id)!;
  };
  return (
    <>
      {Object.entries(batches).filter(([, items]) => items.length).map((
        [kind, items],
      ) => (
        <Batch
          key={kind}
          pieces={kind.startsWith("asset|")
            ? [{...pack!.get(kind.split("|")[1])![Number(kind.split("|")[2])], ...(kind.split("|")[3] ? {material:textureMaterial(kind.split("|")[3])} : {})}]
            : [{
              geometry: kind.startsWith("mesh:") ? resources.custom.get(kind.split("|")[0])! : (kind === "glassBox" || kind.split("|")[0] === "joinedBox") ? resources.pane : resources[kind.split("|")[0] as "box" | "tree" | "roof" | "column" | "pediment" | "hip" | "shed" | "mansard" | "stairTread" | "stairRail" | "archedPane" | "archInfill"],
              material: kind === "glassBox" || kind === "archedPane" ? resources.glass : kind.includes("|") ? textureMaterial(kind.split("|")[1]) : resources.material,
            }]}
          instances={items}
          onSelect={onSelect}
          reduced={reduced}
          animate
        />
      ))}
      {properties.some((p) =>
        p.profile.buildingDesign && p.profile.buildingDesign.version !== 1 &&
    !(p.profile.buildingDesign.version === 3 && p.profile.buildingDesign.generatorRevision === "city-office-4") &&
        !p.profile.buildingArt
      ) && (
        <CityDesignSigns
          properties={properties}
          reduced={reduced}
          onSelect={onSelect}
          matchIds={matchIds}
          selectedId={selectedId}
        />
      )}
    </>
  );
}

export function CityDesignBuildings(props: Parameters<typeof BuildingBatches>[0]) {
 const prepared=usePreparedCity(props.properties,!!props.center);
 return <CityVisibility properties={prepared} enabled={!!props.center} simpleOnly={CITY_LIGHT_MODE}><BuildingBatches {...props} properties={prepared}/><CityBuildingGrounding properties={prepared} center={props.center} reduced={props.reduced}/></CityVisibility>;
}
