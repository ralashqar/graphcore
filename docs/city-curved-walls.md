# Curved generated walls (September 2026)

Round and oval parts now take generated walls, the same as straight faces. This covers:

- free openings, arcades and doors;
- the facade rhythm;
- paint regions and bands;
- trims;
- see-through glass, the interior shell and door portals.

Before this change, `studioFaceFrame` refused the `curve` side, so the Freeform tool did nothing on a round part.

This is local studio work only. There is no schema, validator (apart from the one noted below), backend or provider change.

## Face model

An ellipse part has one curved face: `side: 'curve'`, the whole outer wall unrolled (`src/domain/cityStudioFaceCurve.ts`).

- **Face x** is the arc length along the true ellipse, not the kit's coarse facets. **Face y** is metres above the part base, as on straight faces.
- **x = 0** is at the back of the part: the parametric angle 3π/2, on the −z side.
- **x increases to the viewer's right** when looking at the wall from outside. Seen from above, that is clockwise (decreasing angle): back → west → front (+z, x = L/2) → east → back (x = L).
- **The seam** at the back is a face edge. `FREE_OPENING.edge` applies there, so an opening cannot straddle it.
- **Free-opening `u`** is x/L on curves (no flip). Kit anchors keep their own angle-based `u`.
- **Arc-length tables:** 1,024 samples per ellipse, cached by semi-axes. `curvePoint`/`curveXAt` round-trip to below 1e-6 m.

### Frame and mapping API

These are in `cityStudioFreeOpenings.ts`. They work for straight and curved faces alike.

| API | Straight faces | Curved faces |
|---|---|---|
| `studioFaceFrame(r,d,shapeId,'curve')` | – | Returns a frame with `curve: {cx,cz,a,b}` and `length` = perimeter. `origin` is the seam; `tangent`, `normal` and `rotation` describe the front. |
| `faceS(frame,x,z)` | Projection onto the tangent. | Arc length, by angle. |
| `facePose(frame,x,out)` | Position and wall rotation at face x. | Same, using the local normal. |
| `studioBayFaceSpans(frame,bay)` | – | Face-x spans of a kit bay. Chord ends map by angle, so neighbouring bays share ends exactly. A bay across the seam splits in two. |
| `faceMaxOpeningWidth(frame,x)` | ∞ | `curveMaxOpening`. |
| `freeOpeningHitFromBay`, `studioFaceRegion`, `resolveStudioFreeFace` | – | Use the helpers above, so the pointer's plane hit on a curved kit bay maps to arc x. |

`cityStudioFaceCurve.ts` also exports these, all as plain data and pure functions:

- `curveLength`, `curvePoint`, `curveNormal`, `curveTangent`, `curveXAt`, `curveTheta`/`curveXOfTheta`;
- `curveRadius`, `curveSag`, `curveRayHit`.

## Geometry

The bend is in `src/domain/cityStudioCurvedWalls.ts`.

1. `resolveStudioFreeFaces` resolves the openings in face space, with the curve width limit described under Limits.
2. `buildFaceBend` samples the arc into facets.
   - Each facet turns at most 6° at the tightest point of the ellipse and is 0.15–0.6 m long.
   - A circle therefore gets 60 facets up to about 5.7 m radius, and gentle curves get longer facets (105 at 10 m radius).
3. `buildFreeOpeningFaceGeometry` builds the face in face space.
   - It receives `breaks` (the facet lines) and `seam: true`.
   - Wall triangles are split at every facet line (`splitTrianglesAtX` in `cityStudioPaintGeometry.ts`), and so are caps.
   - Hole outlines gain a vertex wherever they cross a facet line.
   - The wall between openings is carved per vertical zone, so plain wall triangulates as short strips.
   - The seam gets no end caps.
4. `bendFreeFaceGeometry` maps every vertex into building-local x/z, with y still above the base. The wall follows the arc:

   `p(x,y,z) = C(x) + z·M(x)`

   - C is the facet polyline and M is the per-vertex miter, both interpolated within a facet.
   - For a fixed z the map is affine per facet, so each facet is planar.
   - Neighbouring facets share their edges exactly, so there are no cracks at facet joints.
   - Split points on shared edges stay collinear.
   - Holes, reveals and surrounds therefore follow the curve.
5. **Openings stay flat.**
   - The builder tags the vertices of these parts with their group: frames, glazing bars, glass, apertures, sills, mullions, door leaves, rails and handles.
   - Each group gets one plane (`FreeFacePlane`): the chord through its jambs at the glazing depth, pushed out by the group's sagitta.
   - The glazing line therefore meets the curved jamb reveals exactly at both jambs. At mid-span it sits at the normal glazing depth.
   - The reveal (the full wall thickness) covers the sagitta, so nothing pokes through either skin.
   - Surrounds follow the arc. Sills stand proud at their ends, like a straight stone sill on a round wall.
6. **Inner skin.**
   - Kit floors and roofs follow the coarse facet ring of the ellipse (`sculptPrimitiveBoundary`, 8–32 facets), which lies inside the true arc.
   - The inner half of the wall is stretched by the gap to that ring, so there is no slit above slabs or roofs.
   - Anything deeper, such as the interior shell, is translated rather than stretched.
7. **Normals.** Walls use the analytic ellipse normal interpolated across each facet, so they shade round. Flat parts use their plane's normal.

Curved `StudioFreeFace`s carry `curve` and `bend` (structured-clone safe). Their geometry and shell are already bent.

- `buildStudioDetailBatches` adds only the base height for them: it uses rotation 0 and offset `[0, base, 0]`.
- Near/far LOD, `owners`, see-through glass and far apertures are unchanged.
- Kit tiles of an owned curved face are removed exactly as for straight faces. So are blockers, the entrance and legacy tile paint, through `studioBayFaceSpans`.

## Integration

| Area | Behaviour |
|---|---|
| **Free doors** (`cityStudioFreeDoors.ts`) | These all sit on their group's plane: portals, closed-leaf blockers, landing and ramp decks, and interior clear zones. The interior shell depth on curves comes from the part's smaller diameter. The shell is bent with the wall. Ground-floor bay blockers are cut along each bay's own chord where doors cross. |
| **Trims** (`CityStudioTrimParts.tsx`) | Placements are fitted on the unrolled face. Each part is posed on the facet under it and turned to that facet's normal (`bendPose`). Parts stay rigid. |
| **Facade rhythm** (`cityStudioFacadeRhythm.ts`, minimal change) | Ellipse parts dress their `curve` face. Exposure comes from `studioBayFaceSpans`. Column widths are capped by `faceMaxOpeningWidth`. Rhythm rules may target `side: 'curve'`: this is the only validator change, it is local only, and the old rule rejected it. |
| **Paint regions** | Rectangles are in face metres. The painted outer-skin pieces are bent with the wall. `studioPaintRegionTool` maps hits by angle and ray-casts brush drags against the outer-skin ellipse. It orients the cursor to the local normal and places it on the bent wall. |
| **Freeform, Arcade and dress ghosts** (`studioFreeOpeningTool.ts`) | Ghosts face the local normal and sit proud by the chord's sagitta, so they clear the round wall. |
| **UI** | No `CityStudio.tsx` or `useStudioInteraction.ts` change was needed. |

## Limits

**Tight radii.** An opening group is one flat chord. Its chord may bow at most 0.14 m (`CURVE.sag`) and turn at most 70°. The resolver handles wider openings like this:

- narrows them and marks them `clamped`;
- or marks them inactive with "This wall curves too tightly for an opening this wide." when less than half of the requested width would remain.

Mullioned merging stops, left to right, before a group outgrows the limit.

| Radius | Widest opening |
|---|---|
| 1 m | 1.01 m |
| 1.5 m | 1.25 m |
| 2 m | 1.45 m |
| 3 m | 1.78 m |
| 3.5 m | 1.93 m |
| 5 m | 2.31 m |
| 8 m | 2.94 m |

**What stays straight:**

- Openings are planar on their chord.
- Trims (shutters, lintels, canopies) are rigid. At the ends of wide parts on tight curves they stand slightly off the wall.
- Kit parapets and terrace rails still follow the coarse 8–32-facet ring, so a round tower keeps a polygonal rail on a round wall.

**Not supported:**

- Concave curves: an ellipse *cut* into another part.
- Openings across the back seam.

**Far LOD.** The far representation draws the same facets as near. There is no coarser far ring: the outer skin is about 1.2k triangles for a 25 m round tower with 12 openings, which is small.

**Rendering cost.** Curved faces cost more than straight ones, because splitting at facets shreds long triangles. A 12-opening tower wall has about 2.3× the triangles of the same openings on a straight face of equal length, and takes 2–3× the build time.

Benchmark (8 m round tower, 3 storeys, 12 openings; Node, warm median):

| | Curved face (25.1 m, 60 facets) | Same openings, straight face of equal length |
|---|---|---|
| Resolve + build (+ bend) | about 30 ms | about 11 ms |
| Face triangles | 6,526 (wall 4,318, outer skin 2,396) | 2,874 (wall 1,074) |

The whole-tower `resolveSculpt` is about 48 ms (5 ms without openings). The merged detail batches are 6,614 triangles near and 2,548 far. In the page, the browser scene resolves in 40–55 ms (openings) and about 90 ms (rhythm on both curved parts).

## Verification

### Unit tests

`node --experimental-strip-types --test src/domain/cityStudioCurvedWalls.test.ts` has 6 tests:

- the arc-length round trip, the seam/front/viewer-right convention and uniform spacing;
- a curved frame, bay spans covering the ring, and pointer hit → placement;
- adaptive facets (chord/angle limits);
- no new open edge and none along a facet line after splitting (crack check);
- no degenerate bent triangles;
- the outer skin on the arc and area stretched by (r+t)/r;
- per-group glass that is planar and inside the wall, with its glazing line on both jamb reveals;
- tight radii: narrowed, refused and merge-limited;
- a round tower through `resolveSculpt`: kit tiles removed, a bent paint band, and detail batches in building space;
- trims oriented to the normal, a door portal on its plane, and a rhythm around a round tower with a front door and every generated opening fitting.

All `src/domain/cityStudio*.test.ts` pass, and `npx tsc --noEmit` is clean. One assertion in `cityStudioFreeOpenings.test.ts` changed: curves are now accepted, and a wrong side on an ellipse is still refused.

### Browser test

`scripts/city-studio-curved-walls-browser.mjs` needs the dev server (`CITY_TEST_ORIGIN`, default `http://localhost:5180`). Set `CITY_BACKEND=webgl` for WebGL2. It uses a round tower (4 storeys) and an oval wing (2 storeys):

1. Seeded curved openings and trims on the wing.
2. Four openings cut through **Openings → Freeform** by clicking the tower's curved wall, then one dragged along the curve.
3. A brick **Band** painted with the Paint tool.
4. A townhouse facade rhythm on both curved parts.

It writes `output/city-studio-curved-*.png`. Both backends pass with no page errors.

### Benchmark

`node --experimental-strip-types scripts/benchmark-city-curved-walls.mjs` compares a round tower (8 m diameter, 3 storeys, 12 openings) with the same openings on a straight face.
