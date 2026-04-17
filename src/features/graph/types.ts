import type { AssetDefinition, DefinitionBase, Diagnostic, EdgeDefinition, GraphCreateInput, GraphDefinition, NodeDefinition } from '../../domain/graphcore'
import type { WorldBuildBatch } from '../../domain/worldBuild'
import type { EntityIconId } from '../../shared/entityIcons'

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
  onOpenDefinitionLink?: (() => void) | null
  cinematicCard?: {
    variant: 'entity-ref' | 'composite-ref' | 'storyboard-ref' | 'shot' | 'take'
    iconId?: EntityIconId | null
    kicker?: string | null
    chips?: Array<{ label: string; iconId?: EntityIconId | null; tone?: 'default' | 'muted' }>
    secondaryChips?: Array<{ label: string; iconId?: EntityIconId | null; tone?: 'default' | 'muted' }>
    lines?: Array<
      | string
      | {
          type: 'dialogue' | 'action'
          speaker?: string | null
          text: string
        }
    >
    summary?: string | null
    takeShots?: Array<{
      id: string
      title: string
      kicker?: string | null
      chips?: Array<{ label: string; tone?: 'default' | 'muted' }>
      tags?: Array<{ label: string; iconId?: EntityIconId | null; tone?: 'default' | 'muted' }>
      lines?: Array<
        | string
        | {
            type: 'dialogue' | 'action'
            speaker?: string | null
            text: string
          }
      >
    }>
    ambience?: string | null
  } | null
  onAddChoice?: () => void
  onUpdateChoiceLabel?: (choiceId: string, label: string) => void
}
