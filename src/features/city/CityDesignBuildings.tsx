import { useEffect, useMemo } from "react";
import {
  BoxGeometry,
  Color,
  IcosahedronGeometry,
  MeshLambertMaterial,
} from "three";
import { buildingParts } from "../../domain/cityBuildingDesign";
import type { CityProperty } from "../../domain/city";
import { Batch, type Instance } from "./CityInstances";
import { useCityMapLayout } from "./CityMapLayout";

/** Shared by the editor and world. All visible buildings use two instanced draws. */
export function CityDesignBuildings(
  { properties, onSelect, reduced = true, matchIds, selectedId }: {
    properties: CityProperty[];
    onSelect?: (property: CityProperty) => void;
    reduced?: boolean;
    matchIds?: Set<string>;
    selectedId?: string;
  },
) {
  const { plotAxis, plotSize } = useCityMapLayout();
  const resources = useMemo(
    () => ({
      box: new BoxGeometry(1, 1, 1),
      tree: new IcosahedronGeometry(1, 1),
      material: new MeshLambertMaterial({ color: "#ffffff" }),
    }),
    [],
  );
  useEffect(() => () => {
    resources.box.dispose();
    resources.tree.dispose();
    resources.material.dispose();
  }, [resources]);
  const batches = useMemo(() => {
    const out: { box: Instance[]; tree: Instance[] } = { box: [], tree: [] };
    for (const p of properties) {
      const d = p.profile.buildingDesign;
      if (!d || p.profile.buildingArt) continue;
      const scale = plotSize / 24,
        angle = d.rotation * Math.PI / 2,
        c = Math.cos(angle),
        s = Math.sin(angle);
      const dim = matchIds && !matchIds.has(p.id) && p.id !== selectedId;
      buildingParts(d, p.profile.color).forEach((part, index) => {
        const [x, y, z] = part.position;
        out[part.kind].push({
          key: `${p.id}:${index}`,
          property: p,
          x: plotAxis(p.x) + (x * c + z * s) * scale,
          y: y * scale,
          z: plotAxis(p.z) + (z * c - x * s) * scale,
          scale: part.size.map((v) => v * scale) as [number, number, number],
          rotation: angle,
          color: dim
            ? `#${new Color(part.color).multiplyScalar(.55).getHexString()}`
            : part.color,
        });
      });
    }
    return out;
  }, [properties, plotAxis, plotSize, matchIds, selectedId]);
  return (
    <>
      {(["box", "tree"] as const).map((kind) => (
        <Batch
          key={kind}
          pieces={[{ geometry: resources[kind], material: resources.material }]}
          instances={batches[kind]}
          onSelect={onSelect}
          reduced={reduced}
          animate
        />
      ))}
    </>
  );
}
