import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,Color,Float32BufferAttribute,Matrix4,Vector3} from 'three';
import {mergeTrimItems} from './cityStudioTrimMerge.ts';

const piece=()=>{const g=new BoxGeometry(1,2,.5).toNonIndexed();g.deleteAttribute('uv');g.setAttribute('color',new Float32BufferAttribute(new Float32Array(g.getAttribute('position').count*3).fill(.5),3));return g;};
test('trim placements merge into one non-indexed geometry with baked transforms and tints',()=>{
 const a=piece(),b=piece(),ma=new Matrix4().makeTranslation(3,0,0);
 const rot=new Matrix4().makeRotationY(Math.PI/2).premultiply(new Matrix4().makeTranslation(0,1,0)).multiply(new Matrix4().makeScale(2,2,2));
 const g=mergeTrimItems([{geometry:a,matrix:ma,tint:new Color(1,.5,.25)},{geometry:b,matrix:rot,tint:null}]);
 const count=a.getAttribute('position').count;assert.equal(g.getAttribute('position').count,count*2,'vertex count preserved');assert.equal(g.index,null);
 const p=g.getAttribute('position'),n=g.getAttribute('normal'),c=g.getAttribute('color');
 for(let k=0;k<count;k++){assert.ok(Math.abs(p.getX(k)-(a.getAttribute('position').getX(k)+3))<1e-6);
  const q=new Vector3().fromBufferAttribute(b.getAttribute('position'),k).applyMatrix4(rot);assert.ok(new Vector3().fromBufferAttribute(p,count+k).distanceTo(q)<1e-5,'second placement baked');
  const nn=new Vector3().fromBufferAttribute(b.getAttribute('normal'),k).transformDirection(rot);assert.ok(new Vector3().fromBufferAttribute(n,count+k).distanceTo(nn)<1e-5,'unit normals rotated, not scaled');}
 assert.deepEqual([c.getX(0),c.getY(0),c.getZ(0)],[.5,.25,.125],'vertex colour x tint');assert.deepEqual([c.getX(count),c.getY(count),c.getZ(count)],[.5,.5,.5],'untinted classes keep vertex colour');
 assert.ok(g.boundingSphere&&g.boundingSphere.radius>0);
});
