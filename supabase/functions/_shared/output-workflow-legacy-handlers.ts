export type LegacyMonolithWorkflowNodeHandlerMigrationTarget =
  | 'cinematic_text_pack'
  | 'prompt_text_pack'
  | 'sequence_animatic_continuity_pack'
  | 'sequence_animatic_master_pack'
  | 'legacy_output_pack'

const legacyMonolithWorkflowNodeHandlerKeyList = [
  'action',
  'dialogue',
  'editor_pass',
  'establishing',
  'reaction',
  'video_stitch',
] as const

function migrationTargetForLegacyHandlerKey(
  handlerKey: string,
): LegacyMonolithWorkflowNodeHandlerMigrationTarget {
  if (handlerKey.startsWith('sequence_animatic_continuity_')) return 'sequence_animatic_continuity_pack'
  if (
    handlerKey.startsWith('sequence_animatic_scene_')
    || handlerKey.startsWith('sequence_animatic_director_')
    || handlerKey.includes('_anchor_atlas_prompt')
    || handlerKey.includes('_anchor_extract')
  ) {
    return 'sequence_animatic_master_pack'
  }
  if (handlerKey.startsWith('cinematic_')) return 'cinematic_text_pack'
  if (handlerKey === 'editor_pass') return 'prompt_text_pack'
  if (
    handlerKey.endsWith('_prompt')
    || handlerKey.endsWith('_prompt_pack')
  ) {
    return 'prompt_text_pack'
  }
  if (['action', 'dialogue', 'establishing', 'reaction', 'video_stitch'].includes(handlerKey)) return 'legacy_output_pack'
  throw new Error(`Legacy monolith workflow node handler "${handlerKey}" needs an explicit migration target.`)
}

export const legacyMonolithWorkflowNodeHandlerRecords = legacyMonolithWorkflowNodeHandlerKeyList.map((handlerKey) => ({
  handlerKey,
  migrationTarget: migrationTargetForLegacyHandlerKey(handlerKey),
}))

export const legacyMonolithWorkflowNodeHandlerKeys = legacyMonolithWorkflowNodeHandlerRecords.map((record) => record.handlerKey)

export function assertLegacyMonolithWorkflowNodeHandlerDebtIsTracked() {
  const seen = new Set<string>()
  const duplicateKeys: string[] = []
  const missingTargets: string[] = []
  for (const record of legacyMonolithWorkflowNodeHandlerRecords) {
    if (seen.has(record.handlerKey)) duplicateKeys.push(record.handlerKey)
    seen.add(record.handlerKey)
    if (!record.migrationTarget) missingTargets.push(record.handlerKey)
  }
  if (duplicateKeys.length > 0) {
    throw new Error(`Duplicate legacy monolith workflow node handler key(s): ${[...new Set(duplicateKeys)].sort().join(', ')}`)
  }
  if (missingTargets.length > 0) {
    throw new Error(`Legacy monolith workflow node handler key(s) missing migration targets: ${missingTargets.sort().join(', ')}`)
  }
}
