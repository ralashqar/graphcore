# GraphCore Product IR

GraphCore authors one canonical project snapshot made of:

- `DefinitionBase[]` for items, stats, quests, characters, locations, markets, and narrative artifacts
- `GraphDefinition[]` for narrative and system logic
- `AssetDefinition[]` for media and bundle attachments
- `PatchOperation[]` for prompt-driven edits
- `GameSystemBundle` for deterministic export

Definitions are key-addressed and component-composed. Progression tokens are hidden `item` definitions with progression semantics, not a separate type family.
