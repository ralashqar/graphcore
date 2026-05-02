import test from 'node:test'
import assert from 'node:assert/strict'

import { PROJECT_TYPE_OPTIONS } from './projectContextProfiles.ts'
import {
  WORLD_SEED_SKELETON_PROFILES,
  getAllWorldSeedSkeletonProfiles,
  getWorldSeedSkeletonProfile,
  worldSeedSkeletonProfileSchema,
} from './worldSeedProfiles.ts'

test('every project subtype has a valid initial seed skeleton profile', () => {
  const allSubtypeIds = PROJECT_TYPE_OPTIONS.flatMap((typeOption) => typeOption.subtypes.map((subtype) => subtype.id))

  assert.equal(Object.keys(WORLD_SEED_SKELETON_PROFILES).length, allSubtypeIds.length)
  for (const subtypeId of allSubtypeIds) {
    const profile = getWorldSeedSkeletonProfile(subtypeId)
    const parsed = worldSeedSkeletonProfileSchema.parse(profile)

    assert.equal(parsed.projectSubtype, subtypeId)
    assert.ok(parsed.categories.length > 0)
    assert.ok(parsed.sequence.min > 0)
    assert.ok(parsed.relationshipGuidance.length > 0)
  }
})

test('story seed profiles require wiki metadata, cast, locations, and ordered sequence units', () => {
  const storyProfiles = getAllWorldSeedSkeletonProfiles().filter((profile) => profile.projectType === 'story')

  assert.ok(storyProfiles.length > 0)
  for (const profile of storyProfiles) {
    const categoryIds = new Set(profile.categories.map((category) => category.id))

    assert.ok(profile.wikiMetadataRequired.includes('title'))
    assert.ok(profile.wikiMetadataRequired.includes('logline'))
    assert.ok(categoryIds.has('main_cast'))
    assert.ok(categoryIds.has('main_locations'))
    assert.equal(profile.sequence.requiredFields.includes('ordinal'), true)
    assert.equal(profile.sequence.requiredFields.includes('synopsis'), true)
    assert.equal(profile.sequence.requiredFields.includes('outcome'), true)
    assert.ok(profile.sequence.requiredRelationships.includes('precedes'))
    assert.ok(profile.sequence.requiredRelationships.includes('causes'))
  }
})

test('non-story seed profiles require subtype-appropriate support structure', () => {
  const gameProfile = getWorldSeedSkeletonProfile('action_rpg')
  const brandProfile = getWorldSeedSkeletonProfile('campaign_world')
  const ugcProfile = getWorldSeedSkeletonProfile('direct_response_ad')
  const appProfile = getWorldSeedSkeletonProfile('mascot_daily_ritual')

  assert.ok(gameProfile.categories.some((category) => category.id === 'systems_concepts'))
  assert.equal(gameProfile.sequence.unitKind, 'mission')

  assert.ok(brandProfile.categories.some((category) => category.id === 'message_pillars'))
  assert.equal(brandProfile.sequence.unitKind, 'campaign_moment')

  assert.ok(ugcProfile.categories.some((category) => category.id === 'proof_concepts'))
  assert.equal(ugcProfile.sequence.unitKind, 'ugc_beat')

  assert.ok(appProfile.categories.some((category) => category.id === 'screens_components'))
  assert.ok(appProfile.categories.some((category) => category.nodeType === 'capability'))
  assert.equal(appProfile.sequence.unitKind, 'user_flow')
})
