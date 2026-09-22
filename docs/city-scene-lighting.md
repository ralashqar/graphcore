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

No physical mobile device has been validated. High quality is opt-in and is not a promise of mobile performance. Screen-space AO remains deferred: adding the tested React postprocessing wrapper encountered the repository's React/Fiber peer dependency conflict. No forced dependency upgrade or new package is included. No production deployment, backend contract, migration or provider spending is part of this frontend change.

Completed checks: `npx tsc --noEmit`, `npm run build`, fresh `npm run dev` startup on temporary port 5199, lighting browser audit against both 5188 and the fresh server, driving/browser controls in Balanced and High, and the 400-property Balanced/High benchmarks. The temporary verification server was stopped; the original 5188 server remains running. Build warnings about existing large chunks and an unresolved landing-page image remain outside this change.
