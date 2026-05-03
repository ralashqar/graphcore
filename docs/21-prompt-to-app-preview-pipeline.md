# Prompt-To-App Preview Pipeline

## Summary

GraphCore should evolve Prompt-to-App from "one prompt creates one graph" into a staged, graph-first pipeline that can produce a previewable app inside the web product. The initial App Graph remains stored in the existing world graph tables, but app generation should move through explicit readiness gates before code is generated.

The recommended target flow is:

```txt
Prompt
  -> Initial App Graph
  -> App Graph completion and readiness repair
  -> Brand atlas
  -> Screen mockups
  -> Visual decomposition and reusable assets
  -> Static clickable prototype
  -> User-approved design
  -> Code plan towers and code_file nodes
  -> Expo React Native code generation
  -> Build, repair, and sandbox preview
```

The first preview surface should be an Expo Web build rendered in a sandboxed iframe inside an iPhone-sized shell in GraphCore. Native dependencies are represented as capability nodes and mocked through adapter interfaces until real device builds are introduced.

## Current Foundation

Use the systems already in place:

- Store app graph nodes in `world_entities` and relationships in `world_relationships`.
- Store app-specific structured fields under `customProperties.app`.
- Store durable visual prompts under `metadata.visualDescription`.
- Use App Wiki sections and graph presentation helpers for app-specific node groups.
- Use `visual_generation_jobs` and the Fly worker for long-running visual generation.
- Keep initial app graph onboarding on `start-world-seed-inference` and `continue-world-seed-generation`.

Do not create a parallel graph store for v1. The graph remains the product source of truth; app-specific job tables should only store build/codegen execution state and generated files.

## Lifecycle Gates

App projects should expose a visible lifecycle state:

| Gate | Meaning | Primary output |
| --- | --- | --- |
| `Design Graph Draft` | Onboarding generated the first App Graph. | Product, flows, screens, components, data/API, capabilities, design system. |
| `Design Graph Refined` | App design graph gaps are filled and relationships are usable. | Complete screen/data/action/API/component relationships. |
| `Visual Prototype Ready` | Design artifacts and static click-through exist. | Brand atlas, screen mockups, image regions, visual specs, required assets, transitions. |
| `Implementation Plan Ready` | Approved design has implementation planning nodes. | `tower` and `code_file` graph nodes. |
| `Code Generated` | Source files are generated and stored. | Expo React Native project files. |
| `Preview Passing` | Build/export succeeded. | Sandboxed iframe preview session. |

Each gate should be derived by an app readiness checker, not by a manually toggled flag. The UI can cache the latest readiness result for display, but the graph and job outputs are the canonical inputs.

## App Graph Refinement

The initial seed pass should not try to do everything. It should generate a commercially coherent App Graph with product and UX shape:

- `app`, `persona`, `business_goal`, `feature`
- `user_flow`, `screen`, `section`, `component`
- `data_model`, `action`, `api_endpoint`, `backend_function`, `external_service`
- `capability`, `design_system`

After onboarding completes, run an iterative `Refine App Graph` pass. This pass should receive app-readiness diagnostics and a compact App Readiness Ledger, then repair missing details:

- screen `route`, `purpose`, `states`, `actions`, `dataDependencies`
- component `props`, `states`, `interactions`, `fileMapping`
- actions connected to data models and/or API endpoints
- API endpoints with `method`, `path`, `inputSchema`, `outputSchema`, and auth requirement
- capabilities with web preview, Expo Go, dev build, and production constraints
- missing relationships such as `contains`, `reads`, `writes`, `calls`, `emits`, `transitions_to`, `requires_capability`, and `styled_by`

This pass must not invent code files yet. It should make the app graph prototype-ready as a product and UX system.

## Code Plan Generation

Generate `tower` and `code_file` nodes in a dedicated pass only after `Visual Prototype Ready` and explicit user approval. This avoids overloading the first app seed pass and makes code planning repeatable from an approved design source.

Recommended tower slices:

- `project_setup`
- `navigation`
- `design_system`
- `onboarding`
- `home_loop`
- `generation_flow`
- `paywall`
- `history`
- `backend_adapters`
- `capability_mocks`
- `tests`

Each `code_file` node should include:

```ts
type AppCodeFileNodeProperties = {
  filePath: string
  ownerTower: string
  fileKind: "config" | "route" | "screen" | "component" | "hook" | "adapter" | "model" | "test" | "asset" | "docs"
  exports: string[]
  imports: string[]
  dependsOn: string[]
  implementationSummary: string
  publicInterface: Record<string, unknown>
  visualSpecRefs: string[]
  testExpectations: string[]
}
```

Code file nodes should be related with:

- `owned_by_tower` from `code_file` to `tower`
- `implemented_as` from app graph nodes to `code_file`
- `depends_on` between code files and shared contracts
- `styled_by` from screens/components to design system or visual specs
- `requires_capability` from files/screens/features to capability nodes

The base Expo file plan should come from the existing app codegen domain module, then add screen, component, data, adapter, and test files from the refined graph.

## Visual Design Pipeline

The brand atlas is the visual anchor. After onboarding or graph completion, auto-generate the brand atlas when these metadata fields exist:

- `worldWiki.brandAtlasPrompt`
- `worldWiki.artStyleDescription`
- `worldWiki.colorScheme`

For screen design, generate one visual job per route-bearing `screen`. A per-screen job is preferable to a single large grid because it improves image quality, makes regeneration targeted, and gives the vision analysis pass a clean artifact.

Each screen mockup job should receive:

- app name, logline, and product promise
- brand atlas asset key
- design system node
- screen node and route
- relevant user flow
- contained sections/components
- screen states and emotional/UX goal
- required data/actions/capabilities
- target viewport: iPhone, 390x844

Contact sheets can be generated later for review, but they must not be the implementation source of truth.

## Visual Decomposition

After a `screen_mockup` asset completes, run a vision decomposition pass. It should create `image_region` nodes and store a visual spec on the screen mockup node.

Minimum visual spec:

```ts
type AppScreenVisualSpec = {
  screenKey: string
  route: string
  sourceAssetKey: string
  viewport: { width: 390; height: 844; device: "iphone" }
  designTokensUsed: string[]
  layoutTree: Array<{
    id: string
    componentKey?: string
    role: "header" | "navigation" | "content" | "form" | "card" | "cta" | "media" | "background"
    frame: { x: number; y: number; width: number; height: number }
    style: Record<string, unknown>
    textStyle?: Record<string, unknown>
    assetRequirementKey?: string
  }>
  sharedTokenCandidates: Record<string, unknown>
  requiredAssets: Array<{
    key: string
    role: "icon" | "illustration" | "photo" | "mascot" | "background" | "texture"
    transparentBackground: boolean
    prompt: string
    targetSize: string
  }>
}
```

The decomposition pass should avoid treating the mockup image as a screenshot to embed. Its job is to convert the design into reproducible code guidance: layout frames, style tokens, typography, asset needs, and component mapping.

Reusable required assets should be generated through the visual job pipeline. Small transparent assets can be batched for efficiency, but final outputs should be split into individual `project_assets` rows.

## Static Prototype Before Codegen

Before Expo code generation, GraphCore should render a Figma-like static prototype:

- show each route-bearing screen mockup inside an iPhone shell
- use `transitions_to` relationships for navigation between screens
- use `image_region` CTA/navigation frames as clickable hotspots when available
- fall back to route/action buttons when region analysis is incomplete
- let users regenerate screen art or refine the design graph before approving the design

Approving the design writes a durable app design approval marker on the top-level `app` node. Implementation planning and code generation should use that approved visual prototype as their source, not the raw initial graph.

## App Code Generation Jobs

Add dedicated app-generation endpoints after graph and visual readiness are stable:

- `start-app-code-generation`
- `get-app-generation-status`
- `cancel-app-generation-job`
- `get-app-preview-session`

Prefer dedicated tables:

- `app_generation_jobs`
- `app_generation_job_steps`
- `app_generated_files`

Do not overload world prompt generation jobs with app build state. Keep `code_file` graph nodes as the navigable source-of-truth index, while generated file contents live in app generated file records or storage assets.

Current implementation status:

- `start-app-code-generation` enqueues an `app_generation_jobs` record and queued build steps.
- The Fly world-generation worker also runs an app-generation loop, claims queued app jobs, writes deterministic Expo-oriented source records, creates `preview/sandbox.html`, and completes/fails the job through service-role RPCs.
- `get-app-generation-status` and `get-app-preview-session` remain the stable frontend polling/session APIs.
- The next stage is to replace deterministic file synthesis with a real sandbox builder that writes a temporary Expo project, installs dependencies, runs typecheck/build/export, maps failures back to `code_file` owners, and stores the passing preview bundle.

The generated project should target:

- Expo Router
- React Native primitives
- TypeScript
- shared design tokens
- local mock backend adapter
- managed/backend adapter interface
- capability adapter interfaces
- mock providers for native or paid services
- Expo Web preview

Do not generate web-only React as the canonical source. The web preview is a target of the Expo app, not a separate implementation.

## Codegen Order

Generate shared contracts first:

- app graph type definitions
- navigation manifest
- route registry
- data models
- action contracts
- API endpoint contracts
- backend adapter interface
- capability adapter interfaces
- design tokens
- mock data

After shared contracts are locked, generate towers in parallel. Each worker receives:

- owned files
- owned graph nodes
- relevant edges
- visual specs and required asset keys
- shared contracts
- allowed file paths
- forbidden file paths
- validation expectations

Use mock adapters for RevenueCat, camera, HealthKit, push notifications, AI generation, auth, subscriptions, and payments until production integrations are explicitly configured. The graph should still preserve the real capability requirements so later export/publishing can replace mocks with production adapters.

## Build, Repair, And Preview

Builds should run in a Fly worker or dedicated sandbox builder, not in a long browser-held request.

Recommended build loop:

```txt
write files
-> npm install
-> npm run typecheck
-> npm run lint when configured
-> npx expo export --platform web
-> launch preview session
```

If build fails:

- parse the error
- map file path to `code_file`
- map `code_file` to owner tower
- run targeted repair for that tower
- repeat until passing or max repair attempts reached

When passing, publish a preview bundle/session and render it in GraphCore:

- sandboxed iframe
- iPhone-sized viewport
- iPhone border/chrome
- preview status panel
- build logs summary
- rebuild button
- regenerate from graph button

## App Wiki And Graph Split

App projects should show two conceptual surfaces while still using one graph:

### Product System

Product and implementation graph:

- app
- personas
- business goals
- features
- user flows
- screens
- sections
- components
- data models
- actions
- API endpoints
- backend functions
- external services
- capabilities
- design system
- screen mockups
- image regions
- towers
- code files

### In-App Content

Generated content used by the app:

- mascots
- collectible cards
- templates
- sample outputs
- inventory items
- timeline entries
- seed data
- content packs

Graph view should offer the same split as filters or tabs. Wiki should expose readiness and generation actions in the Product System area, while In-App Content remains focused on the app's authored content/data.

## App Wiki Actions

Add app-specific Wiki buttons:

- `Refine App Graph`: analyze readiness, fill the highest-priority graph gaps, and report whether the graph is ready for code planning.
- `Refine Design Graph`: fill product, UX, screen, component, data/API, capability, design-system, and transition gaps without creating implementation nodes.
- `Generate Code Plan`: create or repair towers and code files.
- `Generate Screen Art`: enqueue one durable `app_screen_mockup` visual job per route-bearing screen once the code plan and brand atlas are ready. Each completed job writes an image asset and a `screen_mockup` node linked to the source screen.
- `Analyze Screen Art`: run vision/layout decomposition for completed mockups, writing `screen_mockup.customProperties.app.visualSpec` and `image_region` nodes for layout frames, CSS/React Native styling, text treatment, mapped components, and required reusable assets.
- `Preview Static Flow`: open the clickable image-based prototype.
- `Approve Design For Build`: mark the current visual prototype as the implementation source.
- `Generate Implementation Plan`: create or repair towers and code files from the approved design.
- `Build Preview App`: start app code generation when implementation readiness passes.

Buttons should be gated by readiness. If a gate is missing, the button should explain the blocker and offer the most relevant prior action.

## Test Plan

Unit tests:

- app readiness checker detects missing routes, states, actions, data dependencies, API schemas, capabilities, visual specs, towers, and code files
- code plan generation creates required tower and `code_file` coverage from a refined app graph
- screen visual spec schema accepts valid decomposition output and rejects missing required layout data
- app Wiki gap/suggestion tests expose the new app actions without story language

Integration tests:

- app onboarding creates the initial graph, then automatic completion fills gaps
- brand atlas generation completes and screen mockup jobs are created from screen nodes
- visual decomposition writes `image_region` nodes and screen visual specs
- code generation creates shared contracts before tower files
- failed build maps errors back to `code_file` and tower ownership

UI tests:

- App Wiki readiness panels show correct gated actions
- preview action is disabled until graph/code-plan/visual readiness passes
- sandbox iframe renders a completed app inside the iPhone shell
- app Graph/Wiki split between Product System and In-App Content works

Verification:

```bash
npx tsc --noEmit
npm test
npm run build
npm run dev
```

## Assumptions

- Initial App Graph generation remains on the durable world seed pipeline.
- Existing world graph tables remain canonical for App Graph v1.
- Visual generation continues through `visual_generation_jobs` and Fly workers.
- App code generation gets dedicated job tables and endpoints.
- The first preview target is Expo Web in a sandbox iframe.
- Native features are mocked in preview through adapter interfaces.
- Production GitHub export, EAS builds, and App Store publishing are later phases after sandbox preview is stable.
