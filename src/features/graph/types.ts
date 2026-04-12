import type { AssetDefinition, DefinitionBase, Diagnostic, EdgeDefinition, GraphCreateInput, GraphDefinition, NodeDefinition } from '../../domain/graphcore'
import type { WorldBuildBatch } from '../../domain/worldBuild'

export type GraphWorkspaceProps = {
  assets: AssetDefinition[]
  deletingGraphKey?: string | null
  definitions: DefinitionBase[]
  diagnostics: Diagnostic[]
  worldBuildBatches?: WorldBuildBatch[]
  selectedEdge: EdgeDefinition | null
  selectedGraph: GraphDefinition | null
  selectedNode: NodeDefinition | null
  snapshotGraphs: GraphDefinition[]
  onClearSelection: () => void
  onConnectEdge: (graphKey: string, edge: EdgeDefinition) => void
  onCreateGraph: (input: GraphCreateInput) => void
  onCreateNode: (graphKey: string, node: NodeDefinition) => void
  onDeleteEdge: (graphKey: string, edgeKey: string) => void
  onDeleteGraph: (graphKey: string) => void
  onDeleteNode: (graphKey: string, nodeKey: string) => void
  onDuplicateGraph: (graphKey: string) => void
  onDuplicateNode: (graphKey: string, nodeKey: string) => void
  onMoveNode: (graphKey: string, nodeKey: string, position: NodeDefinition['position']) => void
  onSelectEdge: (key: string | null) => void
  onSelectGraph: (key: string | null) => void
  onSelectNode: (key: string | null) => void
  onUpdateEdge: (graphKey: string, edgeKey: string, changes: Partial<EdgeDefinition>) => void
  onUpdateGraph: (graphKey: string, changes: Partial<GraphDefinition>) => void
  onUpdateNode: (graphKey: string, nodeKey: string, changes: Partial<NodeDefinition>) => void
}

export type RailMode = 'graphs' | 'library'

export type GraphContextMenu =
  | { kind: 'pane'; x: number; y: number; flowPosition: NodeDefinition['position'] }
  | { kind: 'node'; x: number; y: number; nodeKey: string }

export type GraphNodeData = {
  node: NodeDefinition
  previewUrl: string | null
  conditionSummary: string
  effectSummary: string[]
  onAddChoice?: () => void
  onUpdateChoiceLabel?: (choiceId: string, label: string) => void
}
