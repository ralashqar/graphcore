import type {
  ConditionExpr,
  EffectOp,
  GraphDefinition,
  GraphType,
  NodeDefinition,
  NodeLibraryGroup,
  NodeTemplateDefinition,
  PortDefinition,
} from './graphcore.ts'
import {
  updateNodeMetadataWithAssetRef,
  updateNodeMetadataWithCompositeRef,
  updateNodeMetadataWithTake,
  updateNodeMetadataWithShot,
  updateNodeMetadataWithStoryboardRef,
} from './cinematics.ts'

const narrativeGraphTypes: GraphType[] = ['narrative_flow', 'quest_flow']
const cinematicGraphTypes: GraphType[] = ['cinematic_flow']
const allGraphTypes: GraphType[] = ['narrative_flow', 'quest_flow', 'system_graph', 'cinematic_flow']

export const graphNodeLibrary: NodeLibraryGroup[] = [
  {
    key: 'narrative',
    label: 'Narrative',
    templates: [
      template('start', 'Start', 'narrative', 'start', allGraphTypes, 'Start', 'basic'),
      template('story_text', 'Story Text', 'narrative', 'text', narrativeGraphTypes, 'Story Beat', 'story', {
        defaultBody: { text: 'Narrative text...' },
      }),
      template('choice', 'Choice', 'narrative', 'choice', narrativeGraphTypes, 'Decision', 'choice', {
        defaultBody: {
          text: 'What should the player do next?',
          choices: [
            { id: 'choice_accept', label: 'Accept' },
            { id: 'choice_decline', label: 'Decline' },
          ],
        },
      }),
      template('end', 'End', 'narrative', 'end', allGraphTypes, 'End', 'basic'),
    ],
  },
  {
    key: 'cinematics',
    label: 'Cinematics',
    templates: [
      template('asset_ref', 'Entity Ref', 'cinematics', 'asset_ref', cinematicGraphTypes, 'Entity Ref', 'basic', {
        defaultSubtitle: 'Bind a character, environment, item, or support reference.',
        defaultMetadata: updateNodeMetadataWithAssetRef({}, {}),
        defaultDisplay: {
          compactPreview: true,
        },
      }),
      template('composite_ref', 'Composite Ref', 'cinematics', 'composite_ref', cinematicGraphTypes, 'Composite Ref', 'basic', {
        defaultSubtitle: 'Derived continuity asset from multiple refs.',
        defaultMetadata: updateNodeMetadataWithCompositeRef({}, {
          relationshipType: 'equip',
          priority: 85,
        }),
        defaultDisplay: { compactPreview: true },
      }),
      template('storyboard_ref', 'Storyboard Ref', 'cinematics', 'storyboard_ref', cinematicGraphTypes, 'Storyboard Ref', 'basic', {
        defaultSubtitle: 'Optional storyboard support reference.',
        defaultMetadata: updateNodeMetadataWithStoryboardRef({}, {
          storyboardKind: 'shot_panel',
          priority: 90,
        }),
        defaultDisplay: { compactPreview: true },
      }),
      template('cinematic_take', 'Take Output', 'cinematics', 'cinematic_take', cinematicGraphTypes, 'Take Output', 'basic', {
        defaultSubtitle: 'Compiled Seedance clip output.',
        defaultMetadata: updateNodeMetadataWithTake({}, {
          durationSeconds: 4,
          seedanceEndpoint: 'reference-to-video',
        }),
      }),
      template('character_ref', 'Character Ref', 'cinematics', 'asset_ref', cinematicGraphTypes, 'Character Ref', 'basic', {
        defaultSubtitle: 'Primary character source.',
        defaultMetadata: updateNodeMetadataWithAssetRef({}, {
          assetRole: 'character',
          role: 'participant',
          priority: 70,
        }),
        defaultDisplay: { compactPreview: true },
      }),
      template('location_ref', 'Location Ref', 'cinematics', 'asset_ref', cinematicGraphTypes, 'Location Ref', 'basic', {
        defaultSubtitle: 'Environment or scene anchor.',
        defaultMetadata: updateNodeMetadataWithAssetRef({}, {
          assetRole: 'environment',
          role: 'location',
          priority: 60,
        }),
        defaultDisplay: { compactPreview: true },
      }),
      template('prop_ref', 'Prop Ref', 'cinematics', 'asset_ref', cinematicGraphTypes, 'Prop Ref', 'basic', {
        defaultSubtitle: 'Item or prop source.',
        defaultMetadata: updateNodeMetadataWithAssetRef({}, {
          assetRole: 'item',
          role: 'prop',
          priority: 55,
        }),
        defaultDisplay: { compactPreview: true },
      }),
      template('creator_identity_ref', 'Creator Identity', 'cinematics', 'asset_ref', cinematicGraphTypes, 'Creator Identity Ref', 'basic', {
        defaultSubtitle: 'Primary creator look and feel reference for UGC presets.',
        defaultMetadata: updateNodeMetadataWithAssetRef({}, {
          assetRole: 'character',
          role: 'creator',
          priority: 78,
        }),
        defaultDisplay: { compactPreview: true },
      }),
      template('product_hold_ref', 'Product Hold', 'cinematics', 'composite_ref', cinematicGraphTypes, 'Product Hold Ref', 'basic', {
        defaultSubtitle: 'Creator plus product continuity reference for short-form demos and ads.',
        defaultMetadata: updateNodeMetadataWithCompositeRef({}, {
          relationshipType: 'hold',
          priority: 88,
        }),
        defaultDisplay: { compactPreview: true },
      }),
      template('demo_proof_ref', 'Demo / Proof', 'cinematics', 'composite_ref', cinematicGraphTypes, 'Demo Proof Ref', 'basic', {
        defaultSubtitle: 'Product and proof composition for UGC benefit or demo shots.',
        defaultMetadata: updateNodeMetadataWithCompositeRef({}, {
          relationshipType: 'targets',
          priority: 86,
        }),
        defaultDisplay: { compactPreview: true },
      }),
      template('audio_ref', 'Audio Ref', 'cinematics', 'asset_ref', cinematicGraphTypes, 'Audio Ref', 'basic', {
        defaultSubtitle: 'Audio reference or voice guide.',
        defaultMetadata: updateNodeMetadataWithAssetRef({}, {
          refKind: 'audio',
          assetRole: 'audio',
          role: 'audio',
          priority: 35,
        }),
        defaultDisplay: { compactPreview: true },
      }),
      template('style_ref', 'Style Ref', 'cinematics', 'asset_ref', cinematicGraphTypes, 'Style Ref', 'basic', {
        defaultSubtitle: 'Look or tone reference.',
        defaultMetadata: updateNodeMetadataWithAssetRef({}, {
          refKind: 'style',
          assetRole: 'style',
          role: 'style',
          priority: 30,
        }),
        defaultDisplay: { compactPreview: true },
      }),
      template('equipped_character_ref', 'Equipped Ref', 'cinematics', 'composite_ref', cinematicGraphTypes, 'Equipped Character Ref', 'basic', {
        defaultSubtitle: 'Fuse subject and equipment into one stable reference.',
        defaultMetadata: updateNodeMetadataWithCompositeRef({}, {
          relationshipType: 'equip',
          priority: 85,
        }),
        defaultDisplay: { compactPreview: true },
      }),
      template('paired_subject_ref', 'Paired Subject', 'cinematics', 'composite_ref', cinematicGraphTypes, 'Paired Subject Ref', 'basic', {
        defaultSubtitle: 'Fuse multiple related subjects into one reference.',
        defaultMetadata: updateNodeMetadataWithCompositeRef({}, {
          relationshipType: 'ally_of',
          priority: 75,
        }),
        defaultDisplay: { compactPreview: true },
      }),
      template('wardrobe_ref', 'Wardrobe Ref', 'cinematics', 'composite_ref', cinematicGraphTypes, 'Wardrobe Ref', 'basic', {
        defaultSubtitle: 'Lock costume and character together.',
        defaultMetadata: updateNodeMetadataWithCompositeRef({}, {
          relationshipType: 'wear',
          priority: 82,
        }),
        defaultDisplay: { compactPreview: true },
      }),
      template('sequence_board_ref', 'Sequence Board', 'cinematics', 'storyboard_ref', cinematicGraphTypes, 'Sequence Board', 'basic', {
        defaultSubtitle: 'Storyboard sheet for the sequence.',
        defaultMetadata: updateNodeMetadataWithStoryboardRef({}, {
          storyboardKind: 'sequence_board',
          priority: 95,
        }),
        defaultDisplay: { compactPreview: true },
      }),
      template('shot_panel_ref', 'Shot Panel', 'cinematics', 'storyboard_ref', cinematicGraphTypes, 'Shot Panel', 'basic', {
        defaultSubtitle: 'Storyboard panel for a specific shot.',
        defaultMetadata: updateNodeMetadataWithStoryboardRef({}, {
          storyboardKind: 'shot_panel',
          priority: 92,
        }),
        defaultDisplay: { compactPreview: true },
      }),
      template('cinematic_shot', 'Shot', 'cinematics', 'cinematic_shot', cinematicGraphTypes, 'Cinematic Shot', 'story', {
        defaultSubtitle: 'Describe the beat and generate still/video output.',
        defaultBody: {
          text: 'Describe the shot beat, staging, and on-screen action.',
        },
        defaultMetadata: updateNodeMetadataWithShot({}, {}),
      }),
      template('cinematic_establishing', 'Establishing', 'cinematics', 'cinematic_shot', cinematicGraphTypes, 'Establishing Shot', 'story', {
        defaultSubtitle: 'Wide scene setup.',
        defaultBody: {
          text: 'Establish the setting, scale, and mood before the action begins.',
        },
        defaultMetadata: updateNodeMetadataWithShot({}, {
          shotType: 'establishing',
          framing: 'wide',
          cameraAngle: 'eye level',
          cameraMovement: 'slow drift',
        }),
      }),
      template('cinematic_dialogue', 'Dialogue', 'cinematics', 'cinematic_shot', cinematicGraphTypes, 'Dialogue Shot', 'story', {
        defaultSubtitle: 'Performance and exchange.',
        defaultBody: {
          text: 'Stage a character exchange with clear eyelines and emotional emphasis.',
        },
        defaultMetadata: updateNodeMetadataWithShot({}, {
          shotType: 'dialogue',
          framing: 'medium close-up',
          cameraAngle: 'over-shoulder',
          cameraMovement: 'subtle handheld',
        }),
      }),
      template('cinematic_reveal', 'Reveal', 'cinematics', 'cinematic_shot', cinematicGraphTypes, 'Reveal Shot', 'story', {
        defaultSubtitle: 'Hold back then disclose.',
        defaultBody: {
          text: 'Reveal the key subject or information with controlled framing and timing.',
        },
        defaultMetadata: updateNodeMetadataWithShot({}, {
          shotType: 'reveal',
          framing: 'push-in',
          cameraMovement: 'slow push',
        }),
      }),
      template('cinematic_action', 'Action', 'cinematics', 'cinematic_shot', cinematicGraphTypes, 'Action Shot', 'story', {
        defaultSubtitle: 'Motion and impact.',
        defaultBody: {
          text: 'Capture decisive movement with readable action and cinematic momentum.',
        },
        defaultMetadata: updateNodeMetadataWithShot({}, {
          shotType: 'action',
          framing: 'medium wide',
          cameraMovement: 'tracking',
        }),
      }),
      template('cinematic_insert', 'Insert', 'cinematics', 'cinematic_shot', cinematicGraphTypes, 'Insert Shot', 'story', {
        defaultSubtitle: 'Detail emphasis.',
        defaultBody: {
          text: 'Focus on a prop, gesture, or detail that sharpens the scene beat.',
        },
        defaultMetadata: updateNodeMetadataWithShot({}, {
          shotType: 'insert',
          framing: 'close-up',
          cameraMovement: 'locked-off',
        }),
      }),
      template('cinematic_transition', 'Transition', 'cinematics', 'cinematic_shot', cinematicGraphTypes, 'Transition Shot', 'story', {
        defaultSubtitle: 'Bridge into the next beat.',
        defaultBody: {
          text: 'Bridge scenes with a transitional image that preserves tone and continuity.',
        },
        defaultMetadata: updateNodeMetadataWithShot({}, {
          shotType: 'transition',
          framing: 'wide',
          cameraMovement: 'glide',
        }),
      }),
    ],
  },
  {
    key: 'rpg_logic',
    label: 'RPG Logic',
    templates: [
      template('inventory_check', 'Inventory Check', 'rpg_logic', 'condition', allGraphTypes, 'Check Inventory', 'condition', {
        defaultBody: { text: 'Does the player have the required item?' },
        defaultCondition: { type: 'hasItem', itemKey: '', minQuantity: 1 },
      }),
      template('token_check', 'Token Check', 'rpg_logic', 'condition', allGraphTypes, 'Check Shadow Token', 'condition', {
        defaultBody: { text: 'Has the player unlocked this progression token?' },
        defaultCondition: { type: 'tokenPresent', tokenKey: '' },
      }),
      template('stat_check', 'Stat Check', 'rpg_logic', 'condition', allGraphTypes, 'Check Stat', 'condition', {
        defaultBody: { text: 'Does the player meet the stat gate?' },
        defaultCondition: { type: 'statCompare', statKey: '', comparator: 'gte', value: 0 },
      }),
      template('quest_state_check', 'Quest State', 'rpg_logic', 'condition', allGraphTypes, 'Check Quest State', 'condition', {
        defaultCondition: { type: 'questState', questKey: '', state: 'active' },
      }),
      template('grant_item', 'Grant Item', 'rpg_logic', 'effect', allGraphTypes, 'Grant Item', 'effect', {
        defaultEffects: [{ type: 'grantItem', itemKey: '', quantity: 1 }],
      }),
      template('remove_item', 'Remove Item', 'rpg_logic', 'effect', allGraphTypes, 'Remove Item', 'effect', {
        defaultEffects: [{ type: 'removeItem', itemKey: '', quantity: 1 }],
      }),
      template('modify_stat', 'Modify Stat', 'rpg_logic', 'effect', allGraphTypes, 'Modify Stat', 'effect', {
        defaultEffects: [{ type: 'addStat', statKey: '', value: { type: 'literal', value: 1 } }],
      }),
      template('grant_token', 'Grant Token', 'rpg_logic', 'effect', allGraphTypes, 'Grant Token', 'effect', {
        defaultEffects: [{ type: 'grantToken', tokenKey: '' }],
      }),
      template('revoke_token', 'Revoke Token', 'rpg_logic', 'effect', allGraphTypes, 'Revoke Token', 'effect', {
        defaultEffects: [{ type: 'revokeToken', tokenKey: '' }],
      }),
      template('quest_step', 'Quest Step', 'rpg_logic', 'quest_step', ['quest_flow', 'narrative_flow'], 'Quest Step', 'quest_step'),
      template('market', 'Market', 'rpg_logic', 'market', ['narrative_flow', 'system_graph'], 'Market Interaction', 'market'),
    ],
  },
  {
    key: 'utility',
    label: 'Utility',
    templates: [
      template('branch', 'Branch', 'utility', 'branch', allGraphTypes, 'Branch', 'branch'),
      template('random', 'Random', 'utility', 'random', allGraphTypes, 'Random Roll', 'random'),
      template('call_subgraph', 'Call Subgraph', 'utility', 'call_subgraph', allGraphTypes, 'Call Subgraph', 'call_subgraph'),
      template('return', 'Return', 'utility', 'return', allGraphTypes, 'Return', 'basic'),
      template('effect', 'Effect Stack', 'utility', 'effect', allGraphTypes, 'Apply Effects', 'effect'),
    ],
  },
]

export const graphNodeTemplatesByKey = new Map(
  graphNodeLibrary.flatMap((group) => group.templates.map((template) => [template.key, template] as const)),
)

function template(
  key: string,
  label: string,
  groupKey: string,
  baseNodeType: NodeDefinition['type'],
  compatibleGraphTypes: GraphType[],
  defaultTitle: string,
  inspectorSchema: NodeTemplateDefinition['inspectorSchema'],
  options?: Partial<NodeTemplateDefinition>,
): NodeTemplateDefinition {
  return {
    key,
    label,
    groupKey,
    baseNodeType,
    compatibleGraphTypes,
    defaultTitle,
    inspectorSchema,
    ...options,
  }
}

export function createNodeFromTemplate(
  graph: GraphDefinition,
  template: NodeTemplateDefinition,
  count: number,
  position: NodeDefinition['position'],
): NodeDefinition {
  const slug = template.key.replace(/[^a-z0-9]+/gi, '_').toLowerCase()
  const key = `${graph.key}.${slug}_${count}`

  const node: NodeDefinition = {
    id: `node-${slug}-${Date.now()}-${count}`,
    key,
    type: template.baseNodeType,
    title: template.defaultTitle,
    templateKey: template.key,
    subtitle: template.defaultSubtitle ?? null,
    position,
    body: {
      text: null,
      imageAssetKey: null,
      audioAssetKey: null,
      choices: [],
      ...template.defaultBody,
    },
    condition: template.defaultCondition ?? null,
    effects: template.defaultEffects ?? [],
    ports: [],
    display: {
      colorToken: template.defaultDisplay?.colorToken,
      iconAssetKey: template.defaultDisplay?.iconAssetKey ?? null,
      compactPreview: template.defaultDisplay?.compactPreview ?? false,
    },
    metadata: template.defaultMetadata ?? {},
  }

  return normalizeNode(node)
}

export function applyTemplateToNode(node: NodeDefinition, templateKey: string) {
  const template = graphNodeTemplatesByKey.get(templateKey)

  if (!template) {
    return node
  }

  return normalizeNode({
    ...node,
    type: template.baseNodeType,
    templateKey: template.key,
    subtitle: template.defaultSubtitle ?? node.subtitle,
    title: node.title || template.defaultTitle,
    body: {
      text: node.body.text ?? template.defaultBody?.text ?? null,
      imageAssetKey: node.body.imageAssetKey ?? template.defaultBody?.imageAssetKey ?? null,
      audioAssetKey: node.body.audioAssetKey ?? template.defaultBody?.audioAssetKey ?? null,
      choices:
        template.baseNodeType === 'choice'
          ? node.body.choices.length > 0
            ? node.body.choices
            : template.defaultBody?.choices ?? []
          : [],
    },
    condition:
      template.baseNodeType === 'condition'
        ? node.condition ?? template.defaultCondition ?? null
        : null,
    effects:
      template.baseNodeType === 'effect' || template.baseNodeType === 'quest_step' || template.baseNodeType === 'market'
        ? node.effects.length > 0
          ? node.effects
          : template.defaultEffects ?? []
        : [],
    display: {
      ...node.display,
      ...template.defaultDisplay,
    },
    metadata: {
      ...node.metadata,
    },
  })
}

export function normalizeNode(node: NodeDefinition): NodeDefinition {
  return {
    ...node,
    ports: inferPortsForNode(node),
    display: {
      colorToken: node.display.colorToken,
      iconAssetKey: node.display.iconAssetKey ?? null,
      compactPreview: node.display.compactPreview ?? false,
    },
  }
}

export function inferPortsForNode(node: NodeDefinition): PortDefinition[] {
  const inputs: PortDefinition[] =
    node.type === 'start'
      ? []
      : node.type === 'cinematic_shot'
        ? [
            { id: 'flow_in', label: 'Flow', direction: 'input' },
            { id: 'asset_in', label: 'Assets', direction: 'input' },
          ]
        : node.type === 'cinematic_take'
          ? [{ id: 'in', label: 'In', direction: 'input' }]
        : node.type === 'asset_ref' || node.type === 'storyboard_ref'
          ? []
          : node.type === 'composite_ref'
            ? [{ id: 'asset_in', label: 'Assets', direction: 'input' }]
          : [{ id: 'in', label: 'In', direction: 'input' }]

  switch (node.type) {
    case 'start':
      return [{ id: 'out', label: 'Out', direction: 'output' }]
    case 'asset_ref':
    case 'storyboard_ref':
      return [{ id: 'asset_out', label: 'Asset', direction: 'output' }]
    case 'composite_ref':
      return [...inputs, { id: 'asset_out', label: 'Asset', direction: 'output' }]
    case 'cinematic_shot':
      return [...inputs, { id: 'out', label: 'Out', direction: 'output' }]
    case 'cinematic_take':
      return [...inputs, { id: 'out', label: 'Out', direction: 'output' }]
    case 'end':
      return inputs
    case 'condition':
      return [
        ...inputs,
        { id: 'true', label: 'True', direction: 'output' },
        { id: 'false', label: 'False', direction: 'output' },
      ]
    case 'choice':
      return [
        ...inputs,
        ...(node.body.choices.length > 0
          ? node.body.choices.map((choice, index) => ({
              id: choice.id,
              label: choice.label || `Choice ${index + 1}`,
              direction: 'output' as const,
            }))
          : [{ id: 'out', label: 'Out', direction: 'output' as const }]),
      ]
    case 'branch':
      return [
        ...inputs,
        { id: 'branch_a', label: 'Branch A', direction: 'output' },
        { id: 'branch_b', label: 'Branch B', direction: 'output' },
      ]
    case 'random':
      return [
        ...inputs,
        { id: 'success', label: 'Success', direction: 'output' },
        { id: 'fail', label: 'Fail', direction: 'output' },
      ]
    default:
      return [...inputs, { id: 'out', label: 'Out', direction: 'output' }]
  }
}

export function summarizeCondition(condition: ConditionExpr | null): string {
  if (!condition) return 'No condition'

  switch (condition.type) {
    case 'all':
      return `All of ${condition.conditions.length} conditions`
    case 'any':
      return `Any of ${condition.conditions.length} conditions`
    case 'not':
      return `Not: ${summarizeCondition(condition.condition)}`
    case 'hasItem':
      return `Has ${condition.itemKey} x${condition.minQuantity}`
    case 'itemCount':
      return `${condition.itemKey} ${condition.comparator} ${condition.value}`
    case 'statCompare':
      return `${condition.statKey} ${condition.comparator} ${condition.value}`
    case 'questState':
      return `${condition.questKey} is ${condition.state}`
    case 'tokenPresent':
      return `Token ${condition.tokenKey}`
    case 'locationUnlocked':
      return `Unlocked ${condition.locationKey}`
    case 'flagEquals':
      return `${condition.flagKey} = ${String(condition.value)}`
  }
}

export function summarizeEffects(effects: EffectOp[]): string[] {
  return effects.map((effect) => {
    switch (effect.type) {
      case 'grantItem':
        return `Grant ${effect.itemKey} x${effect.quantity}`
      case 'removeItem':
        return `Remove ${effect.itemKey} x${effect.quantity}`
      case 'setStat':
        return `Set ${effect.statKey}`
      case 'addStat':
        return `Add ${effect.statKey}`
      case 'setQuestState':
        return `Quest ${effect.questKey} -> ${effect.state}`
      case 'grantToken':
        return `Grant ${effect.tokenKey}`
      case 'revokeToken':
        return `Revoke ${effect.tokenKey}`
      case 'unlockLocation':
        return `Unlock ${effect.locationKey}`
      case 'enqueueNarrative':
        return `Queue ${effect.graphKey}`
      case 'emitEvent':
        return `Emit ${effect.eventKey}`
    }
  })
}
