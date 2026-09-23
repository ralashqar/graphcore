# City character exploration

Local implementation of playable-character / parked-car exploration. No account, business profile, database, generation provider or deployment changes.

## Controls and session

Start using **Drive mode**. **E** exits below 1 m/s, or enters from a clear door approach within two metres while grounded. **WASD/arrows** run relative to the camera; **Shift** walks. **Space** jumps (handbrake in the car), **G** waves, **R** recovers and **Escape** returns to the map.

On foot, left- or right-drag or swipe the canvas for unrestricted horizontal orbit. Scroll, pinch or use +/- to zoom between 2.4 and 11 metres. Vertical orbit ranges from low eye level to a steep overhead view, with ground and obstacle clearance. Movement follows the rendered camera direction. Rotating the camera while stationary does not rotate the character. Camera heading, elevation and zoom persist across map returns. Touch controls provide Run movement, a held Walk modifier, and Jump.

Both actor roots and the perspective camera remain mounted. Map return pauses actors and preserves their state in the City scene's session ref, including renderer fallback reconstruction. Full reload starts a new session. The character mixer pauses while driving, in map mode or when hidden. Lost focus clears inputs, captured pointers and velocities. Existing car chase behaviour retains recentering after looking around.

## Assets

- Kay Lousberg, **KayKit Adventurers Free 2.0**, CC0: https://kaylousberg.itch.io/kaykit-adventurers
- **KayKit Character Animations Free 1.1**, CC0: https://kaylousberg.itch.io/kaykit-character-animations
- Default Ranger with quiver removed. Rogue is bundled for compatibility validation/future skin swaps and is not fetched during normal gameplay.
- All 23 Rig_Medium joints, parents, local bind transforms and inverse bind matrices match within 0.0001 across both skins and the three animation source files.
- Seven shared clips: idle, walk, run, jump start, airborne idle, landing, wave. Root tracks are removed; child-joint body motion remains. Jump-start and landing follow simulated phases.
- Common normalization: native Ranger height 2.274951 metres becomes 1.8 metres; both skins share rig scale and floor origin.
- Ranger 447,324 bytes; clips 163,036 bytes; optional Rogue 394,432 bytes. All assets are local.
- Registry: `src/domain/cityCharacter.ts`. Original licences, versions, archive and output hashes: `public/assets/city/character/`.

Run `node scripts/prepare-city-character.mjs [source-directory]` after extracting the official free archives under `output/kaykit-source`. The reproducible script checks rigs, removes weapons and bundles selected animation data. Download archives are ignored preparation intermediates. `node scripts/city-character-assets-test.mjs` checks hashes, glTF validity and bindings.

## Controller and collisions

`cityExploration.ts` layers a parked-car oriented box over the existing render-independent spatial hash. Dimensions derive from the measured normalized car in the driving profile. An AABB rejects distant walking queries before exact car-local disc sweeps. Driving excludes its own car. Camera queries include the car's sides and roof; walking excludes its footprint at every jump height. Plots remain protected, including gates, and car roofs are not walkable.

Fixed 120 Hz simulation allows at most 100 ms catch-up per render frame and interpolates display transforms. Default run is 5.5 m/s; walking is 2.2 m/s. Diagonal input is normalized. Jump height is 0.8 m with 120 ms buffering and 100 ms coyote time. Pavement uses the existing smooth height sampler. Contact response preserves tangential velocity with minimal separation. Animations follow resolved speed and waving yields to movement/jump. React state is not updated every simulation tick.

Exit checks both doors then the rear, including swept clearance. Entry requires ground contact, door proximity and an unobstructed approach. City allocation updates revalidate both actors. Recovery searches safe road positions, excluding the parked car for pedestrians.

Existing residency, streaming, reflection and bounded map/drive AO caches are retained. Successful model/clip requests are cached; failures permit explicit retry. Driving remains usable during character loading/failure.

## Initial release verification — 22 September 2026

- TypeScript and production Vite build passed. Existing large-chunk / landing-atlas build warnings and public office-manifest dev warning remain unrelated.
- Fresh temporary dev server passed the browser flow and was stopped; original port 5188 was preserved. No new browser runtime or binding errors.
- Initial 22 driving/pedestrian tests passed: safe/blocked exits, arbitrary car headings, entry obstruction, sweeps/sliding, pavement/recovery, 30/60/120 FPS fixed steps, bounded long frames, jump buffering/coyote time, emote interruption and camera roof clearance.
- All three GLBs passed hashes and glTF validation. Both skins played all seven clips without binding errors; minimum floor-contact bounds differed by less than 0.000001 native units.
- Native WebGPU and WebGL2 flows passed. WebGL2 also covered reduced motion and failed character download/retry. Narrow-viewport controls, focus loss and map restoration passed.
- Enhanced AO retained two pipelines. Ranger and clips loaded once in gameplay; Rogue only during explicit compatibility testing.

Initial performance setup: Windows desktop, i7-10875H, Intel UHD plus RTX 3080 Laptop GPU installed; Edge 153.0.4234.48 headless with D3D11, high-performance renderer preference, native WebGPU, 1000 x 750, balanced lighting and architectural AO. Runs were sequential without builds.

| 72-property workload | Frame p50 | Frame p95 | Controller/camera p95 |
|---|---:|---:|---:|
| Driving before characters | 16.7 ms | 16.8 ms | 0.2 ms |
| Driving after characters | 16.7 ms | 16.8 ms | 0.2 ms |
| Walking with Ranger | 16.7 ms | 16.8 ms | 0.2 ms |

Driving used the same timed sequence, meeting the 10% p95 target on this setup. Walking was a different camera/route workload. Final-frame snapshots: 49 calls / 168,417 triangles before; 49 / 168,605 driving after; 64 / 233,482 walking. A separate 12,000-sample 400-collider CPU test (two steps plus camera and clearance queries) measured below 0.03 ms p95.

Evidence: `output/city-drive-character-before.json`, `output/city-drive-character-after.json`, `output/city-drive-character-walking.json`; screenshots in `output/playwright/city-character-*.png`. Reproduce using `scripts/city-drive-benchmark.mjs` with Node type stripping, `CITY_BENCH_COUNT=72`, `CITY_BENCH_LABEL` and optional `CITY_BENCH_MODE=walking`. Browser script: `scripts/city-exploration-browser.mjs`; options include `CITY_BACKEND=webgl`, `CITY_CHARACTER_FAILURE=1`, `CITY_REDUCED=1`, `CITY_AO_MODE=screen`, `CITY_TEST_ORIGIN`.

## RPG controls follow-up

Running now defaults on, with Shift/Walk slowing movement. Added spherical orbit/zoom, movement relative to the displayed camera, touch pinch, left-drag orbit, pointer cleanup and persisted camera preferences. The domain suite now contains 24 combined tests, including default/modifier speed, diagonal normalization and orbit/zoom bounds. The performance table above describes the initial release, not a new benchmark of this follow-up.

Outstanding: the previous full 400-property rendered benchmark stalled during preparation; a valid before/after at that size is unavailable. The 400-collider test is not rendering acceptance. Physical mobile is untested; browser viewport/touch emulation does not substitute for physical-device validation. No production deployment.

Follow-up verification: all 24 simulation tests, TypeScript and production build passed. A fresh dev server and native WebGPU browser check passed default running, Shift walking, full orbit, wheel/keyboard zoom, emulated touch pinch and map-return camera restoration with no browser console errors. Enhanced AO retained two cached pipelines; controller/camera p95 was 0.2 ms in this browser run. Existing build chunk/landing asset and dev office-manifest warnings remain unrelated.
