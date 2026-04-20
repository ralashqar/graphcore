import '@xyflow/react/dist/style.css'

import ELK from 'elkjs/lib/elk.bundled.js'
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'

import { resolveAssetSourceUrl } from '../domain/assets'
import type { AssetDefinition, DefinitionBase, GraphDefinition } from '../domain/graphcore'
import type {
  WorldEntity,
  WorldEntityCreateInput,
  WorldGraphConnection,
  WorldOperator,
  WorldRelationship,
  WorldRelationshipCreateInput,
  WorldResult,
  WorldView,
  WorldViewCreateInput,
} from '../domain/worldGraph'
import {
  buildGlobalWorldSuggestions,
  buildSuggestionsForEntity,
  createDefaultWorldView,
  getDerivedOperationsForEntityPair,
  getWorldEntityUsage,
  iconForWorldEntity,
  labelForWorldEntity,
  labelForWorldOperator,
  labelForWorldResult,
} from '../domain/worldGraphHelpers'
import { EntityIcon } from '../shared/entityIcons'
import { GraphWorkspace } from './graphWorkspace'
import type { GraphWorkspaceProps } from './graph/types'

type WorldGraphPageProps = {
  assets: AssetDefinition[]
  definitions: DefinitionBase[]
  snapshotGraphs: GraphDefinition[]
  worldEntities: WorldEntity[]
  worldRelationships: WorldRelationship[]
  worldViews: WorldView[]
  worldOperators: WorldOperator[]
  worldResults: WorldResult[]
  worldGraphConnections: WorldGraphConnection[]
  selectedWorldNodeKey: string | null
  selectedWorldEdgeKey: string | null
  selectedWorldEntityKey: string | null
  selectedWorldViewKey: string | null
  onSelectWorldNode: (key: string | null) => void
  onSelectWorldEdge: (key: string | null) => void
  onSelectWorldEntity: (key: string | null) => void
  onSelectWorldView: (key: string | null) => void
  onCreateWorldEntity: (input: WorldEntityCreateInput) => Promise<void> | void
  onUpdateWorldEntity: (entityKey: string, changes: Partial<WorldEntityCreateInput>) => Promise<void> | void
  onDeleteWorldEntity: (entityKey: string) => Promise<void> | void
  onCreateWorldRelationship: (input: WorldRelationshipCreateInput) => Promise<void> | void
  onCreateWorldRelationshipFromGraphGesture: (input: WorldRelationshipCreateInput) => Promise<void> | void
  onUpdateWorldRelationship: (relationshipKey: string, changes: Partial<WorldRelationshipCreateInput>) => Promise<void> | void
  onDeleteWorldRelationship: (relationshipKey: string) => Promise<void> | void
  onCreateWorldDerivedComposition: (input: {
    sourceEntityKey: string
    targetEntityKey: string
    operatorType: WorldOperator['operatorType']
    title?: string
    summary?: string
  }) => Promise<void> | void
  onUpdateWorldDerivedComposition: (operatorKey: string, changes: {
    operatorChanges?: Partial<Pick<WorldOperator, 'operatorType' | 'inputEntityKeys' | 'label' | 'status' | 'metadata'>>
    resultChanges?: Partial<Pick<WorldResult, 'resultType' | 'title' | 'summary' | 'previewAssetKey' | 'status' | 'metadata'>>
  }) => Promise<void> | void
  onDeleteWorldDerivedComposition: (operatorKey: string) => Promise<void> | void
  onGenerateWorldResultPreview: (resultKey: string) => Promise<void> | void
  onCreateCinematicReferenceFromWorldResult: (resultKey: string) => void
  onCreateWorldView: (input: WorldViewCreateInput) => Promise<void> | void
  onUpdateWorldView: (viewKey: string, changes: Partial<WorldViewCreateInput>) => Promise<void> | void
  onGenerateStarterWorld: (prompt: string) => Promise<void> | void
  onGenerateWorldExpansion: (entityKey: string) => Promise<void> | void
  onOpenDefinitionLink: (definitionKey: string, kind: DefinitionBase['kind']) => void
  onOpenCinematicGraph: (graphKey: string) => void
  legacyGraphProps: GraphWorkspaceProps
}

type WorldGraphNodeRecord =
  | { kind: 'entity'; entity: WorldEntity; title: string; subtitle: string; summary: string; imageUrl: string | null }
  | { kind: 'operator'; operator: WorldOperator; title: string; subtitle: string; summary: string; imageUrl: string | null }
  | { kind: 'result'; result: WorldResult; title: string; subtitle: string; summary: string; imageUrl: string | null }

type WorldNodeData = {
  record: WorldGraphNodeRecord
  relationCount: number
  usageCount: number
  dimmed: boolean
}

type WorldFlowEdgeData = {
  kind: 'relationship' | 'connection'
}

type EntityComposerState = {
  mode: 'global' | 'related'
  defaults: Partial<WorldEntityCreateInput>
  relationshipDefaults: Partial<WorldRelationshipCreateInput>
  canvasPosition?: { x: number; y: number } | null
}

type RelationshipComposerState = {
  sourceEntityKey: string
  targetEntityKey: string
  notes: string
}

type CompositionComposerState = {
  sourceEntityKey: string
  targetEntityKey: string
  operatorType: WorldOperator['operatorType']
}

type EdgeEditorState = {
  mode: 'create' | 'edit'
  relationshipKey?: string
  sourceEntityKey: string
  targetEntityKey: string
  notes: string
}

type PendingEntityResolutionState = {
  previousEntityKeys: string[]
  canvasPosition: { x: number; y: number } | null
  relationshipDefaults: Partial<WorldRelationshipCreateInput>
}

type ContextMenuState =
  | { kind: 'canvas'; x: number; y: number; flowPosition: { x: number; y: number } | null }
  | { kind: 'entity'; x: number; y: number; entityKey: string }
  | { kind: 'operator'; x: number; y: number; operatorKey: string }
  | { kind: 'result'; x: number; y: number; resultKey: string }
  | { kind: 'relationship'; x: number; y: number; relationshipKey: string }
  | { kind: 'connection'; x: number; y: number; connectionKey: string }

const elk = new ELK()

const nodeTypes = {
  worldNode: WorldNodeCard,
}

function nodeShellStyle(record: WorldGraphNodeRecord, selected: boolean, dimmed: boolean): CSSProperties {
  const palette =
    record.kind === 'entity'
      ? record.entity.nodeType === 'actor'
        ? ['rgba(148, 163, 184, 0.32)', 'rgba(56, 189, 248, 0.14)']
        : record.entity.nodeType === 'group'
          ? ['rgba(253, 224, 71, 0.24)', 'rgba(245, 158, 11, 0.12)']
          : record.entity.nodeType === 'place'
            ? ['rgba(52, 211, 153, 0.24)', 'rgba(16, 185, 129, 0.12)']
            : record.entity.nodeType === 'object'
              ? ['rgba(244, 114, 182, 0.22)', 'rgba(236, 72, 153, 0.1)']
              : record.entity.nodeType === 'concept'
                ? ['rgba(192, 132, 252, 0.22)', 'rgba(139, 92, 246, 0.08)']
                : ['rgba(251, 146, 60, 0.22)', 'rgba(249, 115, 22, 0.12)']
      : record.kind === 'operator'
        ? ['rgba(96, 165, 250, 0.28)', 'rgba(59, 130, 246, 0.08)']
        : ['rgba(255, 255, 255, 0.18)', 'rgba(148, 163, 184, 0.08)']

  return {
    opacity: dimmed ? 0.22 : 1,
    borderColor: selected ? 'rgba(255,255,255,0.34)' : palette[0],
    background: `linear-gradient(180deg, rgba(12, 17, 25, 0.96), ${palette[1]})`,
    boxShadow: selected ? '0 0 0 1px rgba(255,255,255,0.1), 0 18px 38px rgba(5, 8, 14, 0.45)' : '0 14px 32px rgba(5, 8, 14, 0.28)',
  }
}

function WorldNodeCard({ data, selected }: NodeProps<Node<WorldNodeData>>) {
  const { record, relationCount, usageCount, dimmed } = data
  const title = record.title
  const summary = record.summary
  const imageUrl = record.imageUrl
  const kicker =
    record.kind === 'entity'
      ? labelForWorldEntity(record.entity.nodeType)
      : record.kind === 'operator'
        ? 'Operator'
        : 'Derived Result'
  const iconId =
    record.kind === 'entity'
      ? iconForWorldEntity(record.entity.nodeType)
      : record.kind === 'operator'
        ? 'graph'
        : 'cinematic'

  return (
    <div className={`world-node-card world-node-card-${record.kind}`} style={nodeShellStyle(record, selected, dimmed)}>
      {record.kind === 'entity' ? <Handle className="world-node-handle" position={Position.Left} type="target" /> : null}
      {record.kind === 'entity' ? <Handle className="world-node-handle" position={Position.Right} type="source" /> : null}
      <div className="world-node-kicker">
        <EntityIcon id={iconId} />
        <span>{kicker}</span>
        {record.kind === 'result' ? <span className="world-node-badge">Derived</span> : null}
      </div>
      {imageUrl ? (
        <div className="world-node-media">
          <img alt={title} src={imageUrl} />
        </div>
      ) : null}
      <strong>{title}</strong>
      {record.subtitle ? <span className="world-node-subtitle">{record.subtitle}</span> : null}
      {!imageUrl && summary ? <p>{summary}</p> : null}
      <div className="world-node-meta">
        <span>{relationCount} links</span>
        <span>{usageCount} uses</span>
      </div>
    </div>
  )
}

function defaultNameForWorldNodeType(nodeType: WorldEntity['nodeType']) {
  switch (nodeType) {
    case 'actor':
      return 'New Character'
    case 'group':
      return 'New Group'
    case 'place':
      return 'New Place'
    case 'object':
      return 'New Item'
    case 'concept':
      return 'New Lore'
    case 'event':
      return 'New Event'
  }
}

export function WorldGraphPage({
  assets,
  definitions,
  snapshotGraphs,
  worldEntities,
  worldRelationships,
  worldViews,
  worldOperators,
  worldResults,
  worldGraphConnections,
  selectedWorldNodeKey,
  selectedWorldEdgeKey,
  selectedWorldEntityKey,
  selectedWorldViewKey,
  onSelectWorldNode,
  onSelectWorldEdge,
  onSelectWorldEntity,
  onSelectWorldView,
  onCreateWorldEntity,
  onUpdateWorldEntity,
  onDeleteWorldEntity,
  onCreateWorldRelationship,
  onCreateWorldRelationshipFromGraphGesture,
  onUpdateWorldRelationship,
  onDeleteWorldRelationship,
  onCreateWorldDerivedComposition,
  onUpdateWorldDerivedComposition,
  onDeleteWorldDerivedComposition,
  onGenerateWorldResultPreview,
  onCreateCinematicReferenceFromWorldResult,
  onCreateWorldView,
  onUpdateWorldView,
  onGenerateStarterWorld,
  onGenerateWorldExpansion,
  onOpenDefinitionLink,
  onOpenCinematicGraph,
  legacyGraphProps,
}: WorldGraphPageProps) {
  const flowRef = useRef<ReactFlowInstance<Node<WorldNodeData>, Edge<WorldFlowEdgeData>> | null>(null)
  const [legacyMode, setLegacyMode] = useState(false)
  const [viewMode, setViewMode] = useState<WorldView['mode']>('graph')
  const [search, setSearch] = useState('')
  const [activeInspectorTab, setActiveInspectorTab] = useState<'overview' | 'relationships' | 'usage' | 'suggestions'>('overview')
  const [showSuggestions, setShowSuggestions] = useState(true)
  const [showLabels, setShowLabels] = useState(true)
  const [showDerivedLayer, setShowDerivedLayer] = useState(true)
  const [draftPositions, setDraftPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [autoLayoutNonce, setAutoLayoutNonce] = useState(0)
  const [layoutPositions, setLayoutPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [inspectorNodeKey, setInspectorNodeKey] = useState<string | null>(selectedWorldNodeKey)
  const [pendingEntityResolution, setPendingEntityResolution] = useState<PendingEntityResolutionState | null>(null)
  const [entityComposer, setEntityComposer] = useState<EntityComposerState | null>(null)
  const [relationshipComposer, setRelationshipComposer] = useState<RelationshipComposerState | null>(null)
  const [compositionComposer, setCompositionComposer] = useState<CompositionComposerState | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [edgeEditor, setEdgeEditor] = useState<EdgeEditorState | null>(null)
  const [relationshipInspectorNotes, setRelationshipInspectorNotes] = useState('')
  const [starterPrompt, setStarterPrompt] = useState('')
  const [isStarterPending, setIsStarterPending] = useState(false)
  const [isExpansionPending, setIsExpansionPending] = useState(false)
  const [busyMessage, setBusyMessage] = useState<string | null>(null)

  const selectedView = useMemo(
    () => worldViews.find((view) => view.key === selectedWorldViewKey) ?? worldViews[0] ?? createDefaultWorldView(),
    [selectedWorldViewKey, worldViews],
  )
  const selectedEntity = useMemo(
    () => worldEntities.find((entity) => entity.key === selectedWorldEntityKey) ?? worldEntities.find((entity) => entity.key === selectedWorldNodeKey) ?? null,
    [selectedWorldEntityKey, selectedWorldNodeKey, worldEntities],
  )
  const selectedOperator = useMemo(
    () => worldOperators.find((entry) => entry.key === selectedWorldNodeKey) ?? null,
    [selectedWorldNodeKey, worldOperators],
  )
  const selectedResult = useMemo(
    () => worldResults.find((entry) => entry.key === selectedWorldNodeKey) ?? null,
    [selectedWorldNodeKey, worldResults],
  )

  useEffect(() => {
    setViewMode(selectedView.mode)
    setSearch(selectedView.search)
    setShowSuggestions(selectedView.showSuggestions)
    setShowLabels(selectedView.showLabels)
    setShowDerivedLayer(selectedView.showDerivedLayer)
  }, [selectedView.mode, selectedView.search, selectedView.showDerivedLayer, selectedView.showLabels, selectedView.showSuggestions])

  useEffect(() => {
    setDraftPositions(selectedView.nodePositions)
  }, [selectedView.key])

  useEffect(() => {
    if (!selectedView.key) return
    if (Object.keys(selectedView.nodePositions).length === 0) return
    setDraftPositions((current) => {
      let changed = false
      const next = { ...current }
      for (const [key, position] of Object.entries(selectedView.nodePositions)) {
        if (!next[key]) {
          next[key] = position
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [selectedView.key, selectedView.nodePositions])

  useEffect(() => {
    if (selectedWorldNodeKey) {
      setInspectorNodeKey(selectedWorldNodeKey)
    }
  }, [selectedWorldNodeKey])

  const assetByKey = useMemo(() => new Map(assets.map((asset) => [asset.key, asset])), [assets])
  const definitionByKey = useMemo(() => new Map(definitions.map((definition) => [definition.key, definition])), [definitions])
  const usageByEntityKey = useMemo(() => (
    new Map(worldEntities.map((entity) => [entity.key, getWorldEntityUsage(entity, snapshotGraphs)]))
  ), [snapshotGraphs, worldEntities])
  const imageUrlByEntityKey = useMemo(() => {
    return new Map(worldEntities.map((entity) => {
      const linkedDefinition = entity.linkedDefinitionKey ? definitionByKey.get(entity.linkedDefinitionKey) ?? null : null
      const previewAssetKey = entity.thumbnailAssetKey ?? linkedDefinition?.iconAssetKey ?? null
      return [entity.key, resolveAssetSourceUrl(previewAssetKey ? assetByKey.get(previewAssetKey) ?? null : null)]
    }))
  }, [assetByKey, definitionByKey, worldEntities])
  const imageUrlByResultKey = useMemo(() => {
    return new Map(worldResults.map((result) => [
      result.key,
      resolveAssetSourceUrl(result.previewAssetKey ? assetByKey.get(result.previewAssetKey) ?? null : null),
    ]))
  }, [assetByKey, worldResults])

  const effectiveFilters = selectedView.filters
  const filteredEntities = useMemo(() => {
    const query = search.trim().toLowerCase()
    return worldEntities.filter((entity) => {
      if (effectiveFilters.nodeTypes.length > 0 && !effectiveFilters.nodeTypes.includes(entity.nodeType)) return false
      if (effectiveFilters.linkedOnly && !entity.linkedDefinitionKey) return false
      if (effectiveFilters.unlinkedOnly && entity.linkedDefinitionKey) return false
      if (effectiveFilters.usedInCinematic && (usageByEntityKey.get(entity.key)?.length ?? 0) === 0) return false
      if (effectiveFilters.aiSuggestedOnly && entity.source === 'user') return false
      if (!query) return true
      return (
        entity.name.toLowerCase().includes(query)
        || entity.summary.toLowerCase().includes(query)
        || entity.aliases.some((alias) => alias.toLowerCase().includes(query))
        || entity.tags.some((tag) => tag.toLowerCase().includes(query))
      )
    })
  }, [effectiveFilters, search, usageByEntityKey, worldEntities])

  const filteredEntityKeys = useMemo(() => new Set(filteredEntities.map((entity) => entity.key)), [filteredEntities])
  const pinnedRootKey = selectedView.rootEntityKey
  const focusRootKey = selectedWorldNodeKey ?? pinnedRootKey ?? null

  const visibleNodeKeys = useMemo(() => {
    const mixedAdjacency = new Map<string, Set<string>>()
    const addLink = (source: string, target: string) => {
      const sourceLinks = mixedAdjacency.get(source) ?? new Set<string>()
      sourceLinks.add(target)
      mixedAdjacency.set(source, sourceLinks)
      const targetLinks = mixedAdjacency.get(target) ?? new Set<string>()
      targetLinks.add(source)
      mixedAdjacency.set(target, targetLinks)
    }

    for (const relationship of worldRelationships) {
      addLink(relationship.sourceEntityKey, relationship.targetEntityKey)
    }
    if (showDerivedLayer) {
      for (const connection of worldGraphConnections) {
        addLink(connection.sourceNodeKey, connection.targetNodeKey)
      }
    }

    const seed = focusRootKey ? [focusRootKey] : [...filteredEntityKeys]
    const visited = new Set<string>(seed)
    let frontier = new Set<string>(seed)
    const depthLimit = focusRootKey ? selectedView.focusDepth + 1 : 3
    for (let depth = 0; depth < depthLimit; depth += 1) {
      const next = new Set<string>()
      for (const key of frontier) {
        for (const neighbor of mixedAdjacency.get(key) ?? []) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor)
            next.add(neighbor)
          }
        }
      }
      frontier = next
    }

    for (const key of filteredEntityKeys) visited.add(key)
    if (!showDerivedLayer) {
      return new Set([...visited].filter((key) => filteredEntityKeys.has(key)))
    }
    return visited
  }, [filteredEntityKeys, focusRootKey, selectedView.focusDepth, showDerivedLayer, worldGraphConnections, worldRelationships])

  const nodeRecords = useMemo(() => {
    const result = new Map<string, WorldGraphNodeRecord>()
    for (const entity of worldEntities) {
      result.set(entity.key, {
        kind: 'entity',
        entity,
        title: entity.name,
        subtitle: labelForWorldEntity(entity.nodeType),
        summary: entity.summary,
        imageUrl: imageUrlByEntityKey.get(entity.key) ?? null,
      })
    }
    for (const operator of worldOperators) {
      const inputNames = operator.inputEntityKeys
        .map((key) => worldEntities.find((entity) => entity.key === key)?.name ?? key)
        .join(' + ')
      result.set(operator.key, {
        kind: 'operator',
        operator,
        title: labelForWorldOperator(operator.operatorType),
        subtitle: operator.label || 'Derived operation',
        summary: inputNames,
        imageUrl: null,
      })
    }
    for (const worldResult of worldResults) {
      result.set(worldResult.key, {
        kind: 'result',
        result: worldResult,
        title: worldResult.title,
        subtitle: labelForWorldResult(worldResult.resultType),
        summary: worldResult.summary,
        imageUrl: imageUrlByResultKey.get(worldResult.key) ?? null,
      })
    }
    return result
  }, [imageUrlByEntityKey, imageUrlByResultKey, worldEntities, worldOperators, worldResults])

  useEffect(() => {
    if (inspectorNodeKey && !nodeRecords.has(inspectorNodeKey)) {
      setInspectorNodeKey(null)
    }
  }, [inspectorNodeKey, nodeRecords])

  useEffect(() => {
    if (!pendingEntityResolution) return
    const createdEntity = worldEntities.find((entity) => !pendingEntityResolution.previousEntityKeys.includes(entity.key)) ?? null
    if (!createdEntity) return
    const resolvedEntity = createdEntity
    const resolution = pendingEntityResolution
    setPendingEntityResolution(null)

    async function resolveCreatedEntity() {
      if (resolution.canvasPosition) {
        const nextPositions = {
          ...draftPositions,
          [resolvedEntity.key]: resolution.canvasPosition,
        }
        setDraftPositions(nextPositions)
        await persistViewChanges({ nodePositions: nextPositions })
      }

      if (resolution.relationshipDefaults.sourceEntityKey) {
        await onCreateWorldRelationship({
          sourceEntityKey: resolution.relationshipDefaults.sourceEntityKey,
          targetEntityKey: resolvedEntity.key,
          verb: 'related to',
          direction: resolution.relationshipDefaults.direction ?? 'outbound',
          strength: resolution.relationshipDefaults.strength ?? null,
          confidence: resolution.relationshipDefaults.confidence ?? null,
          source: resolution.relationshipDefaults.source ?? 'user',
          notes: resolution.relationshipDefaults.notes ?? resolution.relationshipDefaults.verb ?? '',
          state: resolution.relationshipDefaults.state ?? 'confirmed',
          metadata: resolution.relationshipDefaults.metadata ?? {},
        })
      }
    }

    void resolveCreatedEntity()
  }, [draftPositions, onCreateWorldRelationship, pendingEntityResolution, worldEntities])

  const visibleNodeRecords = useMemo(
    () => [...nodeRecords.values()].filter((record) => visibleNodeKeys.has(
      record.kind === 'entity' ? record.entity.key : record.kind === 'operator' ? record.operator.key : record.result.key,
    )),
    [nodeRecords, visibleNodeKeys],
  )

  const visibleRelationships = useMemo(
    () => worldRelationships.filter((relationship) => visibleNodeKeys.has(relationship.sourceEntityKey) && visibleNodeKeys.has(relationship.targetEntityKey)),
    [visibleNodeKeys, worldRelationships],
  )
  const visibleConnections = useMemo(
    () => (showDerivedLayer
      ? worldGraphConnections.filter((connection) => visibleNodeKeys.has(connection.sourceNodeKey) && visibleNodeKeys.has(connection.targetNodeKey))
      : []),
    [showDerivedLayer, visibleNodeKeys, worldGraphConnections],
  )

  useEffect(() => {
    let cancelled = false

    async function layoutVisibleGraph() {
      if (viewMode !== 'graph' || visibleNodeRecords.length === 0) {
        if (!cancelled) setLayoutPositions({})
        return
      }

      const graph = await elk.layout({
        id: 'world-graph',
        layoutOptions: {
          'elk.algorithm': 'layered',
          'elk.direction': 'RIGHT',
          'elk.layered.spacing.nodeNodeBetweenLayers': '120',
          'elk.spacing.nodeNode': '70',
        },
        children: visibleNodeRecords.map((record) => {
          const key = record.kind === 'entity' ? record.entity.key : record.kind === 'operator' ? record.operator.key : record.result.key
          const width = record.kind === 'entity'
            ? record.entity.nodeType === 'place'
              ? 250
              : 220
            : record.kind === 'operator'
              ? 160
              : 250
          const height = record.kind === 'result' ? 210 : record.kind === 'operator' ? 110 : 170
          return {
            id: key,
            width,
            height,
          }
        }),
        edges: [
          ...visibleRelationships.map((relationship) => ({
            id: relationship.key,
            sources: [relationship.sourceEntityKey],
            targets: [relationship.targetEntityKey],
          })),
          ...visibleConnections.map((connection) => ({
            id: connection.key,
            sources: [connection.sourceNodeKey],
            targets: [connection.targetNodeKey],
          })),
        ],
      })

      if (cancelled) return
      setLayoutPositions(Object.fromEntries(
        (graph.children ?? []).map((child, index) => [child.id, { x: child.x ?? index * 220, y: child.y ?? 0 }]),
      ))
    }

    void layoutVisibleGraph()
    return () => {
      cancelled = true
    }
  }, [autoLayoutNonce, viewMode, visibleConnections, visibleNodeRecords, visibleRelationships])

  useEffect(() => {
    if (!selectedView.key || viewMode !== 'graph' || visibleNodeRecords.length === 0) return

    const nextPositions = { ...draftPositions }
    let changed = false
    for (const record of visibleNodeRecords) {
      const key = record.kind === 'entity' ? record.entity.key : record.kind === 'operator' ? record.operator.key : record.result.key
      if (!nextPositions[key] && layoutPositions[key]) {
        nextPositions[key] = layoutPositions[key]
        changed = true
      }
    }

    if (!changed) return

    setDraftPositions(nextPositions)
    void persistViewChanges({ nodePositions: nextPositions })
  }, [draftPositions, layoutPositions, selectedView.key, viewMode, visibleNodeRecords])

  const relationCountByNodeKey = useMemo(() => {
    const counts = new Map<string, number>()
    for (const record of visibleNodeRecords) {
      counts.set(record.kind === 'entity' ? record.entity.key : record.kind === 'operator' ? record.operator.key : record.result.key, 0)
    }
    for (const relationship of worldRelationships) {
      counts.set(relationship.sourceEntityKey, (counts.get(relationship.sourceEntityKey) ?? 0) + 1)
      counts.set(relationship.targetEntityKey, (counts.get(relationship.targetEntityKey) ?? 0) + 1)
    }
    for (const connection of worldGraphConnections) {
      counts.set(connection.sourceNodeKey, (counts.get(connection.sourceNodeKey) ?? 0) + 1)
      counts.set(connection.targetNodeKey, (counts.get(connection.targetNodeKey) ?? 0) + 1)
    }
    return counts
  }, [visibleNodeRecords, worldGraphConnections, worldRelationships])

  const flowNodes = useMemo<Node<WorldNodeData>[]>(() => {
    return visibleNodeRecords.map((record, index) => {
      const key = record.kind === 'entity' ? record.entity.key : record.kind === 'operator' ? record.operator.key : record.result.key
      return {
        id: key,
        type: 'worldNode',
        position: draftPositions[key] ?? layoutPositions[key] ?? { x: index * 220, y: 0 },
        draggable: viewMode === 'graph',
        data: {
          record,
          relationCount: relationCountByNodeKey.get(key) ?? 0,
          usageCount: record.kind === 'entity'
            ? usageByEntityKey.get(record.entity.key)?.length ?? 0
            : record.kind === 'result' && typeof record.result.metadata?.cinematicGraphKey === 'string'
              ? 1
              : 0,
          dimmed: Boolean(focusRootKey) && !visibleNodeKeys.has(key),
        },
      }
    })
  }, [draftPositions, focusRootKey, layoutPositions, relationCountByNodeKey, usageByEntityKey, viewMode, visibleNodeKeys, visibleNodeRecords])

  const flowEdges = useMemo<Edge<WorldFlowEdgeData>[]>(() => {
    return [
      ...visibleRelationships.map((relationship) => ({
        id: relationship.key,
        source: relationship.sourceEntityKey,
        target: relationship.targetEntityKey,
        selected: selectedWorldEdgeKey === relationship.key,
        label: showLabels ? (relationship.notes.trim() || undefined) : undefined,
        animated: relationship.state !== 'confirmed',
        data: { kind: 'relationship' as const },
        style: {
          stroke: relationship.state === 'confirmed' ? 'rgba(148, 163, 184, 0.54)' : relationship.state === 'suggested' ? 'rgba(94, 234, 212, 0.54)' : 'rgba(244, 114, 182, 0.42)',
          strokeDasharray: relationship.state === 'confirmed' ? undefined : '7 5',
          strokeWidth: relationship.strength ? 1 + relationship.strength * 2 : 1.4,
        },
        labelStyle: {
          fill: '#cbd5e1',
          fontSize: 12,
        },
      })),
      ...visibleConnections.map((connection) => ({
        id: connection.key,
        source: connection.sourceNodeKey,
        target: connection.targetNodeKey,
        selected: selectedWorldEdgeKey === connection.key,
        label: showLabels ? connection.role : undefined,
        animated: false,
        data: { kind: 'connection' as const },
        style: {
          stroke: 'rgba(255, 255, 255, 0.16)',
          strokeDasharray: '5 4',
          strokeWidth: 1.2,
        },
        labelStyle: {
          fill: '#94a3b8',
          fontSize: 11,
        },
      })),
    ]
  }, [selectedWorldEdgeKey, showLabels, visibleConnections, visibleRelationships])

  const groupedEntities = useMemo(() => ({
    actor: filteredEntities.filter((entity) => entity.nodeType === 'actor'),
    group: filteredEntities.filter((entity) => entity.nodeType === 'group'),
    place: filteredEntities.filter((entity) => entity.nodeType === 'place'),
    object: filteredEntities.filter((entity) => entity.nodeType === 'object'),
    concept: filteredEntities.filter((entity) => entity.nodeType === 'concept'),
    event: filteredEntities.filter((entity) => entity.nodeType === 'event'),
  }), [filteredEntities])

  const worldSummarySuggestions = useMemo(
    () => buildGlobalWorldSuggestions(worldEntities, worldRelationships, snapshotGraphs),
    [snapshotGraphs, worldEntities, worldRelationships],
  )
  const inspectorEntity = useMemo(
    () => worldEntities.find((entity) => entity.key === inspectorNodeKey) ?? null,
    [inspectorNodeKey, worldEntities],
  )
  const inspectorOperator = useMemo(
    () => worldOperators.find((entry) => entry.key === inspectorNodeKey) ?? null,
    [inspectorNodeKey, worldOperators],
  )
  const inspectorResult = useMemo(
    () => worldResults.find((entry) => entry.key === inspectorNodeKey) ?? null,
    [inspectorNodeKey, worldResults],
  )
  const inspectorEntitySuggestions = useMemo(
    () => inspectorEntity ? buildSuggestionsForEntity(inspectorEntity, worldRelationships, snapshotGraphs) : [],
    [inspectorEntity, snapshotGraphs, worldRelationships],
  )
  const inspectorRelationship = useMemo(
    () => worldRelationships.find((relationship) => relationship.key === selectedWorldEdgeKey) ?? null,
    [selectedWorldEdgeKey, worldRelationships],
  )
  const inspectorEntityUsage = inspectorEntity ? usageByEntityKey.get(inspectorEntity.key) ?? [] : []
  const inspectorEntityRelationships = inspectorEntity
    ? worldRelationships.filter((relationship) => relationship.sourceEntityKey === inspectorEntity.key || relationship.targetEntityKey === inspectorEntity.key)
    : []

  useEffect(() => {
    setRelationshipInspectorNotes(inspectorRelationship?.notes ?? '')
  }, [inspectorRelationship?.key, inspectorRelationship?.notes])

  async function persistViewChanges(changes: Partial<WorldViewCreateInput>) {
    if (!selectedView.key || worldViews.length === 0) return
    await onUpdateWorldView(selectedView.key, changes)
  }

  function selectWorldNode(key: string | null) {
    onSelectWorldNode(key)
    onSelectWorldEdge(null)
    const entity = key ? worldEntities.find((entry) => entry.key === key) ?? null : null
    onSelectWorldEntity(entity?.key ?? null)
    setInspectorNodeKey(key)
  }

  function selectWorldEdge(key: string | null) {
    onSelectWorldEdge(key)
    onSelectWorldNode(null)
    onSelectWorldEntity(null)
    setInspectorNodeKey(null)
  }

  async function handleNodeDragStop(_event: unknown, node: Node<WorldNodeData>) {
    const nextPositions = {
      ...draftPositions,
      [node.id]: node.position,
    }
    setDraftPositions(nextPositions)
    await persistViewChanges({ nodePositions: nextPositions })
  }

  async function handleAutoLayout() {
    setAutoLayoutNonce((value) => value + 1)
    setTimeout(() => flowRef.current?.fitView({ padding: 0.18, duration: 300 }), 20)
  }

  async function handleSaveCurrentView() {
    const baseName = selectedEntity ? `${selectedEntity.name} Focus` : 'Saved World View'
    await onCreateWorldView({
      name: baseName,
      mode: viewMode,
      filters: selectedView.filters,
      search,
      rootEntityKey: focusRootKey && worldEntities.some((entity) => entity.key === focusRootKey) ? focusRootKey : null,
      camera: selectedView.camera,
      focusDepth: selectedView.focusDepth,
      showSuggestions,
      showLabels,
      showDerivedLayer,
      nodePositions: draftPositions,
      collapsedState: selectedView.collapsedState,
      sortMode: selectedView.sortMode,
      metadata: {},
    })
  }

  async function handleCreateEntity(input: WorldEntityCreateInput) {
    const previousEntityKeys = worldEntities.map((entity) => entity.key)
    setPendingEntityResolution({
      previousEntityKeys,
      canvasPosition: entityComposer?.canvasPosition ?? null,
      relationshipDefaults: entityComposer?.relationshipDefaults ?? {},
    })
    await onCreateWorldEntity(input)
    setEntityComposer(null)
  }

  async function handleGenerateStarter() {
    if (!starterPrompt.trim()) return
    setIsStarterPending(true)
    setBusyMessage('Generating starter world...')
    try {
      await onGenerateStarterWorld(starterPrompt.trim())
      setStarterPrompt('')
    } finally {
      setIsStarterPending(false)
      setBusyMessage(null)
    }
  }

  async function handleGenerateExpansion() {
    if (!selectedEntity) return
    setIsExpansionPending(true)
    setBusyMessage(`Generating additions around ${selectedEntity.name}...`)
    try {
      await onGenerateWorldExpansion(selectedEntity.key)
    } finally {
      setIsExpansionPending(false)
      setBusyMessage(null)
    }
  }

  async function handleGenerateExpansionForEntity(entityKey: string) {
    const entity = worldEntities.find((entry) => entry.key === entityKey) ?? null
    if (!entity) return
    setIsExpansionPending(true)
    setBusyMessage(`Generating additions around ${entity.name}...`)
    try {
      await onGenerateWorldExpansion(entity.key)
    } finally {
      setIsExpansionPending(false)
      setBusyMessage(null)
    }
  }

  function closeMenus() {
    setContextMenu(null)
    setEdgeEditor(null)
  }

  async function handleQuickCreateEntity(
    nodeType: WorldEntity['nodeType'],
    canvasPosition: { x: number; y: number } | null,
  ) {
    const previousEntityKeys = worldEntities.map((entity) => entity.key)
    setPendingEntityResolution({
      previousEntityKeys,
      canvasPosition,
      relationshipDefaults: {},
    })
    setActiveInspectorTab('overview')
    await onCreateWorldEntity({
      name: defaultNameForWorldNodeType(nodeType),
      summary: '',
      nodeType,
      aliases: [],
      tags: [],
      status: 'active',
      thumbnailAssetKey: null,
      linkedDefinitionKey: null,
      source: 'user',
      customProperties: {},
      metadata: {},
      ensureLinkedDefinition: true,
    })
  }

  function openNodeContextMenu(event: ReactMouseEvent, nodeId: string) {
    event.preventDefault()
    const entity = worldEntities.find((entry) => entry.key === nodeId) ?? null
    if (entity) {
      setContextMenu({ kind: 'entity', x: event.clientX, y: event.clientY, entityKey: entity.key })
      return
    }
    const operator = worldOperators.find((entry) => entry.key === nodeId) ?? null
    if (operator) {
      setContextMenu({ kind: 'operator', x: event.clientX, y: event.clientY, operatorKey: operator.key })
      return
    }
    const resultNode = worldResults.find((entry) => entry.key === nodeId) ?? null
    if (resultNode) {
      setContextMenu({ kind: 'result', x: event.clientX, y: event.clientY, resultKey: resultNode.key })
    }
  }

  if (legacyMode) {
    return (
      <div className="focus-layout graph-layout world-graph-layout">
        <aside className="focus-rail graph-rail world-graph-rail">
          <div className="detail-stack compact">
            <span className="eyebrow">Legacy Flow Graphs</span>
            <h3>Advanced Flow Editor</h3>
            <div className="inline-note">Narrative, system, and older flow editing remain available here while the main tab now centers the world map.</div>
            <button className="ghost-button compact" onClick={() => setLegacyMode(false)} type="button">Back To World Graph</button>
          </div>
        </aside>
        <section className="main-surface graph-surface world-graph-legacy">
          <GraphWorkspace {...legacyGraphProps} />
        </section>
      </div>
    )
  }

  return (
    <div className="focus-layout graph-layout world-graph-layout" onClick={() => setContextMenu(null)}>
      <aside className="focus-rail graph-rail world-graph-rail">
        <div className="detail-stack compact">
          <div>
            <span className="eyebrow">World Graph</span>
            <h2>{selectedView.name || 'Living World'}</h2>
            <div className="inline-note">Structured like a knowledge base, connected like a living universe map.</div>
          </div>
          <div className="world-graph-actions">
            <button className="primary-button compact" onClick={() => setEntityComposer({ mode: 'global', defaults: { nodeType: 'actor', source: 'user' }, relationshipDefaults: {}, canvasPosition: null })} type="button">Add Entity</button>
            <button className="ghost-button compact" onClick={() => setLegacyMode(true)} type="button">Legacy Flow Graphs</button>
            <button className="ghost-button compact" onClick={() => void handleSaveCurrentView()} type="button">Save View</button>
          </div>
          <label className="field-block">
            <span>Search</span>
            <input placeholder="Search title, aliases, tags, description" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          <div className="world-filter-grid">
            {(['actor', 'group', 'place', 'object', 'concept', 'event'] as const).map((nodeType) => {
              const active = selectedView.filters.nodeTypes.includes(nodeType)
              return (
                <button
                  key={nodeType}
                  className={active ? 'segment-button is-active' : 'segment-button'}
                  onClick={() => {
                    const nodeTypes = active
                      ? selectedView.filters.nodeTypes.filter((value) => value !== nodeType)
                      : [...selectedView.filters.nodeTypes, nodeType]
                    void persistViewChanges({ filters: { ...selectedView.filters, nodeTypes } })
                  }}
                  type="button"
                >
                  {labelForWorldEntity(nodeType)}
                </button>
              )
            })}
          </div>
        </div>

        {entityComposer ? (
          <EntityComposer
            entityComposer={entityComposer}
            onCancel={() => setEntityComposer(null)}
            onCreate={handleCreateEntity}
          />
        ) : null}

        {relationshipComposer ? (
          <div className="editor-section compact-section world-composer-card">
            <div className="section-head">
              <div>
                <span className="eyebrow">Direct Link</span>
                <h3>Create Relationship</h3>
              </div>
            </div>
            <RelationshipComposer
              entities={worldEntities.filter((entity) => entity.key !== relationshipComposer.sourceEntityKey)}
              state={relationshipComposer}
              onCancel={() => setRelationshipComposer(null)}
              onCreate={async (input) => {
                await onCreateWorldRelationship(input)
                setRelationshipComposer(null)
              }}
            />
          </div>
        ) : null}

        {compositionComposer ? (
          <div className="editor-section compact-section world-composer-card">
            <div className="section-head">
              <div>
                <span className="eyebrow">Derived Layer</span>
                <h3>Create Composition</h3>
              </div>
            </div>
            <CompositionComposer
              entities={worldEntities}
              state={compositionComposer}
              onCancel={() => setCompositionComposer(null)}
              onCreate={async (input) => {
                await onCreateWorldDerivedComposition(input)
                setCompositionComposer(null)
              }}
            />
          </div>
        ) : null}

        <div className="detail-stack compact">
          <div className="section-head">
            <div>
              <span className="eyebrow">Saved Views</span>
              <h3>Views</h3>
            </div>
          </div>
          <div className="rail-list">
            {worldViews.length === 0 ? <div className="inline-note">No saved views yet. Save the current layout once you have a useful neighborhood.</div> : null}
            {worldViews.map((view) => (
              <button
                key={view.key}
                className={view.key === selectedView.key ? 'rail-button is-active' : 'rail-button'}
                onClick={() => onSelectWorldView(view.key)}
                type="button"
              >
                <strong>{view.name}</strong>
                <span>{view.rootEntityKey ? 'Focused' : 'Overview'}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="detail-stack compact">
          <div className="section-head">
            <div>
              <span className="eyebrow">Entities</span>
              <h3>World Structure</h3>
            </div>
          </div>
          <div className="world-entity-group-list">
            {Object.entries(groupedEntities).map(([nodeType, entities]) => (
              entities.length > 0 ? (
                <div key={nodeType} className="rail-section">
                  <span className="section-label">{labelForWorldEntity(nodeType as WorldEntity['nodeType'])}s</span>
                  <div className="rail-list">
                    {entities.map((entity) => (
                      <button
                        key={entity.key}
                        className={entity.key === selectedEntity?.key ? 'rail-button item-row is-active' : 'rail-button item-row'}
                        onClick={() => {
                          selectWorldNode(entity.key)
                          setActiveInspectorTab('overview')
                        }}
                        type="button"
                      >
                        <div className="media-thumb">
                          <EntityIcon id={iconForWorldEntity(entity.nodeType)} />
                        </div>
                        <div className="item-row-copy">
                          <strong>{entity.name}</strong>
                          <span>{labelForWorldEntity(entity.nodeType)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null
            ))}
          </div>
        </div>
      </aside>

      <section className="main-surface graph-surface world-graph-surface">
        <div className="world-graph-toolbar">
          <div className="segmented-control">
            {(['graph', 'table', 'timeline', 'board'] as const).map((mode) => (
              <button
                key={mode}
                className={viewMode === mode ? 'segment-button is-active' : 'segment-button'}
                onClick={() => {
                  setViewMode(mode)
                  void persistViewChanges({ mode })
                }}
                type="button"
              >
                {mode[0].toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          <div className="world-graph-toolbar-actions">
            <button className={showDerivedLayer ? 'ghost-button compact is-active' : 'ghost-button compact'} onClick={() => {
              const nextValue = !showDerivedLayer
              setShowDerivedLayer(nextValue)
              void persistViewChanges({ showDerivedLayer: nextValue })
            }} type="button">Show Derived Layer</button>
            <button className={showLabels ? 'ghost-button compact is-active' : 'ghost-button compact'} onClick={() => {
              const nextValue = !showLabels
              setShowLabels(nextValue)
              void persistViewChanges({ showLabels: nextValue })
            }} type="button">Labels</button>
            <button className="ghost-button compact" onClick={() => void handleAutoLayout()} type="button">Auto Layout</button>
            <button className="ghost-button compact" onClick={() => flowRef.current?.fitView({ padding: 0.18, duration: 300 })} type="button">Fit</button>
            <button className="primary-button compact" onClick={() => setEntityComposer({ mode: 'global', defaults: { nodeType: 'actor', source: 'user' }, relationshipDefaults: {}, canvasPosition: null })} type="button">Add Entity</button>
            <button className="ghost-button compact" disabled={!selectedEntity || isExpansionPending} onClick={() => void handleGenerateExpansion()} type="button">
              {isExpansionPending ? 'Generating...' : 'Generate From Selection'}
            </button>
          </div>
        </div>

        {selectedWorldNodeKey ? (
          <div className="world-focus-banner">
            <span className="section-label">Focus Mode</span>
            <strong>{selectedEntity?.name ?? selectedOperator?.label ?? selectedResult?.title ?? 'Selection'}</strong>
            <button className="ghost-button compact" onClick={() => selectWorldNode(null)} type="button">Exit Focus</button>
            <button className="ghost-button compact" onClick={() => void persistViewChanges({ focusDepth: Math.min(2, selectedView.focusDepth + 1) })} type="button">Expand 1 Level</button>
            <button className="ghost-button compact" onClick={() => void persistViewChanges({ rootEntityKey: selectedEntity?.key ?? null })} type="button">Pin Neighborhood</button>
            <button className="ghost-button compact" onClick={() => void handleSaveCurrentView()} type="button">Save As View</button>
          </div>
        ) : null}

        {busyMessage ? <div className="inline-note">{busyMessage}</div> : null}

        {worldEntities.length === 0 ? (
          <div className="world-graph-empty">
            <span className="eyebrow">Start Building</span>
            <h2>Create a starter world</h2>
            <p>Seed the graph from a prompt, or start manually with a first character, place, or idea.</p>
            <textarea
              className="world-seed-textarea"
              rows={4}
              placeholder="A fractured kingdom where rival groups compete for power"
              value={starterPrompt}
              onChange={(event) => setStarterPrompt(event.target.value)}
            />
            <div className="world-empty-actions">
              <button className="primary-button" disabled={isStarterPending || !starterPrompt.trim()} onClick={() => void handleGenerateStarter()} type="button">
                {isStarterPending ? 'Generating...' : 'Generate Starter World'}
              </button>
              <button className="ghost-button" onClick={() => setEntityComposer({ mode: 'global', defaults: { nodeType: 'actor', source: 'user' }, relationshipDefaults: {}, canvasPosition: null })} type="button">Add First Character</button>
              <button className="ghost-button" onClick={() => setEntityComposer({ mode: 'global', defaults: { nodeType: 'place', source: 'user' }, relationshipDefaults: {}, canvasPosition: null })} type="button">Add First Place</button>
            </div>
          </div>
        ) : viewMode !== 'graph' ? (
          <div className="world-view-stub">
            <span className="eyebrow">{viewMode[0].toUpperCase() + viewMode.slice(1)} Mode</span>
            <h2>{viewMode[0].toUpperCase() + viewMode.slice(1)} view is stubbed in v1</h2>
            <div className="inline-note">Graph is the production-ready mode in this first release. The saved-view, filter, and inspector model is already structured to support richer table, timeline, and board surfaces next.</div>
          </div>
        ) : (
          <div className="canvas-stage graph-canvas world-graph-canvas">
            <ReactFlow
              fitView
              nodeTypes={nodeTypes}
              nodes={flowNodes}
              edges={flowEdges}
              onInit={(instance) => {
                flowRef.current = instance
              }}
              onConnect={(connection: Connection) => {
                if (!connection.source || !connection.target || connection.source === connection.target) return
                const sourceEntity = worldEntities.find((entity) => entity.key === connection.source) ?? null
                const targetEntity = worldEntities.find((entity) => entity.key === connection.target) ?? null
                if (!sourceEntity || !targetEntity) return
                setEdgeEditor({
                  mode: 'create',
                  sourceEntityKey: sourceEntity.key,
                  targetEntityKey: targetEntity.key,
                  notes: '',
                })
                setContextMenu(null)
              }}
              onNodeClick={(_, node) => {
                selectWorldNode(node.id)
                setActiveInspectorTab('overview')
              }}
              onNodeDoubleClick={(_, node) => {
                selectWorldNode(node.id)
                const entity = worldEntities.find((entry) => entry.key === node.id) ?? null
                void persistViewChanges({ rootEntityKey: entity?.key ?? null })
              }}
              onNodeContextMenu={(event, node) => openNodeContextMenu(event, node.id)}
              onNodeDragStop={handleNodeDragStop}
              onEdgeClick={(_, edge) => {
                selectWorldEdge(edge.id)
                setEdgeEditor(null)
              }}
              onEdgeContextMenu={(event, edge) => {
                event.preventDefault()
                selectWorldEdge(edge.id)
                const relationship = worldRelationships.find((entry) => entry.key === edge.id) ?? null
                setContextMenu(relationship
                  ? { kind: 'relationship', x: event.clientX, y: event.clientY, relationshipKey: relationship.key }
                  : { kind: 'connection', x: event.clientX, y: event.clientY, connectionKey: edge.id })
              }}
              onPaneClick={() => {
                selectWorldNode(null)
                selectWorldEdge(null)
                setInspectorNodeKey(null)
                closeMenus()
              }}
              onPaneContextMenu={(event) => {
                event.preventDefault()
                setContextMenu({
                  kind: 'canvas',
                  x: event.clientX,
                  y: event.clientY,
                  flowPosition: flowRef.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) ?? null,
                })
              }}
              nodesDraggable
              onlyRenderVisibleElements
            >
              <Background />
              <Controls />
            </ReactFlow>
          </div>
        )}

        {edgeEditor ? (
          <div className="world-overlay-card world-edge-popup">
            <div className="world-popup-head">
              <div>
                <span className="eyebrow">Relationship</span>
                <h3>{edgeEditor.mode === 'create' ? 'Create Relationship' : 'Edit Relationship'}</h3>
              </div>
              <button className="world-popup-close" onClick={() => setEdgeEditor(null)} type="button" aria-label="Close relationship editor">×</button>
            </div>
            <label className="field-block">
              <span>Connection note</span>
              <textarea
                rows={4}
                placeholder="How these two things relate"
                value={edgeEditor.notes}
                onChange={(event) => setEdgeEditor((current) => current ? { ...current, notes: event.target.value } : current)}
              />
            </label>
            <div className="world-inspector-actions">
              <button
                className="primary-button compact"
                onClick={() => void (async () => {
                  if (edgeEditor.mode === 'create') {
                    await onCreateWorldRelationshipFromGraphGesture({
                      sourceEntityKey: edgeEditor.sourceEntityKey,
                      targetEntityKey: edgeEditor.targetEntityKey,
                      verb: 'related to',
                      direction: 'outbound',
                      strength: null,
                      confidence: null,
                      source: 'user',
                      notes: edgeEditor.notes.trim(),
                      state: 'confirmed',
                      metadata: { creationMode: 'graph_gesture' },
                    })
                  } else if (edgeEditor.relationshipKey) {
                    await onUpdateWorldRelationship(edgeEditor.relationshipKey, {
                      verb: 'related to',
                      notes: edgeEditor.notes.trim(),
                    })
                  }
                  setEdgeEditor(null)
                })()}
                type="button"
              >
                {edgeEditor.mode === 'create' ? 'Create' : 'Save'}
              </button>
            </div>
          </div>
        ) : null}

        {contextMenu ? (
          <div className="world-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
            {contextMenu.kind === 'canvas' ? (
              <>
                {(['actor', 'group', 'place', 'object', 'concept', 'event'] as const).map((nodeType) => (
                  <button key={nodeType} className="world-context-action" onClick={() => {
                    void handleQuickCreateEntity(nodeType, contextMenu.flowPosition)
                    setContextMenu(null)
                  }} type="button">
                    Add {labelForWorldEntity(nodeType)}
                  </button>
                ))}
                <button className="world-context-action" onClick={() => {
                  setContextMenu(null)
                  flowRef.current?.fitView({ padding: 0.18, duration: 300 })
                }} type="button">Fit View</button>
                <button className="world-context-action" onClick={() => {
                  void handleAutoLayout()
                  setContextMenu(null)
                }} type="button">Auto Layout</button>
                <button className="world-context-action" onClick={() => {
                  void handleSaveCurrentView()
                  setContextMenu(null)
                }} type="button">Save View</button>
                <button className="world-context-action" onClick={() => {
                  const nextValue = !showDerivedLayer
                  setShowDerivedLayer(nextValue)
                  void persistViewChanges({ showDerivedLayer: nextValue })
                  setContextMenu(null)
                }} type="button">Toggle Derived Layer</button>
              </>
            ) : null}

            {contextMenu.kind === 'entity' ? (
              <>
                <button className="world-context-action" onClick={() => {
                  selectWorldNode(contextMenu.entityKey)
                  setContextMenu(null)
                }} type="button">Open</button>
                <button className="world-context-action" onClick={() => {
                  selectWorldNode(contextMenu.entityKey)
                  void persistViewChanges({ rootEntityKey: contextMenu.entityKey })
                  setContextMenu(null)
                }} type="button">Focus</button>
                <button className="world-context-action" onClick={() => {
                  selectWorldNode(contextMenu.entityKey)
                  setEntityComposer({
                    mode: 'related',
                    defaults: { nodeType: 'actor', source: 'user' },
                    relationshipDefaults: { sourceEntityKey: contextMenu.entityKey, verb: 'related to' },
                    canvasPosition: null,
                  })
                  setContextMenu(null)
                }} type="button">Add Related Entity</button>
                <button className="world-context-action" onClick={() => {
                  setRelationshipComposer({ sourceEntityKey: contextMenu.entityKey, targetEntityKey: '', notes: '' })
                  setContextMenu(null)
                }} type="button">Link To Existing...</button>
                <button className="world-context-action" onClick={() => {
                  setCompositionComposer({ sourceEntityKey: contextMenu.entityKey, targetEntityKey: '', operatorType: 'wear' })
                  setContextMenu(null)
                }} type="button">Create Composition...</button>
                <button className="world-context-action" onClick={() => {
                  void handleGenerateExpansionForEntity(contextMenu.entityKey)
                  setContextMenu(null)
                }} type="button">Generate Around This</button>
                <button className="world-context-action" onClick={() => {
                  const entity = worldEntities.find((entry) => entry.key === contextMenu.entityKey) ?? null
                  if (entity?.linkedDefinitionKey) {
                    const kind = entity.nodeType === 'actor' ? 'character' : entity.nodeType === 'place' ? 'environment' : entity.nodeType === 'object' ? 'item' : null
                    if (kind) onOpenDefinitionLink(entity.linkedDefinitionKey, kind)
                  }
                  setContextMenu(null)
                }} type="button">Open Linked Record</button>
                <button className="world-context-action" onClick={() => {
                  void handleSaveCurrentView()
                  setContextMenu(null)
                }} type="button">Save Neighborhood As View</button>
                <button className="world-context-action danger" onClick={() => {
                  void onUpdateWorldEntity(contextMenu.entityKey, { status: 'archived' })
                  setContextMenu(null)
                }} type="button">Archive</button>
              </>
            ) : null}

            {contextMenu.kind === 'relationship' ? (
              <>
                <button className="world-context-action" onClick={() => {
                  const relationship = worldRelationships.find((entry) => entry.key === contextMenu.relationshipKey)
                  if (relationship) {
                    setEdgeEditor({
                      mode: 'edit',
                      relationshipKey: relationship.key,
                      sourceEntityKey: relationship.sourceEntityKey,
                      targetEntityKey: relationship.targetEntityKey,
                      notes: relationship.notes,
                    })
                  }
                  setContextMenu(null)
                }} type="button">Edit Relationship</button>
                <button className="world-context-action" onClick={() => {
                  const relationship = worldRelationships.find((entry) => entry.key === contextMenu.relationshipKey)
                  if (relationship) {
                    void onUpdateWorldRelationship(relationship.key, {
                      sourceEntityKey: relationship.targetEntityKey,
                      targetEntityKey: relationship.sourceEntityKey,
                    })
                  }
                  setContextMenu(null)
                }} type="button">Flip Direction</button>
                <button className="world-context-action danger" onClick={() => {
                  void onDeleteWorldRelationship(contextMenu.relationshipKey)
                  setContextMenu(null)
                }} type="button">Delete Link</button>
              </>
            ) : null}

            {contextMenu.kind === 'operator' ? (
              <>
                <button className="world-context-action" onClick={() => {
                  selectWorldNode(contextMenu.operatorKey)
                  setContextMenu(null)
                }} type="button">Open Inputs</button>
                <button className="world-context-action" onClick={() => {
                  const result = worldResults.find((entry) => entry.sourceOperatorKey === contextMenu.operatorKey)
                  if (result) void onGenerateWorldResultPreview(result.key)
                  setContextMenu(null)
                }} type="button">Regenerate Result</button>
                <button className="world-context-action" onClick={() => {
                  const operator = worldOperators.find((entry) => entry.key === contextMenu.operatorKey)
                  if (operator) {
                    void onUpdateWorldDerivedComposition(operator.key, {
                      operatorChanges: {
                        inputEntityKeys: [...operator.inputEntityKeys].reverse(),
                      },
                    })
                  }
                  setContextMenu(null)
                }} type="button">Swap Inputs</button>
                <button className="world-context-action" onClick={() => {
                  const operator = worldOperators.find((entry) => entry.key === contextMenu.operatorKey)
                  if (operator) {
                    const sourceEntityKey = operator.inputEntityKeys[0] ?? ''
                    const targetEntityKey = operator.inputEntityKeys[1] ?? ''
                    setCompositionComposer({ sourceEntityKey, targetEntityKey, operatorType: operator.operatorType })
                  }
                  setContextMenu(null)
                }} type="button">Change Operation</button>
                <button className="world-context-action danger" onClick={() => {
                  void onDeleteWorldDerivedComposition(contextMenu.operatorKey)
                  setContextMenu(null)
                }} type="button">Delete Operation</button>
              </>
            ) : null}

            {contextMenu.kind === 'result' ? (
              <>
                <button className="world-context-action" onClick={() => {
                  selectWorldNode(contextMenu.resultKey)
                  setContextMenu(null)
                }} type="button">Open Result</button>
                <button className="world-context-action" onClick={() => {
                  void onGenerateWorldResultPreview(contextMenu.resultKey)
                  setContextMenu(null)
                }} type="button">Regenerate Preview</button>
                <button className="world-context-action" onClick={() => {
                  const resultNode = worldResults.find((entry) => entry.key === contextMenu.resultKey)
                  const operator = resultNode ? worldOperators.find((entry) => entry.key === resultNode.sourceOperatorKey) ?? null : null
                  const firstEntityKey = operator?.inputEntityKeys[0] ?? null
                  if (firstEntityKey && resultNode?.previewAssetKey) {
                    void onUpdateWorldEntity(firstEntityKey, { thumbnailAssetKey: resultNode.previewAssetKey })
                  }
                  setContextMenu(null)
                }} type="button">Pin As Node Cover</button>
                <button className="world-context-action" onClick={() => {
                  onCreateCinematicReferenceFromWorldResult(contextMenu.resultKey)
                  setContextMenu(null)
                }} type="button">Create Cinematic Ref</button>
                <button className="world-context-action" onClick={() => {
                  const resultNode = worldResults.find((entry) => entry.key === contextMenu.resultKey)
                  const graphKey = typeof resultNode?.metadata?.cinematicGraphKey === 'string' ? resultNode.metadata.cinematicGraphKey : null
                  if (graphKey) onOpenCinematicGraph(graphKey)
                  setContextMenu(null)
                }} type="button">Open In Cinematics</button>
                <button className="world-context-action danger" onClick={() => {
                  const resultNode = worldResults.find((entry) => entry.key === contextMenu.resultKey)
                  if (resultNode) void onDeleteWorldDerivedComposition(resultNode.sourceOperatorKey)
                  setContextMenu(null)
                }} type="button">Delete Result</button>
              </>
            ) : null}
          </div>
        ) : null}
      </section>

      <aside className="context-drawer world-graph-drawer">
        {inspectorRelationship ? (
          <div className="detail-stack compact">
            <div className="drawer-head">
              <div>
                <span className="eyebrow">Relationship</span>
                <h3>{inspectorRelationship.notes.trim() || 'Untitled Link'}</h3>
              </div>
            </div>
            <div className="editor-section compact-section">
              <div className="inline-note">
                {(worldEntities.find((entity) => entity.key === inspectorRelationship.sourceEntityKey)?.name ?? 'Missing source')}
                {' -> '}
                {(worldEntities.find((entity) => entity.key === inspectorRelationship.targetEntityKey)?.name ?? 'Missing target')}
              </div>
              <label className="field-block">
                <span>Connection note</span>
                <textarea
                  rows={4}
                  value={relationshipInspectorNotes}
                  onChange={(event) => setRelationshipInspectorNotes(event.target.value)}
                />
              </label>
              <div className="inline-note">{inspectorRelationship.direction} · {inspectorRelationship.source}</div>
              <div className="world-inspector-actions">
                <button
                  className="primary-button compact"
                  onClick={() => void onUpdateWorldRelationship(inspectorRelationship.key, {
                    verb: 'related to',
                    notes: relationshipInspectorNotes.trim(),
                  })}
                  type="button"
                >
                  Save
                </button>
                <button
                  className="ghost-button compact"
                  onClick={() => {
                    const sourceEntity = worldEntities.find((entity) => entity.key === inspectorRelationship.sourceEntityKey) ?? null
                    const targetEntity = worldEntities.find((entity) => entity.key === inspectorRelationship.targetEntityKey) ?? null
                    if (sourceEntity) selectWorldNode(sourceEntity.key)
                    else if (targetEntity) selectWorldNode(targetEntity.key)
                  }}
                  type="button"
                >
                  Jump To Node
                </button>
                <button
                  className="ghost-button compact"
                  onClick={() => void onUpdateWorldRelationship(inspectorRelationship.key, {
                    sourceEntityKey: inspectorRelationship.targetEntityKey,
                    targetEntityKey: inspectorRelationship.sourceEntityKey,
                  })}
                  type="button"
                >
                  Flip Direction
                </button>
                <button className="ghost-button compact danger" onClick={() => void onDeleteWorldRelationship(inspectorRelationship.key)} type="button">Delete</button>
              </div>
            </div>
          </div>
        ) : !inspectorNodeKey ? (
          <div className="detail-stack compact">
            <span className="eyebrow">World Summary</span>
            <h3>{worldEntities.length} entities</h3>
            <dl className="data-list compact">
              {(['actor', 'group', 'place', 'object', 'concept', 'event'] as const).map((nodeType) => (
                <div key={nodeType}>
                  <dt>{labelForWorldEntity(nodeType)}s</dt>
                  <dd>{worldEntities.filter((entity) => entity.nodeType === nodeType).length}</dd>
                </div>
              ))}
            </dl>
            <div className="editor-section compact-section">
              <div className="section-head">
                <div>
                  <span className="eyebrow">Recent</span>
                  <h3>Recent additions</h3>
                </div>
              </div>
              {worldEntities.slice(-5).reverse().map((entity) => (
                <button key={entity.key} className="rail-button item-row" onClick={() => selectWorldNode(entity.key)} type="button">
                  <div className="media-thumb">
                    <EntityIcon id={iconForWorldEntity(entity.nodeType)} />
                  </div>
                  <div className="item-row-copy">
                    <strong>{entity.name}</strong>
                    <span>{labelForWorldEntity(entity.nodeType)}</span>
                  </div>
                </button>
              ))}
            </div>
            {showSuggestions ? (
              <SuggestionPanel
                suggestions={worldSummarySuggestions}
                onApply={(suggestion) => setEntityComposer({
                  mode: 'global',
                  defaults: {
                    nodeType: suggestion.entityDefaults?.nodeType ?? 'actor',
                    name: suggestion.entityDefaults?.name,
                    summary: suggestion.entityDefaults?.summary,
                    source: 'user',
                  },
                  relationshipDefaults: suggestion.relationshipDefaults ?? {},
                  canvasPosition: null,
                })}
              />
            ) : null}
          </div>
        ) : inspectorEntity ? (
          <div className="detail-stack compact">
            <div className="drawer-head">
              <div>
                <span className="eyebrow">{labelForWorldEntity(inspectorEntity.nodeType)}</span>
                <h3>{inspectorEntity.name}</h3>
              </div>
            </div>
            <div className="segmented-control">
              {(['overview', 'relationships', 'usage', 'suggestions'] as const).map((tab) => (
                <button
                  key={tab}
                  className={activeInspectorTab === tab ? 'segment-button is-active' : 'segment-button'}
                  onClick={() => setActiveInspectorTab(tab)}
                  type="button"
                >
                  {tab[0].toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {activeInspectorTab === 'overview' ? (
              <div className="editor-section compact-section">
                <label className="field-block">
                  <span>Name</span>
                  <input value={inspectorEntity.name} onChange={(event) => void onUpdateWorldEntity(inspectorEntity.key, { name: event.target.value })} />
                </label>
                <label className="field-block">
                  <span>Summary</span>
                  <textarea rows={4} value={inspectorEntity.summary} onChange={(event) => void onUpdateWorldEntity(inspectorEntity.key, { summary: event.target.value })} />
                </label>
                <div className="world-inspector-actions">
                  {inspectorEntity.linkedDefinitionKey ? (
                    <button className="ghost-button compact" onClick={() => {
                      const kind = inspectorEntity.nodeType === 'actor' ? 'character' : inspectorEntity.nodeType === 'place' ? 'environment' : inspectorEntity.nodeType === 'object' ? 'item' : null
                      if (kind) onOpenDefinitionLink(inspectorEntity.linkedDefinitionKey!, kind)
                    }} type="button">Open Linked Record</button>
                  ) : null}
                <button className="ghost-button compact" onClick={() => setEntityComposer({
                  mode: 'related',
                  defaults: { nodeType: 'actor', source: 'user' },
                  relationshipDefaults: { sourceEntityKey: inspectorEntity.key, verb: 'related to' },
                  canvasPosition: null,
                })} type="button">Add Related Entity</button>
                  <button className="ghost-button compact danger" onClick={() => void onDeleteWorldEntity(inspectorEntity.key)} type="button">Delete</button>
                </div>
              </div>
            ) : null}

            {activeInspectorTab === 'relationships' ? (
              <div className="editor-section compact-section">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">Links</span>
                    <h3>Relationships</h3>
                  </div>
                  <button className="ghost-button compact" onClick={() => setRelationshipComposer({
                    sourceEntityKey: inspectorEntity.key,
                    targetEntityKey: '',
                    notes: '',
                  })} type="button">Add Relationship</button>
                </div>
                {inspectorEntityRelationships.length === 0 ? <div className="inline-note">This entity has no relationships yet.</div> : null}
                {inspectorEntityRelationships.map((relationship) => {
                  const counterpart = worldEntities.find((entity) => (
                    relationship.sourceEntityKey === inspectorEntity.key ? entity.key === relationship.targetEntityKey : entity.key === relationship.sourceEntityKey
                  )) ?? null
                  return (
                    <div key={relationship.key} className="schema-card world-relationship-card">
                      <div className="schema-card-head">
                        <strong>{relationship.notes.trim() || 'Relationship'}</strong>
                        <div className="world-inspector-actions">
                          {counterpart ? <button className="ghost-button compact" onClick={() => selectWorldNode(counterpart.key)} type="button">Jump</button> : null}
                          <button className="ghost-button compact" onClick={() => setEdgeEditor({
                            mode: 'edit',
                            relationshipKey: relationship.key,
                            sourceEntityKey: relationship.sourceEntityKey,
                            targetEntityKey: relationship.targetEntityKey,
                            notes: relationship.notes,
                          })} type="button">Edit</button>
                          <button className="ghost-button compact danger" onClick={() => void onDeleteWorldRelationship(relationship.key)} type="button">Remove</button>
                        </div>
                      </div>
                      <div className="inline-note">{counterpart?.name ?? 'Missing link'} · {relationship.direction} · {relationship.source}</div>
                    </div>
                  )
                })}
              </div>
            ) : null}

            {activeInspectorTab === 'usage' ? (
              <div className="editor-section compact-section">
                <div className="section-head">
                  <div>
                    <span className="eyebrow">Backlinks</span>
                    <h3>Usage</h3>
                  </div>
                </div>
                {inspectorEntityUsage.length === 0 ? <div className="inline-note">No downstream cinematic usage yet.</div> : null}
                {inspectorEntityUsage.map((usage) => (
                  <button key={usage.graphKey} className="rail-button item-row" onClick={() => onOpenCinematicGraph(usage.graphKey)} type="button">
                    <div className="media-thumb">
                      <EntityIcon id="cinematic" />
                    </div>
                    <div className="item-row-copy">
                      <strong>{usage.graphName}</strong>
                      <span>Open cinematic</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}

            {activeInspectorTab === 'suggestions' ? (
              <SuggestionPanel
                suggestions={inspectorEntitySuggestions}
                onApply={(suggestion) => setEntityComposer({
                  mode: 'related',
                  defaults: {
                    nodeType: suggestion.entityDefaults?.nodeType ?? 'actor',
                    name: suggestion.entityDefaults?.name,
                    summary: suggestion.entityDefaults?.summary,
                    source: 'user',
                  },
                  relationshipDefaults: {
                    sourceEntityKey: suggestion.relationshipDefaults?.sourceEntityKey ?? inspectorEntity.key,
                    targetEntityKey: suggestion.relationshipDefaults?.targetEntityKey,
                    verb: suggestion.relationshipDefaults?.verb ?? 'related to',
                  },
                  canvasPosition: null,
                })}
              />
            ) : null}
          </div>
        ) : inspectorOperator ? (
          <div className="detail-stack compact">
            <span className="eyebrow">Operator</span>
            <h3>{labelForWorldOperator(inspectorOperator.operatorType)}</h3>
            <div className="inline-note">Inputs: {inspectorOperator.inputEntityKeys.map((key) => worldEntities.find((entity) => entity.key === key)?.name ?? key).join(' + ')}</div>
            <div className="world-inspector-actions">
              <button className="ghost-button compact" onClick={() => {
                const resultNode = worldResults.find((entry) => entry.sourceOperatorKey === inspectorOperator.key)
                if (resultNode) void onGenerateWorldResultPreview(resultNode.key)
              }} type="button">Regenerate Result</button>
              <button className="ghost-button compact" onClick={() => void onUpdateWorldDerivedComposition(inspectorOperator.key, { operatorChanges: { inputEntityKeys: [...inspectorOperator.inputEntityKeys].reverse() } })} type="button">Swap Inputs</button>
              <button className="ghost-button compact danger" onClick={() => void onDeleteWorldDerivedComposition(inspectorOperator.key)} type="button">Delete Operation</button>
            </div>
          </div>
        ) : inspectorResult ? (
          <div className="detail-stack compact">
            <span className="eyebrow">Derived Result</span>
            <h3>{inspectorResult.title}</h3>
            {imageUrlByResultKey.get(inspectorResult.key) ? (
              <div className="world-result-preview">
                <img alt={inspectorResult.title} src={imageUrlByResultKey.get(inspectorResult.key)!} />
              </div>
            ) : null}
            <div className="inline-note">{inspectorResult.summary || labelForWorldResult(inspectorResult.resultType)}</div>
            <div className="world-inspector-actions">
              <button className="ghost-button compact" onClick={() => void onGenerateWorldResultPreview(inspectorResult.key)} type="button">Generate Preview</button>
              <button className="ghost-button compact" onClick={() => onCreateCinematicReferenceFromWorldResult(inspectorResult.key)} type="button">Create Cinematic Ref</button>
              <button className="ghost-button compact" onClick={() => {
                const graphKey = typeof inspectorResult.metadata?.cinematicGraphKey === 'string' ? inspectorResult.metadata.cinematicGraphKey : null
                if (graphKey) onOpenCinematicGraph(graphKey)
              }} type="button">Open In Cinematics</button>
              <button className="ghost-button compact danger" onClick={() => void onDeleteWorldDerivedComposition(inspectorResult.sourceOperatorKey)} type="button">Delete Result</button>
            </div>
          </div>
        ) : (
          <div className="detail-stack compact">
            <span className="eyebrow">World Graph</span>
            <h3>Nothing selected</h3>
          </div>
        )}
      </aside>
    </div>
  )
}

function EntityComposer({
  entityComposer,
  onCancel,
  onCreate,
}: {
  entityComposer: EntityComposerState
  onCancel: () => void
  onCreate: (input: WorldEntityCreateInput) => Promise<void>
}) {
  const [nodeType, setNodeType] = useState<WorldEntity['nodeType']>(entityComposer.defaults.nodeType ?? 'actor')
  const [name, setName] = useState(entityComposer.defaults.name ?? '')
  const [summary, setSummary] = useState(entityComposer.defaults.summary ?? '')

  return (
    <div className="editor-section compact-section world-composer-card">
      <div className="section-head">
        <div>
          <span className="eyebrow">{entityComposer.mode === 'related' ? 'Related Entity' : 'New Entity'}</span>
          <h3>{entityComposer.mode === 'related' ? 'Add Related Entity' : 'Create Entity'}</h3>
        </div>
      </div>
      <label className="field-block">
        <span>Type</span>
        <select value={nodeType} onChange={(event) => setNodeType(event.target.value as WorldEntity['nodeType'])}>
          <option value="actor">Character</option>
          <option value="group">Group</option>
          <option value="place">Place</option>
          <option value="object">Item</option>
          <option value="concept">Lore</option>
          <option value="event">Event</option>
        </select>
      </label>
      <label className="field-block">
        <span>Name</span>
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="field-block">
        <span>Summary</span>
        <textarea rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} />
      </label>
      <div className="world-inspector-actions">
        <button
          className="primary-button compact"
          disabled={!name.trim()}
          onClick={() => void onCreate({
            name: name.trim(),
            summary: summary.trim(),
            nodeType,
            aliases: [],
            tags: [],
            status: 'active',
            thumbnailAssetKey: null,
            linkedDefinitionKey: null,
            source: 'user',
            customProperties: {},
            metadata: {},
            ensureLinkedDefinition: true,
          })}
          type="button"
        >
          Create
        </button>
        <button className="ghost-button compact" onClick={onCancel} type="button">Cancel</button>
      </div>
    </div>
  )
}

function RelationshipComposer({
  entities,
  state,
  onCancel,
  onCreate,
}: {
  entities: WorldEntity[]
  state: RelationshipComposerState
  onCancel: () => void
  onCreate: (input: WorldRelationshipCreateInput) => Promise<void>
}) {
  const [targetEntityKey, setTargetEntityKey] = useState(state.targetEntityKey)
  const [notes, setNotes] = useState(state.notes)

  return (
    <div className="schema-card">
      <label className="field-block">
        <span>Target entity</span>
        <select value={targetEntityKey} onChange={(event) => setTargetEntityKey(event.target.value)}>
          <option value="">Select entity…</option>
          {entities.map((entity) => <option key={entity.key} value={entity.key}>{entity.name}</option>)}
        </select>
      </label>
      <label className="field-block">
        <span>Connection note</span>
        <textarea
          rows={3}
          placeholder="How these two things relate"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      <div className="world-inspector-actions">
        <button
          className="primary-button compact"
          disabled={!targetEntityKey}
          onClick={() => void onCreate({
            sourceEntityKey: state.sourceEntityKey,
            targetEntityKey,
            verb: 'related to',
            direction: 'outbound',
            strength: null,
            confidence: null,
            source: 'user',
            notes: notes.trim(),
            state: 'confirmed',
            metadata: {},
          })}
          type="button"
        >
          Create Link
        </button>
        <button className="ghost-button compact" onClick={onCancel} type="button">Cancel</button>
      </div>
    </div>
  )
}

function CompositionComposer({
  entities,
  state,
  onCancel,
  onCreate,
}: {
  entities: WorldEntity[]
  state: CompositionComposerState
  onCancel: () => void
  onCreate: (input: {
    sourceEntityKey: string
    targetEntityKey: string
    operatorType: WorldOperator['operatorType']
    title?: string
    summary?: string
  }) => Promise<void>
}) {
  const [sourceEntityKey, setSourceEntityKey] = useState(state.sourceEntityKey)
  const [targetEntityKey, setTargetEntityKey] = useState(state.targetEntityKey)
  const sourceEntity = entities.find((entity) => entity.key === sourceEntityKey) ?? entities[0] ?? null
  const targetEntity = entities.find((entity) => entity.key === targetEntityKey) ?? null
  const options = sourceEntity && targetEntity ? getDerivedOperationsForEntityPair(sourceEntity, targetEntity) : []
  const [operatorType, setOperatorType] = useState<WorldOperator['operatorType']>(state.operatorType)

  useEffect(() => {
    if (options.length > 0 && !options.some((option) => option.operatorType === operatorType)) {
      setOperatorType(options[0].operatorType)
    }
  }, [operatorType, options])

  return (
    <div className="schema-card">
      <label className="field-block">
        <span>Source entity</span>
        <select value={sourceEntityKey} onChange={(event) => setSourceEntityKey(event.target.value)}>
          <option value="">Select entity…</option>
          {entities.map((entity) => <option key={entity.key} value={entity.key}>{entity.name}</option>)}
        </select>
      </label>
      <label className="field-block">
        <span>Target entity</span>
        <select value={targetEntityKey} onChange={(event) => setTargetEntityKey(event.target.value)}>
          <option value="">Select entity…</option>
          {entities.filter((entity) => entity.key !== sourceEntityKey).map((entity) => <option key={entity.key} value={entity.key}>{entity.name}</option>)}
        </select>
      </label>
      <label className="field-block">
        <span>Operation</span>
        <select value={operatorType} onChange={(event) => setOperatorType(event.target.value as WorldOperator['operatorType'])}>
          {options.length === 0 ? <option value="">No valid operations</option> : null}
          {options.map((option) => <option key={option.operatorType} value={option.operatorType}>{option.label}</option>)}
        </select>
      </label>
      <div className="world-inspector-actions">
        <button
          className="primary-button compact"
          disabled={!sourceEntityKey || !targetEntityKey || options.length === 0}
          onClick={() => void onCreate({ sourceEntityKey, targetEntityKey, operatorType })}
          type="button"
        >
          Create Derived Result
        </button>
        <button className="ghost-button compact" onClick={onCancel} type="button">Cancel</button>
      </div>
    </div>
  )
}

function SuggestionPanel({
  suggestions,
  onApply,
}: {
  suggestions: ReturnType<typeof buildGlobalWorldSuggestions>
  onApply: (suggestion: ReturnType<typeof buildGlobalWorldSuggestions>[number]) => void
}) {
  return (
    <div className="editor-section compact-section">
      <div className="section-head">
        <div>
          <span className="eyebrow">World Brain</span>
          <h3>Suggestions</h3>
        </div>
      </div>
      {suggestions.length === 0 ? <div className="inline-note">No high-priority suggestions right now.</div> : null}
      {suggestions.map((suggestion) => (
        <div key={suggestion.id} className="schema-card">
          <div className="schema-card-head">
            <strong>{suggestion.title}</strong>
            <button className="ghost-button compact" onClick={() => onApply(suggestion)} type="button">{suggestion.cta === 'generate' ? 'Generate' : suggestion.cta === 'link' ? 'Link' : 'Add'}</button>
          </div>
          <div className="inline-note">{suggestion.why}</div>
        </div>
      ))}
    </div>
  )
}
