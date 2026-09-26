/**
 * Bakes placed trim pieces (non-indexed, deformed per size) into one geometry per material class:
 * positions by each placement matrix, normals by its normal matrix, vertex colours x the placement tint
 * (what the per-instance tint used to do). Plain three.js so it runs under node tests.
 */
// @deno-types="npm:@types/three@0.186.0"
import {BufferGeometry,Float32BufferAttribute,Matrix3,type Color,type Matrix4} from 'three';
export type TrimMergeItem={geometry:BufferGeometry;matrix:Matrix4;tint:Color|null};
export function mergeTrimItems(items:TrimMergeItem[]){
 const total=items.reduce((n,i)=>n+i.geometry.getAttribute('position').count,0),position=new Float32Array(total*3),normal=new Float32Array(total*3),color=new Float32Array(total*3),nm=new Matrix3();let v=0;
 for(const {geometry,matrix,tint} of items){
  const p=geometry.getAttribute('position').array,n=geometry.getAttribute('normal').array,c=geometry.getAttribute('color')?.array,e=matrix.elements,m=nm.getNormalMatrix(matrix).elements,count=p.length/3;
  for(let k=0;k<count;k++,v++){
   const x=p[k*3],y=p[k*3+1],z=p[k*3+2],a=n[k*3],b=n[k*3+1],d=n[k*3+2];
   position[v*3]=e[0]*x+e[4]*y+e[8]*z+e[12];position[v*3+1]=e[1]*x+e[5]*y+e[9]*z+e[13];position[v*3+2]=e[2]*x+e[6]*y+e[10]*z+e[14];
   const nx=m[0]*a+m[3]*b+m[6]*d,ny=m[1]*a+m[4]*b+m[7]*d,nz=m[2]*a+m[5]*b+m[8]*d,l=Math.hypot(nx,ny,nz)||1;normal[v*3]=nx/l;normal[v*3+1]=ny/l;normal[v*3+2]=nz/l;
   color[v*3]=(c?.[k*3]??1)*(tint?.r??1);color[v*3+1]=(c?.[k*3+1]??1)*(tint?.g??1);color[v*3+2]=(c?.[k*3+2]??1)*(tint?.b??1);
  }
 }
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(position,3));g.setAttribute('normal',new Float32BufferAttribute(normal,3));g.setAttribute('color',new Float32BufferAttribute(color,3));g.computeBoundingSphere();return g;
}
