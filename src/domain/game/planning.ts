import { z } from 'zod'
import { gameDesignSchema, type GameDesignSpec } from './contracts.ts'
export const gamePlanSections = ['brief', 'style', 'movement', 'inventory', 'scene'] as const
export const gameScopeSchema = z.object({ sections: z.array(z.enum(gamePlanSections)).min(1).max(5), rationale: z.string().min(1).max(2000), unsupportedMechanics: z.array(z.string().max(2000)).max(12) }).strict()
export const gameSectionSchemas = {
  brief: gameDesignSchema.pick({ title: true, brief: true, coreLoop: true, quest: true, dialogue: true, sourceEntityKeys: true }),
  style: gameDesignSchema.pick({ style: true }), movement: gameDesignSchema.pick({ movement: true }), inventory: gameDesignSchema.pick({ inventory: true }),
  scene: gameDesignSchema.pick({ prefabs: true, level: true, assets: true }),
} as const
export type GamePlanSection = typeof gamePlanSections[number]
export function applyGameSection(design: GameDesignSpec, section: GamePlanSection, input: unknown): GameDesignSpec {
  const value = gameSectionSchemas[section].parse(input), next = { ...structuredClone(design), ...value }
  if (section === 'style') {
    next.style.version = design.style.version + 1
    next.assets = next.assets.map(a => ({ ...a, styleVersion: next.style.version, revision: a.revision + 1 }))
  }
  return gameDesignSchema.parse(next)
}
export function sectionForFinding(node: string): GamePlanSection {
  if (node === 'movement' || node === 'inventory') return node
  if (node === 'style' || node === 'presentation') return 'style'
  if (['brief', 'dialogue', 'quest', 'title', 'coreLoop', 'sourceEntityKeys'].includes(node)) return 'brief'
  return 'scene'
}
