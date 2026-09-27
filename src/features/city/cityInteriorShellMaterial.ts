import {MeshBasicNodeMaterial} from "three/webgpu";
import {Discard,Fn,If,cameraPosition,dot,modelWorldMatrix,normalLocal,positionLocal,uv,varying,vec4,vertexColor} from "three/tsl";

/**
 * Unlit, vertex-coloured material for the interior shells behind generated-wall openings on buildings without
 * interiors (cityStudioFreeDoors.buildFreeFaceShell). The shell buffers carry their facade: each normal is the
 * facade's outward direction and uv.x the depth behind the wall's centre plane. A shell fragment only draws while
 * the camera is outside that facade, so from inside the building (orbit zoom, cutaway, walking in) the boxes vanish
 * instead of floating in the rooms as loose planes.
 */
export function interiorShellMaterial(){
 const material=new MeshBasicNodeMaterial();
 const wall=modelWorldMatrix.mul(vec4(positionLocal.add(normalLocal.mul(uv().x)),1)).xyz;
 const outward=modelWorldMatrix.mul(vec4(normalLocal,0)).xyz;
 const outside=varying(dot(cameraPosition.sub(wall),outward));
 material.colorNode=Fn(()=>{If(outside.lessThan(0),()=>{Discard();});return vertexColor();})();
 return material;
}
