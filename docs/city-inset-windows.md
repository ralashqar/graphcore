# Recessed windows at every visible detail level

The city-detail office renderer used a solid outer envelope with thin glazing panels placed outside it, while its close-up renderer used true apertures. That optimisation made the same building's windows look pasted onto the wall in city/drive views.

Near and medium office geometry now use closed wall strips around apertures and glazing seated 10 cm behind the outer face. Curved footprints retain their segment orientation and mitred inner corners. Far silhouettes omit window panels altogether. Geometry remains merged and instanced; there is no runtime boolean operation.

Older version-2 and version-1 procedural buildings also use recessed glazing rather than surface-mounted glass. Version 2 partitions the wall around windows and the entrance. Version 1 keeps its ribbon composition with recessed glass, opaque corner piers and a deeper internal core. Existing authored dimensions, footprint, colours and branding remain unchanged; the requested visual correction intentionally updates their generated geometry.

Version-3 alternating opaque infill now occupies a recessed opening rather than projecting as a thin plate. Actual frame, sill, canopy and architectural trim projections remain intentional. Imported native Quaternius assemblies are unchanged; this fixes procedural geometry and its light-mode representations.

Regression coverage: every complete preset at near and medium detail, plus legacy versions, checks pane depth and casts rays through apertures to reject opaque walls or outward panels covering glazing. Existing bounded geometry, office solidity and composition checks also apply.


## Performance and verification

Medium office walls omit internal faces between adjacent wall rectangles and use explicit aperture returns; close-up walls retain their fully extruded pieces. This reduced the 400-property fixture from 928,076 to 763,940 rendered triangles. Calls stayed at 48 and textures at 8. It does not restore the solid-envelope baseline of 565,712 triangles.

On the existing Intel UHD / ANGLE D3D11 desktop fixture, the final run reported 100 ms p95 / 23.09 FPS, versus the preceding AO run's 50 ms / 35.50 FPS. Preparation was 11.3 seconds including page navigation and assembly (the initial full-extrusion attempt took 25.7 seconds). The small viewport on the same desktop GPU reported 16.8 ms / 50.50 FPS. These are individual runs, not a physical-mobile certification. Correct visible recesses take priority here; large desktop scenes still need further performance work. No broad deployment is included.

The ray-based inset test covers all complete presets at both visible detail levels and version-1/version-2 fixtures. All 26 existing design, composition and office geometry tests passed. Two legacy geometry snapshots were deliberately updated because this user-requested visual correction replaces their raised glazing without changing saved recipes.


Browser verification passed on a freshly started development server: six office presets, controls, mock save/reload, undo and mobile layout. Driving now explicitly waits for the wrapper's resident count to match prepared buildings before testing movement, braking, look-around, return/re-entry and mobile controls. The loaded 72-building scene was visually inspected; the driving test passed without renderer errors. Existing public-manifest development warnings remain unrelated. The temporary verification server was stopped; the original 5188 server remains running.


Final verification: `npx tsc --noEmit` and the production build passed. After the last residential alternating-panel centring correction, the expanded aperture test passed again, TypeScript was rerun successfully, and `npx vite build` refreshed the final bundle successfully. Existing large-chunk and landing-image build warnings remain unchanged. No deployment was performed.
