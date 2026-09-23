# SynArc City architectural kit v1

This is an original low-poly kit generated for GraphCore in Blender 5.2.2 through the connected Blender MCP. No Quaternius or other third-party geometry or texture is included.

The editable source is `synarc-city-kit-v1.blend`. It contains three style collections, each divided into shell, opening, edge, base and attachment collections, with a separate collection for every part. `scripts/build-city-synarc-kit.py` is the reproducible generator. Run it inside Blender, including via Blender MCP, to replace the `.blend` source and export `public/city/synarc-kit/v1/kit.glb` and the matching manifest. `scripts/check-city-synarc-kit.py` verifies hashes, IDs, measured bounds and the required part families.

The standard shell bay is 2 m wide, 3 m tall and 0.30 m thick. Solid fillers are 1 m and 0.5 m wide. Origins are at bottom centre; the runtime exterior normal is +Z. Door and window bays own a real wall opening and replace a plain bay. They are never laid over it. Detailed openings retain their native aspect ratio. Only undecorated fillers and continuous edge strips may be scaled along a wall run.

The runtime stores style, part choices and authored paint intent; it derives mesh placements from exposed walls. Curved façades keep their existing renderer until a compatible wedge kit is available. Older saved designs remain on their existing rendering path until the user opts into this kit.
