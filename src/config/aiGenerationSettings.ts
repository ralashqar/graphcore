export const aiGenerationSettings = {
  outputWorkflow: {
    imageQualityDefaults: {
      default: 'medium',
      characterConceptArt: 'low',
      conceptArt: 'medium',
      poster: 'medium',
      comic: 'medium',
      ebookCover: 'medium',
    },
    imageOutputFormatDefault: 'webp',
    entityReferenceSheetQuality: 'low',
    entityReferenceSheetOutputFormat: 'webp',
    entityReferenceSheetImageSizes: {
      character: { width: 2048, height: 1536 },
      location: { width: 2048, height: 2048 },
      group: { width: 2048, height: 2048 },
      item: { width: 2048, height: 2048 },
    },
    cinematicReferenceModeDefault: 'storyboard_sheet',
    debugSkipVideoGenerationDefault: true,
  },
} as const
