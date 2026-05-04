import type { ProjectContext } from './projectContext.ts'
import { evaluateNarrativeRpgReadiness } from './gameGraph.ts'
import type { WorldEntity, WorldRelationship, WorldWikiPresentationMetadata } from './worldGraph.ts'
import type {
  WorldPromptDiagnosticFinding,
  WorldPromptIncrementalWorkItem,
  WorldPromptSuggestion,
} from './worldPrompt.ts'

export type WorldPromptStrategyId = 'story' | 'game' | 'app' | 'default'

export type AppIncrementalSlice =
  | 'product'
  | 'flows'
  | 'screens'
  | 'components'
  | 'data_api'
  | 'capabilities'
  | 'design_system'
  | 'towers_code_files'
  | 'relationships'

export type GameIncrementalSlice =
  | 'world_content'
  | 'inventory'
  | 'economy'
  | 'travel'
  | 'narrative'
  | 'dialogue'
  | 'rules_validation'
  | 'prototype'

export type WorldPromptStrategy = {
  id: WorldPromptStrategyId
  plannerGuidance: string[]
  incrementalManifestGuidance: string[]
  incrementalWorkItemGuidance: string[]
}

export type AppReadinessInput = {
  entities: WorldEntity[]
  relationships: WorldRelationship[]
  wikiMetadata?: WorldWikiPresentationMetadata | null
  selectedRootEntityKey?: string | null
}

export const APP_PROMPT_FORBIDDEN_STORY_TERMS = [
  /\bthreat\b/i,
  /\bvillain\b/i,
  /\bantagonist\b/i,
  /\bprotagonist\b/i,
  /\bhero\b/i,
  /\bchapter\b/i,
  /\binciting event\b/i,
  /\blore\b/i,
  /\bkingdom\b/i,
  /\brealm\b/i,
  /\bruler\b/i,
  /\bcourt\b/i,
  /\bfaction\b/i,
  /\bfactions\b/i,
  /\bstory beat\b/i,
  /\bplot\b/i,
  /\bmain conflict\b/i,
  /\bworld conflict\b/i,
  /\bcast\b/i,
  /\bcharacter circle\b/i,
  /\bpower structure\b/i,
  /\bhidden truth\b/i,
  /\bmotives?\b/i,
]

export const GAME_PROMPT_FORBIDDEN_APP_TERMS = [
  /\bpaywall\b/i,
  /\bsubscription\b/i,
  /\bconversion\b/i,
  /\bAPI contract\b/i,
  /\bcode tower\b/i,
  /\bExpo\b/i,
  /\bcomponent props\b/i,
  /\bbusiness goal\b/i,
]

export function projectContextUsesAppStrategy(projectContext: ProjectContext | null | undefined) {
  return projectContext?.projectType === 'app' || projectContext?.brainProfile === 'app'
}

export function getWorldPromptStrategy(projectContext: ProjectContext | null | undefined): WorldPromptStrategy {
  if (projectContextUsesAppStrategy(projectContext)) return APP_PROMPT_STRATEGY
  if (projectContext?.projectType === 'game' || projectContext?.brainProfile === 'game') return GAME_PROMPT_STRATEGY
  if (projectContext?.projectType === 'story' || projectContext?.brainProfile === 'story') return STORY_PROMPT_STRATEGY
  return DEFAULT_PROMPT_STRATEGY
}

export function suggestionContainsForbiddenAppStoryLanguage(suggestion: Pick<WorldPromptSuggestion, 'label' | 'prompt' | 'summary' | 'retrievalHint' | 'generatedReason'>) {
  const text = [
    suggestion.label,
    suggestion.prompt,
    suggestion.summary,
    suggestion.retrievalHint,
    suggestion.generatedReason,
  ].filter(Boolean).join(' ')
  return APP_PROMPT_FORBIDDEN_STORY_TERMS.some((pattern) => pattern.test(text))
}

export function filterSuggestionsForPromptStrategy(
  suggestions: WorldPromptSuggestion[],
  projectContext: ProjectContext | null | undefined,
) {
  if (projectContextUsesAppStrategy(projectContext)) return suggestions.filter((suggestion) => !suggestionContainsForbiddenAppStoryLanguage(suggestion))
  if (projectContext?.projectType === 'game' || projectContext?.brainProfile === 'game') {
    return suggestions.filter((suggestion) => {
      const text = [suggestion.label, suggestion.prompt, suggestion.summary, suggestion.retrievalHint, suggestion.generatedReason].filter(Boolean).join(' ')
      return !GAME_PROMPT_FORBIDDEN_APP_TERMS.some((pattern) => pattern.test(text))
    })
  }
  return suggestions
}

export function normalizeWorkItemForPromptStrategy(
  item: WorldPromptIncrementalWorkItem,
  projectContext: ProjectContext | null | undefined,
): WorldPromptIncrementalWorkItem {
  if (projectContext?.projectType === 'game' || projectContext?.brainProfile === 'game') {
    return {
      ...item,
      projectType: 'game',
      gameSlice: item.gameSlice ?? inferGameSliceForWorkItem(item),
      entityTypes: item.entityTypes,
    }
  }
  if (!projectContextUsesAppStrategy(projectContext)) return item
  const appSlice = item.appSlice ?? inferAppSliceForWorkItem(item)
  return {
    ...item,
    kind: item.kind === 'sequence_unit' ? 'entity_batch' : item.kind,
    projectType: 'app',
    appSlice,
    sequenceOrdinal: null,
    entityTypes: appSlice === 'towers_code_files'
      ? item.entityTypes.filter((nodeType) => nodeType === 'tower' || nodeType === 'code_file')
      : item.entityTypes.filter((nodeType) => nodeType !== 'sequence_unit' && nodeType !== 'tower' && nodeType !== 'code_file'),
  }
}

export function buildGameGraphReadinessFindings(input: AppReadinessInput): WorldPromptDiagnosticFinding[] {
  const readiness = evaluateNarrativeRpgReadiness({
    entities: input.entities,
    relationships: input.relationships,
  })
  return [...readiness.blockers, ...readiness.warnings].slice(0, 6).map((finding, index) => ({
    id: `game-readiness-${index}-${finding.entityKey ?? finding.category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    findingType: finding.severity === 'blocker' ? 'world_imbalance' : 'weak_context',
    title: `${finding.category} needs playable graph support`,
    summary: finding.message,
    targetKeys: finding.entityKey ? [finding.entityKey] : input.selectedRootEntityKey ? [input.selectedRootEntityKey] : [],
    severity: finding.severity === 'blocker' ? 'high' : 'medium',
  }))
}

export function buildDefaultAppIncrementalWorkItems(): WorldPromptIncrementalWorkItem[] {
  return [
    {
      id: 'app_product',
      kind: 'entity_batch',
      label: 'App product foundation',
      objective: 'Create or complete the app identity, target personas, business goals, and core features.',
      dependsOn: [],
      expectedOps: 5,
      entityTypes: ['app', 'persona', 'business_goal', 'feature'],
      sequenceOrdinal: null,
      projectType: 'app',
      appSlice: 'product',
      critical: true,
    },
    {
      id: 'app_flows',
      kind: 'entity_batch',
      label: 'UX flow map',
      objective: 'Create user_flow nodes for onboarding, first success, return loop, sharing/export, and paywall conversion as applicable.',
      dependsOn: ['app_product'],
      expectedOps: 4,
      entityTypes: ['user_flow'],
      sequenceOrdinal: null,
      projectType: 'app',
      appSlice: 'flows',
      critical: true,
    },
    {
      id: 'app_screens',
      kind: 'entity_batch',
      label: 'Screen route plan',
      objective: 'Create the screen nodes needed by the UX flows, including route, purpose, states, actions, and data dependencies.',
      dependsOn: ['app_flows'],
      expectedOps: 6,
      entityTypes: ['screen'],
      sequenceOrdinal: null,
      projectType: 'app',
      appSlice: 'screens',
      critical: true,
    },
    {
      id: 'app_components',
      kind: 'entity_batch',
      label: 'Component contracts',
      objective: 'Break key screens into sections and components with props, states, interactions, and style dependencies.',
      dependsOn: ['app_screens'],
      expectedOps: 6,
      entityTypes: ['section', 'component'],
      sequenceOrdinal: null,
      projectType: 'app',
      appSlice: 'components',
      critical: false,
    },
    {
      id: 'app_data_api',
      kind: 'entity_batch',
      label: 'Data and API contracts',
      objective: 'Create data_model, action, api_endpoint, backend_function, and external_service nodes for the core app loop.',
      dependsOn: ['app_screens'],
      expectedOps: 7,
      entityTypes: ['data_model', 'action', 'api_endpoint', 'backend_function', 'external_service'],
      sequenceOrdinal: null,
      projectType: 'app',
      appSlice: 'data_api',
      critical: true,
    },
    {
      id: 'app_capabilities_design',
      kind: 'entity_batch',
      label: 'Capabilities and design system',
      objective: 'Create capability and design_system nodes with preview constraints, colors, typography, spacing, motion, and platform rules.',
      dependsOn: ['app_data_api'],
      expectedOps: 4,
      entityTypes: ['capability', 'design_system'],
      sequenceOrdinal: null,
      projectType: 'app',
      appSlice: 'design_system',
      critical: false,
    },
    {
      id: 'app_relationships',
      kind: 'relationship_batch',
      label: 'App graph relationships',
      objective: 'Connect app design nodes with contains, transitions_to, reads, writes, emits, calls, styled_by, gated_by, and requires_capability links.',
      dependsOn: ['app_components', 'app_data_api', 'app_capabilities_design'],
      expectedOps: 10,
      entityTypes: [],
      sequenceOrdinal: null,
      projectType: 'app',
      appSlice: 'relationships',
      critical: false,
    },
    {
      id: 'app_final_summary',
      kind: 'final_summary',
      label: 'App readiness summary',
      objective: 'Summarize what became design-prototype-ready and suggest the next app graph, brand, screen-art, or approval step.',
      dependsOn: ['app_relationships'],
      expectedOps: 2,
      entityTypes: [],
      sequenceOrdinal: null,
      projectType: 'app',
      appSlice: 'relationships',
      critical: false,
    },
  ]
}

export function buildAppImplementationPlanIncrementalWorkItems(): WorldPromptIncrementalWorkItem[] {
  const items: WorldPromptIncrementalWorkItem[] = [
    {
      id: 'app_implementation_towers_code_files',
      kind: 'entity_batch',
      label: 'Implementation towers and code files',
      objective: 'Create or repair only tower and code_file nodes from the approved app design bundle. Each code_file needs filePath, ownerTower, fileKind, exports, imports, dependsOn, implementationSummary, publicInterface, visualSpecRefs, and testExpectations.',
      dependsOn: [],
      expectedOps: 10,
      entityTypes: ['tower', 'code_file'],
      sequenceOrdinal: null,
      projectType: 'app',
      appSlice: 'towers_code_files',
      critical: true,
    },
    {
      id: 'app_implementation_relationships',
      kind: 'relationship_batch',
      label: 'Implementation relationships',
      objective: 'Connect tower and code_file nodes to approved design/data/capability nodes with implemented_as, owned_by_tower, depends_on, reads, writes, calls, styled_by, and requires_capability relationships only.',
      dependsOn: ['app_implementation_towers_code_files'],
      expectedOps: 12,
      entityTypes: [],
      sequenceOrdinal: null,
      projectType: 'app',
      appSlice: 'relationships',
      critical: true,
    },
  ]
  return items
}

export function buildAppGraphReadinessFindings(input: AppReadinessInput): WorldPromptDiagnosticFinding[] {
  const activeEntities = input.entities.filter((entity) => entity.status !== 'archived')
  const relationships = input.relationships
  const byType = (nodeType: string) => activeEntities.filter((entity) => entity.nodeType === nodeType)
  const firstByType = (nodeType: string) => byType(nodeType)[0] ?? null
  const relationTouches = (entityKey: string, verbs: string[]) => relationships.some((relationship) => (
    (relationship.sourceEntityKey === entityKey || relationship.targetEntityKey === entityKey)
    && verbs.includes(relationship.verb)
  ))
  const relationOut = (entityKey: string, verbs: string[], targetTypes: string[]) => relationships.some((relationship) => {
    if (relationship.sourceEntityKey !== entityKey || !verbs.includes(relationship.verb)) return false
    const target = activeEntities.find((entity) => entity.key === relationship.targetEntityKey)
    return target ? targetTypes.includes(target.nodeType) : false
  })
  const findings: WorldPromptDiagnosticFinding[] = []
  const addFinding = (finding: WorldPromptDiagnosticFinding) => {
    if (!findings.some((existing) => existing.id === finding.id)) findings.push(finding)
  }

  const requiredLayers = [
    ['app', 'app identity'],
    ['persona', 'personas'],
    ['business_goal', 'business goals'],
    ['feature', 'features'],
    ['user_flow', 'UX flows'],
    ['screen', 'screens'],
    ['component', 'components'],
    ['data_model', 'data models'],
    ['action', 'actions'],
    ['api_endpoint', 'API endpoints'],
    ['capability', 'capabilities'],
    ['design_system', 'design system'],
  ] as const
  const missingLayers = requiredLayers
    .filter(([nodeType]) => byType(nodeType).length === 0)
    .map(([, label]) => label)
  if (missingLayers.length > 0) {
    addFinding({
      id: 'app-readiness-missing-layers',
      findingType: 'world_imbalance',
      title: 'App design graph is missing product layers',
      summary: `Add ${missingLayers.slice(0, 7).join(', ')} so the product graph can support UX, data/API, capabilities, and visual prototyping.`,
      targetKeys: input.selectedRootEntityKey ? [input.selectedRootEntityKey] : [],
      severity: 'high',
    })
  }

  const weakScreen = byType('screen').find((screen) => {
    const app = appProperties(screen)
    const route = stringValue(app.route)
    const purpose = stringValue(app.purpose) || screen.summary
    const states = stringArray(app.states)
    return !route || !purpose || states.length === 0 || !relationOut(screen.key, ['emits', 'uses', 'reads', 'writes'], ['action', 'data_model'])
  })
  if (weakScreen) {
    addFinding({
      id: `app-readiness-screen-${weakScreen.key}`,
      findingType: 'weak_context',
      title: `${weakScreen.name} needs clearer screen contract`,
      summary: `${weakScreen.name} should define route, purpose, states, connected actions, and data dependencies before it can drive screen art and a static prototype.`,
      targetKeys: [weakScreen.key],
      severity: 'high',
    })
  }

  const weakComponent = byType('component').find((component) => {
    const app = appProperties(component)
    return Object.keys(recordValue(app.props)).length === 0
      || stringArray(app.states).length === 0
      || (!stringValue(app.filePath) && !relationTouches(component.key, ['implemented_as', 'owned_by_tower']))
  })
  if (weakComponent) {
    addFinding({
      id: `app-readiness-component-${weakComponent.key}`,
      findingType: 'weak_context',
      title: `${weakComponent.name} needs component contract details`,
      summary: `${weakComponent.name} should define props, states, interactions, styling dependencies, and reusable component intent. File mappings can wait until the implementation plan.`,
      targetKeys: [weakComponent.key],
      severity: 'medium',
    })
  }

  const weakAction = byType('action').find((action) => !relationOut(action.key, ['calls', 'reads', 'writes', 'creates', 'updates'], ['api_endpoint', 'data_model', 'backend_function']))
  if (weakAction) {
    addFinding({
      id: `app-readiness-action-${weakAction.key}`,
      findingType: 'relationship_gap',
      title: `${weakAction.name} is not wired to data or API`,
      summary: `${weakAction.name} should connect to the data models, API endpoints, or backend functions it reads, writes, or calls.`,
      targetKeys: [weakAction.key],
      severity: 'high',
    })
  }

  const weakApi = byType('api_endpoint').find((api) => {
    const app = appProperties(api)
    return !stringValue(app.method) || !stringValue(app.path)
      || Object.keys(recordValue(app.inputSchema)).length === 0
      || Object.keys(recordValue(app.outputSchema)).length === 0
  })
  if (weakApi) {
    addFinding({
      id: `app-readiness-api-${weakApi.key}`,
      findingType: 'weak_context',
      title: `${weakApi.name} needs API contract fields`,
      summary: `${weakApi.name} should define method, path, input schema, output schema, auth requirement, and associated action.`,
      targetKeys: [weakApi.key],
      severity: 'high',
    })
  }

  const weakCapability = byType('capability').find((capability) => {
    const app = appProperties(capability)
    const rule = recordValue(app.capabilityRule)
    return !stringValue(rule.webPreview) || !stringValue(rule.expoGo) || typeof rule.requiresDevBuild !== 'boolean'
  })
  if (weakCapability) {
    addFinding({
      id: `app-readiness-capability-${weakCapability.key}`,
      findingType: 'weak_context',
      title: `${weakCapability.name} needs preview and build constraints`,
      summary: `${weakCapability.name} should declare web preview behavior, Expo Go support, dev-build requirements, and production entitlement notes.`,
      targetKeys: [weakCapability.key],
      severity: 'medium',
    })
  }

  const designSystem = firstByType('design_system')
  const colorScheme = recordValue(input.wikiMetadata?.colorScheme)
  if (!designSystem || !input.wikiMetadata?.artStyleDescription || !input.wikiMetadata?.brandAtlasPrompt || Object.keys(colorScheme).length < 3) {
    addFinding({
      id: 'app-readiness-design-system',
      findingType: 'world_imbalance',
      title: 'App design system is not visual-prototype-ready',
      summary: 'Define a design_system node plus project art style description, brand atlas prompt, and primary/secondary/tertiary app color scheme.',
      targetKeys: designSystem ? [designSystem.key] : [],
      severity: 'medium',
    })
  }

  return findings.slice(0, 6)
}

function inferAppSliceForWorkItem(item: WorldPromptIncrementalWorkItem): AppIncrementalSlice {
  const text = `${item.id} ${item.label} ${item.objective} ${item.kind} ${item.entityTypes.join(' ')}`.toLowerCase()
  if (/\b(persona|business|goal|feature|product|app identity)\b/.test(text)) return 'product'
  if (/\b(user_flow|flow|onboarding|return loop|paywall)\b/.test(text)) return 'flows'
  if (/\b(screen|route|state)\b/.test(text)) return 'screens'
  if (/\b(component|section|props|interaction)\b/.test(text)) return 'components'
  if (/\b(data|api|endpoint|backend|action|model|schema|service)\b/.test(text)) return 'data_api'
  if (/\b(capability|camera|push|health|iap|expo|native)\b/.test(text)) return 'capabilities'
  if (/\b(tower|code_file|code file|file plan|implementation|owner tower|expo router|react native)\b/.test(text)) return 'towers_code_files'
  if (/\b(design|style|color|typography|brand|token|motion)\b/.test(text)) return 'design_system'
  return 'relationships'
}

function inferGameSliceForWorkItem(item: WorldPromptIncrementalWorkItem): GameIncrementalSlice {
  const text = `${item.id} ${item.label} ${item.objective} ${item.kind} ${item.entityTypes.join(' ')}`.toLowerCase()
  if (/\b(actor|character|npc|place|world|location)\b/.test(text)) return 'world_content'
  if (/\b(inventory|item|currency|token|save)\b/.test(text)) return 'inventory'
  if (/\b(market|trade|barter|cost|economy)\b/.test(text)) return 'economy'
  if (/\b(travel|spot|route|map)\b/.test(text)) return 'travel'
  if (/\b(quest|arc|scene|encounter)\b/.test(text)) return 'narrative'
  if (/\b(dialogue|choice|branch)\b/.test(text)) return 'dialogue'
  if (/\b(condition|outcome|state|rule|validate|readiness)\b/.test(text)) return 'rules_validation'
  return 'prototype'
}

function appProperties(entity: WorldEntity) {
  return recordValue(recordValue(entity.customProperties).app)
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : []
}

const APP_PROMPT_STRATEGY: WorldPromptStrategy = {
  id: 'app',
  plannerGuidance: [
    'For App projects, every graph mutation should use app/product language and app ontology. Do not use story terms, story diagnostics, or story-specific suggestions.',
    'For App projects, do not use sequence_unit for UX flows. Use user_flow nodes for onboarding, first success, daily return, paywall, sharing, and export flows.',
    'For App projects, use app graph node types: app, persona, business_goal, feature, user_flow, screen, section, component, data_model, action, api_endpoint, backend_function, external_service, design_system, capability, screen_mockup, image_region, animation_spec, tower, and code_file.',
    'When an App project needs executable interaction systems, model them as shared interactive-system graph canon instead of hardcoded UI: player_initial_config, player_stat, inventory, inventory_item, currency, shadow_token, marketplace, trade_offer, dialogue_node, choice, choice_condition, choice_outcome, state_variable, travel_link, location_spot, and save_state. Declare the required systems on customProperties.app.interactiveSystems or customProperties.interactive.requiredSystems.',
    'For App projects, put app-specific structured fields under customProperties.app and connect nodes with contains, reads, writes, emits, calls, transitions_to, gated_by, styled_by, requires_capability, owned_by_tower, and implemented_as.',
    'For App projects, suggestionCandidates must be app/product moves only: UX flows, screens, components, data/API contracts, capabilities, design system, paywall, brand atlas, screen art, or visual prototype readiness.',
    'When an App prompt includes an App Readiness Ledger or asks to Refine Design Graph, treat it as an iterative design-readiness repair pass: repair the listed blockers/warnings, keep scope narrow, and finish with whether the graph is ready for screen art or static prototype preview.',
    'Do not create tower or code_file nodes during initial generation, Refine Design Graph, or visual analysis. Create tower and code_file nodes only when the prompt explicitly asks to Generate Implementation Plan or Plan Code after design approval.',
    'When an App prompt asks to analyze generated screen art, create implementation-facing screen_mockup visualSpec data and image_region nodes. Focus on layout frames, role, mapped component, style, textStyle, required assets, shared token candidates, and CSS/React Native styling constraints.',
  ],
  incrementalManifestGuidance: [
    'This is an app graph build. Create appSlice values for app work items and keep kind values compatible with the generic work-item schema.',
    'Use app work in this order: product foundation, UX flows, screens, components, data/API/backend, capabilities/design system, relationships, final design-prototype readiness summary.',
    'Do not create sequence_unit work items for app UX. Use entity_batch work items with user_flow node types instead.',
    'Use valid app entity node types by default: app, persona, business_goal, feature, user_flow, screen, section, component, data_model, action, api_endpoint, backend_function, external_service, design_system, capability, screen_mockup, image_region, animation_spec, tower, and code_file. If the app requires executable inventory, economy, progression, dialogue, travel, or save-state systems, add shared interactive-system work items and nodes for those systems.',
  ],
  incrementalWorkItemGuidance: [
    'This work item belongs to an app graph. Use app ontology, app relationship verbs, and customProperties.app fields.',
    'Valid app entity node types are app, persona, business_goal, feature, user_flow, screen, section, component, data_model, action, api_endpoint, backend_function, external_service, design_system, capability, screen_mockup, image_region, animation_spec, tower, and code_file. App work items may also use shared interactive-system nodes when the app explicitly needs runtime state, player initial config, numeric stats, inventory, currency, progression tokens, markets, dialogue choices, conditions, outcomes, travel, or save state.',
    'Never create sequence_unit, actor, group, place, object, concept, or event nodes for an app work item unless the user explicitly asks to model separate story/world canon later. Use shared interactive-system nodes for executable mechanics, not lore-only story nodes.',
    'For screens, include route, purpose, states, actions, data dependencies, emotional beat, and transitions. For components, include props, states, interactions, styling dependencies, and reusable component intent.',
    'For data/API work, define data models, actions, API endpoints, backend functions, auth notes, input/output schemas, and reads/writes/calls relationships.',
    'For capabilities, declare web preview behavior, Expo Go support, dev build requirement, and production entitlement note.',
    'Do not create tower or code_file nodes unless this work item is explicitly an implementation-planning pass after design approval.',
  ],
}

const GAME_PROMPT_STRATEGY: WorldPromptStrategy = {
  id: 'game',
  plannerGuidance: [
    'For Game projects, keep graph mutations playable and game-system-aware: locations, NPCs, inventory, economy, travel, quests, dialogue choices, conditions, outcomes, state, and progression.',
    'For Narrative RPG Mobile projects, use executable game nodes for branching play: player_profile, player_initial_config, player_stat, inventory, inventory_item, currency, shadow_token, location_spot, travel_link, marketplace, trade_offer, quest, quest_step, narrative_arc, narrative_scene, dialogue_node, choice, choice_condition, choice_outcome, state_variable, game_rule, encounter, and save_state.',
    'Keep actor, place, object, group, and concept nodes for world identity and lore, then connect them to executable game-system nodes with represented_by, located_in, uses, starts_at, travels_to, offers, requires_item, requires_token, grants_item, grants_token, sets_state, unlocks, and branches_to relationships.',
    'For game suggestions, avoid product-app language such as paywalls, subscriptions, app API contracts, code towers, and business goals unless the user explicitly asks for mobile shell implementation planning.',
    'When asked to Refine Game Graph, repair playability blockers slice-by-slice: world content, inventory, economy, travel, narrative, dialogue, conditions/outcomes, and validation.',
  ],
  incrementalManifestGuidance: [
    'This is a game graph build. Order work items as world content, inventory, economy, travel, narrative arcs, dialogue choices, conditions/outcomes, playability validation, and final summary.',
    'For Narrative RPG Mobile work, prefer executable game-system node types over generic lore-only concepts when modeling play rules.',
    'Use sequence_unit only for high-level quest or mission order. Use quest, narrative_scene, dialogue_node, choice, choice_condition, and choice_outcome for executable branching.',
  ],
  incrementalWorkItemGuidance: [
    'This work item belongs to a playable game graph. Store structured game fields under customProperties.game.',
    'Choices should connect to conditions and outcomes. Conditions may check items, currency, shadow tokens, state variables, visited locations, or player_stat values. Outcomes should mutate inventory, currency, shadow tokens, player stats, state variables, quest progress, travel access, current scene/dialogue, or branch targets.',
    'Travel links should connect origin and destination places or location spots. Marketplaces should offer trade_offer nodes with currency or barter contracts.',
    'Every required item, token, or currency should be obtainable from starter inventory, trade, choice outcome, quest reward, or explicit unlock.',
  ],
}

const STORY_PROMPT_STRATEGY: WorldPromptStrategy = {
  id: 'story',
  plannerGuidance: [
    'For Story projects, use story/world ontology and sequence_unit nodes for authored chapters, episodes, acts, or story beats.',
    'For fiction_novel and nonfiction_ebook subtypes, make sequence_unit nodes manuscript-facing: chapter order, reader/story promise, outcome, consequence, and enough wiki metadata for the Outputs ebook preset.',
  ],
  incrementalManifestGuidance: [
    'For Story projects, sequence-heavy requests should create sequence_unit work items with complete sequence metadata.',
    'For book or ebook requests, plan chapter/table-of-contents work items before prose or asset work so downstream output workflows can bind sequence units automatically.',
  ],
  incrementalWorkItemGuidance: [
    'For Story projects, keep sequence_unit metadata complete when creating authored progression.',
    'For manuscript-facing chapters, include synopsis, dramaticQuestion or reader question, storyFunction, outcome, consequences, openLoops, and resolvedLoops.',
  ],
}

const DEFAULT_PROMPT_STRATEGY: WorldPromptStrategy = {
  id: 'default',
  plannerGuidance: [
    'Keep suggestions and graph mutations aligned to the current project type.',
  ],
  incrementalManifestGuidance: [
    'Keep work items aligned to the current project type and avoid unrelated story assumptions.',
  ],
  incrementalWorkItemGuidance: [
    'Use only valid graph node types and relationship verbs for the current project context.',
  ],
}
