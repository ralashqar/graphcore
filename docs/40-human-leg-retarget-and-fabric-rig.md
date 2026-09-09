# Human leg retargeting and Fabric mannequin

The G1 adapter 1.1 preserved independent robot limb directions. Its walk averaged a wider knee stance than ankle stance on SOMA, producing inward-slanted shins. Adapter `g1-humanoid-1.2.0` retains the upper-body calibration and foot targets but solves each leg as a fixed-length two-bone chain in a pelvis-forward bend plane. Reach corrections over 2.5 cm fail. Original 1.0/1.1 recipes keep their original implementations.

After GLB export/re-import, the new recipe revision checks knee-plane error (maximum 2.5 cm) and crossing feet (maximum 5 mm), in addition to contacts, seams, finite transforms and fixed bone lengths. These limits are tied to the retarget revision and do not change prior policy behavior. This is a bounded idle/walk adapter, not a general motion/terrain solver.

## Fabric target

Inspected the three requested Fabric variants at `ece321fe728af45ad88a7c068a2c02fa50e985ba`. `base.glb` has 127 animations; `ybot.glb` has 104 skin joints including duplicates. Selected `ybot_mixamo.glb`, with 65 source skin joints and separate surface/joint meshes.

`humanoid.fabric-ybot.v1` derives its mesh, skin weights and proportions from that file. It uses the existing 77-joint canonical interface, with extra unweighted virtual joints, and has a separate immutable rig hash. Animation tracks are removed. Source/derived hashes and provenance live in `workers/game/rigs/fabric-ybot-v1/`. No source gameplay code or animation library is copied.

The source transport adds `space: fabric_ybot` with exact pinned hierarchy and rest proportions; it cannot masquerade as native inference or SOMA. The worker checks the frozen profile against the bundled mesh. Runtime procedural poses recognize the canonical rig, and baked clips carry the actual skinned mesh. Builds continue freezing rig/clip/graph revisions; old rigs and published releases are preserved.

The Animations workspace offers a MotionBricks target mannequin selector. Binding a different rig clears incompatible bindings, with an explicit UI explanation; Accept alone preserves the current actor. Paid generation remains gated. Fabric Kimodo generation is not admitted by this change: it needs a separately validated adapter. Existing Kimodo behavior is unchanged.

## Verification and review

- `node --experimental-strip-types scripts/game-humanoid-retarget-test.mjs`: four CPU-only saved-source bakes, strict source validation and post-export checks.
- Blender `workers/game/motionbricks/test_leg_retarget.py`: fixed lengths, mirrored legs, forward/backward placements and unreachable/degenerate rejection.
- MotionBricks contract tests cover distinct target revisions, exact rest proportions and rejection of converted artifacts as native inference.
- Existing gameplay suite and rollback database tests protect review, ownership and admission behavior.
- The read-only review at port 5194 includes corrected SOMA and Fabric idle/walk, front/side cameras, scrubbing and GLB downloads. Candidates remain pending user review.

Source motion is reused from the two original provider requests. No new GPU calls, reservations or accepted project bindings are made by re-baking. The $30 total setup cap remains in force and old billing reservations remain unreconciled.

Deploy affected game Edge entries and both isolated Fly game apps together. Shared world-worker modules are not changed by this implementation. Main frontend hosting still requires its destination; local build/dev verification remains the frontend deployment boundary.

## Rollout evidence

The three game Edge entries and both isolated Fly apps were deployed; worker implementation is `game-humanoid-retarget-3.5.5`. All four hosted saved-source jobs completed and registered technically valid, pending-review candidates. Repeating the Fabric walk import returned the same job and zero credit reservation.

| Target | State | Hosted job | Candidate |
| --- | --- | --- | --- |
| Fabric Y-Bot | Idle | `a110b469-7e3a-4499-bcb7-3bdb44bb1d95` | `45571138-d540-475b-9485-ab286139d613` |
| Fabric Y-Bot | Walk | `9a35bb55-e073-4c90-8a0c-4b303ff27fe8` | `3a72bc4e-0c2e-42bd-8362-329eb90ab521` |
| SOMA | Idle | `c6ace100-bca5-42c3-b70d-571186043f8c` | `31ea1b05-3a57-42e6-98fd-8c1f3c4d2efd` |
| SOMA | Walk | `af9e954b-32d8-4d7e-8f64-61464e69d029` | `8ccefff8-3770-4d8f-8bf9-e97f3978e481` |

Hosted Fabric walk: maximum knee-plane error 3.27 mm, foot crossing zero, contact error 22.1 mm, export transform error 0.00151 mm. SOMA walk: knee-plane error 3.71 mm, foot crossing zero. Front/side browser previews showed the actual skinned Fabric mannequin; no page errors. TypeScript, application/runtime builds, 30 gameplay tests, six MotionBricks contract tests, three leg-solver regressions, rollback database tests and authoring UI tests passed.

The isolated runtime fixture using the hosted Fabric clips passed all 12 browser checks, including nine idle loops, 13 walk loops, quest interactions and exact fresh-page checkpoint restoration with external origins blocked. Both frozen bindings loaded, with no runtime errors. This test does not accept candidates or change the project's active graph.
