import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { CanvasTexture, MeshBasicMaterial, PlaneGeometry, Quaternion, Matrix4, Vector3, SRGBColorSpace } from "three";
import { Batch, type Instance } from "./CityInstances";
import { useCityMapLayout } from "./CityMapLayout";
import type { CityProperty } from "../../domain/city";

const urls = ["studio", "cafe", "games"].map(name => `/city/sprites/${name}.png?v=1`);
// Reviewed pixel anchors compensate for small generator framing drift.
const anchors = [
  {left:26,right:486,side:349,front:472},
  {left:30,right:482,side:355,front:478},
  {left:32,right:480,side:360,front:482},
];
// 448px-wide 48m diamond in a 512px sprite. Ground centre is pixel (256,360).
const size = 48 * Math.SQRT2 * 512 / 448;
const orientation = new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(
  new Vector3(420,380,420), new Vector3(), new Vector3(0,1,0),
));
function variant(id: string) {
  let hash = 2166136261;
  for (const c of id) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0) % urls.length;
}

export function CitySpriteBuildings({properties, selected, matchIds, onSelect, reduced}: {
  properties: CityProperty[]; selected: CityProperty | null; matchIds?: Set<string>;
  onSelect: (p: CityProperty) => void; reduced: boolean;
}) {
  const textures = useTexture(urls);
  const { gl } = useThree();
  const { plotAxis } = useCityMapLayout();
  const assets = useMemo(() => textures.map((texture,index) => {
    texture.colorSpace = SRGBColorSpace;
    const canvas = document.createElement("canvas");
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext("2d", {willReadFrequently:true})!;
    const anchor = anchors[index];
    const sx = 448/(anchor.right-anchor.left), sy = 120/(anchor.front-anchor.side);
    ctx.drawImage(texture.image as HTMLImageElement,32-anchor.left*sx,360-anchor.side*sy,512*sx,512*sy);
    const pixels = ctx.getImageData(0,0,canvas.width,canvas.height);
    const data = pixels.data;
    // The experimental generator supplies opaque chroma-key images. Key at
    // decode time, once per shared texture, never on each property/frame.
    for (let i=0;i<data.length;i+=4) {
      if (data[i]>150 && data[i+2]>150 && data[i+1]<Math.min(data[i],data[i+2])*.65) data[i+3]=0;
    }
    ctx.putImageData(pixels,0,0);
    const keyed = new CanvasTexture(canvas); keyed.colorSpace = SRGBColorSpace;
    const geometry = new PlaneGeometry(size,size);
    // Move toward the orthographic camera without changing screen position.
    // Otherwise the lower half of the camera-facing plane intersects the ground.
    // Equal depth offsets preserve back-to-front ordering between all plots.
    geometry.translate(0,104 * size / 512,48);
    geometry.applyQuaternion(orientation);
    const material = new MeshBasicMaterial({map:keyed,transparent:true,alphaTest:.08,depthWrite:true,toneMapped:false});
    const alphaMask = (u:number,v:number) => {
      const x = Math.min(canvas.width-1,Math.max(0,Math.floor(u*canvas.width)));
      const y = Math.min(canvas.height-1,Math.max(0,Math.floor((1-v)*canvas.height)));
      return data[(y*canvas.width+x)*4+3] > 20;
    };
    return {pieces:[{geometry,material}],alphaMask,keyed};
  }), [textures]);
  useEffect(() => () => assets.forEach(a => {a.keyed.dispose();a.pieces.forEach(p => {p.geometry.dispose();p.material.dispose();});}), [assets]);
  const groups = useMemo(() => {
    const result: Instance[][] = [[],[],[]];
    properties.forEach(p => result[variant(p.id)].push({key:p.id,property:p,x:plotAxis(p.x),y:.15,z:plotAxis(p.z),
      color:matchIds && !matchIds.has(p.id) && p.id!==selected?.id ? "#7b8178" : "#ffffff"}));
    return result;
  },[properties,selected,matchIds,plotAxis]);
  useEffect(() => {
    gl.domElement.dataset.citySprites=JSON.stringify({textures:assets.length,properties:properties.length,size:512});
    return () => {delete gl.domElement.dataset.citySprites;};
  },[gl,assets,properties.length]);
  return <group userData={{citySpriteBuildings:true}}>{assets.map((asset,i) => <Batch key={i}
    {...asset} instances={groups[i]} reduced={reduced} onSelect={onSelect} animate />)}</group>;
}
