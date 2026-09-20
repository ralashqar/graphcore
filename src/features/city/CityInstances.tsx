import { useMarketMotion } from "./CityMarketMotion";
import { marketMotion } from "../../domain/cityMarket";
import { plotAxis, frontage } from "../../domain/cityLayout";
import { useLayoutEffect, useMemo, useRef } from "react";
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
  const playback = useMarketMotion();
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
  }, [instances, pieces, playback, reduced]);
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
          const rotation =
            (frontage(from.x) - frontage(to.x)) * (1 - motion.turn);
          const dx = item.x - plotAxis(to.x),
            dz = item.z - plotAxis(to.z);
          dummy.position.set(
            x +
              (dx * Math.cos(rotation) + dz * Math.sin(rotation)) *
                motion.scale,
            (item.y || 0) * motion.scale + motion.lift,
            z +
              (-dx * Math.sin(rotation) + dz * Math.cos(rotation)) *
                motion.scale,
          );
          dummy.rotation.y += rotation;
          dummy.scale.multiplyScalar(motion.scale);
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
