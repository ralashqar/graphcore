# Playful City Driving

## Implementation

The existing City driving controller now uses a fixed 120 Hz planar arcade simulation with separate longitudinal/lateral velocity, smoothed steering and yaw, lateral grip and handbrake slip. Input catch-up is capped at 100 ms; the rendered chassis interpolates previous/current simulation states. Reverse input brakes before reversing. Starting tuning is 24 m/s forward, 7 m/s reverse. Space is the handbrake, R/Recover returns to the last collision-free road-centre position, and Escape/Back to map exits. Touch equivalents remain. Recovery searches safe road centres when a city revision invalidates the saved position.

A render-independent spatial hash stores one solid box per property, using the shared plot-axis mapping and the fence's outer 11.225/24 extent. Standard 24-unit and demo 48-unit layouts are supported. Unfenced properties remain protected and gates do not permit entry. Pavilion and launch-plaza envelopes and an outer road-network boundary are included. Updates retain unchanged entries; visual residency and LOD do not affect collision. A conservative 2.3 m disc encloses the car's footprint. Exact swept disc/box faces and corner tests prevent tunnelling; up to four contact iterations preserve tangent velocity with zero restitution and 0.1 mm separation tolerance. Collision does not force the car's heading. Pavement is traversable, with a smooth visual height transition.

The same world sweeps constrain the chase camera, both before and after smoothing. Camera look-ahead includes velocity; speed adds up to 2 m follow distance and 5 degrees FOV. Right-drag look recentres after one second. Reduced motion disables variable FOV and body exaggeration and uses direct camera positioning. Camera identities, cached AO pipelines and existing resident/streamed city rendering are retained.

## Vehicle asset

Kenney Car Kit 3.1, `hatchback-sports.glb`, CC0: https://kenney.nl/assets/car-kit. The GLB and its external `Textures/colormap.png` are bundled locally with the original licence and source/hash manifest under `public/assets/city/car`. No paid downloads or provider calls. The model is normalized to 4.1 m long. Separate body and wheel nodes retain native geometry; new steering/spin pivots use measured wheel centres. The body has damped pitch/roll; wheels follow analytical pavement height. This is visual suspension, not a rigid-body or jumping vehicle.

The asset promise is preloaded when City mounts and retained between sessions. Mesh geometry and the atlas are shared; per-instance material clones use the existing canvas reflection environment. One opaque material means there is no additional glass/reflection render pass. Missing model, atlas or required movable parts retains the procedural fallback. No business schema/API, database or deployment changes.

## Verification

- Eleven simulation/collision tests: acceleration, reverse braking, handbrake stopping/slip, fixed-step consistency at 30/60/120 Hz, pavement access, continuous sliding, head-on/reverse recovery, rounded corner/high-speed sweeps, revision changes, standard/estate plot extents, camera boom, finite sustained contact and bounded long deltas.
- Native Edge browser: textured asset and four wheel nodes, movement, braking, look, keyboard recovery, map return/re-entry and mobile-sized controls; zero device losses or shader errors.
- WebGL2 with failed vehicle request and reduced motion: fallback remains driveable, recovery and controls pass. This is browser viewport emulation, not physical-mobile acceptance.
- A local 72-property 1000×750 native Edge run (balanced lighting, architectural AO, same timed input sequence) measured p95 frame time 33.6 ms before and 33.5 ms after. Driving simulation, recovery safety checks and camera collision/update measured 0.2 ms p95. Camera/route differences from the new handling change which geometry is visible; this is a gameplay workload comparison, not identical-frame GPU analysis. Source later received a conservative collider-radius adjustment and temporary-array reuse.
- An isolated 400-property collision-world benchmark (18,999 samples, two simulation steps plus camera/safety queries per sample) measured 0.058 ms p95 with nine local candidates. This validates the lightweight broad phase, not full-scene GPU performance.
- The original 400-property native baseline stalled during preparation; a valid before/after comparison and the <=10% target at that size are not established. Do not present the 72-property measurement as acceptance for 400 properties or physical mobile.

Evidence: `output/city-playful-tests.log`, `output/city-playful-textured.log`, `output/city-playful-fallback.log`, `output/city-drive-before.json`, `output/city-drive-after.json`. Run `scripts/city-drive-benchmark.mjs` with Node type stripping for fixture-backed 72/400-property workloads; `CITY_BENCH_COUNT` selects one size and `CITY_BENCH_LABEL` labels evidence. The canvas exposes `data-city-drive-performance` with a rolling p95 including camera work, and `data-city-car-details` for asset checks. These diagnostics do not update React state.

Full TypeScript check and production Vite build passed (existing large-chunk and landing-image warnings only). Fresh dev startup and City HTTP route check passed on temporary port 5199; the original 5188 server was retained. Enhanced AO repeated transition checks passed with exactly two cached pipelines and no rendering errors.

No production deployment. Traffic, damage, jumps, vehicle interiors, audio and selection remain deferred. Physical mobile and subjective handling acceptance remain separate.
