import { useCityMapLayout } from "./CityMapLayout";
import { useMarketMotion } from "./CityMarketMotion";
import { entranceScale } from "../../domain/cityStreaming";
import { marketMotion } from "../../domain/cityMarket";

import { createContext, useContext, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
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
  const { plotAxis } = useCityMapLayout();
  const refs = useRef<(InstancedMesh | null)[]>([]),
    poses = useRef(new Map<string, Vector3>()),
    dirty = useRef(true);
  const dummy = useMemo(() => new Object3D(), []),
    target = useMemo(() => new Vector3(), []);
  const { gl } = useThree();
  const playback = useMarketMotion();
  const arrivals = useContext(CityArrivalContext);
  const moves = useMemo(
    () => new Map(playback?.event.moves.map((move) => [move.id, move]) || []),
    [playback],
  );
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
  }, [instances, pieces, playback, reduced, arrivals]);
  useFrame((_, delta) => {
    const elapsed = playback ? performance.now() - playback.started : 4000;
    const playing = !!playback && elapsed < 3100 && !reduced;
    if (!dirty.current && !playing) return;
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
        const age = performance.now() - arrival;
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
          userData={{cityInstances:instances}}
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
