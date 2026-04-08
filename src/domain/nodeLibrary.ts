import type {
  ConditionExpr,
  EffectOp,
  GraphDefinition,
  GraphType,
  NodeDefinition,
  NodeLibraryGroup,
  NodeTemplateDefinition,
  PortDefinition,
} from './graphcore'

const narrativeGraphTypes: GraphType[] = ['narrative_flow', 'quest_flow']
const allGraphTypes: GraphType[] = ['narrative_flow', 'quest_flow', 'system_graph']

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
  const inputs: PortDefinition[] = node.type === 'start' ? [] : [{ id: 'in', label: 'In', direction: 'input' }]

  switch (node.type) {
    case 'start':
      return [{ id: 'out', label: 'Out', direction: 'output' }]
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
