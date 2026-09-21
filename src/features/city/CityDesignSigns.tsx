import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import {
  CanvasTexture,
  InstancedBufferAttribute,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from "three";
import type { CityProperty } from "../../domain/city";
import { resolveDesign } from "../../domain/cityBuildingV2";
import { type DesignSign, resolveV3 } from "../../domain/cityBuildingV3";
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
      properties.flatMap((p) => {
        const d = p.profile.buildingDesign;
        if (!d || d.version === 1 || p.profile.buildingArt) return [];
        const signs: DesignSign[] = d.version === 3
          ? resolveV3(d, p.profile.color, "far").signs
          : [{
            ...resolveDesign(d, p.profile.color, "far").sign,
            rotation: 0,
            campaign: false,
          }];
        return signs.map((designSign) => ({ ...p, designSign }));
      }).slice(0, 800),
    [properties],
  );
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const deadlines = items.filter((p) => p.designSign.campaign).map((p) =>
      Date.parse(p.profile.offer?.expiresAt || "")
    ).filter((t) => t > Date.now());
    if (!deadlines.length) return;
    const timer = setTimeout(
      () => setClock(Date.now()),
      Math.min(
        2147483647,
        Math.max(1, Math.min(...deadlines) - Date.now() + 1),
      ),
    );
    return () => clearTimeout(timer);
  }, [items, clock]);
  const atlas = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 2048;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return { canvas, texture };
  }, []);
  useEffect(() => () => atlas.texture.dispose(), [atlas]);
  useEffect(() => {
    let live = true;
    const ctx = atlas.canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 2048, 2048);
    const images: HTMLImageElement[] = [];
    items.forEach((p, i) => {
      const x = (i % 16) * 128, y = Math.floor(i / 16) * 32;
      const pixelAspect = p.profile.buildingDesign?.version === 3
        ? p.designSign.width / p.designSign.height / 4
        : 1;
      const offer = p.profile.offer;
      const label = p.designSign.campaign && offer?.title &&
          (!offer.expiresAt || Date.parse(offer.expiresAt) > clock)
        ? offer.title
        : p.profile.name;
      const draw = (img?: HTMLImageElement) => {
        if (!live) return;
        ctx.fillStyle = p.profile.color;
        ctx.fillRect(x, y, 128, 32);
        let start = x + 5;
        if (
          img && p.designSign.campaign &&
          (!offer?.expiresAt || Date.parse(offer.expiresAt) > clock)
        ) {
          const scale = Math.max(
            128 * pixelAspect / img.naturalWidth,
            32 / img.naturalHeight,
          );
          ctx.save();
          ctx.beginPath();
          ctx.rect(x, y, 128, 32);
          ctx.clip();
          ctx.drawImage(
            img,
            x + (128 - img.naturalWidth * scale / pixelAspect) / 2,
            y + (32 - img.naturalHeight * scale) / 2,
            img.naturalWidth * scale / pixelAspect,
            img.naturalHeight * scale,
          );
          ctx.restore();
          ctx.fillStyle = "rgba(0,0,0,.6)";
          ctx.fillRect(x, y + 8, 128, 24);
        } else if (img) {
          const ratio = Math.min(24 / img.naturalWidth, 24 / img.naturalHeight);
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(x + 3, y + 3, 26 / pixelAspect, 26);
          ctx.drawImage(
            img,
            x + 3 + (1 + (24 - img.naturalWidth * ratio) / 2) / pixelAspect,
            y + 4 + (24 - img.naturalHeight * ratio) / 2,
            img.naturalWidth * ratio / pixelAspect,
            img.naturalHeight * ratio,
          );
          start = x + 7 + 26 / pixelAspect;
        }
        ctx.fillStyle = "#ffffff";
        ctx.textBaseline = "middle";
        let size = 12;
        ctx.font = `600 ${size}px sans-serif`;
        while (
          ctx.measureText(label).width > x + 123 - start && size > 7
        ) {
          size--;
          ctx.font = `600 ${size}px sans-serif`;
        }
        ctx.save();
        ctx.beginPath();
        ctx.rect(start, y, 123 - (start - x), 32);
        ctx.clip();
        ctx.fillText(label, start, y + 16);
        ctx.restore();
        atlas.texture.needsUpdate = true;
        invalidate();
      };
      draw();
      const source = p.designSign.campaign &&
          (!offer?.expiresAt || Date.parse(offer.expiresAt) > clock)
        ? p.profile.billboard || p.profile.hero || p.profile.logo
        : p.profile.logo;
      if (source) {
        const img = new Image();
        images.push(img);
        img.crossOrigin = "anonymous";
        img.onload = () => {
          if (img.naturalWidth) draw(img);
        };
        img.src = source;
      }
    });
    return () => {
      live = false;
      for (const img of images) img.onload = null;
    };
  }, [items, atlas, invalidate, clock]);
  const piece = useMemo(() => {
    const geometry = new PlaneGeometry(1, 1),
      rects = new Float32Array(items.length * 4);
    items.forEach((_, i) =>
      rects.set([
        (i % 16) / 16,
        1 - (Math.floor(i / 16) + 1) / 64,
        1 / 16,
        1 / 64,
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
      const sign = p.designSign,
        a = d.rotation * Math.PI / 2,
        s = plotSize / 24;
      return {
        key: `${p.id}:${sign.campaign ? "campaign" : "brand"}`,
        property: p,
        x: plotAxis(p.x) + (sign.x * Math.cos(a) + sign.z * Math.sin(a)) * s,
        y: sign.y * s,
        z: plotAxis(p.z) + (sign.z * Math.cos(a) - sign.x * Math.sin(a)) * s,
        rotation: a + sign.rotation,
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
