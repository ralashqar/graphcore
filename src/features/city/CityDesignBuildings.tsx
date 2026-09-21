import { citySurfaceMaterial } from "./CitySurfaceMaterial";
import { residentDetails, type CityDetail } from "../../domain/cityStreaming";
import { pitchedRoofPositions } from "../../domain/cityBuildingSurfaces";
import { useEffect, useMemo, useState, useRef } from "react";
import {
  BoxGeometry,
  CylinderGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  IcosahedronGeometry,
  MeshLambertMaterial,
} from "three";
import { resolveCurrent } from "../../domain/cityBuildingV3";
import { type DecoratorPack, loadDecorators } from "./CityDecorators";
import { CityDesignSigns } from "./CityDesignSigns";
import { buildingParts } from "../../domain/cityBuildingDesign";
import type { CityProperty } from "../../domain/city";
import { Batch, type Instance } from "./CityInstances";
import { useCityMapLayout } from "./CityMapLayout";

/** Shared by the editor and world. Procedural primitives and each curated geometry/material are instanced across properties. */
export function CityDesignBuildings(
  {
    properties,
    onSelect,
    reduced = true,
    matchIds,
    selectedId,
    center,
    zoom = 20,
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
  const { plotAxis, plotSize } = useCityMapLayout();
  const nearby = useMemo(() =>
    new Set(
      [...properties].sort((a, b) => {
        if (a.id === selectedId) return -1;
        if (b.id === selectedId) return 1;
        const distance = (p: CityProperty) =>
          center
            ? Math.max(Math.abs(p.x - center.x), Math.abs(p.z - center.z))
            : 0;
        return distance(a) - distance(b);
      }).filter((p) =>
        !center || p.id === selectedId ||
        (zoom >= 2 &&
          Math.max(Math.abs(p.x - center.x), Math.abs(p.z - center.z)) <= 3)
      ).slice(0, 12).map((p) => p.id),
    ), [properties, center?.x, center?.z, zoom, selectedId]);
  // Detail is selected once per residency, not reranked on every camera pan.
  // Changing the top-12 list used to replace walls/props on still-visible buildings.
  const residentDetail = useRef(new Map<string, CityDetail>());
  const detail = useMemo(() => {
    const candidates = new Map<string, CityDetail>();
    for (const p of properties) candidates.set(p.id,
      (nearby.has(p.id) ? "near" : center && Math.max(Math.abs(p.x-center.x), Math.abs(p.z-center.z)) > 6 ? "far" : "medium"));
    const next = residentDetails(residentDetail.current, candidates);
    residentDetail.current = next;
    return next;
  }, [properties, nearby, center?.x, center?.z]);
  const [pack, setPack] = useState<DecoratorPack | null>(null);
  const needsPack = properties.some((p) =>
    !p.profile.buildingArt &&
    p.profile.buildingDesign && p.profile.buildingDesign.version !== 1 &&
    p.profile.buildingDesign.finish !== "procedural"
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
      box: new BoxGeometry(1, 1, 1),
      tree: new IcosahedronGeometry(1, 1),
      hip: (() => { const g = new BufferGeometry(); g.setAttribute("position", new Float32BufferAttribute(pitchedRoofPositions("hip"), 3)); g.computeVertexNormals(); return g; })(),
      shed: (() => { const g = new BufferGeometry(); g.setAttribute("position", new Float32BufferAttribute(pitchedRoofPositions("shed"), 3)); g.computeVertexNormals(); return g; })(),
      column: new CylinderGeometry(.5, .5, 1, 12),
      pediment: (() => {
        const g = new BufferGeometry();
        g.setAttribute("position", new Float32BufferAttribute(pitchedRoofPositions(), 3));
        g.rotateY(Math.PI / 2);
        g.computeVertexNormals();
        return g;
      })(),
      roof: (() => {
        const g = new BufferGeometry();
        g.setAttribute(
          "position",
          new Float32BufferAttribute(pitchedRoofPositions(), 3),
        );
        g.computeVertexNormals();
        return g;
      })(),
      material: citySurfaceMaterial(),
      glass: citySurfaceMaterial(true),
    }),
    [],
  );
  useEffect(() => () => {
    resources.box.dispose();
    resources.column.dispose();
    resources.hip.dispose();
    resources.shed.dispose();
    resources.pediment.dispose();
    resources.tree.dispose();
    resources.roof.dispose();
    resources.material.dispose();
    resources.glass.dispose();
  }, [resources]);
  const batches = useMemo(() => {
    const out: Record<string, Instance[]> = { box: [], tree: [], roof: [], column: [], pediment: [], hip: [], shed: [] };
    for (const p of properties) {
      const d = p.profile.buildingDesign;
      if (!d || p.profile.buildingArt) continue;
      const scale = plotSize / 24,
        angle = d.rotation * Math.PI / 2,
        c = Math.cos(angle),
        s = Math.sin(angle);
      const dim = matchIds && !matchIds.has(p.id) && p.id !== selectedId;
      const lod = detail.get(p.id) || "medium";
      const resolved = d.version !== 1
        ? resolveCurrent(d, p.profile.color, lod)
        : null;
      const kit = pack && d.version !== 1 && (lod === "near" || (d.version === 3 && lod === "medium")) && d.finish !== "procedural";
      const legacyComplete = kit && resolved?.attachments.every(a => pack.has(a.asset));
      (resolved ? resolved.parts : buildingParts(d, p.profile.color)).forEach(
        (part, index) => {
          if (kit && "fallback" in part && part.fallback &&
            ("fallbackAsset" in part && typeof part.fallbackAsset === "string" ? pack.has(part.fallbackAsset) : legacyComplete)) return;
          const [x, y, z] = part.position;
          const key = d.version !== 1 && part.kind === "box" && part.color === d.palette.glass ? "glassBox" : part.kind;
          (out[key] ||= []).push({
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
        },
      );
      if (kit && resolved) {
        for (const [index, a] of resolved.attachments.entries()) {
          if (!pack.has(a.asset)) {
            continue;
          }
          const [x, y, z] = a.position;
          pack.get(a.asset)!.forEach((piece, partIndex) => {
            const key = "asset|" + a.asset + "|" + partIndex;
            const role = (piece.material as MeshLambertMaterial).userData
              .cityPalette as "wall" | "trim" | "glass";
            const tint = d.palette[a.role === "paving" ? "trim" : role];
            (out[key] ||= []).push({
              key: `${p.id}:asset:${index}`,
              property: p,
              x: plotAxis(p.x) + (x * c + z * s) * scale,
              y: y * scale,
              z: plotAxis(p.z) + (z * c - x * s) * scale,
              rotation: angle + a.rotation,
              scale: [scale * a.scale, scale * a.scale, scale * a.scale],
              color: dim
                ? `#${new Color(tint).multiplyScalar(.55).getHexString()}`
                : tint,
            });
          });
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
    detail,
    pack,
    center?.x,
    center?.z,
  ]);
  return (
    <>
      {Object.entries(batches).filter(([, items]) => items.length).map((
        [kind, items],
      ) => (
        <Batch
          key={kind}
          pieces={kind.startsWith("asset|")
            ? [pack!.get(kind.split("|")[1])![Number(kind.split("|")[2])]]
            : [{
              geometry: kind === "glassBox" ? resources.box : resources[kind as "box" | "tree" | "roof" | "column" | "pediment" | "hip" | "shed"],
              material: kind === "glassBox" ? resources.glass : resources.material,
            }]}
          instances={items}
          onSelect={onSelect}
          reduced={reduced}
          animate
        />
      ))}
      {properties.some((p) =>
        p.profile.buildingDesign && p.profile.buildingDesign.version !== 1 &&
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
