# Connected roof studio

Open the opt-in local builder at `/city?demo=1&cityStudio=1`. Select a roof directly or choose **Roofs** with a building part selected. Existing saved studio buildings retain their previous roof resolver until **Enable roof editing** is explicitly chosen; this upgrade and all subsequent edits are undoable. New studio buildings use `roof-envelope-2`.

## Interaction

The dedicated tray offers Flat, Terrace, Gable, Hipped, Lean-to, Mansard, Half-hipped, Gambrel, Pyramidal and Conical roofs. Thumbnails are projected from the runtime resolver by `scripts/render-city-roof-thumbnails.mjs`. Mouse hover previews a roof without saving it; click commits. Touch chooses by click rather than hover.

Drag the roof-height, eave or crown handles, or use Low/Balanced/Steep and Flush/Small/Deep presets. Adjust exposes bounded rise/eave/shoulder/crown controls appropriate to the roof family. A continuous slider or world-handle gesture commits one undo entry. This part and Connected roofs scopes apply to both the tray and world handles. Connected scope follows touching/overlapping parts at the same top storey. Ridge direction, lean-to slope flip, slate/terracotta/metal finishes and colour are local part settings. Flat/terrace roofs offer open, parapet and railing boundaries.

Roof surfaces are selectable from their actual prepared face planes, including holes, rather than a transparent bounding box. Camera controls are unchanged. A taller-wall junction offers a contextual **Try a lean-to here** action.

## Geometry

`cityStudioRoofEnvelope.ts` resolves the occupied building union at each vertical interval, subtracting cuts before it clips roof solids. Each roof cell carries its own underside and top plane. Intersections can remove a whole cell, cap a roof below an elevated structure, or trim its underside at its supporting floor. Lower roofs never re-emerge through the top of an upper-storey obstruction. This prevents hidden gable/underside penetration while retaining clearance beneath bridges. Courtyard cuts reaching the source roof floor remain open above it.

Competing roof surfaces resolve into a height envelope. Auto connects slopes; End against wall terminates a selected roof at a neighbouring host footprint; Keep separate leaves a narrow separation. Connection preferences remain per roof, with the existing This part / Connected roofs scopes. The solver does not silently change roof type, pitch or storey heights. The existing lean-to suggestion remains explicit and undoable.

Edges split at junction vertices. Ridge/valley classification uses the change in slope across the edge rather than part ownership. Horizontal exposed eaves receive gutter strips; sloping gable edges receive rake trim. Abutments receive taller flashing strips with shared mitred sections at contour vertices; connected sections omit internal end caps. Valleys receive wider strips. Internal coplanar seams and trim buried against bridge undersides are suppressed. Vertical closures are clipped against neighbouring roof cells and occupied building layers, so internal fascias are omitted. Exposed gable infill inherits the part/building wall colour and texture; it does not use roof tiles. Degenerate triangles at faceted curved intersections are removed without flattening the whole roof.

Roof clipping consumes the resolved floor contours used by the walls. The shared `sculptPrimitiveBoundary` supplies the same bay-sized 8–32 facets, arc-length spacing and angular phase for curved parts; unions and courtyard holes retain those vertices. At taller-wall junctions, the cut sits outside the structural contour by half the 0.30 m kit wall depth plus 0.03 m for raised finish detail (0.18 m total). This offset follows the final union, including corners, and preserves the original facet directions. The flashing overlaps the wall face to close the narrow seam. Eave offsets also move existing facet lines without resampling the curve. Conical roofs follow these same elliptical facets. A conical choice on a rectangular part becomes a pyramidal cap with a visible explanation. Other pitched families on elliptical parts retain a documented flat treatment. Player intent remains stored.

Each roof part has its own material patch; compatible edge finishes share an instance batch. Sloped walking/camera collision is produced from the same roof planes and solid underside as rendering. Roof work remains worker-prepared and does not modify public business-profile schemas or require backend deployment.

## Reference builds

Starting ideas now includes **Gabled cafÃ© & apartments**, **L-shaped roof house**, and **Mansard courtyard**, in addition to the earlier studio examples. **Stepped roof house** and **Roof beneath bridge** add partial upper-storey and elevated-structure junctions. **Round tower roof junction** adds a curved upper-storey wall meeting a hipped roof. Together they exercise wall abutments, intersecting wings, roof openings, exact curved boundaries and overhead clearance.

## Verification

The focused suite contains 107 passing tests, including all ten families, outward-facing gable closure, taller-wall abutments, elevated bridges, courtyard holes across roof families, mixed-family insertion order, parameter changes, legacy preservation, sloped collision and all six references at both plot sizes. Existing sculpt, kit, land, character and worker-service tests remain in the suite.

Local browser verification used the 48 m café/apartment reference: reload retained its recipe; clicking the café roof opened the roof tray; the lean-to suggestion aligned its high edge against the taller wall; a height-handle drag changed rise from 2.40 m to 3.40 m and one Undo restored 2.40 m. Keyboard slider adjustment also undid in one step. The gable closure and roof junction were inspected visually, and the browser reported no console errors. The compact tray was checked at 1280 × 720.

The follow-up junction suite samples triangle vertices, edges and interiors against occupied building volumes, and checks trimmed undersides, bridge caps and suppression of roof fragments above obstructions, cut tunnels, wall-coloured infill, rake/gutter distinction, cross-part ridges, T-wing valleys, curved obstructions and repeated host moves/resizes with serialization. Browser inspection of both new starters confirmed the wall/bridge terminations and gable materials in the native renderer. The bridge example reopened after reload; raising its lower roof from 4 m to the 8 m maximum preserved the upper roof, and one Undo restored the reference. Ground/ceiling/camera queries consume the same prepared cell undersides and polygons. Full character traversal and compatibility-backend certification were not repeated in this follow-up.

The curved-boundary follow-up checks that cut edges follow parallel wall facets at the wall-tile clearance distance and remove the extra occupied area across five ellipse sizes, flat/pitched/mansard roofs, curved/rectangular unions and courtyard holes. It also verifies consistent conical eave subdivisions and shared flashing corners. Local browser inspection of the Round tower roof junction confirmed the curved termination after the thickness offset, with no console errors. Compatibility-backend and physical-device checks were not repeated.

Commands:

```
node --experimental-strip-types --test src/domain/cityStudioRoofs.test.ts src/domain/cityStudio.test.ts src/domain/citySculpt.test.ts src/domain/citySynarcKit.test.ts src/domain/cityLand.test.ts src/domain/cityExploration.test.ts src/features/city/citySculptPreview.test.ts src/features/city/citySculptService.test.ts
node --experimental-strip-types scripts/render-city-roof-thumbnails.mjs
node --experimental-strip-types scripts/benchmark-city-roof-junctions.mjs
npx tsc --noEmit
npx vite build
```

TypeScript checking and the production build pass, with the existing large-chunk and unresolved landing-atlas warnings.

The earlier junction implementation’s local 20-sample warm CPU resolver run measured p95 of 87.0 ms (café/apartments), 57.1 ms (L-shaped), 30.6 ms (courtyard), 63.5 ms (stepped house), and 98.1 ms (bridge). These exclude worker transfer, render preparation and GPU work; they are not end-to-end latency or city frame-time acceptance.

With wall-tile clearance and identical floor contours coalesced, the same warm CPU run measured p95 of 112.6 ms (café/apartments), 43.3 ms (L-shaped), 25.5 ms (courtyard), 64.7 ms (stepped house), 70.6 ms (bridge) and 35.9 ms (round tower). The six reference results remain below the 150 ms CPU preparation target; worker transfer and render latency still require separate measurement.

The construction studio's existing native/compatibility performance and physical-mobile release gates still apply. Roof dormers, roof windows and chimney placement remain a separate roof-detail follow-up; this change implements roof shapes, editing and connections.
