export type LegacyMonolithWorkflowNodeHandlerMigrationTarget =
  | 'cinematic_text_pack'
  | 'document_text_pack'
  | 'prompt_text_pack'
  | 'sequence_animatic_continuity_pack'
  | 'sequence_animatic_master_pack'
  | 'legacy_output_pack'

const legacyMonolithWorkflowNodeHandlerKeyList = [
  'action',
  'bible_assembly',
  'bible_section',
  'bible_section_plan',
  'chapter_assembly',
  'chapter_plan',
  'chapter_prose',
  'cinematic_beat_sheet_prompt',
  'cinematic_entity_selector',
  'cinematic_keyframe_prompt_pack',
  'cinematic_v2_keyframe_prompt',
  'cinematic_v2_keyframe_qa',
  'cinematic_v2_panel_extract',
  'cinematic_v2_shot_asset_pack',
  'cinematic_v2_shot_keyframe_passthrough',
  'cinematic_v2_storyboard_prompt',
  'cinematic_v2_timeline_assemble',
  'cinematic_v2_video_prompt',
  'cinematic_v3_dynamic_shot_parse_fanout',
  'cinematic_v3_panel_extract',
  'cinematic_v3_reference_select',
  'cinematic_v3_screenplay_author',
  'cinematic_v3_shot_break_plan',
  'cinematic_v3_shot_parse_group',
  'cinematic_v3_storyboard_group_video_prompt',
  'cinematic_v3_storyboard_prompt',
  'cinematic_v3_timeline_assemble',
  'cinematic_video_artifact',
  'cinematic_video_prompt',
  'comic_artifact',
  'comic_entity_selector',
  'comic_page_plan',
  'comic_page_prompt',
  'comic_pdf_render',
  'comic_scene_script',
  'comic_script',
  'concept_art_prompt',
  'dialogue',
  'ebook_cover_prompt',
  'editor_pass',
  'establishing',
  'front_back_matter',
  'image_reference_selector',
  'outline',
  'poster_prompt',
  'reaction',
  'sequence_animatic_character_anchor_atlas_prompt',
  'sequence_animatic_character_anchor_extract',
  'sequence_animatic_continuity_anchor_plan',
  'sequence_animatic_continuity_artifact',
  'sequence_animatic_continuity_asset_prompt',
  'sequence_animatic_continuity_batch_artifact',
  'sequence_animatic_continuity_batch_extract',
  'sequence_animatic_continuity_batch_input',
  'sequence_animatic_continuity_batch_prompt',
  'sequence_animatic_continuity_block_merge',
  'sequence_animatic_continuity_block_plan',
  'sequence_animatic_continuity_global_merge',
  'sequence_animatic_continuity_global_plan',
  'sequence_animatic_continuity_graph_finalize',
  'sequence_animatic_continuity_input',
  'sequence_animatic_continuity_seed_graph',
  'sequence_animatic_continuity_structure_artifact',
  'sequence_animatic_location_anchor_atlas_prompt',
  'sequence_animatic_location_anchor_extract',
  'sequence_animatic_prop_anchor_atlas_prompt',
  'sequence_animatic_prop_anchor_extract',
  'story_bible_artifact',
  'story_bible_document_render',
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
  if (handlerKey.startsWith('cinematic_') || handlerKey.startsWith('comic_')) return 'cinematic_text_pack'
  if (
    handlerKey.startsWith('bible_')
    || handlerKey.startsWith('chapter_')
    || handlerKey.startsWith('story_bible_')
    || handlerKey === 'front_back_matter'
    || handlerKey === 'editor_pass'
    || handlerKey === 'outline'
  ) {
    return 'document_text_pack'
  }
  if (
    handlerKey.endsWith('_prompt')
    || handlerKey.endsWith('_prompt_pack')
    || handlerKey === 'image_reference_selector'
    || handlerKey === 'concept_art_prompt'
    || handlerKey === 'poster_prompt'
    || handlerKey === 'ebook_cover_prompt'
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
