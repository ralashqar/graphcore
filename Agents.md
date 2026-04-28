# GraphCore AI Agents

This document outlines the AI agents and autonomous systems that power GraphCore's content generation, game authoring, and UGC creation capabilities.

## Overview

GraphCore employs multiple specialized AI agents working in concert to transform natural language prompts into structured game content. The system uses a layered architecture where different agents handle specific aspects of content creation, from initial concept generation to detailed asset production.

## Maintenance Requirements

**CRITICAL**: This document must be kept current whenever changes are made to the AI agent infrastructure. Update requirements:

- **New Agents**: When adding new AI agents, document their purpose, capabilities, integration patterns, and supported models
- **Agent Modifications**: Update capabilities, models, and workflows when agents are enhanced or modified
- **Infrastructure Changes**: Document changes to Supabase Edge Functions, provider integrations, or orchestration patterns
- **Model Updates**: Track new model support, deprecated models, and performance characteristics
- **API Changes**: Update function signatures, request/response formats, and error handling
- **Configuration Updates**: Document new environment variables, secrets, or configuration options
- **Performance Changes**: Update latency expectations, throughput capabilities, and cost implications
- **Security Updates**: Document security enhancements, authentication changes, or access control modifications

**Verification Requirement**: Before marking any code change as complete, AI agents MUST verify:

1. **TypeScript Compilation**: Run `npx tsc --noEmit` and confirm zero errors
2. **Project Builds**: Run `npm run build` (or equivalent) and confirm successful build
3. **Dev Server Starts**: Run `npm run dev` and confirm the application starts without errors
4. **No Runtime Errors**: Check for console errors in the development server output

**Review Process**: All pull requests that modify AI agent code, Supabase functions, or agent orchestration logic must include corresponding updates to this document.

## Core AI Infrastructure

### Supabase Edge Functions
GraphCore runs AI workloads through protected Supabase Edge Functions that provide secure, authenticated access to external AI providers.

#### `ai-openai` Function
**Purpose**: General-purpose LLM interactions for content generation, reasoning, and structured data extraction.

**Capabilities**:
- OpenAI Responses API integration
- JSON schema validation and structured outputs
- Multi-modal content processing
- Reasoning effort control (low/medium/high)
- Tool calling and function execution
- Token usage tracking and optimization

**Models Supported**:
- GPT-4, GPT-4 Turbo
- GPT-3.5 Turbo
- Custom fine-tuned models
- Reasoning models (o1, o3-mini)

**Use Cases**:
- Graph structure generation
- Content archetype creation
- Narrative script writing
- UGC psychology optimization
- Patch operation planning

#### `ai-fal` Function
**Purpose**: Visual asset generation and image manipulation using Fal.ai's queue-based processing system.

**Capabilities**:
- Asynchronous job queuing and status polling
- Image generation from text prompts
- Image-to-image editing and manipulation
- Batch processing with priority controls
- Webhook notifications for job completion
- Multiple output formats (PNG, JPEG, WebP)

**Models Supported**:
- `fal-ai/nano-banana-2` (primary image generation)
- `fal-ai/nano-banana-2/edit` (image editing)
- Custom fine-tuned vision models
- Style transfer and enhancement models

**Use Cases**:
- Character concept art generation
- Environment visualization
- Item and asset previews
- Cinematic storyboard creation
- UGC thumbnail and banner creation

## Specialized Content Agents

### Prompt-to-Patch Agent (`prompt-patch`)
**Purpose**: Orchestrates the conversion of natural language prompts into structured game content patches.

**Architecture**:
- Multi-pass generation strategy
- Content pass → Graph pass separation
- Validation and repair layers
- Patch proposal and review workflow

**Capabilities**:
- Natural language understanding for game design
- Structured patch generation (JSON operations)
- Content scaffolding and archetype reuse
- Graph relationship modeling
- Error correction and validation

**Workflow**:
1. **Content Pass**: Creates or reuses content definitions (items, characters, locations)
2. **Graph Pass**: Builds narrative graphs, choices, and relationships
3. **Validation**: Ensures patch integrity and compatibility
4. **Proposal**: Stores patch for user review and approval

### Visual Asset Generation Agent
**Purpose**: Creates visual assets for game content using AI image generation.

**Capabilities**:
- Concept art generation from text descriptions
- Character portrait creation
- Environment visualization
- Item and prop design
- Style consistency across assets

**Integration**:
- Automatic prompt enhancement for better results
- Reference image incorporation
- Aspect ratio optimization for different use cases
- Resolution scaling (1K, 2K, 4K outputs)

### Cinematic Script Agent
**Purpose**: Generates cinematic content and video scripts optimized for UGC engagement.

**Capabilities**:
- Script writing with psychological hooks
- Storyboard generation
- Scene composition and timing
- Character dialogue optimization
- Viral content structure implementation

**Special Features**:
- Attention psychology integration
- Conversion mechanism embedding
- Scroll-stopper implementation
- Platform-specific formatting

### World Building Agent
**Purpose**: Procedurally generates game worlds, environments, and interconnected content systems.

**Capabilities**:
- Environment assembly and structural fusion
- World entity relationship modeling
- Terrain and geography generation
- Cultural and societal system creation
- Quest and narrative thread weaving

**Advanced Features**:
- Multi-scale world construction (local → regional → global)
- Entity relationship inference
- World state consistency checking
- Dynamic content expansion
- World-prompt chat turns now return touched linked definition records alongside world-graph mutations so prompt-created characters, items, and environments appear immediately in their specialized workspaces without waiting on a later refresh cycle.
- World-prompt chat turns now also return the completed turn's prompt messages, prompt events, suggestions, and touched threads in the `start-world-prompt-turn` response so the frontend can merge the submitted user prompt and assistant result immediately without depending on realtime timing or a broad snapshot reload.
- World graph views now include a graph-native Wiki mode for readable world-bible presentation derived from entities, relationships, threads, timeline ordering, linked outputs, and lightweight wiki metadata.
- World graph views now distinguish authored story sequence from in-world event chronology. `sequence_unit` nodes represent chapters, episodes, missions, campaign moments, or UGC beats, while `event` nodes remain diegetic world happenings.

### World Prompt Agent (`world-prompt`)
**Purpose**: Runs GraphCore's live prompt-to-world graph chat for story-gardening style authoring over an ever-growing world graph.

**Capabilities**:
- Resolves each turn into explicit answer, preview, apply, or blocked modes before planning
- Applies actionable world-building changes immediately and answers in advisory mode when the prompt is non-mutating
- Maintains structured session memory for active focus, background focus, recent turns, and retrieved graph context
- Builds a balanced prompt context packet for every turn with recent raw chat, compact long-term session memory, a lightweight world atlas, typo-tolerant entity matching, rich graph/thread retrieval, and diagnostics for what context was used
- Persists actionable suggestions with machine-readable target metadata
- Treats selected prompt suggestions as apply-now continuations when they return safe actionable graph operations, and accepts explicit canon-repair wording as correction intent instead of looping on preview-only answers
- Preserves full advisory answers for chat readability and uses advisory-specific progress messages so answer-only turns do not appear to be assembling graph mutations
- Maintains a neighborhood-first world view layer with auto-managed semantic views such as protagonist neighborhoods, faction/place maps, lore clusters, timeline overviews, thread-focus views, recent-growth views, and a separate global overview
- Uses the active selected world view as a first-class retrieval anchor, and can switch the session-selected view to a newly relevant neighborhood when a prompt causes a real topic pivot
- Ranks next-step suggestions using both planner ideas and story-seed signals such as protagonist, villain, ruler, factions, lore, and missing inciting events
- Completes underspecified support entities on direct world-building turns by reusing a strong existing match when available or inventing a concrete named entity instead of emitting placeholder canon
- Reconciles entity summaries, contexts, and relationship notes additively while preserving prior refinements in append-only metadata history
- Syncs shared world-entity fields (`name`, `summary`, icon, tags) into linked definition records during prompt-driven world mutations
- Returns touched linked definition records from `start-world-prompt-turn` so prompt-created or prompt-updated characters, items, groups, concepts, events, and environments appear immediately in their specialized workspaces
- Returns updated prompt suggestion records from `start-world-prompt-turn`, including used and superseded records, so selected suggestions disappear immediately and do not loop back into the same suggestion set
- Exposes linked world context and world-graph relationships inside the specialized definition workspaces through the `linkedDefinitionKey` bridge, including deep links back into the graph and across linked records
- Uses planner-authored thread lifecycle actions so world-prompt turns can create, deepen, reprioritize, resolve, park, or relink story threads without backend-invented fallback thread canon
- Uses planner-authored temporal event relationships so event chronology is stored as graph canon on `world_relationships.metadata.temporal` instead of chat order or prompt event sequence
- Maintains lightweight wiki presentation hints during prompt turns when canon naturally supports them, including loglines, synopsis text, role labels, short summaries, tone tags, and wiki section metadata
- Maintains project-wide wiki overview metadata with planner-authored `update_world_wiki_metadata` ops in the same prompt turn, storing logline, synopsis, themes, tone tags, genre, core conflict, visual motifs, and freshness fingerprints in `project_drafts.metadata.worldWiki`
- Includes wiki gap diagnostics in prompt retrieval so empty or weak wiki sections can be filled through targeted prompt turns without extra background LLM passes on every normal authoring turn
- Uses authored sequence retrieval for Story project plot and chapter prompts. Sequence units carry synopsis, dramatic question, story function, outcome, consequences, character arc deltas, open/resolved loops, and script-expansion readiness metadata.

**Architecture**:
- Retrieval-first world authoring instead of generic chat memory
- Explicit turn contract before planning:
  - `resolvedMode`
  - `resolvedIntent`
  - `resolvedFocus`
- Conservative mutation policy with immediate apply-or-answer execution
- Structured continuity memory in `world_prompt_sessions.last_context.memoryState`
- Hybrid retrieval using graph anchors, graph-local expansion, Postgres FTS, and reranking

**Capabilities**:
- Distinguishes advisory turns from graph mutations
- Auto-pivots focus when prompts abruptly shift topic
- Narrows context separately for answer, mutation, and background packets
- Persists actionable suggestions with machine-readable target metadata
- Skips risky unresolved ops with an explicit assistant note instead of creating a pending approval queue
- Stores retrieval diagnostics for debugging relevance and coherence issues

**Integration**:
- `create-world-prompt-session`
- `start-world-prompt-turn`
- `apply-world-prompt-preview`
- `approve-world-prompt-op`
- `reject-world-prompt-op`
- `refresh-world-prompt-suggestions`

**Operational Notes**:
- The graph remains the source of truth; chat history is continuity support only
- Apply paths refresh touched entities and threads from live DB state before mutating
- After manual graph edits and mutating prompt turns, the system recomputes and persists auto-managed `world_views` so the world surface stays neighborhood-first instead of collapsing into one global graph
- Linked definition records are a synced projection layer for shared identity fields; world-only narrative state such as `context`, threads, and relationships remains canonical on the world graph
- Character, content, and environment workspaces render linked world context and relationships directly from the graph instead of duplicating relationship storage into `project_definitions`
- Thread search now incorporates linked entity names and aliases for better recall
- World Prompt canon creation is LLM-authored only; deterministic logic is limited to routing, retrieval, and safety checks
- Event timeline canon is graph-native: `event` nodes carry optional display hints, event-to-event temporal relationships carry ordering metadata, and deterministic timeline derivation/validation can skip invalid or cyclic temporal links without inventing replacement chronology
- Authored sequence canon is graph-native but separate from event chronology: `sequence_unit` nodes carry chapter/progression metadata, sequence-to-sequence relationships use verbs like `precedes`, `causes`, `complicates`, and `pays_off`, and they must not use event temporal relationship metadata.
- Wiki presentation is graph-native and derived at render/retrieval time. The graph remains canonical; wiki metadata only improves display, and gap-fill buttons call the existing `start-world-prompt-turn` flow with targeted context.
- Project-wide wiki presentation is metadata-only and low-cost: the planner may update it when retrieval marks wiki context as targeted or opportunistic, while backend validation caps and merges fields without deterministically writing replacement synopsis canon.
- Thread canon is also LLM-authored during world-prompt turns; the backend validates and persists planner thread actions but does not synthesize fallback threads like `Emerging Story Thread`
- Hosted planner output is retried once if it still contains placeholder entities or unresolved descriptor-only relationship endpoints, and mutating turns fail or degrade to non-mutating behavior instead of writing deterministic fallback canon
- The live chat no longer uses preview/apply-first-wave or manual approval as the default UX; risky unresolved ops are skipped with an immediate assistant note instead of creating a pending review queue
- Suggestion records can now carry view-targeting metadata (`suggestedViewKey`, `targetRootEntityKey`, `preferredViewKind`) so clicking a suggestion can continue from a more appropriate neighborhood or thread view
- Selecting a prompt suggestion is treated as an instruction to execute that suggestion as a compact world-building step by default, unless the suggestion is explicitly plan-only
- Count-explicit seed prompts now produce planner-side entity requirements from the user text, such as requested character, faction, place, and artifact counts. Direct-build scope caps expand only for those count-explicit world-seeding turns so a prompt like “three major characters, two rival factions, one artifact” can land as one coherent first wave instead of silently staging required entities into follow-up work.
- During direct world-building, malformed `upsert_entity` ops that point at an existing entity key while carrying a different new entity name are treated as new additive entities when there is no clear same-name match. This avoids skipping simple seed-world creations as semantic rewrites while preserving approval pressure for explicit correction/replacement prompts.
- Temporary direct-apply behavior: ops annotated only as `Semantic rewrite of existing entity` are allowed to run instead of being skipped, so frustrating false positives do not drop entity creation/refinement turns. Other risky cases such as ambiguous matches, missing targets, canon-locked touches, and collapsed relationship endpoints remain skipped.
- World-prompt application now treats linked projections as an invariant for core authoring entity types: `actor` nodes must have `character` records, `place` nodes must have `environment` records, and `object` nodes must have `item` records. Prompt-created and prompt-touched entities are repaired after mutation if a linked definition is missing, and shared identity fields continue syncing through `linkedDefinitionKey`.

### UGC Psychology Agent
**Purpose**: Applies research-backed psychological principles to optimize content for viral spread and user engagement.

**Capabilities**:
- Attention capture mechanisms
- Identity protection framing
- Knowledge gap creation
- Loss aversion messaging
- Vicarious skepticism handling

**Content Optimization**:
- Hook strength analysis
- Conversion funnel design
- Platform-specific adaptation
- A/B testing recommendations

## Agent Orchestration

### Service Layer Integration
AI agents are orchestrated through GraphCore's application services:

```typescript
// Example: Prompt generation service
export const promptGenerationService = {
  generate: (request: PromptPatchRequest) =>
    graphcoreWorkspaceAdapter.proposePatch(request),
}

// Example: Visual asset service
export const visualAssetGenerationService = {
  generateConceptImage: (request) =>
    visualAssetAdapter.generateConceptImage(request),
}
```

### Multi-Agent Coordination
Complex content generation involves coordinated agent execution:

1. **Planning Phase**: UGC Psychology Agent analyzes target audience and platform
2. **Content Phase**: Prompt-to-Patch Agent creates structured content
3. **Visual Phase**: Visual Asset Agent generates accompanying imagery
4. **Cinematic Phase**: Script Agent creates video content
5. **Optimization Phase**: Psychology Agent refines for maximum engagement

### Error Handling and Recovery
- Automatic retry logic for transient failures
- Fallback strategies for unavailable providers
- Partial result recovery and continuation
- User-friendly error messaging

## Agent Capabilities Matrix

| Agent | Text Generation | Image Generation | Structured Data | UGC Optimization | Real-time Processing |
|-------|----------------|------------------|-----------------|------------------|---------------------|
| OpenAI Agent | ✅ | ❌ | ✅ | ✅ | ✅ |
| Fal.ai Agent | ❌ | ✅ | ❌ | ❌ | ❌ (async) |
| Prompt-to-Patch | ✅ | ❌ | ✅ | ✅ | ❌ |
| Visual Assets | ❌ | ✅ | ❌ | ❌ | ❌ |
| Cinematics | ✅ | ✅ | ✅ | ✅ | ❌ |
| World Building | ✅ | ✅ | ✅ | ❌ | ❌ |
| UGC Psychology | ✅ | ❌ | ✅ | ✅ | ✅ |

## Configuration and Secrets

### Environment Setup
AI agents require provider credentials stored as Supabase secrets:

```bash
# OpenAI configuration
npx supabase secrets set OPENAI_API_KEY=your_key
npx supabase secrets set OPENAI_BASE_URL=https://api.openai.com/v1

# Fal.ai configuration
npx supabase secrets set FAL_KEY=your_fal_key
```

### Model Selection
Agents support dynamic model selection based on task requirements:

- **Creative Tasks**: GPT-4 with high temperature for ideation
- **Structured Tasks**: GPT-4 with JSON schema for reliable outputs
- **Fast Tasks**: GPT-3.5 Turbo for quick iterations
- **Reasoning Tasks**: o1 models for complex planning

## Monitoring and Observability

### Usage Tracking
- Token consumption monitoring
- Request latency tracking
- Success/failure rate analysis
- Cost optimization insights

### Quality Metrics
- Content coherence scoring
- User engagement correlation
- Conversion rate tracking
- A/B test performance analysis

## Future Agent Developments

### Planned Enhancements
- **Multi-modal Agents**: Combined text + image + video generation
- **Real-time Collaboration**: Multi-user content co-creation
- **Personalization Agents**: User preference learning and adaptation
- **Quality Assurance Agents**: Automated content validation and improvement
- **Market Analysis Agents**: Competitive content analysis and optimization

### Research Areas
- Advanced prompt engineering techniques
- Cross-platform content adaptation
- Cultural context awareness
- Accessibility optimization
- Performance prediction models

## Agent Development Guidelines

### Adding New Agents
1. Define clear scope and capabilities
2. Implement proper error handling and recovery
3. Add comprehensive logging and monitoring
4. Include usage tracking and cost analysis
5. Provide fallback strategies for failures
6. Document integration patterns and APIs

### Testing Strategies
- Unit tests for agent logic
- Integration tests for provider APIs
- End-to-end tests for complete workflows
- Performance benchmarks and load testing
- Failure scenario simulation and recovery testing

## Troubleshooting

### Common Issues
- **Rate Limiting**: Implement exponential backoff and request queuing
- **Token Limits**: Chunk large requests and optimize prompt length
- **API Errors**: Provide user-friendly error messages and retry logic
- **Cost Control**: Monitor usage and implement budget limits

### Debug Tools
- Request/response logging in development
- Agent performance dashboards
- Error tracking and alerting
- Usage analytics and reporting

---

*This document is maintained alongside the GraphCore codebase. For implementation details, see the source code in `src/domain/`, `src/data/`, and `supabase/functions/`.*
