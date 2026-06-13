# Spatial World Integration Workstream

Status: durable backend and environment workflow implemented; embedded splat viewer and marker tools pending
Branch: `codex/worldapps-integration`

## Objective

Add an optional spatial-world output pipeline that turns a GraphCore environment or world model into an explorable 3D representation while keeping GraphCore's structured canon, assembly graph, spatial document, navigation, and gameplay rules authoritative.

The first supported providers should be World Labs and SpAItial. The integration must remain provider-neutral so self-hosted or capture-based providers can be added later without changing the product model.

## Product Boundary

GraphCore owns:

- world canon and entity relationships
- environment definitions and assembly graphs
- rooms, anchors, connectors, navigation, and spawn semantics
- gameplay and cinematic intent
- provider-independent job and asset records

Spatial-world providers own:

- visual world synthesis
- Gaussian splat generation
- provider-specific reconstruction metadata
- optional collider generation
- provider-hosted previews when available

Generated worlds are derivative output artifacts. They must not silently mutate the canonical environment blueprint or spatial document.

## Initial User Workflows

### Environment Preview

An environment page exposes `Generate explorable world`. The request is assembled from:

- environment summary and visual identity
- project art style, palette, tone, and motifs
- current environment state such as lighting, weather, damage, or season
- concept image, world-concept image, or location reference sheet
- a compact spatial-document summary when one exists

The completed result appears in the existing 3D workspace as an immersive preview with orbit and optional walk controls.

### Cinematic Location Scouting

A cinematic scene or shot-location variant can request a spatial world for camera scouting. Saved viewpoints should reference GraphCore scene, location, spot, or coverage IDs rather than provider-local identifiers.

### Provider Bake-Off

For internal evaluation, the same normalized request can be submitted to World Labs and SpAItial. The review surface compares:

- visual fidelity and art-direction adherence
- spatial consistency and traversal quality
- collider usefulness
- generation latency and reliability
- browser memory, load time, and frame rate
- stored asset size and provider cost

## Proposed Domain Model

Create a dedicated job family instead of extending the character/item-oriented `mesh_generation_jobs` table.

### `spatial_world_generation_jobs`

Suggested fields:

- `id`, `project_id`, `draft_id`, `requested_by`
- `target_kind`: `environment`, `world_model`, or `cinematic_location`
- `target_key`
- `provider`: initially `worldlabs` or `spaitial`
- `model`
- `status`: `queued`, `submitting`, `running`, `completed`, `failed`, `cancelled`
- `provider_operation_id`, `provider_world_id`, and provider status metadata
- `input` containing the normalized provider-independent request
- `outputs` containing durable GraphCore asset keys
- `estimated_usd`, `actual_usd`, and normalized usage metadata
- worker claim, heartbeat, retry, timeout, and idempotency fields
- timestamps and structured failure diagnostics

Only one active job should exist for the same target, provider, and requested variant unless an explicit comparison run is requested.

### Spatial World Manifest

Each successful job should produce a provider-neutral manifest:

```ts
type SpatialWorldManifest = {
  version: 1
  provider: 'worldlabs' | 'spaitial' | string
  providerWorldId: string | null
  visualAssetKeys: string[]
  primarySplatAssetKey: string | null
  lodAssetKeys: string[]
  colliderMeshAssetKey: string | null
  panoramaAssetKey: string | null
  thumbnailAssetKey: string | null
  hostedPreviewUrl: string | null
  units: 'meters' | 'provider_native'
  metricScaleFactor: number | null
  groundPlaneOffset: number | null
  bounds: { min: [number, number, number]; max: [number, number, number] } | null
  generation: Record<string, unknown>
}
```

Store the manifest as structured job output and in asset metadata. Do not depend on provider URLs after job completion; downloadable outputs should be copied into GraphCore-controlled storage.

### Bindings

Extend environment and world render bindings with additive spatial-world fields:

- `spatialWorldAssetKey`
- `spatialWorldManifestAssetKey`
- `colliderMeshAssetKey`
- `spatialWorldJobId`
- `spatialWorldVariantKey`

Keep `primaryMeshAssetKey` intact for conventional GLB/GLTF rendering and export.

## Provider Adapter Contract

Provider-specific code should implement a shared server-side contract:

```ts
interface SpatialWorldProvider {
  submit(input: SpatialWorldProviderInput): Promise<SpatialWorldSubmission>
  getStatus(operationId: string): Promise<SpatialWorldProviderStatus>
  cancel(operationId: string): Promise<void>
  resolveOutputs(status: SpatialWorldProviderStatus): Promise<SpatialWorldProviderOutput[]>
}
```

The normalized input should support:

- text prompt
- one primary image
- optional multi-view images
- optional panorama or video
- requested quality tier
- deterministic GraphCore idempotency key

Provider adapters must remain in worker/server code. API keys and provider download URLs must never be exposed as durable browser state.

## Execution Architecture

Use the existing Fly world-generation worker pattern:

1. An authenticated Edge Function validates project access and inserts a queued job.
2. The Fly worker claims the job and submits it through the selected provider adapter.
3. The worker polls or handles provider callbacks, with heartbeat and retry protection.
4. Completed provider files are downloaded with bounded timeout and retry behavior.
5. Files are uploaded to `project-assets` and represented as `project_assets` rows.
6. The worker writes the spatial-world manifest and updates the target render binding.
7. Realtime/delta updates refresh the client without broad snapshot replacement.

Recommended endpoints:

- `start-spatial-world-generation`
- `get-spatial-world-generation-status`
- `cancel-spatial-world-generation`
- `compare-spatial-world-generations` for internal evaluation only

## Rendering And Processing

### Browser Runtime

Use Spark inside the existing React Three Fiber viewport for SPZ and related Gaussian-splat formats. Preserve the existing `GLTFLoader` path for conventional meshes and collider visualization.

The viewport should support three render modes:

- `mesh`
- `spatial_world`
- `hybrid`, rendering splat visuals with mesh collision/debug overlays

### PlayCanvas Tooling

Use PlayCanvas tooling selectively rather than replacing the Three.js runtime:

- SuperSplat for optional manual cleanup and inspection
- SplatTransform in worker-side processing for format conversion, decimation, LOD preparation, and collision fallback
- generated collision GLB only as navigation/physics geometry, not as the high-quality visual world

Any PlayCanvas-specific format should be normalized into the spatial-world manifest and remain replaceable.

## Canon And Spatial Alignment

Generated visuals will not reliably reproduce GraphCore's exact room and anchor topology. The MVP should therefore use a loose alignment model:

- preserve provider scale and ground-plane metadata
- retain GraphCore spatial documents separately
- support a manual or computed transform from GraphCore coordinates to provider coordinates
- render GraphCore anchors, rooms, connectors, and camera markers as overlays
- record alignment confidence and validation notes

Do not infer canonical rooms, doors, traversal links, or entity placement from a generated splat without an explicit reviewed import step.

## Delivery Phases

### Phase 0: Provider Benchmark

- create normalized request and manifest schemas
- add local fixture responses for World Labs and SpAItial
- run one exterior and one interior environment through both providers
- record quality, latency, cost, file size, collider, and browser-performance results
- select the first production provider while retaining both adapters

Exit gate: one provider produces a useful explorable result for at least three representative GraphCore environments.

### Phase 1: Durable Backend Pipeline

- add migrations, RLS, claim/heartbeat RPCs, and snapshot/delta inclusion
- implement start, status, and cancel Edge Functions
- add Fly worker execution with retries and idempotency
- download and persist all outputs into GraphCore storage
- record normalized AI usage and cost events

Exit gate: refreshes, worker restarts, retries, and cancellation cannot orphan or duplicate assets.

### Phase 2: Spatial Viewer

- integrate Spark with `ThreeSceneViewport`
- add splat, mesh, and hybrid modes
- load provider collider GLB
- add bounded walk controls and performance telemetry
- support low-resolution-first loading when provider LOD assets exist

Exit gate: target laptop hardware maintains an acceptable interactive frame rate on representative assets.

### Phase 3: Product Workflow

- add `Generate explorable world` to environment and world-model pages
- add provider/quality selection behind an internal feature flag
- show progress, retry, cancel, regenerate, and comparison states
- expose saved cinematic scouting viewpoints
- protect expensive generation with credit confirmation and quotas

### Phase 4: Spatial Alignment And Export

- align GraphCore anchors and spatial documents with generated coordinates
- add annotation and camera-placement tools
- evaluate navigation mesh generation and runtime export
- benchmark self-hosted HY-World and capture-oriented KIRI workflows

## Implemented Foundation

- Provider-neutral job, quote, manifest, variant, transform, and marker schemas
- Draft-aware RLS tables, worker claims, atomic credit reservation/enqueue, and transactional variant activation
- Signed quote preview plus start, status, cancel, and activation Edge Functions
- World Labs Marble text generation, operation polling, bounded artifact downloads, GraphCore storage, and manifest persistence
- Dedicated Fly `spatial_world` worker lanes and wake scheduling
- Full snapshot hydration and application service APIs
- Environment authoring UI for provider comparison, quality, quote confirmation, progress, cancellation, and activation
- SpAItial fails closed until a verified live API contract is available

The remaining product work is embedded Spark rendering, spatial marker/camera authoring, image/video provider input once verified, PlayCanvas optimization tooling, and benchmark telemetry.

## Configuration

Expected server-only configuration:

- `WORLDLABS_API_KEY`
- `SPAITIAL_API_KEY`
- `SPATIAL_WORLD_PROVIDER`
- `SPATIAL_WORLD_WORKER_CONCURRENCY`
- `SPATIAL_WORLD_PROVIDER_TIMEOUT_MS`
- `SPATIAL_WORLD_PROVIDER_ATTEMPTS`
- optional per-provider webhook secrets

No provider key may use a `VITE_` prefix.

## Open Decisions

- Whether `spatial_world` should become a new `asset_kind` or remain a manifest over existing generic assets.
- Whether provider comparison jobs are persisted as one grouped request or independent jobs with a shared comparison ID.
- Whether collision processing runs inside the current world worker image or a dedicated media-processing worker.
- Which splat formats are stored durably versus generated on demand.
- Maximum asset size, retention policy, and credit model for large worlds.
- Whether externally hosted preview URLs are shown at all or only used as a temporary diagnostic fallback.

## Success Metrics

- generation completion and retry success rate
- median and p95 time to first interactive preview
- stored bytes and generation cost per environment
- first-load and repeat-load latency
- average and p10 browser frame rate
- percentage of colliders suitable for basic walk navigation
- user regeneration rate and provider preference
- number of scouting viewpoints reused by cinematic outputs
