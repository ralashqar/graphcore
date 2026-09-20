import { useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { InstancedMesh, Object3D, Vector3 } from "three";
import { useLiving } from "./CityLiving";
import { freshLiving, storefrontVisual } from "../../domain/cityLiving";
import type { CityProperty } from "../../domain/city";
import { BUILDING_RECIPES, plotAxis } from "../../domain/cityLayout";
import { cityNavigate } from "./api";
export function CityStreetActivity(
  { properties, reduced, paused }: {
    properties: CityProperty[];
    reduced: boolean;
    paused: boolean;
  },
) {
  const living = useLiving(),
    { camera, size, gl } = useThree(),
    bodies = useRef<InstancedMesh>(null),
    heads = useRef<InstancedMesh>(null),
    clock = useRef(0);
  const object = useMemo(() => new Object3D(), []),
    projection = useMemo(() => new Vector3(), []);
  const [shown, setShown] = useState<string[]>([]);
  const markerClock = useRef(0), markerKey = useRef("");
  const entries = properties.flatMap((p) => {
    const state = freshLiving(living.states.find((s) => s.businessId === p.id));
    return state ? [{ p, state }] : [];
  });
  useFrame((_, delta) => {
    clock.current += delta;
    markerClock.current += delta;
    if (markerClock.current >= .25) {
      markerClock.current = 0;
      const boxes: { x: number; y: number }[] = [], ids: string[] = [];
      if (!paused && camera.zoom >= 3) {
        for (const { p, state } of entries) {
          if (state.kind === "quiet" || !freshLiving(state)) continue;
          projection.set(
            plotAxis(p.x),
            BUILDING_RECIPES[p.tier].floors * 3 + 10,
            plotAxis(p.z),
          ).project(camera);
          const x = (projection.x + 1) * size.width / 2,
            y = (1 - projection.y) * size.height / 2;
          if (
            projection.z < -1 || projection.z > 1 || x < 60 ||
            x > size.width - 60 || y < 35 || y > size.height - 35 ||
            boxes.some((b) => Math.abs(b.x - x) < 130 && Math.abs(b.y - y) < 38)
          ) continue;
          boxes.push({ x, y });
          ids.push(p.id);
          if (ids.length === 8) break;
        }
      }
      const key = ids.join(",");
      if (key !== markerKey.current) {
        markerKey.current = key;
        setShown(ids);
      }
    }
    if (!bodies.current || !heads.current) return;
    let count = 0;
    if (!paused && document.visibilityState === "visible") {
      const nearby = entries.filter(({ p, state }) => {
        projection.set(plotAxis(p.x), 2, plotAxis(p.z)).project(camera);
        return state.band !== "quiet" && !!freshLiving(state) &&
          Math.abs(projection.x) < .95 && Math.abs(projection.y) < .95 &&
          projection.z >= -1 && projection.z <= 1;
      }).sort((a, b) =>
        Math.hypot(
          plotAxis(a.p.x) - camera.position.x,
          plotAxis(a.p.z) - camera.position.z,
        ) -
        Math.hypot(
          plotAxis(b.p.x) - camera.position.x,
          plotAxis(b.p.z) - camera.position.z,
        )
      ).slice(0, 8);
      for (const { p, state } of nearby) {
        const max =
          (state.band === "very_busy" ? 12 : state.band === "busy" ? 8 : 4) /
          (size.width < 900 ? 2 : 1);
        for (let n = 0; n < max && count < 96; n++) {
          const move = reduced ? 0 : Math.sin(clock.current * 1.2 + n) * .13;
          object.position.set(
            plotAxis(p.x) + 9 + (n % 2) * 1.2,
            .9,
            plotAxis(p.z) - 6 + Math.floor(n / 2) * 2 + move,
          );
          object.scale.set(1, 1, 1);
          object.updateMatrix();
          bodies.current.setMatrixAt(count, object.matrix);
          object.position.y = 1.85;
          object.updateMatrix();
          heads.current.setMatrixAt(count, object.matrix);
          count++;
        }
      }
    }
    const diagnostic=JSON.stringify({figures:count,maxFigures:96,maxProperties:8,reduced});
    if(gl.domElement.dataset.cityStreetStats!==diagnostic)gl.domElement.dataset.cityStreetStats=diagnostic;
    bodies.current.count = count;
    heads.current.count = count;
    bodies.current.instanceMatrix.needsUpdate = true;
    heads.current.instanceMatrix.needsUpdate = true;
  });
  if (!living.enabled) return null;
  return (
    <>
      <instancedMesh
        ref={bodies}
        args={[undefined, undefined, 96]}
        frustumCulled={false}
        raycast={() => {}}
      >
        <cylinderGeometry args={[.3, .38, 1.3, 5]} />
        <meshLambertMaterial color="#547364" />
      </instancedMesh>
      <instancedMesh
        ref={heads}
        args={[undefined, undefined, 96]}
        frustumCulled={false}
        raycast={() => {}}
      >
        <sphereGeometry args={[.28, 5, 4]} />
        <meshLambertMaterial color="#c8b69a" />
      </instancedMesh>
      {!paused &&
        entries.filter((e) => shown.includes(e.p.id)).map(({ p, state }) => (
          <group
            key={"signal:" + p.id}
            position={[plotAxis(p.x) - 9, 0, plotAxis(p.z) - 6]}
          >
            <mesh position={[0, .18, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[1.1, 1.5, 16]} />
              <meshBasicMaterial color={storefrontVisual[state.kind].color} />
            </mesh>
            {(state.kind === "live_launch" || state.kind === "upcoming") && (
              <mesh position={[0, 3, 0]}>
                <cylinderGeometry args={[.08, .55, 6, 8]} />
                <meshBasicMaterial
                  color={storefrontVisual[state.kind].color}
                  transparent
                  opacity={.45}
                  depthWrite={false}
                />
              </mesh>
            )}
          </group>
        ))}
      {!paused &&
        entries.filter((e) => shown.includes(e.p.id)).map((
          { p, state },
        ) => (
          <Html
            center
            zIndexRange={[3, 0]}
            key={p.id}
            position={[
              plotAxis(p.x),
              BUILDING_RECIPES[p.tier].floors * 3 + 10,
              plotAxis(p.z),
            ]}
          >
            <button
              className="city-living-pin"
              style={{ color: storefrontVisual[state.kind].color }}
              onClick={() =>
                state.primary && cityNavigate(state.primary.destination)}
            >
              {storefrontVisual[state.kind].icon}{" "}
              {storefrontVisual[state.kind].label}
            </button>
          </Html>
        ))}
    </>
  );
}
