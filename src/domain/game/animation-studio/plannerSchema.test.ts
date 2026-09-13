import test from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { gamePlannerJsonSchema } from '../plannerSchema.ts'
import { graphEditPromptSchema } from './flexible.ts'
import { locomotionProcessingSchema } from './locomotionProfile.ts'

test('complete animation planner schema emits items for every array, including optional gait and contacts',()=>{
 const schema=gamePlannerJsonSchema(graphEditPromptSchema)
 let arrays=0
 const visit=(value:any)=>{
  if(!value||typeof value!=='object')return
  assert.equal('prefixItems' in value,false)
  if(value.type==='array'){arrays++;assert.ok(value.items&&typeof value.items==='object')}
  Object.values(value).forEach(visit)
 }
 visit(schema);assert.ok(arrays>10)
 const node=(schema as any).properties.nodes.properties.upsert.items
 const direction=node.properties.locomotion.anyOf[0].properties.direction
 assert.deepEqual(direction.items,{type:'number'});assert.equal(direction.minItems,2);assert.equal(direction.maxItems,2)
 const hips=node.properties.contacts.items.properties.hips
 assert.equal(hips.minItems,3);assert.equal(hips.maxItems,3)
})
test('runtime still enforces direction length, finite numbers and unit magnitude',()=>{
 const parse=(direction:unknown)=>locomotionProcessingSchema.safeParse({version:'locomotion-post-1.0.0',gait:'walk',direction}).success
 assert.equal(parse([0,1]),true)
 for(const value of [[0],[0,1,2],[0,2],[NaN,1],['0',1]])assert.equal(parse(value),false)
})
test('schema adapter refuses heterogeneous or variadic tuples rather than weakening validation',()=>{
 assert.throws(()=>gamePlannerJsonSchema(z.tuple([z.string(),z.number()])),/homogeneous/)
 assert.throws(()=>gamePlannerJsonSchema(z.tuple([z.number()]).rest(z.number())),/variadic/)
})
