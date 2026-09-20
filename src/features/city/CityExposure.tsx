import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Raycaster, Vector2, Vector3 } from "three";
import type { CityProperty } from "../../domain/city";
import { BUILDING_RECIPES, plotAxis } from "../../domain/cityLayout";
import { exposureDwell } from "../../domain/cityLanding";
/** Sample at most four candidates per tick; no event is sent during replay or hidden tabs. */
export function CityExposure(
  { properties, onExposure, paused }: {
    properties: CityProperty[];
    onExposure: (ids: string[], kind: "canvas") => void;
    paused: boolean;
  },
) {
  const { camera, scene, gl } = useThree();
  const clock = useRef(0),
    cursor = useRef(0),
    sent = useRef(new Set<string>()),
    dwell = useRef(
      new Map<string, { since: number; last: number; x: number; y: number }>(),
    );
  const ray = useMemo(() => new Raycaster(), []),
    point = useMemo(() => new Vector3(), []),
    screen = useMemo(() => new Vector2(), []);
  useFrame((_, delta) => {
    clock.current += delta;
    if (clock.current < .25) return;
    clock.current = 0;
    if (
      paused || document.visibilityState !== "visible" ||
      document.querySelector("dialog[open]")
    ) {
      dwell.current.clear();
      return;
    }
    const rect = gl.domElement.getBoundingClientRect(), now = performance.now();
    const candidates = properties.filter((p) => !sent.current.has(p.id)).map(
      (p) => {
        point.set(
          plotAxis(p.x),
          BUILDING_RECIPES[p.tier].floors * 1.5,
          plotAxis(p.z),
        ).project(camera);
        return { p, x: point.x, y: point.y, z: point.z };
      },
    ).filter((c) =>
      c.z >= -1 && c.z <= 1 && Math.abs(c.x) < .95 && Math.abs(c.y) < .95
    ).sort((a, b) => a.x * a.x + a.y * a.y - b.x * b.x - b.y * b.y).slice(
      0,
      12,
    );
    const qualified: string[] = [];
    for (let i = 0; i < Math.min(4, candidates.length); i++) {
      const { p, x, y } = candidates[(cursor.current + i) % candidates.length],
        recipe = BUILDING_RECIPES[p.tier];
      const px = rect.left + (x + 1) * rect.width / 2,
        py = rect.top + (1 - y) * rect.height / 2;
      let hits = 0;
      for (const fraction of [.3, .55, .8]) {
        point.set(plotAxis(p.x), recipe.floors * 3 * fraction, plotAxis(p.z))
          .project(camera);
        const sx = rect.left + (point.x + 1) * rect.width / 2,
          sy = rect.top + (1 - point.y) * rect.height / 2;
        if (document.elementFromPoint(sx, sy) !== gl.domElement) continue;
        screen.set(point.x, point.y);
        ray.setFromCamera(screen, camera);
        const hit = ray.intersectObjects(scene.children, true).find((h) =>
          h.object.visible
        );
        if (
          hit && hit.instanceId !== undefined &&
          hit.object.userData.cityInstances?.[hit.instanceId]?.property?.id ===
            p.id
        ) hits++;
      }
      point.set(plotAxis(p.x), recipe.floors * 3 + 2, plotAxis(p.z)).project(
        camera,
      );
      const visible = hits >= 2 &&
        Math.abs((point.y - y) * rect.height / 2) >= 10;
      const result = exposureDwell(
        dwell.current.get(p.id),
        now,
        px,
        py,
        visible,
      );
      if (!result) dwell.current.delete(p.id);
      else {
        dwell.current.set(p.id, result.state);
        if (result.qualified) {
          sent.current.add(p.id);
          dwell.current.delete(p.id);
          qualified.push(p.id);
        }
      }
    }
    cursor.current += 4;
    const ids = new Set(candidates.map((c) => c.p.id));
    for (const id of dwell.current.keys()) {
      if (!ids.has(id)) dwell.current.delete(id);
    }
    if (qualified.length) onExposure(qualified, "canvas");
  });
  return null;
}
