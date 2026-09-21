import { useEffect, useMemo, useState } from "react";
import {
  CanvasTexture,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from "three";
import type { CityProperty } from "../../domain/city";
import { Batch } from "./CityInstances";
import { useCityMapLayout } from "./CityMapLayout";

/** Validated RGBA output: no browser chroma key or per-brand framing guesses. */
export function CityGeneratedBuilding(
  { property, dimmed, reduced, onSelect }: {
    property: CityProperty;
    dimmed: boolean;
    reduced: boolean;
    onSelect: (p: CityProperty) => void;
  },
) {
  const { plotSize, plotAxis } = useCityMapLayout();
  const [image, setImage] = useState<
    { texture: CanvasTexture; pixels: Uint8ClampedArray } | null
  >(null);
  useEffect(() => {
    let live = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!live) return;
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, 512, 512);
      try {
        const pixels = ctx.getImageData(0, 0, 512, 512).data;
        const texture = new CanvasTexture(canvas);
        texture.colorSpace = SRGBColorSpace;
        setImage({ texture, pixels });
      } catch { /* Keep the previous decoded image if a signed URL fails. */ }
    };
    img.src = property.profile.buildingArt!;
    return () => {
      live = false;
      img.onload = null;
    };
  }, [property.profile.buildingArt]);
  useEffect(() => () => image?.texture.dispose(), [image]);
  const geometry = useMemo(() => {
    const size = plotSize * Math.SQRT2 * 512 / 448;
    const g = new PlaneGeometry(size, size);
    g.translate(0, 104 * size / 512, plotSize);
    g.applyQuaternion(
      new Quaternion().setFromRotationMatrix(
        new Matrix4().lookAt(
          new Vector3(420, 380, 420),
          new Vector3(),
          new Vector3(0, 1, 0),
        ),
      ),
    );
    return g;
  }, [plotSize]);
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        map: image?.texture,
        transparent: true,
        alphaTest: .08,
        depthWrite: true,
        toneMapped: false,
      }),
    [image],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  const pieces = useMemo(() => [{ geometry, material }], [geometry, material]);
  const instances = useMemo(
    () => [{
      key: property.id,
      property,
      x: plotAxis(property.x),
      y: .15,
      z: plotAxis(property.z),
      color: dimmed ? "#7b8178" : "#ffffff",
    }],
    [property, plotAxis, dimmed],
  );
  if (!image) return null;
  return (
    <Batch
      pieces={pieces}
      instances={instances}
      reduced={reduced}
      animate
      onSelect={onSelect}
      alphaMask={(u, v) =>
        image
          .pixels[
            (Math.min(511, Math.max(0, Math.floor((1 - v) * 512))) * 512 +
                Math.min(511, Math.max(0, Math.floor(u * 512)))) * 4 + 3
          ] > 20}
    />
  );
}
