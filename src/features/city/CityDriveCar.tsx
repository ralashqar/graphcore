import {useEffect,useMemo,useRef,useState,type RefObject} from "react";
import {useFrame,useThree} from "@react-three/fiber";
import {Box3,Group,Mesh,MeshStandardMaterial,Vector3} from "three";
import {GLTFLoader,type GLTF} from "three/addons/loaders/GLTFLoader.js";
import {useCityReflection} from "./cityReflections";
import {pavementHeight} from "../../domain/cityDriveWorld";
import {DRIVE_PROFILE,type DriveState} from "../../domain/cityDriving";
const URL=DRIVE_PROFILE.carUrl;
let pending:Promise<GLTF|null>|undefined;
export function preloadCityCar(){return pending??=new GLTFLoader().loadAsync(URL).then(asset=>{let textured=false;asset.scene.traverse(o=>{if(o instanceof Mesh&&(o.material as MeshStandardMaterial).map)textured=true;});if(!textured||!["body","wheel-front-left","wheel-front-right","wheel-back-left","wheel-back-right"].every(n=>asset.scene.getObjectByName(n)))throw new Error("Missing car atlas or movable parts");return asset;}).catch(error=>{console.warn("City car unavailable; using fallback",error);return null;});}
export function CityDriveCar({motion,reduced,active=true}:{motion:RefObject<DriveState>;reduced:boolean;active?:boolean}){
 const [asset,setAsset]=useState<GLTF|null>(null),reflection=useCityReflection(),gl=useThree(s=>s.gl);
 const bodyPitch=useRef(0),bodyRoll=useRef(0),pitchV=useRef(0),rollV=useRef(0);
 useEffect(()=>{let live=true;void preloadCityCar().then(a=>{if(live)setAsset(a);});return()=>{live=false;};},[]);
 const model=useMemo(()=>{
  if(!asset)return null;
  const root=asset.scene.clone(true),bounds=new Box3().setFromObject(root),size=bounds.getSize(new Vector3()),scale=DRIVE_PROFILE.carLength/size.z;
  const materials=new Map<MeshStandardMaterial,MeshStandardMaterial>();
  root.traverse(o=>{if(o instanceof Mesh){const source=o.material as MeshStandardMaterial;let m=materials.get(source);if(!m){m=source.clone();m.transparent=false;m.opacity=1;m.roughness=.48;m.metalness=.12;materials.set(source,m);}o.material=m;o.castShadow=true;}});
  const wheels=['wheel-front-left','wheel-front-right','wheel-back-left','wheel-back-right'].map(name=>{
   const mesh=root.getObjectByName(name)!;const centre=new Box3().setFromObject(mesh).getCenter(new Vector3());
   const steer=new Group(),spin=new Group();steer.position.copy(centre);root.add(steer);steer.add(spin);spin.attach(mesh);return {steer,spin,y:centre.y,x:centre.x,z:centre.z};
  });
  const body=root.getObjectByName('body')!,baseY=body.position.y;
  root.scale.setScalar(scale);root.position.set(-(bounds.min.x+bounds.max.x)*scale/2,-bounds.min.y*scale,-(bounds.min.z+bounds.max.z)*scale/2);
  return {root,wheels,body,baseY,scale,materials:[...materials.values()]};
 },[asset]);
 useEffect(()=>{if(!model)return;for(const m of model.materials){m.envMap=reflection;m.envMapIntensity=.4;m.needsUpdate=true;}},[model,reflection]);
 useEffect(()=>()=>{model?.materials.forEach(m=>m.dispose());},[model]);
 useEffect(()=>{gl.domElement.dataset.cityCar=model?'kenney-hatchback':'fallback';if(model)gl.domElement.dataset.cityCarDetails=JSON.stringify({wheels:model.wheels.length,textured:model.materials.every(m=>!!m.map),length:DRIVE_PROFILE.carLength});return()=>{delete gl.domElement.dataset.cityCar;delete gl.domElement.dataset.cityCarDetails;};},[model,gl]);
 useFrame((_,dt)=>{
  if(!model||!active||document.hidden)return;const s=motion.current;if(!s)return;const d=Math.min(dt,.04),sn=Math.sin(s.heading),cs=Math.cos(s.heading);
  const pitch=reduced?0:Math.max(-.065,Math.min(.065,-s.acceleration*.004+s.impact*.003));
  if(reduced){bodyPitch.current=0;bodyRoll.current=0;pitchV.current=0;rollV.current=0;}
  const roll=reduced?0:Math.max(-.085,Math.min(.085,s.speed*s.yawRate*.004));
  pitchV.current+=(pitch-bodyPitch.current)*65*d-pitchV.current*13*d;bodyPitch.current+=pitchV.current*d;
  rollV.current+=(roll-bodyRoll.current)*65*d-rollV.current*13*d;bodyRoll.current+=rollV.current*d;
  model.body.rotation.x=bodyPitch.current;model.body.rotation.z=bodyRoll.current;
  let height=0;
  for(let i=0;i<4;i++){const w=model.wheels[i],x=w.x*model.scale,z=w.z*model.scale;
   const h=pavementHeight(s.x+x*cs+z*sn,s.z-x*sn+z*cs);height+=h;
   w.steer.position.y=w.y+h/model.scale;w.steer.rotation.y=i<2?s.steering:0;w.spin.rotation.x=s.wheelAngle;
  }
  model.body.position.y=model.baseY+height/4/model.scale;
 });
 return model?<primitive object={model.root} dispose={null}/>:<group position={[0,.65,0]}>
  <mesh><boxGeometry args={[2.2,.65,4]}/><meshLambertMaterial color="#c97745"/></mesh>
  <mesh position={[0,.65,-.25]}><boxGeometry args={[1.85,.8,2]}/><meshLambertMaterial color="#41636d"/></mesh>
  {[-1,1].flatMap(x=>[-1.2,1.2].map(z=><mesh key={`${x}:${z}`} position={[x*1.05,-.15,z]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.45,.45,.25,12]}/><meshLambertMaterial color="#27312e"/></mesh>))}
 </group>;
}
