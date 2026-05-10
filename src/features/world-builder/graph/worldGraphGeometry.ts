import type { Node } from '@xyflow/react'

import type { WorldSceneDisplayTier } from '../../../domain/worldGraphScene'
import type { WorldGraphNodeRecord, WorldNodeData, WorldNodeVisualMode } from '../../world/worldPresentation'
export function worldNodeVisualModeFor(
  _displayTier: WorldSceneDisplayTier,
  nodeKey: string,
  selectedNodeKey: string | null,
  inspectedNodeKey: string | null,
  _selectedAdjacentNodeKeys?: ReadonlySet<string>,
): WorldNodeVisualMode {
  const activeCardNodeKey = inspectedNodeKey ?? selectedNodeKey
  if (activeCardNodeKey && nodeKey === activeCardNodeKey) return 'card'
  return 'nearIcon'
}

export function worldNodeDimensions(record: WorldGraphNodeRecord, _displayTier: WorldSceneDisplayTier, visualMode: WorldNodeVisualMode = 'card') {
  if (visualMode === 'peripheralDot') {
    return { width: 16, height: 16 }
  }
  if (visualMode === 'farIcon') {
    return { width: 22, height: 22 }
  }
  if (visualMode === 'nearIcon') {
    return { width: 76, height: 64 }
  }
  if (record.kind === 'operator') {
    return { width: 132, height: 102 }
  }
  if (record.kind === 'result') {
    return { width: 150, height: 108 }
  }
  return { width: 148, height: 118 }
}

export function worldFlowNodeIntersectsViewport(
  node: Node<WorldNodeData>,
  viewport: { x: number; y: number; zoom: number },
  viewportSize: { width: number; height: number },
) {
  const dimensions = worldNodeDimensions(node.data.record, node.data.displayTier, node.data.visualMode)
  const width = typeof node.width === 'number' && node.width > 0 ? node.width : dimensions.width
  const height = typeof node.height === 'number' && node.height > 0 ? node.height : dimensions.height
  const left = node.position.x * viewport.zoom + viewport.x
  const top = node.position.y * viewport.zoom + viewport.y
  const right = (node.position.x + width) * viewport.zoom + viewport.x
  const bottom = (node.position.y + height) * viewport.zoom + viewport.y
  return right >= 0 && bottom >= 0 && left <= viewportSize.width && top <= viewportSize.height
}

export function worldNodePointerHitRadius(visualMode: WorldNodeVisualMode) {
  if (visualMode === 'card') return 96
  if (visualMode === 'nearIcon') return 32
  if (visualMode === 'farIcon') return 16
  return 12
}

export function worldNodeCollisionPadding(visualMode: WorldNodeVisualMode) {
  if (visualMode === 'peripheralDot') return 10
  if (visualMode === 'farIcon') return 14
  if (visualMode === 'nearIcon') return 18
  return 22
}

export function resolveWorldNodeCenterCollision(
  centerPosition: { x: number; y: number },
  occupiedCenters: Array<{ x: number; y: number; radius: number }>,
  record: WorldGraphNodeRecord,
  displayTier: WorldSceneDisplayTier,
  visualMode: WorldNodeVisualMode = 'card',
) {
  const dimensions = worldNodeDimensions(record, displayTier, visualMode)
  const ownPadding = worldNodeCollisionPadding(visualMode)
  const ownRadius = Math.max(dimensions.width, dimensions.height) / 2 + ownPadding
  const collides = (candidate: { x: number; y: number }) => occupiedCenters.some((occupied) => {
    const dx = candidate.x - occupied.x
    const dy = candidate.y - occupied.y
    const minimumDistance = ownRadius + occupied.radius
    return (dx * dx) + (dy * dy) < minimumDistance * minimumDistance
  })

  if (!collides(centerPosition)) {
    return { center: centerPosition, radius: ownRadius }
  }

  const baseAngle = Math.atan2(centerPosition.y || 1, centerPosition.x || 1)
  for (let ring = 1; ring <= 8; ring += 1) {
    const radiusStep = ring * 42
    const sampleCount = 10 + ring * 4
    for (let index = 0; index < sampleCount; index += 1) {
      const angle = baseAngle + ((Math.PI * 2) / sampleCount) * index
      const candidate = {
        x: centerPosition.x + Math.cos(angle) * radiusStep,
        y: centerPosition.y + Math.sin(angle) * radiusStep,
      }
      if (!collides(candidate)) {
        return { center: candidate, radius: ownRadius }
      }
    }
  }

  return { center: centerPosition, radius: ownRadius }
}
