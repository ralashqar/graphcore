import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import {
  BoxGeometry,
  Float32BufferAttribute,
  CylinderGeometry,
  IcosahedronGeometry,
  Color,
  InstancedMesh,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  Vector3,
  type BufferGeometry,
  type Material,
  type MeshStandardMaterial,
} from "three";
import type { CityProperty } from "../../domain/city";
import {
  BUILDING_RECIPES,
  buildingVariant,
  frontage,
  plotAxis,
  roadNetwork,
} from "../../domain/cityLayout";

type Instance = {
  key: string;
  x: number;
  y?: number;
  z: number;
  rotation?: number;
  scale?: [number, number, number];
  color?: string;
  property?: CityProperty;
};
type Piece = { geometry: BufferGeometry; material: Material };
const unitBox = new BoxGeometry(1, 1, 1);
const paving = new MeshLambertMaterial({ color: "#d7d0bc" });
const grass = new MeshLambertMaterial({ color: "#8e9d79" });
const brand = new MeshLambertMaterial({ color: "white" });
const canopy = {
  geometry: new IcosahedronGeometry(1, 1),
  material: new MeshLambertMaterial({ color: "#607c57" }),
};
const trunk = {
  geometry: new CylinderGeometry(0.14, 0.22, 1, 6),
  material: new MeshLambertMaterial({ color: "#746652" }),
};

/** One draw per shared primitive/material, not one draw per building component. */
function Batch({
  pieces,
  instances,
  onSelect,
  reduced = false,
  animate = false,
}: {
  pieces: Piece[];
  instances: Instance[];
  onSelect?: (p: CityProperty) => void;
  reduced?: boolean;
  animate?: boolean;
}) {
  const refs = useRef<(InstancedMesh | null)[]>([]),
    poses = useRef(new Map<string, Vector3>()),
    dirty = useRef(true);
  const dummy = useMemo(() => new Object3D(), []),
    target = useMemo(() => new Vector3(), []);
  const { gl } = useThree();
  useLayoutEffect(() => {
    dirty.current = true;
    const keys = new Set(instances.map((i) => i.key));
    for (const key of poses.current.keys())
      if (!keys.has(key)) poses.current.delete(key);
    for (const mesh of refs.current)
      if (mesh) {
        instances.forEach((item, i) =>
          mesh.setColorAt(i, new Color(item.color || "#ffffff")),
        );
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
  }, [instances, pieces]);
  useFrame((_, delta) => {
    if (!dirty.current) return;
    let moving = false;
    instances.forEach((item, index) => {
      target.set(item.x, item.y || 0, item.z);
      const pose = poses.current.get(item.key) || target.clone();
      if (!animate || reduced) pose.copy(target);
      else pose.lerp(target, Math.min(1, delta * 5));
      poses.current.set(item.key, pose);
      if (pose.distanceToSquared(target) > 0.0001) moving = true;
      dummy.position.copy(pose);
      dummy.rotation.set(0, item.rotation || 0, 0);
      dummy.scale.set(...(item.scale || [1, 1, 1]));
      dummy.updateMatrix();
      for (const mesh of refs.current) mesh?.setMatrixAt(index, dummy.matrix);
    });
    for (const mesh of refs.current)
      if (mesh) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
    dirty.current = moving;
    gl.shadowMap.needsUpdate = true;
  });
  return (
    <>
      {pieces.map((piece, index) => (
        <instancedMesh
          key={index}
          ref={(m) => {
            refs.current[index] = m;
          }}
          args={[piece.geometry, piece.material, instances.length]}
          castShadow={animate}
          receiveShadow
          onClick={
            onSelect
              ? (e) => {
                  const p =
                    e.instanceId === undefined
                      ? undefined
                      : instances[e.instanceId]?.property;
                  if (p) {
                    e.stopPropagation();
                    onSelect(p);
                  }
                }
              : undefined
          }
        />
      ))}
    </>
  );
}

export function CityKit({
  properties,
  selected,
  capacity,
  center,
  zoom,
  onSelect,
  reduced,
}: {
  properties: CityProperty[];
  selected: CityProperty | null;
  capacity: number;
  center: { x: number; z: number };
  zoom: number;
  onSelect: (p: CityProperty) => void;
  reduced: boolean;
}) {
  const { scene } = useGLTF("/city/downtown/downtown.glb", false, true);
  const assets = useMemo(() => {
    const result = new Map<string, Piece[]>(),
      cache = new Map<Material, Material>();
    scene.updateMatrixWorld(true);
    for (const root of scene.children) {
      const key = root.userData.assetKey || root.name,
        pieces: Piece[] = [];
      root.traverse((child) => {
        if (!(child instanceof Mesh)) return;
        const original = child.material as MeshStandardMaterial;
        if (Array.isArray(original))
          throw new Error("Expected exported material primitives");
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
  }, [scene]);
  useEffect(
    () => () => {
      const materials = new Set<Material>();
      for (const pieces of assets.values())
        for (const p of pieces) {
          p.geometry.dispose();
          materials.add(p.material);
        }
      for (const mat of materials) mat.dispose();
    },
    [assets],
  );
  const roads = useMemo(() => roadNetwork(capacity), [capacity]);
  const visibleRoads = useMemo(() => {
    const groups = new Map<string, Instance[]>();
    for (const p of roads.placements) {
      if (
        Math.abs(p.x - plotAxis(center.x)) > 430 ||
        Math.abs(p.z - plotAxis(center.z)) > 430
      )
        continue;
      const list = groups.get(p.asset) || [];
      list.push(p);
      groups.set(p.asset, list);
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
    )
      for (
        let z = Math.max(-extent, center.z - 12);
        z <= Math.min(extent, center.z + 12);
        z++
      )
        if (x && z)
          out.push({
            key: `plot:${x}:${z}`,
            x: plotAxis(x),
            y: -0.07,
            z: plotAxis(z),
            scale: [23.8, 0.14, 23.8],
          });
    return out;
  }, [capacity, center.x, center.z]);
  const buildings = useMemo(() => {
    const groups = new Map<string, Instance[]>();
    for (const p of properties) {
      const near =
        p.id === selected?.id ||
        (BUILDING_RECIPES[p.tier].floors * 3 * zoom >= 38 &&
          Math.abs(p.x - center.x) <= 5 &&
          Math.abs(p.z - center.z) <= 5);
      const asset = `Building_${p.tier}_${buildingVariant(p.id)}_${near ? "near" : "far"}`;
      const list = groups.get(asset) || [];
      list.push({
        key: p.id,
        x: plotAxis(p.x),
        z: plotAxis(p.z),
        rotation: frontage(p.x),
        property: p,
      });
      groups.set(asset, list);
    }
    return groups;
  }, [properties, selected?.id, zoom, center.x, center.z]);
  const { signs, paths, planters } = useMemo(() => {
    const signs: Instance[] = [],
      paths: Instance[] = [],
      planters: Instance[] = [];
    for (const p of properties) {
      const recipe = BUILDING_RECIPES[p.tier],
        rotation = frontage(p.x),
        sign = Math.sin(rotation),
        x = plotAxis(p.x),
        z = plotAxis(p.z);
      signs.push({
        key: p.id,
        x: x + sign * (recipe.depth / 2 + 0.35),
        y: 2.6,
        z: z - 1,
        rotation,
        scale: [Math.min(5, recipe.width - 0.5), 0.65, 0.22],
        color: p.profile.color,
        property: p,
      });
      const length = 12 - recipe.depth / 2;
      paths.push({
        key: p.id,
        x: x + sign * (recipe.depth / 2 + length / 2),
        y: 0.025,
        z: z - 1,
        scale: [length, 0.05, 2],
      });
      if (Math.abs(p.x - center.x) <= 5 && Math.abs(p.z - center.z) <= 5)
        planters.push({ key: p.id, x: x + sign * 9.5, z: z + 7 });
    }
    return { signs, paths, planters };
  }, [properties, center.x, center.z]);
  const plaza = useMemo(() => {
    const paving: Instance[] = [],
      bollards: Instance[] = [],
      planters: Instance[] = [];
    for (let x = -7.5; x <= 7.5; x += 3)
      for (let z = -7.5; z <= 7.5; z += 3)
        paving.push({ key: `${x}:${z}`, x, z });
    for (const side of [-1, 1])
      for (const offset of [-4, -2, 0, 2, 4]) {
        bollards.push({ key: `x${side}:${offset}`, x: side * 8, z: offset });
        bollards.push({ key: `z${side}:${offset}`, x: offset, z: side * 8 });
      }
    for (const x of [-6, 6])
      for (const z of [-6, 6]) planters.push({ key: `${x}:${z}`, x, z });
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
  const extent = Math.ceil(Math.sqrt(capacity) / 4) * 132 + 60;
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
      <Batch pieces={piece("Prop_Bollard")} instances={plaza.bollards} />
      <Batch pieces={piece("Prop_Planter_Single")} instances={planting} />
      <Batch pieces={[trunk]} instances={trunks} />
      <Batch pieces={[canopy]} instances={crowns} />
      <Batch
        pieces={[{ geometry: unitBox, material: paving }]}
        instances={paths}
      />
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
      <Batch
        pieces={[{ geometry: unitBox, material: brand }]}
        instances={signs}
        onSelect={onSelect}
        reduced={reduced}
        animate
      />
      {properties
        .filter((p) => p.rank <= 3 || p.id === selected?.id)
        .map((p) => (
          <Html
            key={p.id}
            position={[
              plotAxis(p.x),
              BUILDING_RECIPES[p.tier].floors * 3 + 3,
              plotAxis(p.z),
            ]}
            center
            zIndexRange={[3, 0]}
          >
            <button
              className={`city-map-label ${selected?.id === p.id ? "is-selected" : ""}`}
              onClick={() => onSelect(p)}
            >
              <span>{String(p.rank).padStart(2, "0")}</span>
              {p.profile.name}
            </button>
          </Html>
        ))}
      {selected?.profile.logo && (
        <Html
          position={[
            plotAxis(selected.x) +
              Math.sin(frontage(selected.x)) *
                (BUILDING_RECIPES[selected.tier].depth / 2 + 0.6),
            3,
            plotAxis(selected.z) - 1,
          ]}
          center
          zIndexRange={[2, 0]}
        >
          <img
            className="city-building-logo"
            alt={`${selected.profile.name} sign`}
            src={selected.profile.logo}
          />
        </Html>
      )}
      <Html position={[0, 0.2, 0]} center zIndexRange={[2, 0]}>
        <span className="city-plaza-label">CENTRAL PLAZA</span>
      </Html>
    </>
  );
}
