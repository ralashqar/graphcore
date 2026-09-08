# Fabric gameplay reuse review

Reviewed 8 September 2026 against Fabric commit [`ece321fe728af45ad88a7c068a2c02fa50e985ba`](https://github.com/ank1t-a404a/fabric/tree/ece321fe728af45ad88a7c068a2c02fa50e985ba) and GraphCore's current `adventure.v1` implementation. Git access succeeded; the public web fetch returned 404. This is source and test-code analysis, not a claim that Fabric's application or tests were executed. No Fabric code or assets were imported into GraphCore.

## Recommendation

Use Fabric as a reference implementation and a source of curated gameplay definitions. Build a versioned gameplay module library in GraphCore, starting with combat abilities, actor composition, semantic sockets, and simple procedural poses. Keep server-side authoring, compilation, validation and artifact publication; run interactive simulation locally in the isolated game runtime. Server-driven authoring does not require network round trips for movement or every projectile.

The immediate product should be a combat-and-traversal playground using capsules, primitives and a canonical humanoid. A prompt such as “make a mage who fires a slowing bolt, dodges sideways and climbs this ledge” should yield separate, inspectable specifications and tests before it requests any final character mesh or animation.

## What is actually in Fabric

| Area | Evidence and useful behavior | Transfer decision |
| --- | --- | --- |
| Character archetypes | `src/services/archetypePresetService.js` defines base, shooter, sword/shield, pistol, mage, mutant and zombie presets, binding model, movement profile, state templates and input map | Adapt the catalog concept; separate gameplay body/capabilities/loadout/brain from model and animation pack |
| Ability templates | `src/data/abilityTemplateCatalog.json` has 29 templates, inheritance, parameters, cooldown/cast/recovery defaults and start/end ground/air contracts. Resolver tests cover directional variants and ordered jump/aerial sequences | Curate a small supported subset into strict typed definitions; transfer useful test scenarios |
| Effect vocabulary | `abilityEffectAffordances.json` lists 45 effects and 9 macros; `abilityMacroCatalog.json` contains expansions such as dash strike, evade, summon and chained combat | Strongest candidate for adaptation. Compile bounded macros into tested primitive ops; an entry in a catalog is not proof every path works |
| Movement state machines | `movementStateMachine.js`, ops-driven generated states, `thirdPersonStates.js`, movement context and ledge graph implement transitions, priorities, sensing and hang/climb behavior | Extract algorithms and semantics behind an explicit character motor/world-query boundary; avoid wholesale template import |
| Projectiles | `src/workers/actorSimWorker.js:simulateProjectilesWorker` integrates velocity/gravity, checks swept paths against actor volumes and expanded static AABBs, selects a hit and emits results. RPG runtime adds lifetime/effect/spawn-origin behavior | Port narrowly, add nearest-hit, high-speed, thin-wall, faction, expiry and exactly-once impact tests. Existing actor test is an approximation, not a general continuous capsule sweep |
| Pose and animation affordances | Affordance catalog, pose index, macro knowledge, support-state contracts, layered animation policy and manually reviewed timing hints | Retain semantic tags and clip metadata as evidence. Do not let a selected animation decide damage or movement semantics |
| End effectors and attachments | `gameRpgRuntime.js:resolveProjectileSpawnOrigin` resolves an effector from explicit settings/timeline hints, asks a live resolver, then falls back to body offsets. Attachment specs and rig mapping contain hand/bone aliases | Preserve the fallback strategy; replace global resolver/name heuristics with versioned semantic socket contracts and explicit rig bindings |
| NPC behavior | Ability AI hints encode role, range, impact/control estimates and priorities. Runtime can request registered actions and navigation | Adapt utility hints; player and NPC must use the same ability validation/execution path |
| Engine boundaries | `src/engine/contracts/`, Babylon ports, physics backend and engine-boundary documentation show useful separation work already done | Keep a small set of ports needed by GraphCore; do not reproduce every adapter or compatibility wrapper |
| Tests | Existing tests exercise macro expansion, ability composition/support contracts, archetype resolution, hitboxes, impacts, reactions and root motion | Use as characterization scenarios when extracting. They were inspected, not run in this review |

Key source links: [ability templates](https://github.com/ank1t-a404a/fabric/blob/ece321fe728af45ad88a7c068a2c02fa50e985ba/src/data/abilityTemplateCatalog.json), [effect registry](https://github.com/ank1t-a404a/fabric/blob/ece321fe728af45ad88a7c068a2c02fa50e985ba/src/services/abilityOpRegistry.js), [state contracts](https://github.com/ank1t-a404a/fabric/blob/ece321fe728af45ad88a7c068a2c02fa50e985ba/src/services/stateMachine/contracts.md), [projectile worker](https://github.com/ank1t-a404a/fabric/blob/ece321fe728af45ad88a7c068a2c02fa50e985ba/src/workers/actorSimWorker.js), [engine boundary](https://github.com/ank1t-a404a/fabric/blob/ece321fe728af45ad88a7c068a2c02fa50e985ba/docs/engine-runtime-boundary.md).

## What should be redesigned

Fabric already contains modularization work, but important seams remain: `gameRpgRuntime.js` is 17,762 lines, the ability generator 4,846 and the template service 4,256 at this commit. Gameplay execution, animation knowledge, global maps, store mutation and generation are mixed across these services. Movement contexts expose live scene/mover objects. The state compiler constructs functions from strings; behavior runtime loads code through Blob module URLs. Generation services call providers from application-side services tied to Zustand stores. Some invalid effects are dropped with warnings. That combination makes dependency isolation and reproducible builds difficult.

GraphCore should keep its authenticated command boundary, frozen inputs, leases, revisions, usage ledger and accepted-build promotion. Generated content should select allowlisted operations and bounded parameters. Invalid required effects should fail a node with a repairable diagnostic, not silently disappear. New modules should receive typed snapshots and return commands/events, with explicit ownership of each state field.

Before transferring actual source or third-party animation/model files, record origin and reuse terms separately. No root license file was found in the inspected checkout; repository ownership and bundled asset rights should not be conflated.

## Four distinct graph meanings

1. **Composition graph:** project → actors/world/system modules → capabilities and dependencies. This is a navigable architecture view and versioned source specification.
2. **Behavior graphs:** locomotion statecharts, ability phase graphs and NPC decision graphs. Runtime cycles are legitimate, with bounded transition rules and explicit timers.
3. **Production workflow DAGs:** scoped planning → schema/semantic validation → deterministic compilation → simulation tests → preview acceptance → artifact registration. Asset and animation production are separate optional branches.
4. **World affordance graph:** surfaces, ledges, ladders, traversal links, interaction anchors and navigation regions. Loops and spatial adjacency are legitimate here too.

Do not apply the current composition dependency-cycle rejection to a statechart or navigation graph. Do not make frame-level behavior a Fly workflow. A persistent production node is warranted when the unit can be separately edited, retried, cached, validated or produce an artifact; individual simulation ticks are events, not durable jobs.

Each production node needs `nodeId`, kind and schema version; typed input references and output artifact types; implementation/model/prompt versions; input hash; owned specification paths; prerequisites; budget and retry policy; diagnostics; acceptance status; and links to source revision/run/attempt. A selected gameplay object should link to its own production run and reverse dependencies.

The current game graph exposes seven fixed systems and phase checkpoints in a coarse job. It is not yet a general independently persisted child-node executor. Add revisioned spec nodes and durable child steps incrementally; reuse existing workflow manifest conventions, but retain game execution ownership instead of grafting gameplay onto cinematic jobs.

## Gameplay module contracts

Keep four affordance namespaces distinct: actor capabilities (`canClimb`), world affordances (`climbableLedge`), action/pose requirements (`rightHandRelease`) and asset compatibility (`humanoidRigWithRightHandSocket`). Matching animation tags can suggest presentation candidates; it cannot grant an actor a capability or prove a surface is reachable.

| Contract | Required responsibility |
| --- | --- |
| `ActorArchetypeSpec` | Body proportions/collider, capabilities, stats/resources, movement profile, equipment, abilities, input or AI controller; separate optional visual binding |
| `MovementSpec` | Ground/air/hang/climb states, allowed transitions, guards, motor parameters and movement ownership |
| `AbilitySpec` | Preconditions, costs, cooldown policy, targeting, phases, interrupt/cancel rules, bounded effects and presentation requests |
| `ProjectileSpec` | Spawn socket, velocity/gravity, radius/lifetime, filtering, impact operation and collision policy |
| `WorldAffordanceSpec` | Surface/anchor IDs, geometry-relative transforms, allowed interactions, approach/clearance/reach requirements |
| `PoseIntentSpec` | Canonical key poses, timed semantic events, support/contact constraints, target frames and interpolation |
| `RigBindingSpec` | Canonical joints/sockets to actual bones, rest-pose calibration, proportions and missing-binding diagnostics |
| `BehaviorSpec` | Bounded patrol/chase/range/ability decisions driven by perception and shared action requests |
| `ScenarioTestSpec` | Initial state, seeded inputs, expected events/states, geometric tolerances and budgets |

The motor owns actor transforms; abilities request displacement and control locks; the resource/combat systems own their values; pose/animation consumes presentation requests. Use one ordered simulation clock, seeded randomness and explicit tick ordering. Stable event IDs and per-activation hit sets prevent duplicate effects. Pin physics/runtime versions and validate replay behavior rather than claiming cross-platform bitwise determinism without evidence.

Rapier is a reasonable candidate behind `CharacterMotor` and `WorldQuery` ports, given Fabric's backend and our need for shared browser/headless geometry. Its built-in controller provides move-and-slide, slopes and autostep, but custom ledge traversal still needs our state logic and geometry checks. See [official character-controller documentation](https://rapier.rs/docs/user_guides/javascript/character_controller/). Keep Babylon for rendering; no engine migration is needed.

## Pose approximation before animation production

Yes: build a procedural pose and socket layer before generative animation. Fabric already demonstrates the value of approximate end-effector offsets, but a reusable solution should be body-scaled and phase-aware.

Start with a canonical humanoid, primitive body parts, joint limits and semantic sockets such as `hand.right.cast`, `weapon.primary.muzzle`, `weapon.primary.tip`, `foot.left`, `grip.left` and `chest`. Store local position **and orientation**, parent frame, units, forward/up axes, confidence and fallback behavior. Transform them through the actor's logical pose; do not require a rendered mesh to obtain gameplay socket positions.

For each action author or plan 3–5 constrained poses: ready, anticipation, release/contact, follow-through and recovery. Use a small curated pose library, bounded joint targets, quaternion interpolation, simple two-bone arm/leg IK and explicit planted-foot/grip constraints. An LLM can select intent and constraints; it should not be trusted to produce arbitrary physically valid joint rotations. Unsupported body plans should remain explicit rather than falling back to a human skeleton silently.

Example: a mage bolt has a 0.25-second windup, a once-only release event, then recovery. At release, the simulation resolves `hand.right.cast`, checks the launch point against nearby obstacles, spawns the projectile and emits a cosmetic flash request. The placeholder hand points toward the target. Damage is applied by a projectile impact, never by the animation's completion callback. Timing is an example design value, not a recommendation imported from Fabric.

For melee, the action specifies an authoritative swept hit volume or a baked gameplay socket trajectory and active interval. Visible weapon motion is fitted to that contract. For a ledge, the motor commits only after reach, wall normal, capsule sweep and landing clearance pass; hands then solve to the grip anchors. A pose that looks like hanging is not proof the traversal is valid.

Later, approved clips or generated animations bind to these same events and sockets. Retiming and retargeting must keep contact/release timing within tolerances; mismatches fail presentation acceptance. New art must not silently alter cooldowns, damage windows, collision size or traversal reach. Keep gameplay-controlled root movement initially; animation-controlled movement requires a separately reviewed trajectory contract.

## Implementation sequence and exit criteria

1. **Versioned gameplay foundation.** Add a new template/schema version while preserving existing adventure builds. Introduce module registry, actor/resources/action contracts, simulation clock and event trace. Exit: same recorded inputs reproduce expected states/events; existing adventure tests still pass.
2. **Combat playground.** Adapt a narrow set: melee strike, bolt projectile, dash/evade and heal or shield; player mage/melee archetypes and a basic hostile actor. Add phase editing and socket debug views. Exit: costs/cooldowns, cancellation, friendly filtering, blocked shots, hit-once semantics and NPC use pass without external assets.
3. **Procedural pose laboratory.** Add canonical skeleton, sockets, key-pose constraints and frame stepping. Implement casting, striking, dodging and grip poses. Exit: correct release socket transforms across actor scale/orientation, valid joint limits, coherent contacts, and identical gameplay with visuals disabled.
4. **Traversal playground.** Add vertical level geometry, motor queries and authored affordance anchors; ground/air → approach → hang → shimmy/climb/drop. Exit: reject unreachable/blocked ledges, support loss returns to fall, climb exits are clear and combat locks cannot deadlock traversal. Defer arbitrary mesh edge inference and moving ledges until these pass.
5. **Hierarchical server generation.** Give each actor, ability, movement and world-affordance spec its own scoped planner/validation/compile/test steps. Persist child attempts and node artifacts. Exit: changing one bolt's damage reruns its dependent tests without regenerating actors, world or meshes; cancelled/stale steps cannot promote a build.
6. **Visual replacement.** Bind generated characters, approved/produced animation, weapons and VFX to accepted gameplay contracts. Exit: gameplay replay remains equivalent, rig/socket/timing validation passes and collision/geometry budgets hold.

Build server-planned typed specifications throughout; phase 5 generalizes production granularity rather than postponing server ownership. Keep the first slice narrow enough to validate before adding summoning, complex combos, vehicles, aerial archetypes and large crowds.

## Workspace changes

Expand Systems into an overview with drill-downs for Actors, Abilities and Movement. Add world-affordance overlays to Levels. Add a shared Pose & Sockets lab linked from an ability or actor, and a Tests view with event traces, state transitions, hit volumes and replay controls. Retain Assets and Build & Play. Avoid a new top-level page for every low-level subsystem.

Every selected node should offer Definition, Behavior, Generation workflow, Test results and Dependencies. Show why an action cannot run: missing socket, unsupported ability op, incompatible movement state, blocked clearance or stale dependency. Offer “Play gameplay”, “Show pose proxies” and “Use production assets” independently. Expensive visual generation should not block proving the game loop.

The first acceptance scenario should be one small obstacle arena: pick mage or melee, defeat a target, avoid an attack, climb a ledge, activate an objective, then save/reload. All of it must work with primitives. This provides a useful capability base for prompt-to-game without inheriting Fabric's full runtime.
