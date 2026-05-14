import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '../../../..')

test('feed empty state uses prompt-first new chat UI instead of a large generic icon', () => {
  const source = readFileSync(resolve(repoRoot, 'src/features/world-builder/feed/WorldFeedPanel.tsx'), 'utf8')
  const css = readFileSync(resolve(repoRoot, 'src/styles/features/world-builder/wiki-feed/feed.css'), 'utf8')
  const emptyStateSource = source.slice(
    source.indexOf('function renderEmptyFeedState()'),
    source.indexOf('function renderWorldFeedCard'),
  )

  assert.match(emptyStateSource, /Prompt the world to build on what exists\./)
  assert.match(emptyStateSource, /emptyFeedSuggestions/)
  assert.match(emptyStateSource, /starterPrompts/)
  assert.match(emptyStateSource, /onSetWorldPromptText\(prompt\)/)
  assert.doesNotMatch(emptyStateSource, /<EntityIcon id="activity" \/>/)
  assert.match(css, /\.world-feed-empty\.is-new-chat\s*\{/)
  assert.match(css, /\.world-feed-empty-suggestions button\s*\{/)
})

test('feed dims previous prompt rows while a new prompt is active', () => {
  const source = readFileSync(resolve(repoRoot, 'src/features/world-builder/feed/WorldFeedPanel.tsx'), 'utf8')
  const css = readFileSync(resolve(repoRoot, 'src/styles/features/world-builder/wiki-feed/feed.css'), 'utf8')
  const cardSource = source.slice(
    source.indexOf('function renderWorldFeedCard'),
    source.indexOf('function renderWorldFeedPanel'),
  )

  assert.match(cardSource, /const feedFocusActive = isPromptBusy \|\| Boolean\(activeTurnId\)/)
  assert.match(cardSource, /const entryBelongsToActiveTurn = Boolean/)
  assert.match(cardSource, /entry\.turnId === activeTurnId \|\| entry\.parentTurnId === activeTurnId/)
  assert.match(cardSource, /const dimmedDuringActiveTurn = Boolean\(feedFocusActive && !entryBelongsToActiveTurn\)/)
  assert.match(cardSource, /is-background-during-active-turn/)
  assert.match(css, /\.world-feed-row\.is-background-during-active-turn,\s*\n\.world-feed-turn-divider\.is-background-during-active-turn\s*\{[\s\S]*opacity: 0\.26/)
})

test('feed relationship detail expands only the selected relationship row', () => {
  const source = readFileSync(resolve(repoRoot, 'src/features/world-builder/feed/WorldFeedPanel.tsx'), 'utf8')
  const css = readFileSync(resolve(repoRoot, 'src/styles/features/world-builder/wiki-feed/feed.css'), 'utf8')
  const relationshipRowSource = source.slice(
    source.indexOf('function renderRelationshipGraphRow'),
    source.indexOf('function renderWorldFeedDetailCloseButton'),
  )

  assert.match(source, /selectedFeedRelationshipDetailKey/)
  assert.match(relationshipRowSource, /selectedFeedRelationshipDetailKey === relationship\.key/)
  assert.match(relationshipRowSource, /setSelectedFeedRelationshipDetailKey\(\(current\) => current === relationship\.key \? null : relationship\.key\)/)
  assert.match(relationshipRowSource, /aria-expanded=\{selected\}/)
  assert.match(relationshipRowSource, /selected \? \(/)
  assert.match(relationshipRowSource, /world-feed-relationship-detail/)
  assert.match(css, /\.world-feed-relationship-detail\s*\{/)
  assert.match(css, /\.world-feed-relationship\.is-selected \.world-feed-relationship-connector\s*\{/)
})

test('feed relationship rows show capped endpoint icon stack with overflow label', () => {
  const source = readFileSync(resolve(repoRoot, 'src/features/world-builder/feed/WorldFeedPanel.tsx'), 'utf8')
  const css = readFileSync(resolve(repoRoot, 'src/styles/features/world-builder/wiki-feed/feed.css'), 'utf8')

  assert.match(source, /function relationshipEntityKeysForFeedEntry/)
  assert.match(source, /function renderRelationshipEntityIconStack/)
  assert.match(source, /entityKeys\.slice\(0, 4\)/)
  assert.match(source, /world-feed-relationship-overflow/)
  assert.match(source, /relationshipIconStack \? ' is-relationship-row'/)
  assert.match(css, /\.world-feed-relationship-icons\s*\{/)
  assert.match(css, /\.world-feed-relationship-overflow\s*\{/)
  assert.match(css, /\.world-feed-row\.is-relationship-row \.world-feed-row-main\s*\{/)
})
