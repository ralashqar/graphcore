# Live City building designer

The default Building Studio mode is now **3D designer**, available before creating a business. AI artwork remains a separate mode with its original generation, credit and review flow.

## Editing

Four procedural presets (modern office, stepped tower, courtyard, corner studio) share a bounded geometry recipe. Floors (1–8), footprint (12–18m), terrace setbacks (0–2m), three facade treatments, three tile materials, planting and quarter-turn orientation update immediately. Blueprint view uses the same footprint generator. Orthographic orbit, zoom, reset and plot grid work on desktop and mobile. These are procedural meshes rather than regenerated images or reconfigured Quaternius source assets.

Selecting a preset or changing a control updates the unsaved business profile and clears its active image-art path. Merely opening 3D mode does not replace image art. Save property draft persists the recipe through the existing owner/version boundary; publication still requires existing review. Applying generated art later takes precedence over any retained recipe. Nothing changes paid City Value, plot coordinates or rank.

## Rendering and data

Optional `CityProfile.buildingDesign` has `version: 1`, `blueprint`, `floors`, `width`, `setback`, `facade`, `tile`, `landscaping`, and `rotation`. The service schema rejects unknown fields, versions, enum values and out-of-range geometry. No URLs, scripts, uploaded geometry or database migration are introduced.

The editor and CityKit both use CityDesignBuildings. All visible custom buildings are combined into two instanced draws (boxes and tree crowns), with existing selection, arrival, displacement and dimming support. The world keeps its existing visible-property streaming boundary. Legacy models and image properties retain their paths. Full-height designs remain inside the 24m footprint; estate presentation uniformly scales to its existing 48m tile. Custom height is cosmetic and does not change paid tier or allocation.

## Verification and rollout

Tests cover every preset at extreme floor/width/setback bounds, distinct footprints, material/planting changes, strict API validation, real browser geometry updates, blueprint switching, mock save/reload, responsive layout and actual City rendering. TypeScript, Deno endpoint checks, production build and fresh dev startup passed. The AI artwork browser regression also passed. Existing unrelated office-manifest development and landing-atlas/chunk-size build warnings remain. Browser persistence tests use fixtures; hosted save/publication has not been verified.

The profile validator reaches the existing world worker through city-campus-worker.ts, so deploy the five importing City Edge endpoints and Fly world worker together, followed by frontend. No new provider requests are needed. The rollout remains staging-first and undeployed; no production activation or new provider spending is included. Existing hosted endpoints need this validator update before accepting `buildingDesign` drafts.
