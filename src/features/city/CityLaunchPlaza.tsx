import { Html } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Group, InstancedMesh, Object3D, Vector3 } from "three";
import {
  type LaunchItem,
  launchPhase,
  launchPhaseLabel,
} from "../../domain/cityLaunches";
import { cityNavigate } from "./api";
export const LAUNCH_PLAZA_Z = -510;
function LaunchStructure({ item }: { item: LaunchItem }) {
  const mesh = useRef<Group>(null),
    eligible = useRef(Date.now() < Date.parse(item.content.startsAt)),
    started = useRef(0);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useFrame(() => {
    if (!mesh.current) return;
    const now = Date.now(), start = Date.parse(item.content.startsAt);
    if (eligible.current && now >= start) {
      eligible.current = false;
      if (
        document.visibilityState === "visible" && now - start < 5000 && !reduced
      ) started.current = now;
    }
    mesh.current.scale.y = started.current
      ? Math.min(1, .1 + (now - started.current) / 1500)
      : 1;
  });
  return (
    <group ref={mesh}>
      <mesh position={[0, 4, 2]}>
        <boxGeometry args={[13, 4, 6]} />
        <meshLambertMaterial color="#785895" />
      </mesh>
      <mesh position={[0, 6.2, 2]}>
        <boxGeometry args={[15, .4, 8]} />
        <meshLambertMaterial color="#f7f1e6" />
      </mesh>
    </group>
  );
}
export function CityLaunchPlaza(
  { items, active = false }: { items: LaunchItem[]; active?: boolean },
) {
  const [now, setNow] = useState(Date.now()),
    mesh = useRef<InstancedMesh>(null),
    { camera, size, gl } = useThree();
  const object = useMemo(() => new Object3D(), []),
    projection = useMemo(() => new Vector3(), []);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useFrame(({ clock }) => {
    if (!mesh.current) return;
    let count = 0, properties = 0;
    const reduced =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (active && document.visibilityState === "visible") {
      for (let i = 0; i < items.length && properties < 8; i++) {
        const item = items[i];
        if (
          !item.rank || item.score < 5 ||
          launchPhase(item.content, Date.now()) === "archived"
        ) {
          continue;
        }
        const x = (i % 4 - 1.5) * 32, z = (Math.floor(i / 4) - 1) * 32;
        projection.set(x, 2, z + LAUNCH_PLAZA_Z).project(camera);
        if (
          Math.abs(projection.x) > 1 || Math.abs(projection.y) > 1 ||
          Math.abs(projection.z) > 1
        ) continue;
        properties++;
        const density = (item.score >= 60 ? 12 : item.score >= 20 ? 8 : 4) /
          (size.width < 900 ? 2 : 1);
        for (let n = 0; n < density && count < 96; n++) {
          object.position.set(
            x - 8 + (n % 2) * 1.1,
            1,
            z - 10 + Math.floor(n / 2) * 1.4 +
              (reduced ? 0 : Math.sin(clock.elapsedTime + n) * .08),
          );
          object.updateMatrix();
          mesh.current.setMatrixAt(count++, object.matrix);
        }
      }
    }
    mesh.current.count = count;
    mesh.current.instanceMatrix.needsUpdate = true;
    gl.domElement.dataset.cityLaunchStats = JSON.stringify({
      figures: count,
      maxFigures: 96,
      maxProperties: 8,
    });
  });
  return (
    <group position={[0, 0, LAUNCH_PLAZA_Z]}>
      <instancedMesh
        ref={mesh}
        args={[undefined, undefined, 96]}
        frustumCulled={false}
        raycast={() => {}}
      >
        <capsuleGeometry args={[.3, .8, 2, 5]} />
        <meshLambertMaterial color="#735782" />
      </instancedMesh>
      <mesh position={[0, -.15, 0]}>
        <boxGeometry args={[145, .3, 105]} />
        <meshLambertMaterial color="#dcd6e3" />
      </mesh>
      <mesh position={[0, .02, 130]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[12, 160]} />
        <meshLambertMaterial color="#c6c6b9" />
      </mesh>
      <Html zIndexRange={[3, 0]} center position={[0, 10, 0]}>
        <div className="city-launch-plaza-label">
          <strong>🚀 LAUNCH PLAZA</strong>
          <small>Temporary showcases · Organic interest</small>
        </div>
      </Html>
      {items.slice(0, 12).map((item, index) => {
        const x = (index % 4 - 1.5) * 32, z = (Math.floor(index / 4) - 1) * 32;
        const phase = launchPhase(item.content, now);
        return (
          <group key={item.id} position={[x, 0, z]}>
            <mesh position={[0, 1, 0]}>
              <boxGeometry args={[18, 2, 14]} />
              <meshLambertMaterial color="#bbb1c7" />
            </mesh>
            <LaunchStructure item={item} />
            {phase === "coming_soon" && (
              <mesh position={[0, 4, 2]}>
                <boxGeometry args={[13.2, 4.2, 6.2]} />
                <meshLambertMaterial color="#c0b6c7" />
              </mesh>
            )}
            <Html zIndexRange={[3, 0]} center position={[0, 10, 2]}>
              <div className="city-launch-plaza-label">
                <button
                  onClick={() => cityNavigate("/city/launches/" + item.slug)}
                >
                  <strong>{item.content.title}</strong>
                  <small>
                    {launchPhaseLabel[phase]}
                    {item.rank ? ` · #${item.rank}` : ""}
                  </small>
                </button>
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
