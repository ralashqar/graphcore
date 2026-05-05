import { z } from 'npm:zod@4'

import {
  buildDefaultDefinitionComponents,
  type DefinitionBase,
} from '../../../src/domain/graphcore.ts'
import {
  worldGraphGeneratorResultSchema,
  type WorldEntity,
  type WorldGraphExpansionRequest,
  type WorldGraphGeneratorResult,
  type WorldGraphSeedRequest,
} from '../../../src/domain/worldGraph.ts'
import { TextGateway } from './ai-core/gateways.ts'

type ExistingDefinitionRow = {
  id: string
  key: string
  kind: string
  name: string
}

type ExistingWorldEntityRow = {
  id: string
  key: string
  name: string
  node_type: WorldEntity['nodeType']
  linked_definition_key: string | null
}

function definitionKindForNodeType(nodeType: WorldEntity['nodeType']): DefinitionBase['kind'] | null {
  switch (nodeType) {
    case 'actor':
      return 'character'
    case 'place':
      return 'environment'
    case 'object':
      return 'item'
    default:
      return null
  }
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'entry'
}

function uniqueKey(existingKeys: Set<string>, base: string) {
  let candidate = base
  let index = 2
  while (existingKeys.has(candidate)) {
    candidate = `${base}_${index}`
    index += 1
  }
  existingKeys.add(candidate)
  return candidate
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return null
  }
}

async function generateWithOpenAi(input: {
  instructions: string
  prompt: string
  model: string
}) {
  try {
    const response = await TextGateway.generateObject({
      modelPreference: input.model,
      system: input.instructions,
      messages: [{ role: 'user', content: input.prompt }],
      schema: worldGraphGeneratorResultSchema,
      schemaName: 'world_graph_result',
    })
    return response.object
  } catch (err) {
    return null
  }
}

export async function generateSeedPlan(request: WorldGraphSeedRequest) {
  const instructions = [
    'You are the GraphCore World Graph planner.',
    'Return compact JSON that matches the supplied schema.',
    'Create 4 to 7 entities maximum.',
    'Prefer a mix of group, place, concept, and event. Add an actor or object only if it materially helps.',
    'Relationships must use sourceName and targetName values that exactly match entity names in the same result.',
    'Keep names evocative and concise.',
    'Use the project name and summary as defaults when the prompt is underspecified.',
  ].join('\n')

  const prompt = JSON.stringify({
    project: request.snapshot.project,
    prompt: request.prompt,
    currentEntityCount: request.snapshot.worldEntities.length,
  })

  const generated = await generateWithOpenAi({
    instructions,
    prompt,
    model: request.model,
  })
  if (!generated) {
    throw new Error('World graph planner returned invalid JSON.')
  }
  return generated
}

export async function generateExpansionPlan(request: WorldGraphExpansionRequest) {
  const root = request.snapshot.worldEntities.find((entity) => entity.key === request.rootEntityKey) ?? null
  if (!root) {
    throw new Error(`Root world entity "${request.rootEntityKey}" was not found.`)
  }

  const instructions = [
    'You are the GraphCore World Graph expansion planner.',
    'Return compact JSON that matches the supplied schema.',
    'Create 1 to 3 new entities maximum.',
    'Keep the expansion local to the selected root entity and its immediate neighborhood.',
    'Relationships must use sourceName and targetName values that exactly match entity names in the same result or the provided root entity name.',
  ].join('\n')

  const prompt = JSON.stringify({
    project: request.snapshot.project,
    root,
    neighborhood: request.snapshot.worldRelationships.filter((relationship) => (
      relationship.sourceEntityKey === root.key || relationship.targetEntityKey === root.key
    )),
  })

  const generated = await generateWithOpenAi({
    instructions,
    prompt,
    model: request.model,
  })
  if (!generated) {
    throw new Error('World graph expansion planner returned invalid JSON.')
  }
  return generated
}

export async function persistWorldGraphPlan(input: {
  client: any
  draftId: string
  plan: WorldGraphGeneratorResult
}) {
  const { client, draftId, plan } = input
  const [existingDefinitionsResponse, existingEntitiesResponse, existingViewsResponse] = await Promise.all([
    client
      .from('project_definitions')
      .select('id, key, kind, name')
      .eq('draft_id', draftId),
    client
      .from('world_entities')
      .select('id, key, name, node_type, linked_definition_key')
      .eq('draft_id', draftId),
    client
      .from('world_views')
      .select('key')
      .eq('draft_id', draftId),
  ])

  if (existingDefinitionsResponse.error) throw new Error(existingDefinitionsResponse.error.message)
  if (existingEntitiesResponse.error) throw new Error(existingEntitiesResponse.error.message)
  if (existingViewsResponse.error) throw new Error(existingViewsResponse.error.message)

  const existingDefinitions = (existingDefinitionsResponse.data ?? []) as ExistingDefinitionRow[]
  const existingEntities = (existingEntitiesResponse.data ?? []) as ExistingWorldEntityRow[]
  const existingViewKeys = new Set<string>((existingViewsResponse.data ?? []).map((row: { key: string }) => row.key))
  const definitionKeys = new Set(existingDefinitions.map((definition) => definition.key))
  const entityKeys = new Set(existingEntities.map((entity) => entity.key))
  const entitiesByName = new Map(existingEntities.map((entity) => [`${entity.node_type}:${entity.name.toLowerCase()}`, entity]))
  const definitionsByName = new Map(existingDefinitions.map((definition) => [`${definition.kind}:${definition.name.toLowerCase()}`, definition]))
  const persistedEntities = new Map<string, ExistingWorldEntityRow>()

  for (const generatedEntity of plan.entities) {
    const entityLookupKey = `${generatedEntity.nodeType}:${generatedEntity.name.toLowerCase()}`
    const existingEntity = entitiesByName.get(entityLookupKey)
    if (existingEntity) {
      persistedEntities.set(generatedEntity.name, existingEntity)
      continue
    }

    const definitionKind = definitionKindForNodeType(generatedEntity.nodeType)
    let linkedDefinitionKey: string | null = null

    if (definitionKind) {
      const existingDefinition = definitionsByName.get(`${definitionKind}:${generatedEntity.name.toLowerCase()}`)
      if (existingDefinition) {
        linkedDefinitionKey = existingDefinition.key
      } else {
        const baseDefinitionKey = `${definitionKind}.${slugify(generatedEntity.name)}`
        const nextDefinitionKey = uniqueKey(definitionKeys, baseDefinitionKey)
        const definitionInsert = await client
          .from('project_definitions')
          .insert({
            draft_id: draftId,
            key: nextDefinitionKey,
            kind: definitionKind,
            name: generatedEntity.name,
            summary: generatedEntity.summary,
            status: 'draft',
            tags: generatedEntity.tags,
            schema_version: 1,
            metadata: {},
            llm_hints: {},
            asset_refs: [],
            definition_data: {},
          })
          .select('id, key, kind, name')
          .single()
        if (definitionInsert.error) throw new Error(definitionInsert.error.message)

        const components = buildDefaultDefinitionComponents(definitionKind)
        if (components.length > 0) {
          const componentInsert = await client
            .from('project_definition_components')
            .insert(components.map((component) => ({
              definition_id: definitionInsert.data.id,
              component_type: component.type,
              config: component.config,
            })))
          if (componentInsert.error) throw new Error(componentInsert.error.message)
        }

        linkedDefinitionKey = definitionInsert.data.key
        definitionsByName.set(`${definitionKind}:${generatedEntity.name.toLowerCase()}`, definitionInsert.data)
      }
    }

    const baseEntityKey = `world.${generatedEntity.nodeType}.${slugify(generatedEntity.name).replace(/_/g, '-')}`
    const nextEntityKey = uniqueKey(entityKeys, baseEntityKey)
    const entityInsert = await client
      .from('world_entities')
      .insert({
        draft_id: draftId,
        key: nextEntityKey,
        name: generatedEntity.name,
        summary: generatedEntity.summary,
        node_type: generatedEntity.nodeType,
        aliases: generatedEntity.aliases,
        tags: generatedEntity.tags,
        status: 'active',
        linked_definition_key: linkedDefinitionKey,
        source: 'ai',
        custom_properties: {},
        metadata: {},
      })
      .select('id, key, name, node_type, linked_definition_key')
      .single()
    if (entityInsert.error) throw new Error(entityInsert.error.message)

    entitiesByName.set(entityLookupKey, entityInsert.data)
    persistedEntities.set(generatedEntity.name, entityInsert.data)
  }

  const existingRelationshipRows = await client
    .from('world_relationships')
    .select('key, source_entity_id, target_entity_id, verb')
    .eq('draft_id', draftId)
  if (existingRelationshipRows.error) throw new Error(existingRelationshipRows.error.message)
  const relationshipKeys = new Set<string>((existingRelationshipRows.data ?? []).map((row: { key: string }) => row.key))
  const relationshipIdentity = new Set(
    ((existingRelationshipRows.data ?? []) as Array<{ source_entity_id: string; target_entity_id: string; verb: string }>)
      .map((row) => `${row.source_entity_id}:${row.target_entity_id}:${row.verb.toLowerCase()}`),
  )

  for (const relationship of plan.relationships) {
    const source = persistedEntities.get(relationship.sourceName) ?? entitiesByName.get(`actor:${relationship.sourceName.toLowerCase()}`) ?? entitiesByName.get(`group:${relationship.sourceName.toLowerCase()}`) ?? entitiesByName.get(`place:${relationship.sourceName.toLowerCase()}`) ?? entitiesByName.get(`object:${relationship.sourceName.toLowerCase()}`) ?? entitiesByName.get(`concept:${relationship.sourceName.toLowerCase()}`) ?? entitiesByName.get(`event:${relationship.sourceName.toLowerCase()}`)
    const target = persistedEntities.get(relationship.targetName) ?? entitiesByName.get(`actor:${relationship.targetName.toLowerCase()}`) ?? entitiesByName.get(`group:${relationship.targetName.toLowerCase()}`) ?? entitiesByName.get(`place:${relationship.targetName.toLowerCase()}`) ?? entitiesByName.get(`object:${relationship.targetName.toLowerCase()}`) ?? entitiesByName.get(`concept:${relationship.targetName.toLowerCase()}`) ?? entitiesByName.get(`event:${relationship.targetName.toLowerCase()}`)
    if (!source || !target) continue
    const identity = `${source.id}:${target.id}:${relationship.verb.toLowerCase()}`
    if (relationshipIdentity.has(identity)) continue

    const nextRelationshipKey = uniqueKey(relationshipKeys, `world.relationship.${slugify(`${relationship.sourceName}-${relationship.verb}-${relationship.targetName}`)}`)
    const relationshipInsert = await client
      .from('world_relationships')
      .insert({
        draft_id: draftId,
        key: nextRelationshipKey,
        source_entity_id: source.id,
        target_entity_id: target.id,
        verb: relationship.verb,
        direction: relationship.direction,
        source: 'ai',
        notes: relationship.notes,
        state: 'confirmed',
        metadata: {},
      })
    if (relationshipInsert.error) throw new Error(relationshipInsert.error.message)
    relationshipIdentity.add(identity)
  }

  if (plan.view) {
    const baseViewKey = `world.view.${slugify(plan.view.name)}`
    const nextViewKey = uniqueKey(existingViewKeys, baseViewKey)
    const rootEntity = plan.view.rootEntityName ? persistedEntities.get(plan.view.rootEntityName) ?? null : null
    const viewInsert = await client
      .from('world_views')
      .insert({
        draft_id: draftId,
        key: nextViewKey,
        name: plan.view.name,
        mode: 'graph',
        filters: {},
        search: '',
        root_entity_key: rootEntity?.key ?? null,
        camera: { x: 0, y: 0, zoom: 1 },
        focus_depth: 1,
        show_suggestions: true,
        show_labels: true,
        node_positions: {},
        collapsed_state: {},
        sort_mode: 'manual',
        metadata: {},
      })
    if (viewInsert.error) throw new Error(viewInsert.error.message)
  }
}
