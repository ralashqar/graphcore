# City texture presets

V3 recipes optionally store textures.wall, textures.roof and textures.ground as allowlisted IDs. Omitted/none retains palette shading. Natural material colours override palette tint on selected surfaces. Glass, signs and trim retain separate materials. Wall roles currently use palette colour identity; ground uses low slab height and imported paving roles. This does not retexture city roads.

Eight CC0 ambientCG colour/roughness sets are hosted locally as 512px WebP, approximately 400KB combined. See public/city/textures/sources.json. No normal/displacement maps or live provider requests. Shared materials load selected maps lazily, use world-space triplanar mapping with mipmaps/repeat/anisotropy, and retain neutral shaded fallback until both maps load. No arbitrary texture URLs. Exported Quaternius wall/paving material roles are supported.

Branding > Surface textures provides independent wall, roof and ground selectors and swatches. Seeded demo designs exercise the collection. Palette-only remains available; existing saved recipes are unchanged. Saving reuses the existing ownership/revision/publication flow, with a matching strict server validator. No migration.

Local verification: TypeScript, build, Deno building-design schema tests, driving shader/browser checks, texture selector and mocked save/reload browser checks. Physical mobile performance and hosted publication remain unverified.

Staging rollout pending designated identifiers. Pair the frontend with affected City Edge endpoints (city-api, city-command, city-building-art, city-stripe-webhook, city-reconcile and any transitive consumers of _shared/city.ts) plus world-generation worker: city-campus-worker imports parseProfile from city.ts. Worker version city-design-3.5. No production activation or paid generation authorized/included.

Texture repeats are enlarged fourfold for street-level readability: brick repeats every 5 world metres, concrete every 12, and other materials every 8. Colour and roughness use the same scale on procedural and Quaternius surfaces; roads are unchanged.
