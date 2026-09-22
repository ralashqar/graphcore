import {useSyncExternalStore} from "react";
import {useThree} from "@react-three/fiber";
import type {Scene,Texture} from "three";
// Canvas-local: thumbnail/editor environments must never replace the city's reflections.
const stores=new WeakMap<Scene,{texture:Texture|null;listeners:Set<()=>void>}>();
function store(scene:Scene){let value=stores.get(scene);if(!value){value={texture:null,listeners:new Set()};stores.set(scene,value);}return value;}
export function setCityReflection(scene:Scene,texture:Texture|null){const value=store(scene),previous=value.texture;value.texture=texture;value.listeners.forEach(listener=>listener());return previous;}
export function useCityReflection(){const scene=useThree(s=>s.scene),value=store(scene);return useSyncExternalStore(callback=>{value.listeners.add(callback);return()=>{value.listeners.delete(callback);};},()=>value.texture,()=>null);}
