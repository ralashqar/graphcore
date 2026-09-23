# SynArc City kit prototype

This is a first measured, low-poly façade experiment created in Blender 5.2.2 through the `mcp-for-blender` connection. The geometry and materials are generated from `scripts/blender-city-kit-tile.py`; no third-party mesh or texture is included.

- `city-kit-prototype.blend` contains a 2 m window bay touching a 2 m solid bay, plus preview lighting and ground.
- `window-bay-a.glb` exports **only** the window tile. Its origin is at ground centre, exterior faces toward Blender `-Y`, and its installed envelope is 2 m wide × 3 m high × 0.30 m thick. The projecting sill reaches 0.28 m from the centre plane.
- `preview.png` is a rendered inspection image, not a game texture.

The wall is assembled around a genuine opening; its glass is recessed, and its connector faces remain square so adjacent bays meet without a bevel gap. This proves Blender-to-MCP-to-glTF export, not suitability for the live building generator yet. Before integrating it, test repeated runs, inside/outside corners, material batching, LOD and the game's coordinate/scale contract.
