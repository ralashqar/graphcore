# Multi-storey exterior stairs

The Side stairs control adds `fire-escape` alongside the existing concrete/marble entrance steps. The source kit has straight repeating exterior fire-escape flights, not a helical staircase.

## Asset assembly

`Prop_FireEscape_Bottom`, `Center` and `Top` come from the CC0 Quaternius source pack. Bottom combines a ground ladder with a platform/flight. The offline exporter extracts `Prop_FireEscape_GroundAccess` below the first platform and aligns its x pivot by -0.10594368 m to the Center/Top platform pivot. The ladder adapts independently to lobby height. Repeating flights use a measured 3 m rise and a 0.125 m platform deck offset; each landing follows a resolved floor height, with a Top platform at the roof. Horizontal proportions remain consistent across modules.

The runtime pack is 9,526,332 bytes (previously 9,203,212). Existing lazy loading, shared materials and instancing remain in use; no new runtime dependency. Near/medium render the complete assembly; far omits its detail as a unit. This is exterior decoration, not a navigable or safety-certified stair system.

## Fit rules

Selecting fire escape automatically forms a supported flat side core across all storeys and adds an upper storey if needed. Podiums and setbacks on the opposite side remain. The core is tessellated against the original masses, avoiding overlapping boxes, and reserves side clearance inside the plot. Conflicting signs/slots retain their authored selections but become inactive while the stairs need that space. Turning stairs off restores the authored footprint. Projecting architectural decorations respect the reserved envelope. This does not cut new doors through every upper-floor wall.

## Verification and rollout

Geometry tests cover varying floor counts/lobby heights, exact landing elevations, one-storey/setback adaptation, reserved-plot bounds and obstacle rejection and far-detail omission. Browser checks exercise native rendering and mocked draft save/reload. Shared schema tests preserve the new value.

No migration. Shared profile validation is consumed by city-api, city-command, city-building-art, city-reconcile, city-stripe-webhook and the Fly world worker through city-campus-worker. Worker revision: 2026-09-22-city-design-3.12. Matching staging rollout is pending designated targets; production/provider spending excluded.

Demo fixtures now vary all architectural-kit groups (corners, rooflines, entrances, storefronts, compatible slate roofs, planters, rails, ornaments and rooftop units). Twelve of the default 72 buildings use fitted multi-storey stairs, including ranks 1, 9, 13, 25, 29 and 33; all 400 fixtures retain their facade coverage and plot limits.
