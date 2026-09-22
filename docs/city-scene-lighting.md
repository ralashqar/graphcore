# City scene lighting and material presentation

## Controls and rendering

The map toolbar and building designer include **Scene look**. Three device-local looks are available: Miniature Daylight (default), Warm Afternoon and Soft Overcast. They share sun/hemisphere lighting, exposure, AgX colour response, a screen-space sky gradient and distance haze. Settings carry into driving; the driving interface remains free of these controls. Business recipes and saved palettes are untouched.

Quality choices:

- **Fast:** shared lighting, sky, haze and opaque reflective glass.
- **Balanced (default):** adds a single instanced batch of soft, footprint-derived ground contact marks. These are a stylised approximation, not screen-space ambient occlusion.
- **High:** adds a 1024px directional shadow map and simplified casters for at most 24 nearby properties. Rounded towers use cylindrical casters; other envelopes use floor masses. These intentionally approximate silhouettes, not every window, roof ornament or bridge opening. Caster selection follows the camera in coarse cells, including resident driving scenes. Main detailed batches receive shadows but do not cast them. Software rendering disables the sun shadow map.

A small generated environment is prefiltered once per look per canvas. Only the shared glass material samples it. This avoids live reflection cameras, transmission, downloaded HDR files, and the measured cost of sampling an environment on all masonry surfaces. Glass is an opaque, stylised reflective approximation; it does not refract or reflect other buildings dynamically. Surface textures and existing restrained bump shading remain available.

Ground marks follow existing market displacement/arrival transforms, avoid new scene interactions, and stay within the supported plot footprints. Fast mode omits their draw. The same renderer is used in editor and city. GPU resources and reflection subscriptions are canvas-scoped and disposed on unmount.

## Performance evidence

Fixture: 400 properties mixing the existing commercial designs with the six office compositions, existing streaming enabled, Windows ANGLE D3D11 on Intel UHD Graphics. Measurements are 10-second warmed runs in the existing benchmark script. Browser tests and builds were not running during the measured comparison.

| Desktop, 1440 x 960 | Previous rendering | Balanced |
|---|---:|---:|
| Resident properties | 302 | 302 |
| p95 frame time | 50 ms | 50 ms |
| Average FPS | 45.94 | 43.05 |
| Draw calls | 46 | 48 |
| Triangles | 565,106 | 565,712 |
| Textures | 7 | 8 |
| Reported JS heap | 225 MB | 212 MB |

Optional High measured 50 ms desktop p95 / 42.93 FPS and 16.7 ms small-viewport p95 / 59.78 FPS in the same fixture. Its reported main-pass draw count was 50; renderer counters are not an aggregate GPU timer for all shadow passes.

The small-viewport comparison (390 x 844, DPR 2, **same desktop GPU**) remained approximately 59–60 FPS. Heap values are coarse browser estimates, not a GPU-memory measurement. A first implementation applying environment lighting to all surfaces reached 100 ms p95 and was rejected. Reflection sampling was then restricted to glass.

Reproduce with `CITY_TEST_ORIGIN`, `CITY_DESIGN_VERSION=3` and `CITY_OFFICE_BENCHMARK=1` using `scripts/city-design-benchmark.mjs`. Set `CITY_SCENE_QUALITY=high` to measure optional shadows separately. Logs: `output/city-lighting-before.log`, `output/city-lighting-optimized.log`, `output/city-lighting-high-benchmark.log`.

## Verification and limitations

The lighting audit in `scripts/city-design-browser.mjs` uses `CITY_LIGHTING_AUDIT=1` and checks look/quality switching, persistence, no renderer errors and mobile-width controls. The existing driving test also accepts `CITY_SCENE_QUALITY=high` and checks that scene settings do not appear while driving.

No physical mobile device has been validated. High quality is opt-in and is not a promise of mobile performance. Screen-space AO now uses the optional GT-VBAO node pipeline; see [City WebGPU](city-webgpu.md). The React postprocessing wrapper remains unused because of its React/Fiber peer dependency conflict. No production deployment, backend contract, migration or provider spending is part of this frontend change.

Completed checks: `npx tsc --noEmit`, `npm run build`, fresh `npm run dev` startup on temporary port 5199, lighting browser audit against both 5188 and the fresh server, driving/browser controls in Balanced and High, and the 400-property Balanced/High benchmarks. The temporary verification server was stopped; the original 5188 server remains running. Build warnings about existing large chunks and an unresolved landing-page image remain outside this change.


## Architectural occlusion addition

The local Scene controls now expose **Off**, **Architectural — baked detail** (default), and **Enhanced — screen-space AO**. These do not alter published business recipes. Driving inherits the setting without adding controls over the game.

Architectural AO traces five deterministic short hemisphere rays against assembled procedural box, roof and custom-shell triangles in the existing background preparation worker. Boxes carry four samples per face, packed into six floats per instance; custom shells carry vertex AO. The original WebGL implementation attenuated indirect diffuse only. The WebGPU/node migration uses the standard material AO hook for indirect illumination; direct sun and unlit branding remain intact. This is low-resolution architectural shading, not a full global-illumination bake. Imported Quaternius meshes are not approximated as solid bounding boxes, and therefore do not receive a native asset bake. Neighbouring businesses do not participate.

Equivalent recipes reuse bounded content caches and object-local caches; equivalent refreshed server snapshots adopt their prepared data. Changed recipes invalidate the bake. Camera motion and local lighting changes never trigger a bake. A failed worker uses the existing main-thread fallback; that fallback can still pause briefly during a complex recipe. Preparation now includes an AO cost; the measured 400-property desktop fixture took about 7.2 seconds including navigation and initial assembly.

Enhanced now lazily loads the GT-VBAO node pipeline with half-resolution AO/denoise and full-resolution scene colour; the earlier GTAO composer has been replaced. It recreates camera-dependent passes when entering/exiting driving, disposes resources on disable, excludes invisible shadow proxies and nonphysical ground stamps, and falls back to the normal renderer on a caught rendering failure. Software/low-power scene detection leaves architectural shading in place. Enhanced is opt-in.

The final architectural run on the same Intel UHD 400-property fixture retained **48 calls / 565,712 triangles / 8 textures**, with **50 ms p95 / 35.50 average FPS** and approximately **254 MB reported JS heap**. The earlier committed balanced baseline was 50 ms / 43.05 FPS: matching p95 does not mean zero overhead. The 390 x 844 desktop-GPU viewport measured 16.7 ms p95 / 53.23 FPS; reported heap was highly variable (747 MB in that run), and is not GPU memory. Physical mobile remains unvalidated.

Reproduce with the existing benchmark and `CITY_AO_MODE=architectural` or `screen`. Logs: `output/city-ao-final-benchmark.log` and `output/city-ao-screen-benchmark.log`. AO is intentionally reversible locally through Off; no performance guarantee is made across devices.


Enhanced measured **50.1 ms p95 / 25.84 FPS**, **94 aggregate pass calls / 1,117,684 triangles / 16 textures** in the desktop fixture. The small viewport measured 49.9 ms / 39.94 FPS. Counters intentionally include all composer passes. Enhanced is best treated as an optional close-up quality setting on this GPU, not the city performance default.

Focused verification includes deterministic isolation/overhang/coplanar/glass tests and six actual commercial/curved/connected fixtures, equivalent-snapshot cache reuse and edit invalidation, editor Off/Architectural/Enhanced pixel differences and persistence/disposal, and driving movement, braking, camera return/re-entry and small-screen controls with Enhanced enabled. Renderer error checks passed in both browser flows.


Final AO checks passed: `npx tsc --noEmit`, `npm run build`, the AO geometry/cache suite, editor AO audit on the existing server and a freshly started `npm run dev` server at 5199, and Enhanced driving regression. The temporary server was stopped; the original 5188 server remains available. Existing public-manifest import warnings during development and build asset/chunk warnings are outside this change. No deployment or paid service was used.
