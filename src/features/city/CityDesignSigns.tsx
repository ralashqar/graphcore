import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  CanvasTexture,
  InstancedBufferAttribute,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from "three";
import type { CityProperty } from "../../domain/city";
import { resolveDesign } from "../../domain/cityBuildingV2";
import { Batch, type Instance } from "./CityInstances";
import { useCityMapLayout } from "./CityMapLayout";
export function CityDesignSigns({
  properties,
  onSelect,
  reduced,
  matchIds,
  selectedId,
}: {
  properties: CityProperty[];
  onSelect?: (p: CityProperty) => void;
  reduced: boolean;
  matchIds?: Set<string>;
  selectedId?: string;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const { plotAxis, plotSize } = useCityMapLayout();
  const items = useMemo(
    () =>
      properties.filter((p) =>
        p.profile.buildingDesign?.version === 2 && !p.profile.buildingArt
      ).slice(0, 400),
    [properties],
  );
  const atlas = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 1024;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return { canvas, texture };
  }, []);
  useEffect(() => () => atlas.texture.dispose(), [atlas]);
  useEffect(() => {
    let live = true;
    const ctx = atlas.canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 2048, 1024);
    const images: HTMLImageElement[] = [];
    items.forEach((p, i) => {
      const x = (i % 16) * 128, y = Math.floor(i / 16) * 32;
      const draw = (img?: HTMLImageElement) => {
        if (!live) return;
        ctx.fillStyle = p.profile.color;
        ctx.fillRect(x, y, 128, 32);
        let start = x + 5;
        if (img) {
          const ratio = Math.min(24 / img.naturalWidth, 24 / img.naturalHeight);
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(x + 3, y + 3, 26, 26);
          ctx.drawImage(
            img,
            x + 4 + (24 - img.naturalWidth * ratio) / 2,
            y + 4 + (24 - img.naturalHeight * ratio) / 2,
            img.naturalWidth * ratio,
            img.naturalHeight * ratio,
          );
          start = x + 33;
        }
        ctx.fillStyle = "#ffffff";
        ctx.textBaseline = "middle";
        let size = 12;
        ctx.font = `600 ${size}px sans-serif`;
        while (
          ctx.measureText(p.profile.name).width > x + 123 - start && size > 7
        ) {
          size--;
          ctx.font = `600 ${size}px sans-serif`;
        }
        ctx.save();
        ctx.beginPath();
        ctx.rect(start, y, 123 - (start - x), 32);
        ctx.clip();
        ctx.fillText(p.profile.name, start, y + 16);
        ctx.restore();
        atlas.texture.needsUpdate = true;
        invalidate();
      };
      draw();
      if (p.profile.logo) {
        const img = new Image();
        images.push(img);
        img.crossOrigin = "anonymous";
        img.onload = () => {
          if (img.naturalWidth) draw(img);
        };
        img.src = p.profile.logo;
      }
    });
    return () => {
      live = false;
      for (const img of images) img.onload = null;
    };
  }, [items, atlas, invalidate]);
  const piece = useMemo(() => {
    const geometry = new PlaneGeometry(1, 1),
      rects = new Float32Array(items.length * 4);
    items.forEach((_, i) =>
      rects.set([
        (i % 16) / 16,
        1 - (Math.floor(i / 16) + 1) / 32,
        1 / 16,
        1 / 32,
      ], i * 4)
    );
    geometry.setAttribute("atlasRect", new InstancedBufferAttribute(rects, 4));
    const material = new MeshBasicMaterial({
      map: atlas.texture,
      toneMapped: false,
    });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        "#include <common>\nattribute vec4 atlasRect; varying vec2 citySignUv;",
      ).replace(
        "#include <uv_vertex>",
        "#include <uv_vertex>\ncitySignUv=uv*atlasRect.zw+atlasRect.xy;",
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        "#include <common>\nvarying vec2 citySignUv;",
      ).replace(
        "#include <map_fragment>",
        "diffuseColor *= texture2D(map,citySignUv);",
      );
    };
    material.customProgramCacheKey = () => "city-design-sign-1";
    return { geometry, material };
  }, [items, atlas, invalidate]);
  useEffect(() => () => {
    piece.geometry.dispose();
    piece.material.dispose();
  }, [piece]);
  const instances = useMemo<Instance[]>(() =>
    items.map((p) => {
      const d = p.profile.buildingDesign!;
      if (d.version !== 2) throw Error("Expected v2");
      const sign = resolveDesign(d, p.profile.color, "far").sign,
        a = d.rotation * Math.PI / 2,
        s = plotSize / 24;
      return {
        key: p.id,
        property: p,
        x: plotAxis(p.x) + (sign.x * Math.cos(a) + sign.z * Math.sin(a)) * s,
        y: sign.y * s,
        z: plotAxis(p.z) + (sign.z * Math.cos(a) - sign.x * Math.sin(a)) * s,
        rotation: a,
        scale: [sign.width * s, sign.height * s, 1],
        color: matchIds && !matchIds.has(p.id) && p.id !== selectedId
          ? "#888888"
          : "#ffffff",
      };
    }), [items, plotSize, plotAxis, matchIds, selectedId]);
  return items.length
    ? (
      <Batch
        pieces={[piece]}
        instances={instances}
        onSelect={onSelect}
        reduced={reduced}
        animate
      />
    )
    : null;
}
