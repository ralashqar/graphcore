import { CitySpriteBuildings } from "./CitySpriteBuildings";
import { useCityMapLayout } from "./CityMapLayout";
import { officePreset } from "./CityOfficePresets";
import { estateBillboard } from "../../domain/cityLayout";
import { useMarketMotion } from "./CityMarketMotion";
import { Batch, type Instance, type Piece } from "./CityInstances";
import { CityBillboards } from "./CityBillboards";
import { useEffect, useMemo } from "react";
import { Html, useGLTF } from "@react-three/drei";
import {
  BoxGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  type Material,
  Mesh,
  MeshLambertMaterial,
  type MeshStandardMaterial,
} from "three";
import type { CityProperty } from "../../domain/city";
import {
  BUILDING_RECIPES,
  buildingVariant,
  billboardEnvelope,
  roadNetwork,
} from "../../domain/cityLayout";

const unitBox = new BoxGeometry(1, 1, 1);
const paving = new MeshLambertMaterial({ color: "#d7d0bc" });
const grass = new MeshLambertMaterial({ color: "#8e9d79" });
const canopy = {
  geometry: new IcosahedronGeometry(1, 1),
  material: new MeshLambertMaterial({ color: "#607c57" }),
};
const trunk = {
  geometry: new CylinderGeometry(0.14, 0.22, 1, 6),
  material: new MeshLambertMaterial({ color: "#746652" }),
};

export function CityKit({
  estateDemo = false,
  properties,
  selected,
  capacity,
  center,
  zoom,
  onSelect,
  reduced,
  labels = true,
  matchIds,
}: {
  estateDemo?: boolean;
  properties: CityProperty[];
  selected: CityProperty | null;
  capacity: number;
  center: { x: number; z: number };
  zoom: number;
  onSelect: (p: CityProperty) => void;
  reduced: boolean;
  labels?: boolean;
  matchIds?: Set<string>;
}) {
  const { plotAxis, plotSize, roadCapacityMultiplier } = useCityMapLayout();
  const spriteMode = estateDemo && new URLSearchParams(window.location.search).get("cityRender") !== "offices";
  const emptyMode = spriteMode && new URLSearchParams(window.location.search).get("cityRender") === "empty";
  const playback = useMarketMotion();
  const { scene } = useGLTF(spriteMode ? "/city/sprites/streets.glb?v=1" : estateDemo ? "/city/offices/offices.glb?v=2" : "/city/downtown/downtown.glb?v=source-v3", false, true);
  const signEnvelope = estateDemo ? estateBillboard : billboardEnvelope;
  const assets = useMemo(() => {
    const result = new Map<string, Piece[]>(),
      cache = new Map<Material, Material>();
    scene.updateMatrixWorld(true);
    for (const root of scene.children) {
      const key = root.userData.assetKey || root.name;
      if (estateDemo ? key.startsWith("Building_") : key.startsWith("Office_")) continue;
      const pieces: Piece[] = [];
      root.traverse((child) => {
        if (!(child instanceof Mesh)) return;
        const original = child.material as MeshStandardMaterial;
        if (Array.isArray(original)) {
          throw new Error("Expected exported material primitives");
        }
        let material = cache.get(original);
        if (!material) {
          // Static architectural windows, shared colour textures, no engine-specific interior shaders.
          material = new MeshLambertMaterial({
            color: original.color,
            map: original.map,
            emissive: original.emissive,
            emissiveMap: original.emissiveMap,
            transparent: original.transparent,
            opacity: original.opacity,
            alphaTest: original.alphaTest,
            side: original.side,
            depthWrite: !original.transparent,
          });
          cache.set(original, material);
        }
        const geometry = child.geometry.clone();
        // Quantized positions must be expanded before baking their node scale:
        // writing metre coordinates into a normalized integer attribute corrupts them.
        for (const semantic of ["position", "normal"]) {
          const attribute = geometry.getAttribute(semantic);
          if (!attribute) continue;
          const values = new Float32Array(attribute.count * 3);
          for (let i = 0; i < attribute.count; i++) {
            values.set(
              [attribute.getX(i), attribute.getY(i), attribute.getZ(i)],
              i * 3,
            );
          }
          geometry.setAttribute(
            semantic,
            new Float32BufferAttribute(values, 3),
          );
        }
        pieces.push({
          geometry: geometry.applyMatrix4(child.matrixWorld),
          material,
        });
      });
      result.set(key, pieces);
    }
    return result;
  }, [scene, estateDemo]);
  useEffect(
    () => () => {
      const materials = new Set<Material>();
      for (const pieces of assets.values()) {
        for (const p of pieces) {
          p.geometry.dispose();
          materials.add(p.material);
        }
      }
      for (const mat of materials) mat.dispose();
    },
    [assets],
  );
  const roads = useMemo(() => roadNetwork(capacity * roadCapacityMultiplier), [capacity, roadCapacityMultiplier]);
  const visibleRoads = useMemo(() => {
    const groups = new Map<string, Instance[]>();
    for (const p of roads.placements) {
      if (
        Math.abs(p.x - plotAxis(center.x)) > 430 ||
        Math.abs(p.z - plotAxis(center.z)) > 430
      ) {
        continue;
      }
      const list = groups.get(p.asset) || [];
      list.push(p);
      groups.set(p.asset, list);
      if (p.asset === "Street_4Lane") {
        const along = p.rotation ? p.z : p.x;
        const blockOffset = ((Math.round(along) % 66) + 66) % 66;
        if (blockOffset === 18 || blockOffset === 48) {
          const arrows = groups.get("Road_Arrows") || [];
          arrows.push({ ...p, key: `arrows:${p.key}` });
          groups.set("Road_Arrows", arrows);
        }
      }
    }
    return groups;
  }, [roads, center.x, center.z]);
  const plots = useMemo(() => {
    const radius = Math.round(Math.sqrt(capacity) / 2),
      out: Instance[] = [];
    // Full blocks remain landscaped even when an expansion ring fills only half of them.
    const extent = Math.ceil(radius / 2) * 2;
    for (
      let x = Math.max(-extent, center.x - 12);
      x <= Math.min(extent, center.x + 12);
      x++
    ) {
      for (
        let z = Math.max(-extent, center.z - 12);
        z <= Math.min(extent, center.z + 12);
        z++
      ) {
        if (x && z) {
          out.push({
            key: `plot:${x}:${z}`,
            x: plotAxis(x),
            y: -0.07,
            z: plotAxis(z),
            scale: [plotSize - 0.2, 0.14, plotSize - 0.2],
          });
        }
      }
    }
    return out;
  }, [capacity, center.x, center.z, plotAxis, plotSize]);
  const buildings = useMemo(() => {
    const groups = new Map<string, Instance[]>();
    for (const p of properties) {
      const office = estateDemo ? officePreset(p.id) : null;
      const near = p.id === selected?.id ||
        ((estateDemo ? officePreset(p.id).height : BUILDING_RECIPES[p.tier].floors * 3) * zoom >= 38 &&
          Math.abs(p.x - center.x) <= 5 &&
          Math.abs(p.z - center.z) <= 5);
      const asset = `${office ? office.key : `Building_${p.tier}_${buildingVariant(p.id)}`}_${
        near ? "near" : "far"
      }`;
      const list = groups.get(asset) || [];
      list.push({
        key: p.id,
        x: plotAxis(p.x), z: plotAxis(p.z), property: p,
        color: matchIds && !matchIds.has(p.id) && p.id !== selected?.id ? "#767d76" : "#ffffff",
      });
      groups.set(asset, list);
    }
    return groups;
  }, [properties, selected?.id, zoom, center.x, center.z, matchIds, estateDemo]);
  const { paths, planters } = useMemo(() => {
    const paths: Instance[] = [],
      planters: Instance[] = [];
    for (const p of properties) {
      const variant = buildingVariant(p.id),
        x = plotAxis(p.x), z = plotAxis(p.z), sign = variant ? 1 : -1;
      if (estateDemo) {
        paths.push({ key: p.id, x: x + 20.5, y: 0.025, z: z + 20.5, scale: [3, 0.05, 7] });
        planters.push({ key: p.id, x: x - 19, z: z - 17 });
        continue;
      }
      // A two-metre walk through the open courtyard, outside both joined wings.
      paths.push({ key: p.id, x: x + (variant ? -3 : -7.5), y: 0.025,
        z: z + (variant ? -7.5 : -3), scale: variant ? [2, 0.05, 9] : [9, 0.05, 2] });
      if (Math.abs(p.x - center.x) <= 5 && Math.abs(p.z - center.z) <= 5) {
        planters.push({ key: p.id, x: x + sign * 9.5, z: z + 7 });
      }
    }
    return { paths, planters };
  }, [properties, center.x, center.z, estateDemo]);
  const plaza = useMemo(() => {
    const paving: Instance[] = [],
      bollards: Instance[] = [],
      planters: Instance[] = [];
    for (let x = -7.5; x <= 7.5; x += 3) {
      for (let z = -7.5; z <= 7.5; z += 3) {
        paving.push({ key: `${x}:${z}`, x, z });
      }
    }
    for (const side of [-1, 1]) {
      for (const offset of [-4, -2, 0, 2, 4]) {
        bollards.push({ key: `x${side}:${offset}`, x: side * 8, z: offset });
        bollards.push({ key: `z${side}:${offset}`, x: offset, z: side * 8 });
      }
    }
    for (const x of [-6, 6]) {
      for (const z of [-6, 6]) planters.push({ key: `${x}:${z}`, x, z });
    }
    return { paving, bollards, planters };
  }, []);
  const piece = (asset: string) => {
    const found = assets.get(asset);
    if (!found) throw new Error(`Missing downtown asset: ${asset}`);
    return found;
  };
  const planting = useMemo(
    () => [...plaza.planters, ...planters],
    [plaza, planters],
  );
  const trunks = useMemo(
    () =>
      planting.map((p) => ({
        ...p,
        y: 1.7,
        scale: [1, 2.4, 1] as [number, number, number],
      })),
    [planting],
  );
  const crowns = useMemo(
    () =>
      planting.map((p) => ({
        ...p,
        y: 3.5,
        scale: [1.7, 2, 1.7] as [number, number, number],
      })),
    [planting],
  );
  const extent = Math.ceil(Math.sqrt(capacity * roadCapacityMultiplier) / 4) * 132 + 60;
  return (
    <>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.17, 0]}
        receiveShadow
      >
        <planeGeometry args={[extent, extent]} />
        <meshLambertMaterial color="#a8b298" />
      </mesh>
      <Batch
        pieces={[{ geometry: unitBox, material: grass }]}
        instances={plots}
      />
      {[...visibleRoads].map(([asset, instances]) => (
        <Batch key={asset} pieces={piece(asset)} instances={instances} />
      ))}
      <Batch pieces={piece("Sidewalk_NoCurb_3m")} instances={plaza.paving} />
      {!spriteMode && <>
      <Batch pieces={piece("Prop_Bollard")} instances={plaza.bollards} />
      <Batch pieces={piece("Prop_Planter_Single")} instances={planting} />
      <Batch pieces={[trunk]} instances={trunks} />
      <Batch pieces={[canopy]} instances={crowns} />
      <Batch
        pieces={[{ geometry: unitBox, material: paving }]}
        instances={paths}
      />
      </>}
      {!spriteMode && <>
      {[...buildings].map(([asset, instances]) => (
        <Batch
          key={asset}
          pieces={piece(asset)}
          instances={instances}
          onSelect={onSelect}
          reduced={reduced}
          animate
        />
      ))}
      <CityBillboards
        envelope={signEnvelope}
        perimeter={estateDemo}
        properties={properties}
        selected={selected}
        center={center}
        onSelect={onSelect}
        reduced={reduced}
      />
      </>}
      {spriteMode && !emptyMode && <CitySpriteBuildings properties={properties} selected={selected} matchIds={matchIds} onSelect={onSelect} reduced={reduced} />}
      {properties
        .filter((p) => !emptyMode && labels && (p.rank <= 3 || p.id === selected?.id))
        .map((p) => (
          <Html
            style={playback && performance.now() - playback.started < 3000
              ? { visibility: "hidden" }
              : undefined}
            key={p.id}
            position={[
              plotAxis(p.x),
              spriteMode ? 32 : Math.max(estateDemo ? officePreset(p.id).height : BUILDING_RECIPES[p.tier].floors * 3, signEnvelope(p.tier, p.id).bottom + signEnvelope(p.tier, p.id).height) + 2,
              plotAxis(p.z),
            ]}
            center
            zIndexRange={[3, 0]}
          >
            <button
              className={`city-map-label ${
                selected?.id === p.id ? "is-selected" : ""
              }`}
              onClick={() => onSelect(p)}
            >
              <span>{String(p.rank).padStart(2, "0")}</span>
              {p.profile.name}
            </button>
          </Html>
        ))}
      {labels && (
        <Html position={[0, 0.2, 0]} center zIndexRange={[2, 0]}>
          <span className="city-plaza-label">CENTRAL PLAZA</span>
        </Html>
      )}
    </>
  );
}
