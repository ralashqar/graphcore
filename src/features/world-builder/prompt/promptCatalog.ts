import type { ProjectContext } from '../../../domain/projectContext'

export function getWorldPromptTypeAccelerators(projectContext: ProjectContext | null) {
  switch (projectContext?.brainProfile) {
    case 'game':
      if (projectContext.projectSubtype === 'narrative_rpg_mobile') {
        return [
          { iconId: 'character' as const, label: 'NPC', prompt: 'Create a speaking NPC with dialogue role, location spot, inventory/economy relevance, and at least one choice connection.' },
          { iconId: 'environment' as const, label: 'Spot', prompt: 'Create a location spot inside an existing place with available actions, travel links, and narrative scene hooks.' },
          { iconId: 'item' as const, label: 'Item', prompt: 'Create an inventory_item or shadow_token with how it is obtained, spent, traded, or used as a progression condition.' },
          { iconId: 'credits' as const, label: 'Market', prompt: 'Create a marketplace with trade_offer nodes, barter or currency costs, and relationships to the items it gives and receives.' },
          { iconId: 'thread' as const, label: 'Scene', prompt: 'Create a narrative_scene with dialogue_node choices, conditions, outcomes, and branch targets.' },
          { iconId: 'activity' as const, label: 'Rule', prompt: 'Create or repair choice_condition and choice_outcome nodes so a branch can mutate inventory, currency, tokens, state, or quest progress.' },
          { iconId: 'graph' as const, label: 'Validate', prompt: 'Analyze the Narrative RPG Mobile graph and add the minimum missing nodes or relationships needed for static playable prototype readiness.' },
        ]
      }
      return [
        { iconId: 'character' as const, label: 'Character', prompt: 'Create a playable or story-critical character with a gameplay role, pressure point, and ties to the world.' },
        { iconId: 'content' as const, label: 'Group', prompt: 'Create a faction with territory, methods, allies, and a reason the player will encounter them.' },
        { iconId: 'environment' as const, label: 'Place', prompt: 'Create a region, hub, or traversal space with atmosphere, gameplay purpose, and faction pressure.' },
        { iconId: 'item' as const, label: 'Object', prompt: 'Create an item or world object with utility, desire, and a place in progression.' },
        { iconId: 'content' as const, label: 'Concept', prompt: 'Create a rule, belief, or lore concept that shapes the playable world.' },
        { iconId: 'activity' as const, label: 'Event', prompt: 'Create an event that changes stakes, unlocks new pressure, or alters world state.' },
        { iconId: 'graph' as const, label: 'Any', prompt: 'Create whatever this game world most needs next and connect it to progression.' },
      ]
    case 'brand':
      return [
        { iconId: 'content' as const, label: 'Group', prompt: 'Create a branded faction, audience cluster, or campaign-side force with a clear identity and purpose.' },
        { iconId: 'item' as const, label: 'Object', prompt: 'Create a signature product-world object, icon, or symbolic asset with strong recall.' },
        { iconId: 'content' as const, label: 'Concept', prompt: 'Create a belief, message pillar, ritual, or symbolic rule that defines the brand world.' },
        { iconId: 'activity' as const, label: 'Event', prompt: 'Create a campaign event, launch beat, or branded world moment people can rally around.' },
        { iconId: 'character' as const, label: 'Character', prompt: 'Create a mascot, spokesperson, or human lead who can carry the brand world.' },
        { iconId: 'environment' as const, label: 'Place', prompt: 'Create a branded setting or signature place that anchors the project visually.' },
        { iconId: 'graph' as const, label: 'Any', prompt: 'Create whatever symbolic element would sharpen this brand world next.' },
      ]
    case 'ugc':
      return [
        { iconId: 'character' as const, label: 'Persona', prompt: 'Create a creator persona, audience proxy, or witness character for this UGC world.' },
        { iconId: 'item' as const, label: 'Object', prompt: 'Create the key product, prop, or proof object this world revolves around.' },
        { iconId: 'activity' as const, label: 'Scenario', prompt: 'Create a scenario or event that naturally produces a hook, proof moment, and payoff.' },
        { iconId: 'content' as const, label: 'Concept', prompt: 'Create a central hook, belief reset, or proof idea that drives the next UGC thread.' },
        { iconId: 'content' as const, label: 'Group', prompt: 'Create a customer type, creator cluster, or audience segment that belongs in this world.' },
        { iconId: 'environment' as const, label: 'Place', prompt: 'Create a location or setup where this social-native story naturally unfolds.' },
        { iconId: 'graph' as const, label: 'Any', prompt: 'Create whatever would strengthen the next hook, proof, or social beat.' },
      ]
    case 'app':
      return [
        { iconId: 'app' as const, label: 'App', prompt: 'Refine the app identity with platform targets, product promise, core loop, monetization model, and visual direction.' },
        { iconId: 'character' as const, label: 'Persona', prompt: 'Create a target persona with needs, pains, motivations, objections, and paywall triggers.' },
        { iconId: 'archetype' as const, label: 'Feature', prompt: 'Create a product feature with user value, activation or retention role, states, and dependencies.' },
        { iconId: 'thread' as const, label: 'Flow', prompt: 'Create a user flow with ordered steps, entry and exit screens, emotional goal, and conversion role.' },
        { iconId: 'screen' as const, label: 'Screen', prompt: 'Create a route-ready screen with purpose, layout intent, states, contained components, actions, and data dependencies.' },
        { iconId: 'component' as const, label: 'Component', prompt: 'Create a reusable app component with props, visual role, states, interactions, and file mapping.' },
        { iconId: 'database' as const, label: 'Data', prompt: 'Create a data model with fields, relations, validation rules, and storage target.' },
        { iconId: 'api' as const, label: 'API', prompt: 'Create an API endpoint and backend function contract for an app action.' },
        { iconId: 'capability' as const, label: 'Capability', prompt: 'Create a native capability node with web preview, Expo Go, dev build, and production constraints.' },
        { iconId: 'tower' as const, label: 'Tower', prompt: 'Create an implementation tower with owned nodes, shared contracts, allowed files, and forbidden files.' },
      ]
    default:
      return [
        { iconId: 'character' as const, label: 'Character', prompt: 'Create a new character with a strong flaw, secret motive, and clear place in the world.' },
        { iconId: 'content' as const, label: 'Group', prompt: 'Create a faction, order, or house with a goal, identity, and tension with existing powers.' },
        { iconId: 'environment' as const, label: 'Place', prompt: 'Create a place with atmosphere, purpose, and links to the main conflicts in this world.' },
        { iconId: 'item' as const, label: 'Object', prompt: 'Create an important object or relic with meaning, history, and who wants it.' },
        { iconId: 'content' as const, label: 'Concept', prompt: 'Create a belief, law, prophecy, or abstract concept that shapes this world.' },
        { iconId: 'activity' as const, label: 'Event', prompt: 'Create a major event with consequences, participants, and lingering fallout.' },
        { iconId: 'content' as const, label: 'Chapter', prompt: 'Create the next authored chapter with a synopsis, outcome, cause/effect consequence, and character development.' },
        { iconId: 'graph' as const, label: 'Any', prompt: 'Create whatever this world most needs next and connect it meaningfully.' },
      ]
  }
}

export function getWorldPromptStarterCards(projectContext: ProjectContext | null) {
  switch (projectContext?.brainProfile) {
    case 'game':
      if (projectContext.projectSubtype === 'narrative_rpg_mobile') {
        return [
          {
            title: 'Refine playable graph',
            summary: 'Fill inventory, economy, travel, dialogue, and progression gaps.',
            prompt: 'Refine this Narrative RPG Mobile game graph toward static playable prototype readiness. Add only missing game-system nodes and relationships for inventory, economy, travel, dialogue choices, conditions, outcomes, progression tokens, and save state.',
          },
          {
            title: 'Create a branching scene',
            summary: 'Add a dialogue flow with conditions and outcomes.',
            prompt: 'Create a branching narrative scene with a speaker, dialogue node, at least three choices, condition gates where useful, outcomes that mutate game state, and branch targets.',
          },
          {
            title: 'Create market and travel loop',
            summary: 'Add barter/currency trades and location movement.',
            prompt: 'Create a marketplace, trade offers, inventory items, currency costs, location spots, and travel links that form a small playable loop.',
          },
        ]
      }
      return [
        {
          title: 'Create a faction',
          summary: 'Define a force the player will encounter, ally with, or fight against.',
          prompt: 'Create a faction for this game world with territory, goals, methods, and one immediate world-level tension.',
        },
        {
          title: 'Create a region',
          summary: 'Add a playable place with traversal identity, pressure, and rewards.',
          prompt: 'Create a memorable region or hub for this game world with atmosphere, gameplay purpose, and ties to existing forces.',
        },
        {
          title: 'Create a hook',
          summary: 'Seed an item, landmark, or problem that opens a progression path.',
          prompt: 'Create a compelling world hook for this game project and connect it to factions, places, or progression.',
        },
      ]
    case 'brand':
      return [
        {
          title: 'Create a campaign world',
          summary: 'Define the symbolic world, tone, and power structure around the brand.',
          prompt: 'Create a branded campaign world with clear values, tension, and one signature symbolic element.',
        },
        {
          title: 'Create a mascot',
          summary: 'Add a lead figure or identity anchor people can remember instantly.',
          prompt: 'Create a mascot or leading character for this brand world with a role, tone, and signature visual cue.',
        },
        {
          title: 'Create a signature asset',
          summary: 'Add the object, ritual, or symbol the world revolves around.',
          prompt: 'Create a signature object or symbol for this brand world and connect it to the message pillars.',
        },
      ]
    case 'ugc':
      return [
        {
          title: 'Create a hook',
          summary: 'Start with a problem, confession, or belief reset the audience understands immediately.',
          prompt: 'Create a high-performing social hook for this world and tie it to a clear scenario, persona, or proof object.',
        },
        {
          title: 'Create a proof beat',
          summary: 'Add the event, demo, or scenario where the promise gets verified.',
          prompt: 'Create a proof-driven event or scenario for this UGC world with clear payoff and continuation potential.',
        },
        {
          title: 'Create a persona',
          summary: 'Define the creator voice, witness, or audience surrogate who belongs in the thread.',
          prompt: 'Create the core creator or audience persona for this UGC world and connect them to the main hook.',
        },
      ]
    case 'app':
      return [
        {
          title: 'Map the first-run flow',
          summary: 'Turn the app promise into onboarding, first value, and conversion steps.',
          prompt: 'Create the first-run app flow with screens, components, data dependencies, transitions, and the first monetization moment.',
        },
        {
          title: 'Define the home loop',
          summary: 'Add the daily or repeat workflow users return to.',
          prompt: 'Create the app home loop with a home screen, primary action, result state, retention trigger, and linked data model.',
        },
        {
          title: 'Create implementation towers',
          summary: 'Split the app graph into safe code generation slices.',
          prompt: 'Create implementation towers for onboarding, home loop, generation, paywall, history, design system, and backend.',
        },
      ]
    default:
      return [
        {
          title: 'Create a character',
          summary: 'Introduce a protagonist, rival, mentor, or witness who matters to the core tension.',
          prompt: 'Create a compelling new character for this world and connect them to the central conflict.',
        },
        {
          title: 'Create a faction',
          summary: 'Add a house, cult, guild, or government with loyalties, enemies, and cultural texture.',
          prompt: 'Create a new faction for this world with goals, rivals, and a visible role in the power structure.',
        },
        {
          title: 'Create a place',
          summary: 'Add a city, stronghold, district, ruin, or natural landmark worth returning to.',
          prompt: 'Create a memorable place in this world with atmosphere, function, and relationships to other entities.',
        },
      ]
  }
}

export function getWorldPromptSmartPrompts(projectContext: ProjectContext | null) {
  switch (projectContext?.brainProfile) {
    case 'game':
      return [
        'Add a frontier region where survival and faction pressure collide',
        'Create a relic that unlocks a dangerous traversal path',
        'Introduce a rival faction controlling the safest route forward',
        'Design the first quest hook players will talk about',
      ]
    case 'brand':
      return [
        'Create the core symbolic rule that defines this brand world',
        'Add a mascot-level figure with a recognizable emotional role',
        'Design the signature object the whole campaign revolves around',
        'Create a campaign moment that people would want to share',
      ]
    case 'ugc':
      return [
        'Add the hook that stops someone mid-scroll',
        'Create the proof moment that makes the claim believable',
        'Design the creator persona who naturally tells this story',
        'Create the scenario that turns into an episodic thread',
      ]
    case 'app':
      return [
        'Add the onboarding flow that proves the app promise fast',
        'Create the home screen and primary daily loop',
        'Map the result reveal screen to components, data, and actions',
        'Add native capability constraints for preview and production',
      ]
    default:
      return [
        'Add a hidden heir who threatens the current order',
        'Create the city where trade, spies, and rumors converge',
        'Design a relic that changes who can wield power',
        'Create the prophecy everyone interprets differently',
      ]
  }
}
