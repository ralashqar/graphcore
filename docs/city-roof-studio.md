# Connected roof studio

Open the opt-in local builder at `/city?demo=1&cityStudio=1`. Select a roof directly or choose **Roofs** with a building part selected. Existing saved studio buildings retain their previous roof resolver until **Enable roof editing** is explicitly chosen; this upgrade and all subsequent edits are undoable. New studio buildings use `roof-envelope-2`.

## Interaction

The dedicated tray offers Flat, Terrace, Gable, Hipped, Lean-to, Mansard, Half-hipped, Gambrel, Pyramidal and Conical roofs. Thumbnails are projected from the runtime resolver by `scripts/render-city-roof-thumbnails.mjs`. Mouse hover previews a roof without saving it; click commits. Touch chooses by click rather than hover.

Drag the roof-height, eave or crown handles, or use Low/Balanced/Steep and Flush/Small/Deep presets. Adjust exposes bounded rise/eave/shoulder/crown controls appropriate to the roof family. A continuous slider or world-handle gesture commits one undo entry. This part and Connected roofs scopes apply to both the tray and world handles. Connected scope follows touching/overlapping parts at the same top storey. Ridge direction, lean-to slope flip, slate/terracotta/metal finishes and colour are local part settings. Flat/terrace roofs offer open, parapet and railing boundaries.

Roof surfaces are selectable from their actual prepared face planes, including holes, rather than a transparent bounding box. Camera controls are unchanged. A taller-wall junction offers a contextual **Try a lean-to here** action.

## Geometry

`cityStudioRoofEnvelope.ts` generates planar candidate faces for each part, then resolves all roof families together. Clipping uses occupied vertical intervals, preserving lower roofs beneath elevated bridges. Courtyard cuts are applied only when their cut reaches the roof's source top. Competing roof faces resolve through height comparisons; deterministic part IDs resolve coplanar ties. Auto connect merges envelopes; End against wall preserves ownership at neighbouring footprints; Keep separate additionally leaves a narrow separation seam.

Edges are split at junction vertices before classification into eave, ridge, valley, abutment and height step. Coplanar internal edges are omitted. External gables, undersides and height steps receive closure, and a shared instanced edge batch supplies caps, gutters and wall-junction strips. These are stylised architectural finishes, not construction-grade waterproofing simulation.

Conical roofs follow elliptical parts with 32 facets. A conical choice on a rectangular part becomes a pyramidal cap with a visible explanation. Other pitched families on elliptical parts retain a documented flat treatment. Player intent remains stored.

Each roof part has its own material patch; compatible edge finishes share an instance batch. Sloped walking/camera collision is produced from the same roof planes and solid underside as rendering. Roof work remains worker-prepared and does not modify public business-profile schemas or require backend deployment.

## Reference builds

Starting ideas now includes **Gabled cafÃ© & apartments**, **L-shaped roof house**, and **Mansard courtyard**, in addition to the earlier studio examples. They exercise wall abutments, intersecting wings and roof openings.

## Verification

The focused suite contains 92 passing tests, including all ten families, outward-facing gable closure, taller-wall abutments, elevated bridges, courtyard holes across roof families, mixed-family insertion order, parameter changes, legacy preservation, sloped collision and all three references at both plot sizes. Existing sculpt, kit, land, character and worker-service tests remain in the suite.

Local browser verification used the 48 m café/apartment reference: reload retained its recipe; clicking the café roof opened the roof tray; the lean-to suggestion aligned its high edge against the taller wall; a height-handle drag changed rise from 2.40 m to 3.40 m and one Undo restored 2.40 m. Keyboard slider adjustment also undid in one step. The gable closure and roof junction were inspected visually, and the browser reported no console errors. The compact tray was checked at 1280 × 720.

Commands:

```
node --experimental-strip-types --test src/domain/cityStudioRoofs.test.ts src/domain/cityStudio.test.ts src/domain/citySculpt.test.ts src/domain/citySynarcKit.test.ts src/domain/cityLand.test.ts src/domain/cityExploration.test.ts src/features/city/citySculptPreview.test.ts src/features/city/citySculptService.test.ts
node --experimental-strip-types scripts/render-city-roof-thumbnails.mjs
npx tsc --noEmit
npx vite build
```

TypeScript checking and the production build pass, with the existing large-chunk and unresolved landing-atlas warnings.

The construction studio's existing native/compatibility performance and physical-mobile release gates still apply. Roof dormers, roof windows and chimney placement remain a separate roof-detail follow-up; this change implements roof shapes, editing and connections.
