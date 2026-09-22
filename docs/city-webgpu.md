# City WebGPU renderer

## Scope

Three.js and its types are pinned to 0.186.0. City map, driving and the live building designer use an asynchronous WebGPURenderer factory. Other application canvases retain WebGLRenderer. No backend/API, building recipe, provider, migration or deployment changes.

The browser selects native WebGPU when available, otherwise Three's WebGL2 backend runs the same node materials. Use `?demo=1&cityBackend=webgl` to force compatibility rendering. Scene look displays the active backend. Localhost and HTTPS satisfy WebGPU's secure-context requirement; availability still depends on the browser and driver.

A shared pending renderer per canvas prevents overlapping Fiber configuration calls from creating competing native devices. Preview orthographic bounds are explicitly updated after asynchronous initialization. Native device loss recreates the City canvas roots on WebGL2 for the remainder of the page lifetime; the authored design lives outside the renderer and survives. A reload retries native support. Existing unrecoverable WebGL context handling remains.

## Materials and lighting

GLSL onBeforeCompile hooks and custom ShaderMaterials have been replaced with TSL/node materials for procedural surfaces, packed architectural AO, glass, triplanar colour/roughness/bump textures, sign atlases, grounding and sky. Existing instancing and instance colours remain. Quaternius standard materials are supported by Three's node renderer. Empty batches do not allocate zero-sized native uniform buffers. Frustum tests now respect each camera's WebGPU/WebGL coordinate system.

Architectural AO remains the default, with existing worker bakes and no screen-space passes. Enhanced AO lazily loads MIT-licensed three-gtvbao 0.2.1. It uses the half-resolution **No Temporal Low** denoised preset, single-sample normal/depth targets and full-resolution scene colour. AO attenuates indirect lighting rather than multiplying the final image; the enhanced contribution has a 0.55 visibility floor to avoid black glazing. Camera-dependent passes are retained separately for map and drive (at most two pipelines per canvas), and disposed when disabled. Each lit pass has a distinct MRT identity so r186 does not replace cached render objects when the AO context changes. Single-sample depth avoids native multisample binding mismatches. Real-time AO remains an opt-in GPU cost.

The native node material AO hook can affect indirect specular as well as diffuse; it is not identical to the earlier GLSL diffuse-only hook. Glass environment reflections remain canvas-local. Node materials do not run in the legacy WebGLRenderer.

## Diagnostics and verification

Canvas `data-city-backend` reports the actual backend. `data-city-render-stats` now uses per-frame draw calls (not cumulative renderer calls), triangles, resource counts and estimated GPU allocation bytes. GPU allocation is an estimate of resources tracked by Three, not total driver memory. Stats are sampled before the next frame reset.

Browser scripts accept `CITY_BROWSER_CHANNEL=msedge` for the installed browser. The bundled test Chromium on this Windows installation cannot initialize its native D3D12 device because its DXIL library fails to load; that browser exercises automatic WebGL2 fallback. Installed Edge exercises actual WebGPU. `CITY_RENDERER_RECOVERY=1` with the AO audit injects the unexpected-device-loss callback, destroys its test-owned GPU device and verifies compatibility reconstruction (Three intentionally ignores ordinary device destruction). Browser tests use fixture accounts/data, not merchant writes.

Run browser GPU checks sequentially. One early concurrent full-city test caused Intel D3D12 DXGI_ERROR_DEVICE_HUNG; a subsequent isolated full driving run passed natively with zero device losses. This is a reason to retain recovery and avoid claiming a universal speedup. Physical mobile and broad GPU/driver coverage remain unverified. Earlier 400-property WebGL benchmarks are historical and are not WebGPU performance claims.

Verified locally:

- Full TypeScript check and Vite production build; existing large-chunk and landing-image warnings only.
- Fresh development server on temporary port 5199; original 5188 server preserved.
- 26 geometry/preset tests, aperture/inset-window checks, and deterministic architectural AO/cache tests.
- Native Edge and automatic WebGL2 fallback full 72-property driving: movement, brake, look, map return/re-entry and mobile-sized controls, zero device losses in both completed runs.
- Native AO off/architectural/enhanced pixel changes, persistence and disposal; unexpected-loss injection plus destroyed test device recovered to WebGL2 and rendered enhanced AO again.
- No claims of measured WebGPU speedup, physical-mobile acceptance or complete regression coverage for other SynArc editors. Their existing renderers compile/build against the upgraded Three version.

Evidence: `output/city-webgpu-tsc.log`, `output/city-webgpu-build.log`, `output/city-webgpu-tests.log`, `output/city-webgpu-occlusion.log`, `output/webgpu-driving.log`, `output/webgpu-driving-fallback.log`, `output/webgpu-ao-native.log`, and screenshots under `output/playwright/`.


## Camera-transition regression fix

Map and driving cameras now retain their identities; switching changes the active camera rather than unmounting/recreating it. Fog is also retained and its distances updated. Instance capacities use power-of-two buckets (minimum 128), avoiding shader specialization and buffer allocation for each exact batch length while building preparation progresses. Active draw counts still match populated instances. This trades some spare instance-buffer capacity and a second AO target set for reuse; it does not cache unbounded views.

Measured sequentially on this Windows machine using installed Edge/native WebGPU, balanced quality, 1000×750, 72 demo properties and the development server:

| Measurement | Before | After |
| --- | --- | --- |
| Enhanced AO: all 72 buildings prepared | 63.1 s | 26.0 s |
| Enhanced AO: return to map, three cycles | 11.7–13.2 s | 0.38–0.77 s |
| Enhanced AO: repeat entry to drive | 9.4–10.3 s | 0.45–0.71 s |
| Enhanced AO: first entry to drive | 31.7 s | 13.0 s |
| Architectural AO after fix: return to map | — | 0.26–0.56 s |

These are individual local development runs, not universal speed guarantees. Transition time includes browser button actionability and two animation frames. Initial Enhanced AO shader preparation is still expensive; Architectural remains the default and avoids those passes. Physical mobile, production-build timing and other GPU drivers remain unmeasured.

Reproduce with `CITY_AO_MODE=screen node scripts/city-transition-profile.mjs`; `CITY_BACKEND=webgl` selects compatibility mode and `CITY_CPU_PROFILE=1` saves a DevTools CPU profile. The script checks for rendering errors and a bounded two-pipeline cache. Baseline/intermediate/final evidence is in `output/city-transition-before.log`, `output/city-transition-after.log`, `output/city-transition-final.log` and `output/city-transition-architectural.log`.

Regression verification: native Edge full-city driving and mobile-sized controls passed with zero shader errors/device losses; WebGL2 repeated transitions passed with exactly two retained AO pipelines. Architectural occlusion/cache and inset-window tests passed. Full TypeScript check and Vite production build passed (existing landing-image/large-chunk warnings only). A fresh development server on temporary port 5199 started and served the City route successfully; the original 5188 server remains running.
