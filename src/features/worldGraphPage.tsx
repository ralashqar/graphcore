import '@xyflow/react/dist/style.css'

import ELK from 'elkjs/lib/elk.bundled.js'
import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from '@xyflow/react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import type { AssetDefinition, DefinitionBase, GraphDefinition } from '../domain/graphcore'
import type {
  WorldEntity,
  WorldEntityCreateInput,
  WorldRelationship,
  WorldRelationshipCreateInput,
  WorldView,
  WorldViewCreateInput,
} from '../domain/worldGraph'
import {
  buildGlobalWorldSuggestions,
  buildSuggestionsForEntity,
  createDefaultWorldView,
  getWorldEntityUsage,
  iconForWorldEntity,
  labelForWorldEntity,
} from '../domain/worldGraphHelpers'
import { resolveAssetSourceUrl } from '../domain/assets'
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
  selectedWorldEntityKey: string | null
  selectedWorldViewKey: string | null
  onSelectWorldEntity: (key: string | null) => void
  onSelectWorldView: (key: string | null) => void
  onCreateWorldEntity: (input: WorldEntityCreateInput) => Promise<void> | void
  onUpdateWorldEntity: (entityKey: string, changes: Partial<WorldEntityCreateInput>) => Promise<void> | void
  onDeleteWorldEntity: (entityKey: string) => Promise<void> | void
  onCreateWorldRelationship: (input: WorldRelationshipCreateInput) => Promise<void> | void
  onDeleteWorldRelationship: (relationshipKey: string) => Promise<void> | void
  onCreateWorldView: (input: WorldViewCreateInput) => Promise<void> | void
  onUpdateWorldView: (viewKey: string, changes: Partial<WorldViewCreateInput>) => Promise<void> | void
  onGenerateStarterWorld: (prompt: string) => Promise<void> | void
  onGenerateWorldExpansion: (entityKey: string) => Promise<void> | void
  onOpenDefinitionLink: (definitionKey: string, kind: DefinitionBase['kind']) => void
  onOpenCinematicGraph: (graphKey: string) => void
  legacyGraphProps: GraphWorkspaceProps
}

type WorldNodeData = {
  entity: WorldEntity
  imageUrl: string | null
  relationCount: number
  usageCount: number
  dimmed: boolean
}

type EntityComposerState = {
  mode: 'global' | 'related'
  defaults: Partial<WorldEntityCreateInput>
  relationshipDefaults: Partial<WorldRelationshipCreateInput>
}

type RelationshipComposerState = {
  sourceEntityKey: string
  targetEntityKey: string
  verb: string
}

const elk = new ELK()
const nodeTypes = {
  worldNode: WorldNodeCard,
}

function NodeShellStyle(entity: WorldEntity, selected: boolean, dimmed: boolean): CSSProperties {
  const palette =
    entity.nodeType === 'actor'
      ? ['rgba(148, 163, 184, 0.32)', 'rgba(56, 189, 248, 0.14)']
      : entity.nodeType === 'group'
        ? ['rgba(253, 224, 71, 0.24)', 'rgba(245, 158, 11, 0.12)']
        : entity.nodeType === 'place'
          ? ['rgba(52, 211, 153, 0.24)', 'rgba(16, 185, 129, 0.12)']
          : entity.nodeType === 'object'
            ? ['rgba(244, 114, 182, 0.22)', 'rgba(236, 72, 153, 0.1)']
            : entity.nodeType === 'concept'
              ? ['rgba(192, 132, 252, 0.22)', 'rgba(139, 92, 246, 0.08)']
              : ['rgba(251, 146, 60, 0.22)', 'rgba(249, 115, 22, 0.12)']

  return {
    opacity: dimmed ? 0.25 : 1,
    borderColor: selected ? palette[0].replace('0.24', '0.55').replace('0.22', '0.55').replace('0.32', '0.55') : palette[0],
    background: `linear-gradient(180deg, rgba(12, 17, 25, 0.94), ${palette[1]})`,
    boxShadow: selected ? '0 0 0 1px rgba(255,255,255,0.08), 0 18px 38px rgba(5, 8, 14, 0.45)' : '0 14px 32px rgba(5, 8, 14, 0.28)',
  }
}

function WorldNodeCard({ data, selected }: NodeProps<Node<WorldNodeData>>) {
  const { entity, imageUrl, relationCount, usageCount, dimmed } = data

  return (
    <div className={`world-node-card world-node-${entity.nodeType}`} style={NodeShellStyle(entity, selected, dimmed)}>
      <div className="world-node-kicker">
        <EntityIcon id={iconForWorldEntity(entity.nodeType)} />
        <span>{labelForWorldEntity(entity.nodeType)}</span>
      </div>
      {imageUrl ? (
        <div className="world-node-media">
          <img alt={entity.name} src={imageUrl} />
        </div>
      ) : null}
      <strong>{entity.name}</strong>
      {!imageUrl && entity.summary ? <p>{entity.summary}</p> : null}
      <div className="world-node-meta">
        <span>{relationCount} links</span>
        <span>{usageCount} uses</span>
      </div>
    </div>
  )
}

export function WorldGraphPage({
  assets,
  definitions,
  snapshotGraphs,
  worldEntities,
  worldRelationships,
  worldViews,
  selectedWorldEntityKey,
  selectedWorldViewKey,
  onSelectWorldEntity,
  onSelectWorldView,
  onCreateWorldEntity,
  onUpdateWorldEntity,
  onDeleteWorldEntity,
  onCreateWorldRelationship,
  onDeleteWorldRelationship,
  onCreateWorldView,
  onUpdateWorldView,
  onGenerateStarterWorld,
  onGenerateWorldExpansion,
  onOpenDefinitionLink,
  onOpenCinematicGraph,
  legacyGraphProps,
}: WorldGraphPageProps) {
  const flowRef = useRef<ReactFlowInstance<Node<WorldNodeData>, Edge> | null>(null)
  const [legacyMode, setLegacyMode] = useState(false)
  const [viewMode, setViewMode] = useState<WorldView['mode']>('graph')
  const [search, setSearch] = useState('')
  const [activeInspectorTab, setActiveInspectorTab] = useState<'overview' | 'relationships' | 'usage' | 'suggestions'>('overview')
  const [showSuggestions, setShowSuggestions] = useState(true)
  const [showLabels, setShowLabels] = useState(true)
  const [draftPositions, setDraftPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [autoLayoutNonce, setAutoLayoutNonce] = useState(0)
  const [layoutPositions, setLayoutPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [entityComposer, setEntityComposer] = useState<EntityComposerState | null>(null)
  const [relationshipComposer, setRelationshipComposer] = useState<RelationshipComposerState | null>(null)
  const [starterPrompt, setStarterPrompt] = useState('')
  const [isStarterPending, setIsStarterPending] = useState(false)
  const [isExpansionPending, setIsExpansionPending] = useState(false)
  const [busyMessage, setBusyMessage] = useState<string | null>(null)

  const selectedEntity = useMemo(
    () => worldEntities.find((entity) => entity.key === selectedWorldEntityKey) ?? null,
    [selectedWorldEntityKey, worldEntities],
  )
  const selectedView = useMemo(
    () => worldViews.find((view) => view.key === selectedWorldViewKey) ?? worldViews[0] ?? createDefaultWorldView(),
    [selectedWorldViewKey, worldViews],
  )

  useEffect(() => {
    setViewMode(selectedView.mode)
    setSearch(selectedView.search)
    setShowSuggestions(selectedView.showSuggestions)
    setShowLabels(selectedView.showLabels)
    setDraftPositions(selectedView.nodePositions)
  }, [selectedView])

  const effectiveFilters = selectedView.filters
  const linkedDefinitionKind = (entity: WorldEntity) => (
    entity.nodeType === 'actor' ? 'character' : entity.nodeType === 'place' ? 'environment' : entity.nodeType === 'object' ? 'item' : null
  )

  const usageByEntityKey = useMemo(() => (
    new Map(worldEntities.map((entity) => [entity.key, getWorldEntityUsage(entity, snapshotGraphs)]))
  ), [snapshotGraphs, worldEntities])
  const assetByKey = useMemo(
    () => new Map(assets.map((asset) => [asset.key, asset])),
    [assets],
  )
  const definitionByKey = useMemo(
    () => new Map(definitions.map((definition) => [definition.key, definition])),
    [definitions],
  )
  const imageUrlByEntityKey = useMemo(() => {
    return new Map(worldEntities.map((entity) => {
      const linkedDefinition = entity.linkedDefinitionKey
        ? definitionByKey.get(entity.linkedDefinitionKey) ?? null
        : null
      const previewAssetKey = entity.thumbnailAssetKey ?? linkedDefinition?.iconAssetKey ?? null
      const previewUrl = resolveAssetSourceUrl(previewAssetKey ? assetByKey.get(previewAssetKey) ?? null : null)
      return [entity.key, previewUrl]
    }))
  }, [assetByKey, definitionByKey, worldEntities])

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
  const focusRootKey = selectedEntity?.key ?? pinnedRootKey ?? null

  const visibleEntityKeys = useMemo(() => {
    if (!focusRootKey) return filteredEntityKeys
    const visited = new Set<string>([focusRootKey])
    let frontier = new Set<string>([focusRootKey])
    for (let depth = 0; depth < selectedView.focusDepth; depth += 1) {
      const next = new Set<string>()
      for (const relationship of worldRelationships) {
        if (frontier.has(relationship.sourceEntityKey)) next.add(relationship.targetEntityKey)
        if (frontier.has(relationship.targetEntityKey)) next.add(relationship.sourceEntityKey)
      }
      frontier = next
      for (const key of next) visited.add(key)
    }
    return new Set([...visited].filter((key) => filteredEntityKeys.has(key)))
  }, [filteredEntityKeys, focusRootKey, selectedView.focusDepth, worldRelationships])

  const visibleEntities = useMemo(
    () => worldEntities.filter((entity) => visibleEntityKeys.has(entity.key)),
    [visibleEntityKeys, worldEntities],
  )
  const visibleRelationships = useMemo(
    () => worldRelationships.filter((relationship) => visibleEntityKeys.has(relationship.sourceEntityKey) && visibleEntityKeys.has(relationship.targetEntityKey)),
    [visibleEntityKeys, worldRelationships],
  )

  useEffect(() => {
    let cancelled = false

    async function layoutVisibleGraph() {
      if (viewMode !== 'graph' || visibleEntities.length === 0) {
        if (!cancelled) setLayoutPositions({})
        return
      }

      const graph = await elk.layout({
        id: 'world-graph',
        layoutOptions: {
          'elk.algorithm': 'layered',
          'elk.direction': 'RIGHT',
          'elk.layered.spacing.nodeNodeBetweenLayers': '130',
          'elk.spacing.nodeNode': '80',
        },
        children: visibleEntities.map((entity) => ({
          id: entity.key,
          width: entity.nodeType === 'place' ? 250 : entity.nodeType === 'actor' ? 220 : 200,
          height: entity.nodeType === 'place' ? 130 : 112,
          layoutOptions: {
            'elk.layered.priority.direction': entity.nodeType === 'concept' ? '1' : entity.nodeType === 'place' ? '10' : '5',
          },
        })),
        edges: visibleRelationships.map((relationship) => ({
          id: relationship.key,
          sources: [relationship.sourceEntityKey],
          targets: [relationship.targetEntityKey],
        })),
      })

      if (cancelled) return
      const nextPositions = Object.fromEntries(
        (graph.children ?? []).map((child, index) => [
          child.id,
          {
            x: (child.x ?? (index * 220)) + (visibleEntities.find((entity) => entity.key === child.id)?.nodeType === 'concept' ? 0 : 0),
            y: child.y ?? 0,
          },
        ]),
      )
      setLayoutPositions(nextPositions)
    }

    void layoutVisibleGraph()

    return () => {
      cancelled = true
    }
  }, [autoLayoutNonce, viewMode, visibleEntities, visibleRelationships])

  const relationCountByEntity = useMemo(() => {
    const counts = new Map<string, number>()
    for (const entity of worldEntities) counts.set(entity.key, 0)
    for (const relationship of worldRelationships) {
      counts.set(relationship.sourceEntityKey, (counts.get(relationship.sourceEntityKey) ?? 0) + 1)
      counts.set(relationship.targetEntityKey, (counts.get(relationship.targetEntityKey) ?? 0) + 1)
    }
    return counts
  }, [worldEntities, worldRelationships])

  const flowNodes = useMemo<Node<WorldNodeData>[]>(() => {
    return visibleEntities.map((entity, index) => ({
      id: entity.key,
      type: 'worldNode',
      position: draftPositions[entity.key] ?? selectedView.nodePositions[entity.key] ?? layoutPositions[entity.key] ?? { x: index * 220, y: 0 },
      draggable: viewMode === 'graph',
      data: {
        entity,
        imageUrl: imageUrlByEntityKey.get(entity.key) ?? null,
        relationCount: relationCountByEntity.get(entity.key) ?? 0,
        usageCount: usageByEntityKey.get(entity.key)?.length ?? 0,
        dimmed: Boolean(focusRootKey) && !visibleEntityKeys.has(entity.key),
      },
    }))
  }, [draftPositions, focusRootKey, imageUrlByEntityKey, layoutPositions, relationCountByEntity, selectedView.nodePositions, usageByEntityKey, viewMode, visibleEntities, visibleEntityKeys])

  const flowEdges = useMemo<Edge[]>(() => {
    return visibleRelationships.map((relationship) => ({
      id: relationship.key,
      source: relationship.sourceEntityKey,
      target: relationship.targetEntityKey,
      label: showLabels ? relationship.verb : undefined,
      animated: relationship.state !== 'confirmed',
      style: {
        stroke: relationship.state === 'confirmed' ? 'rgba(148, 163, 184, 0.54)' : relationship.state === 'suggested' ? 'rgba(94, 234, 212, 0.54)' : 'rgba(244, 114, 182, 0.42)',
        strokeDasharray: relationship.state === 'confirmed' ? undefined : '7 5',
        strokeWidth: relationship.strength ? 1 + relationship.strength * 2 : 1.4,
      },
      labelStyle: {
        fill: '#cbd5e1',
        fontSize: 12,
      },
    }))
  }, [showLabels, visibleRelationships])

  const groupedEntities = useMemo(() => {
    return {
      actor: filteredEntities.filter((entity) => entity.nodeType === 'actor'),
      group: filteredEntities.filter((entity) => entity.nodeType === 'group'),
      place: filteredEntities.filter((entity) => entity.nodeType === 'place'),
      object: filteredEntities.filter((entity) => entity.nodeType === 'object'),
      concept: filteredEntities.filter((entity) => entity.nodeType === 'concept'),
      event: filteredEntities.filter((entity) => entity.nodeType === 'event'),
    }
  }, [filteredEntities])

  const worldSummarySuggestions = useMemo(
    () => buildGlobalWorldSuggestions(worldEntities, worldRelationships, snapshotGraphs),
    [snapshotGraphs, worldEntities, worldRelationships],
  )
  const selectedEntitySuggestions = useMemo(
    () => selectedEntity ? buildSuggestionsForEntity(selectedEntity, worldRelationships, snapshotGraphs) : [],
    [selectedEntity, snapshotGraphs, worldEntities, worldRelationships],
  )
  const selectedEntityUsage = selectedEntity ? usageByEntityKey.get(selectedEntity.key) ?? [] : []
  const selectedEntityRelationships = selectedEntity
    ? worldRelationships.filter((relationship) => relationship.sourceEntityKey === selectedEntity.key || relationship.targetEntityKey === selectedEntity.key)
    : []

  async function persistViewChanges(changes: Partial<WorldViewCreateInput>) {
    if (!selectedView || !selectedView.key || worldViews.length === 0) return
    await onUpdateWorldView(selectedView.key, changes)
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
    const nextPositions = Object.keys(layoutPositions).length > 0 ? layoutPositions : draftPositions
    if (Object.keys(nextPositions).length > 0) {
      setDraftPositions(nextPositions)
      await persistViewChanges({ nodePositions: nextPositions })
    }
    setTimeout(() => flowRef.current?.fitView({ padding: 0.18, duration: 300 }), 20)
  }

  async function handleSaveCurrentView() {
    const baseName = selectedEntity ? `${selectedEntity.name} Focus` : 'Saved World View'
    await onCreateWorldView({
      name: baseName,
      mode: viewMode,
      filters: selectedView.filters,
      search,
      rootEntityKey: focusRootKey,
      camera: selectedView.camera,
      focusDepth: selectedView.focusDepth,
      showSuggestions,
      showLabels,
      nodePositions: draftPositions,
      collapsedState: selectedView.collapsedState,
      sortMode: selectedView.sortMode,
      metadata: {},
    })
  }

  async function handleCreateEntity(input: WorldEntityCreateInput, relationshipDefaults?: Partial<WorldRelationshipCreateInput>) {
    const currentCount = worldEntities.length
    await onCreateWorldEntity(input)
    setEntityComposer(null)
    if (relationshipDefaults && selectedEntityKeyOr(relationshipDefaults.sourceEntityKey, selectedEntity?.key) && currentCount < worldEntities.length + 1) {
      // Intentionally left as a soft guard for live-reload mode where the new entity key is not available immediately.
    }
  }

  function selectedEntityKeyOr(primary?: string | null, fallback?: string | null) {
    return primary ?? fallback ?? null
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
    <div className="focus-layout graph-layout world-graph-layout">
      <aside className="focus-rail graph-rail world-graph-rail">
        <div className="detail-stack compact">
          <div>
            <span className="eyebrow">World Graph</span>
            <h2>{selectedView.name || 'Living World'}</h2>
            <div className="inline-note">Structured like a knowledge base, connected like a living universe map.</div>
          </div>
          <div className="world-graph-actions">
            <button className="primary-button compact" onClick={() => setEntityComposer({ mode: 'global', defaults: { nodeType: 'actor', source: 'user' }, relationshipDefaults: {} })} type="button">Add Entity</button>
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
            onCreate={async (input, relationshipDefaults) => {
              await handleCreateEntity(input, relationshipDefaults)
            }}
          />
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
                          onSelectWorldEntity(entity.key)
                          setActiveInspectorTab('overview')
                        }}
                        type="button"
                      >
                        <div className="media-thumb">
                          <EntityIcon id={iconForWorldEntity(entity.nodeType)} />
                        </div>
                        <div className="item-row-copy">
                          <strong>{entity.name}</strong>
                          <span>{relationCountByEntity.get(entity.key) ?? 0} links</span>
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
        <div className="graph-toolbar world-graph-toolbar">
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
          <div className="world-toolbar-actions">
            <button className="ghost-button compact" onClick={() => void handleAutoLayout()} type="button">Auto-layout</button>
            <button className="ghost-button compact" onClick={() => flowRef.current?.fitView({ padding: 0.18, duration: 280 })} type="button">Fit</button>
            <button className={showSuggestions ? 'segment-button is-active' : 'segment-button'} onClick={() => {
              setShowSuggestions((value) => !value)
              void persistViewChanges({ showSuggestions: !showSuggestions })
            }} type="button">Suggestions</button>
            <button className={showLabels ? 'segment-button is-active' : 'segment-button'} onClick={() => {
              setShowLabels((value) => !value)
              void persistViewChanges({ showLabels: !showLabels })
            }} type="button">Labels</button>
            <button className="primary-button compact" disabled={!selectedEntity || isExpansionPending} onClick={() => void handleGenerateExpansion()} type="button">
              {isExpansionPending ? 'Generating…' : 'Generate From Selection'}
            </button>
          </div>
        </div>

        {selectedEntity ? (
          <div className="world-focus-bar">
            <span className="section-label">Focus Mode</span>
            <strong>{selectedEntity.name}</strong>
            <button className="ghost-button compact" onClick={() => onSelectWorldEntity(null)} type="button">Exit Focus</button>
            <button className="ghost-button compact" onClick={() => void persistViewChanges({ focusDepth: Math.min(2, selectedView.focusDepth + 1) })} type="button">Expand 1 Level</button>
            <button className="ghost-button compact" onClick={() => void persistViewChanges({ rootEntityKey: selectedEntity.key })} type="button">Pin Neighborhood</button>
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
                {isStarterPending ? 'Generating…' : 'Generate Starter World'}
              </button>
              <button className="ghost-button" onClick={() => setEntityComposer({ mode: 'global', defaults: { nodeType: 'actor', source: 'user' }, relationshipDefaults: {} })} type="button">Add First Character</button>
              <button className="ghost-button" onClick={() => setEntityComposer({ mode: 'global', defaults: { nodeType: 'place', source: 'user' }, relationshipDefaults: {} })} type="button">Add First Place</button>
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
              onNodeClick={(_, node) => {
                onSelectWorldEntity(node.id)
                setActiveInspectorTab('overview')
              }}
              onNodeDoubleClick={(_, node) => {
                onSelectWorldEntity(node.id)
                void persistViewChanges({ rootEntityKey: node.id })
              }}
              onNodeDragStop={handleNodeDragStop}
              onPaneClick={() => onSelectWorldEntity(null)}
              nodesDraggable
              onlyRenderVisibleElements
            >
              <Background />
              <Controls />
            </ReactFlow>
          </div>
        )}
      </section>

      <aside className="context-drawer world-graph-drawer">
        {!selectedEntity ? (
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
                <button key={entity.key} className="rail-button item-row" onClick={() => onSelectWorldEntity(entity.key)} type="button">
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
                })}
              />
            ) : null}
          </div>
        ) : (
          <div className="detail-stack compact">
            <div className="drawer-head">
              <div>
                <span className="eyebrow">{labelForWorldEntity(selectedEntity.nodeType)}</span>
                <h3>{selectedEntity.name}</h3>
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
                  <input value={selectedEntity.name} onChange={(event) => void onUpdateWorldEntity(selectedEntity.key, { name: event.target.value })} />
                </label>
                <label className="field-block">
                  <span>Summary</span>
                  <textarea rows={4} value={selectedEntity.summary} onChange={(event) => void onUpdateWorldEntity(selectedEntity.key, { summary: event.target.value })} />
                </label>
                <label className="field-block">
                  <span>Tags</span>
                  <input value={selectedEntity.tags.join(', ')} onChange={(event) => void onUpdateWorldEntity(selectedEntity.key, {
                    tags: event.target.value.split(',').map((value) => value.trim()).filter(Boolean),
                  })} placeholder="politics, dynasty, hero prop" />
                </label>
                <label className="field-block">
                  <span>Aliases</span>
                  <input value={selectedEntity.aliases.join(', ')} onChange={(event) => void onUpdateWorldEntity(selectedEntity.key, {
                    aliases: event.target.value.split(',').map((value) => value.trim()).filter(Boolean),
                  })} placeholder="alternate names" />
                </label>
                <div className="world-inspector-actions">
                  {selectedEntity.linkedDefinitionKey && linkedDefinitionKind(selectedEntity) ? (
                    <button className="ghost-button compact" onClick={() => onOpenDefinitionLink(selectedEntity.linkedDefinitionKey!, linkedDefinitionKind(selectedEntity)!)} type="button">Open Linked Record</button>
                  ) : null}
                  <button className="ghost-button compact" onClick={() => setEntityComposer({
                    mode: 'related',
                    defaults: { nodeType: 'actor', source: 'user' },
                    relationshipDefaults: { sourceEntityKey: selectedEntity.key, verb: 'linked to' },
                  })} type="button">Add Related Entity</button>
                  <button className="ghost-button compact danger" onClick={() => void onDeleteWorldEntity(selectedEntity.key)} type="button">Delete</button>
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
                    sourceEntityKey: selectedEntity.key,
                    targetEntityKey: '',
                    verb: 'linked to',
                  })} type="button">Add Relationship</button>
                </div>
                {relationshipComposer ? (
                  <RelationshipComposer
                    entities={worldEntities.filter((entity) => entity.key !== selectedEntity.key)}
                    state={relationshipComposer}
                    onCancel={() => setRelationshipComposer(null)}
                    onCreate={async (input) => {
                      await onCreateWorldRelationship(input)
                      setRelationshipComposer(null)
                    }}
                  />
                ) : null}
                {selectedEntityRelationships.length === 0 ? <div className="inline-note">This entity has no relationships yet.</div> : null}
                {selectedEntityRelationships.map((relationship) => {
                  const counterpart = worldEntities.find((entity) => (
                    relationship.sourceEntityKey === selectedEntity.key ? entity.key === relationship.targetEntityKey : entity.key === relationship.sourceEntityKey
                  )) ?? null
                  return (
                    <div key={relationship.key} className="schema-card world-relationship-card">
                      <div className="schema-card-head">
                        <strong>{relationship.verb}</strong>
                        <div className="world-inspector-actions">
                          {counterpart ? <button className="ghost-button compact" onClick={() => onSelectWorldEntity(counterpart.key)} type="button">Jump</button> : null}
                          <button className="ghost-button compact danger" onClick={() => void onDeleteWorldRelationship(relationship.key)} type="button">Remove</button>
                        </div>
                      </div>
                      <div className="inline-note">
                        {counterpart?.name ?? 'Missing link'} · {relationship.direction} · {relationship.source}
                      </div>
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
                {selectedEntityUsage.length === 0 ? <div className="inline-note">No downstream cinematic usage yet.</div> : null}
                {selectedEntityUsage.map((usage) => (
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
                suggestions={selectedEntitySuggestions}
                onApply={(suggestion) => setEntityComposer({
                  mode: 'related',
                  defaults: {
                    nodeType: suggestion.entityDefaults?.nodeType ?? 'actor',
                    name: suggestion.entityDefaults?.name,
                    summary: suggestion.entityDefaults?.summary,
                    source: 'user',
                  },
                  relationshipDefaults: {
                    sourceEntityKey: suggestion.relationshipDefaults?.sourceEntityKey ?? selectedEntity.key,
                    targetEntityKey: suggestion.relationshipDefaults?.targetEntityKey,
                    verb: suggestion.relationshipDefaults?.verb ?? 'linked to',
                  },
                })}
              />
            ) : null}
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
  onCreate: (input: WorldEntityCreateInput, relationshipDefaults?: Partial<WorldRelationshipCreateInput>) => Promise<void>
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
          }, entityComposer.relationshipDefaults)}
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
  const [verb, setVerb] = useState(state.verb)

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
        <span>Relationship</span>
        <select value={verb} onChange={(event) => setVerb(event.target.value)}>
          {['belongs to', 'part of', 'allied with', 'opposes', 'controls', 'owns', 'uses', 'located in', 'lives in', 'works in', 'influences', 'linked to', 'appears in', 'introduced in', 'occurs in', 'caused by', 'seeks', 'protects', 'follows'].map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
      <div className="world-inspector-actions">
        <button
          className="primary-button compact"
          disabled={!targetEntityKey}
          onClick={() => void onCreate({
            sourceEntityKey: state.sourceEntityKey,
            targetEntityKey,
            verb,
            direction: 'outbound',
            strength: null,
            confidence: null,
            source: 'user',
            notes: '',
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
