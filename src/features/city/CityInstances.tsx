import { useCityVisibility } from "./CityVisibility";
import { useCityMapLayout } from "./CityMapLayout";
import { useMarketMotion } from "./CityMarketMotion";
import { entranceScale } from "../../domain/cityStreaming";
import { marketMotion } from "../../domain/cityMarket";

import { createContext, useContext, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Box3,
  Frustum,
  Matrix4,
  Sphere,
  Color,
  InstancedMesh,
  Object3D,
  Vector3,
  type BufferGeometry,
  type Material,
} from "three";
import type { CityProperty } from "../../domain/city";
export const CityArrivalContext = createContext<ReadonlyMap<string, number>>(new Map());
export type Instance = {
  key: string;
  detail?: "full" | "simple";
  x: number;
  y?: number;
  z: number;
  rotation?: number;
  scale?: [number, number, number];
  color?: string;
  property?: CityProperty;
};
export type Piece = { geometry: BufferGeometry; material: Material };
/** One draw per shared primitive/material, not one draw per building component. */
export function Batch({
  pieces,
  instances,
  onSelect,
  reduced = false,
  animate = false,
  alphaMask,
}: {
  pieces: Piece[];
  instances: Instance[];
  onSelect?: (p: CityProperty) => void;
  reduced?: boolean;
  animate?: boolean;
  alphaMask?: (u: number, v: number) => boolean;
}) {
  const piecesKey=pieces.map(piece=>`${piece.geometry.uuid}:${piece.material.uuid}`).join("|");
  const cityVisibility=useCityVisibility();
  // Custom sign atlases index their UV attributes by original instance ID.
  // Only dual-representation building batches compact their instance buffers.
  const visibility=instances[0]?.detail ? cityVisibility : null;
  const visibilityRevision=useRef(-1);
  const activeIndices=useRef<number[]>([]);
  const colors=useMemo(()=>instances.map(item=>new Color(item.color || "#ffffff")),[instances]);
  const visibilityIds=useMemo(()=>[...new Set(instances.flatMap(item=>item.property?[item.property.id]:[]))],[instances]);
  const lastLevels=useRef("");
  const instanceData=useMemo(()=>({cityInstances:instances}),[instances]);
  const { plotAxis } = useCityMapLayout();
  const refs = useRef<(InstancedMesh | null)[]>([]),
    dirty = useRef(true);
  const dummy = useMemo(() => new Object3D(), []),
    target = useMemo(() => new Vector3(), []);
  const { gl } = useThree();
  const environment = !instances.some(item=>item.property);
  const environmentBounds = useMemo(()=>{
    if(!environment)return [];
    const local=new Box3();
    for(const piece of pieces){piece.geometry.computeBoundingBox();if(piece.geometry.boundingBox)local.union(piece.geometry.boundingBox);}
    const transform=new Object3D();
    return instances.map(item=>{
      transform.position.set(item.x,item.y || 0,item.z);transform.rotation.set(0,item.rotation || 0,0);
      transform.scale.set(...(item.scale || [1,1,1]));transform.updateMatrix();
      return local.clone().applyMatrix4(transform.matrix).getBoundingSphere(new Sphere());
    });
  },[instances,environment,piecesKey]);
  const environmentVisible=useRef<Set<number> | null>(null);
  const cull=useMemo(()=>({frustum:new Frustum(),matrix:new Matrix4(),elapsed:1}),[]);
  const playback = useMarketMotion();
  const arrivals = useContext(CityArrivalContext);
  const moves = useMemo(
    () => new Map(playback?.event.moves.map((move) => [move.id, move]) || []),
    [playback],
  );
  const updateMatrices = () => {
    const now = performance.now();
    const elapsed = playback ? now - playback.started : 4000;
    const playing = !!playback && elapsed < 3100 && !reduced;
    if (!dirty.current && !playing) return;
    let moving = false;
    let count=0;
    activeIndices.current=[];
    instances.forEach((item, index) => {
      if(environment && environmentVisible.current && !environmentVisible.current.has(index))return;
      const level=item.property && visibility?.levels.get(item.property.id);
      if(level === "hidden" || (item.detail && item.detail !== (level || "simple"))) return;
      const slot=count++;activeIndices.current.push(index);
      target.set(item.x, item.y || 0, item.z);
      dummy.position.copy(target);
      dummy.rotation.set(0, item.rotation || 0, 0);
      dummy.scale.set(...(item.scale || [1, 1, 1]));
      const candidate =
        playing && item.property ? moves.get(item.property.id) : undefined;
      const move =
        candidate?.after?.rank === item.property?.rank ? candidate : null;
      if (move?.after) {
        const motion = marketMotion(move, elapsed),
          from = move.before || move.after,
          to = move.after;
        if (motion) {
          const x =
            plotAxis(from.x) +
            (plotAxis(to.x) - plotAxis(from.x)) * motion.turn;
          const z =
            plotAxis(from.z) +
            (plotAxis(to.z) - plotAxis(from.z)) * motion.turn;
          // Buildings and signs retain their camera-facing orientation during displacement.
          const dx = item.x - plotAxis(to.x),
            dz = item.z - plotAxis(to.z);
          dummy.position.set(
            x + dx * motion.scale,
            (item.y || 0) * motion.scale + motion.lift,
            z + dz * motion.scale,
          );
          dummy.scale.multiplyScalar(motion.scale);
          moving = true;
        }
      }
      const arrival = item.property && arrivals.get(item.property.id);
      if (animate && !reduced && !move && arrival !== undefined) {
        const age = now - arrival;
        if (age < 550) {
          const scale = entranceScale(age);
          const x = plotAxis(item.property!.x), z = plotAxis(item.property!.z);
          dummy.position.set(x + (dummy.position.x - x) * scale,
            dummy.position.y * scale, z + (dummy.position.z - z) * scale);
          dummy.scale.multiplyScalar(Math.max(0.001, scale));
          moving = true;
        }
      }
      dummy.updateMatrix();
      for (const mesh of refs.current) mesh?.setMatrixAt(slot, dummy.matrix);
    });
    for (const mesh of refs.current)
      if (mesh) {
        mesh.count=count;
        mesh.userData.cityInstances=activeIndices.current.map(index=>instances[index]);
        activeIndices.current.forEach((index,slot)=>mesh.setColorAt(slot,colors[index]));
        if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
    dirty.current = moving;
    gl.shadowMap.needsUpdate = true;
  };
  useLayoutEffect(() => {
    dirty.current = true;
    environmentVisible.current=null;
    cull.elapsed=1;
    for (const mesh of refs.current)
      if (mesh) {
        instances.forEach((_, i) =>
          mesh.setColorAt(i, colors[i]),
        );
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    // New/reallocated instance buffers must be valid before the first paint.
    updateMatrices();
  }, [instances, piecesKey, playback, reduced, arrivals]);
  useFrame(({camera},delta) => {
    if(environment){
      cull.elapsed+=delta;
      if(cull.elapsed>=.15){
        cull.elapsed=0;cull.matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);cull.frustum.setFromProjectionMatrix(cull.matrix);
        const next=new Set<number>();environmentBounds.forEach((sphere,index)=>{if(cull.frustum.intersectsSphere(sphere))next.add(index);});
        const old=environmentVisible.current;
        if(!old || old.size!==next.size || [...next].some(index=>!old.has(index))){environmentVisible.current=next;dirty.current=true;}
      }
    }
    if(visibility && visibilityRevision.current!==visibility.revision){visibilityRevision.current=visibility.revision;const levels=visibilityIds.map(id=>visibility.levels.get(id)).join(",");if(levels!==lastLevels.current){lastLevels.current=levels;dirty.current=true;}} if (dirty.current || (!reduced && playback)) updateMatrices(); });
  return (
    <>
      {pieces.map((piece, index) => (
        <instancedMesh
          key={index}
          ref={(m) => {
            refs.current[index] = m;
          }}
          args={[piece.geometry, piece.material, instances.length]}
          userData={instanceData}
          raycast={alphaMask ? function (this: InstancedMesh, raycaster, intersections) {
            const hits: typeof intersections = [];
            InstancedMesh.prototype.raycast.call(this, raycaster, hits);
            intersections.push(...hits.filter(hit => hit.uv && alphaMask(hit.uv.x, hit.uv.y)));
          } : undefined}
          castShadow={animate}
          receiveShadow
          onClick={
            onSelect
              ? (e) => {
                  const p =
                    e.instanceId === undefined
                      ? undefined
                      : instances[activeIndices.current[e.instanceId]]?.property;
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
