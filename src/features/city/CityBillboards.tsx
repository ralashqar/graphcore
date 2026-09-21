import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import {
  BoxGeometry,
  CanvasTexture,
  InstancedBufferAttribute,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from "three";
import type { CityProperty } from "../../domain/city";
import { billboardImageRect } from "../../domain/cityBranding";
import {
  billboardEnvelope,
  plotAxis,
} from "../../domain/cityLayout";
import { Batch, type Instance } from "./CityInstances";

const box = new BoxGeometry(1, 1, 1);
const steel = new MeshLambertMaterial({ color: "#343d37" });
const trim = new MeshLambertMaterial({ color: "#ded8c6" });
const TILE_W = 512,
  TILE_H = 256,
  COLS = 4,
  ROWS = 8,
  LIMIT = COLS * ROWS;

type BillboardImage = HTMLImageElement | HTMLCanvasElement;
const imageWidth = (image: BillboardImage) => image instanceof HTMLImageElement ? image.naturalWidth : image.width;
const imageHeight = (image: BillboardImage) => image instanceof HTMLImageElement ? image.naturalHeight : image.height;

/** Text stays on the physical sign. The existing property panel is its accessible alternative. */
export function drawTile(
  ctx: CanvasRenderingContext2D,
  p: CityProperty,
  index: number,
  hero?: BillboardImage | null,
  logo?: BillboardImage | null,
) {
  const x = (index % COLS) * TILE_W,
    y = Math.floor(index / COLS) * TILE_H;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, TILE_W, TILE_H);
  ctx.clip();
  ctx.translate(x, y);
  ctx.fillStyle = p.profile.color;
  ctx.fillRect(0, 0, TILE_W, TILE_H);
  if (hero) {
    const rect = billboardImageRect(
      imageWidth(hero),
      imageHeight(hero),
      p.profile.billboardCrop,
    );
    ctx.drawImage(hero, rect.x, rect.y, rect.width, rect.height);
  }
  if (logo) {
    ctx.fillStyle = "#faf8f0";
    ctx.fillRect(18, 18, 136, 76);
    const scale = Math.min(116 / imageWidth(logo), 56 / imageHeight(logo));
    ctx.drawImage(
      logo,
      86 - (imageWidth(logo) * scale) / 2,
      56 - (imageHeight(logo) * scale) / 2,
      imageWidth(logo) * scale,
      imageHeight(logo) * scale,
    );
  }
  ctx.fillStyle = hero ? "rgba(23,35,29,.94)" : "rgba(23,35,29,.4)";
  ctx.fillRect(0, 170, 512, 86);
  ctx.fillStyle = "#fffdf5";
  ctx.font = "600 30px Manrope, sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(p.profile.name.slice(0, 42), 20, 207, 472);
  ctx.font = "16px Manrope, sans-serif";
  ctx.fillStyle = "#d7decf";
  ctx.fillText(
    (p.profile.tagline || "Discover this business").slice(0, 66),
    20,
    236,
    472,
  );
  ctx.restore();
}

export function CityBillboards({
  properties,
  selected,
  center,
  onSelect,
  reduced,
}: {
  properties: CityProperty[];
  selected: CityProperty | null;
  center: { x: number; z: number };
  onSelect: (p: CityProperty) => void;
  reduced: boolean;
}) {
  const { gl } = useThree();
  const decoded = useRef(new Map<string, HTMLCanvasElement>());
  const featured = useMemo(
    () =>
      [...properties]
        .sort((a, b) => {
          if (a.id === selected?.id) return -1;
          if (b.id === selected?.id) return 1;
          const da = (a.x - center.x) ** 2 + (a.z - center.z) ** 2,
            db = (b.x - center.x) ** 2 + (b.z - center.z) ** 2;
          return da - db || a.rank - b.rank;
        })
        .slice(0, LIMIT),
    [properties, selected?.id, center.x, center.z],
  );
  const atlas = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = COLS * TILE_W;
    canvas.height = ROWS * TILE_H;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy());
    return { canvas, texture };
  }, [gl]);
  useEffect(() => () => atlas.texture.dispose(), [atlas]);
  useLayoutEffect(() => {
    let active = true,
      decodedImages = 0,
      failedImages = 0;
    const ctx = atlas.canvas.getContext("2d")!;
    const pending = new Set<() => void>();
    ctx.clearRect(0, 0, atlas.canvas.width, atlas.canvas.height);
    featured.forEach((p, i) => drawTile(ctx, p, i,
      decoded.current.get(p.profile.billboard || p.profile.hero), decoded.current.get(p.profile.logo)));
    atlas.texture.needsUpdate = true;
    const cache = new Map<string, Promise<BillboardImage | null>>();
    function load(url: string): Promise<BillboardImage | null> {
      if (!url) return Promise.resolve(null);
      // Profiles contain approved storage URLs; demo fixtures use same-origin static images.
      let parsed: URL;
      try {
        parsed = new URL(url, location.origin);
      } catch {
        failedImages++;
        return Promise.resolve(null);
      }
      if (!["https:", "http:"].includes(parsed.protocol))
        return Promise.resolve(null);
      if (cache.has(url)) return cache.get(url)!;
      const retained = decoded.current.get(url);
      if (retained) {
        decodedImages++;
        const ready = Promise.resolve(retained);
        cache.set(url, ready);
        // Bounded LRU: retain recent decoded artwork, never clear it merely for panning.
        decoded.current.delete(url); decoded.current.set(url, retained);
        return ready;
      }
      const promise = new Promise<BillboardImage | null>((resolve) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        let done = false;
        const finish = (result: HTMLImageElement | null) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          image.onload = null;
          image.onerror = null;
          pending.delete(cancel);
          if (result) {
            decodedImages++;
            const thumbnail = document.createElement("canvas");
            const scale = Math.min(1, 512 / Math.max(result.naturalWidth, result.naturalHeight));
            thumbnail.width = Math.max(1, Math.round(result.naturalWidth * scale));
            thumbnail.height = Math.max(1, Math.round(result.naturalHeight * scale));
            thumbnail.getContext("2d")!.drawImage(result, 0, 0, thumbnail.width, thumbnail.height);
            decoded.current.set(url, thumbnail);
            while (decoded.current.size > 128) decoded.current.delete(decoded.current.keys().next().value!);
          }
          else if (active) failedImages++;
          resolve(result ? decoded.current.get(url)! : null);
        };
        const cancel = () => {
          finish(null);
          image.src = "";
        };
        const timer = setTimeout(cancel, 6000);
        pending.add(cancel);
        image.onload = () =>
          finish(image.naturalWidth && image.naturalHeight ? image : null);
        image.onerror = () => finish(null);
        image.src = url;
      });
      cache.set(url, promise);
      return promise;
    }
    let next = 0,
      loaded = 0;
    async function worker() {
      while (active && next < featured.length) {
        const index = next++,
          p = featured[index];
        const [hero, logo] = await Promise.all([
          load(p.profile.billboard || p.profile.hero),
          load(p.profile.logo),
        ]);
        if (!active) return;
        drawTile(ctx, p, index, hero, logo);
        atlas.texture.needsUpdate = true;
        loaded++;
        gl.domElement.dataset.cityBillboards = JSON.stringify({
          slots: featured.length,
          ready: loaded,
          images: [...cache.keys()].length,
          decodedImages,
          failedImages,
        });
      }
    }
    gl.domElement.dataset.cityBillboards = JSON.stringify({
      slots: featured.length,
      ready: 0,
      images: 0,
    });
    void Promise.all(Array.from({ length: 4 }, worker));
    return () => {
      active = false;
      for (const cancel of [...pending]) cancel();
    };
  }, [featured, atlas, gl]);
  const { frames, posts, roofs, faces, rects } = useMemo(() => {
    const frames: Instance[] = [],
      posts: Instance[] = [],
      roofs: Instance[] = [],
      faces: Instance[] = [],
      rects: number[] = [];
    const slots = new Map(featured.map((p, i) => [p.id, i]));
    for (const p of properties) {
      const { width, height, front, bottom, rotation } = billboardEnvelope(p.tier, p.id);
      const sin = Math.sin(rotation), cos = Math.cos(rotation);
      const locate = (localX: number, localZ: number) => ({
        x: plotAxis(p.x) + cos * localX + sin * localZ,
        z: plotAxis(p.z) - sin * localX + cos * localZ,
      });
      const base = { key: p.id, ...locate(0, front), rotation, property: p };
      frames.push({ ...base, y: bottom + height / 2,
        scale: [width + 0.22, height + 0.22, 0.24], color: p.profile.color });
      for (const side of [-1, 1]) posts.push({
        ...base, ...locate(side * (width / 2 - 0.3), front - 0.3),
        key: `${p.id}:${side}`, y: bottom - 0.2, scale: [0.18, 0.6, 0.18],
      });
      roofs.push({ ...base, ...locate(0, front - 0.2), y: bottom - 0.35,
        scale: [width + 0.22, 0.2, 0.8] });
      const slot = slots.get(p.id);
      if (slot === undefined) continue;
      // One outward-facing face only: no advertising on the two rear tile edges.
      faces.push({ ...base, ...locate(0, front + 0.132),
        y: bottom + height / 2, scale: [width, height, 1] });
      rects.push(((slot % COLS) + 0.004) / COLS,
        1 - (Math.floor(slot / COLS) + 0.992) / ROWS, 0.992 / COLS, 0.984 / ROWS);
    }
    return { frames, posts, roofs, faces, rects };
  }, [properties, featured]);
  const facePiece = useMemo(() => {
    const geometry = new PlaneGeometry(1, 1);
    geometry.setAttribute(
      "atlasRect",
      new InstancedBufferAttribute(new Float32Array(rects), 4),
    );
    const material = new MeshBasicMaterial({
      map: atlas.texture,
      toneMapped: false,
    });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nattribute vec4 atlasRect; varying vec2 vBillboardUv;",
        )
        .replace(
          "#include <uv_vertex>",
          "#include <uv_vertex>\nvBillboardUv=uv*atlasRect.zw+atlasRect.xy;",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec2 vBillboardUv;",
        )
        .replace(
          "#include <map_fragment>",
          "diffuseColor *= texture2D(map,vBillboardUv);",
        );
    };
    material.customProgramCacheKey = () => "city-billboard-atlas-v1";
    return { geometry, material };
  }, [rects, atlas]);
  useEffect(
    () => () => {
      facePiece.geometry.dispose();
      facePiece.material.dispose();
    },
    [facePiece],
  );
  return (
    <>
      <Batch
        pieces={[{ geometry: box, material: steel }]}
        instances={posts}
        animate
        reduced={reduced}
      />
      <Batch
        pieces={[{ geometry: box, material: trim }]}
        instances={roofs}
        animate
        reduced={reduced}
      />
      <Batch
        pieces={[{ geometry: box, material: trim }]}
        instances={frames}
        onSelect={onSelect}
        animate
        reduced={reduced}
      />
      <Batch
        pieces={[facePiece]}
        instances={faces}
        onSelect={onSelect}
        animate
        reduced={reduced}
      />
    </>
  );
}
