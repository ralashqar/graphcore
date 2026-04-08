# Bundle and Runtime Contract

`GameSystemBundle` is the canonical export format.

- `manifest`
- `definitions`
- `graphs`
- `assets`
- `lookupIndices`
- `diagnostics`

Unity and Roblox adapters should remain thin import layers that translate this bundle into engine-native structures and runtime hooks without changing authored semantics.
