export type SeedanceReferenceModality = 'image' | 'video' | 'audio'

export type SeedanceReferenceRecord = {
  label: string
  role?: string
  url?: string
  modality?: SeedanceReferenceModality
}

export type SeedanceReferenceManifestEntry = {
  tag: string
  modality: SeedanceReferenceModality
  index: number
  label: string
  role: string
  url?: string
}

function compactLabel(value: string, fallback: string) {
  const cleaned = value.replace(/\s+/g, ' ').trim()
  return cleaned ? cleaned.slice(0, 140) : fallback
}

function roleDescription(role: string | undefined, label: string, index: number) {
  const normalized = (role ?? '').trim()
  if (normalized === 'storyboard_sheet' || /storyboard/i.test(label)) return 'primary sequential storyboard keyframe reference'
  if (normalized === 'direction_sheet') return 'primary director/camera/spatial reference'
  if (normalized === 'keyframe') return index === 1 ? 'primary opening keyframe reference' : 'keyframe continuity reference'
  if (normalized === 'entity_reference') return 'entity identity, wardrobe, variant, or prop continuity reference'
  if (normalized === 'location_reference') return 'environment or shot-location continuity reference'
  if (normalized === 'video_reference') return 'motion continuity reference'
  if (normalized === 'audio_reference') return 'audio continuity reference'
  return 'supporting continuity reference'
}

export function buildReferenceManifestEntries(input: {
  imageReferences?: SeedanceReferenceRecord[]
  videoReferences?: SeedanceReferenceRecord[]
  audioReferences?: SeedanceReferenceRecord[]
}) {
  const entries: SeedanceReferenceManifestEntry[] = []
  const push = (records: SeedanceReferenceRecord[] | undefined, modality: SeedanceReferenceModality) => {
    ;(records ?? []).forEach((record, localIndex) => {
      const index = localIndex + 1
      const prefix = modality === 'image' ? 'Image' : modality === 'video' ? 'Video' : 'Audio'
      const label = compactLabel(record.label, `${modality} reference ${index}`)
      entries.push({
        tag: `@${prefix}${index}`,
        modality,
        index,
        label,
        role: roleDescription(record.role, label, index),
        url: record.url,
      })
    })
  }
  push(input.imageReferences, 'image')
  push(input.videoReferences, 'video')
  push(input.audioReferences, 'audio')
  return entries
}

export function formatReferenceManifest(entries: readonly SeedanceReferenceManifestEntry[]) {
  if (entries.length === 0) return 'No provider references are attached; use the written identity, action, and continuity instructions only.'
  return entries.map((entry) => `${entry.tag}: ${entry.label}; ${entry.role}.`).join('\n')
}
