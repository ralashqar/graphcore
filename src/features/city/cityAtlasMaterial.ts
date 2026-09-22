
import {MeshBasicNodeMaterial} from "three/webgpu";
import {attribute,texture,uv,varying} from "three/tsl";
import type {Texture} from "three";
export function cityAtlasMaterial(map:Texture){
 const material=new MeshBasicNodeMaterial({toneMapped:false});
 const rect=attribute("atlasRect","vec4");
 material.colorNode=texture(map,varying(uv().mul(rect.zw).add(rect.xy)));
 return material;
}
