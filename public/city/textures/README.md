# City surface textures

Source: ambientCG, licensed CC0 1.0. https://docs.ambientcg.com/license/

See sources.json for per-asset source URLs, download URLs and source/output hashes.
Colour and roughness maps were resized from 1K JPEG to 512px WebP. No AI generation.
Reproduce with python scripts/prepare-city-textures.py (Pillow required).
Textures are seamless source materials; repeat spans in cityTexturePresets.ts are art-directed metres.

Grass presets: Grass005 (short lawn), Grass003 (natural grass), Grass004 (lush garden grass). The old Tiles074 checkerboard is retired; legacy recipes render PavingStones036. Surface maps pack height in R and roughness in G; no extra grass geometry is generated.
