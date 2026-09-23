"""Validate the reproducible Blender source and the shipped runtime catalogue."""
import hashlib
import json
import struct
from pathlib import Path

root = Path(__file__).resolve().parents[1]
folder = root / "public/city/synarc-kit/v1"
manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
glb = (folder / "kit.glb").read_bytes()
source = (root / "assets/city/synarc-kit/v1/synarc-city-kit-v1.blend").read_bytes()
assert manifest["version"] == 1
assert manifest["glbSha256"] == hashlib.sha256(glb).hexdigest()
assert manifest["sourceSha256"] == hashlib.sha256(source).hexdigest()
assert glb[:4] == b"glTF"
length, kind = struct.unpack_from("<I4s", glb, 12)
assert kind == b"JSON"
scene = json.loads(glb[20:20 + length])
names = {node.get("name") for node in scene["nodes"]}
parts = manifest["parts"]
ids = {part["id"] for part in parts}
assert len(ids) == len(parts) >= 80
assert len(scene["scenes"]) == 1
assert {scene["nodes"][index]["name"] for index in scene["scenes"][0]["nodes"]} == ids
assert ids.issubset(names), ids - names
for style in manifest["styles"]:
    for part in ("wall-full", "wall-half", "wall-quarter", "window-single",
                 "window-detailed", "window-paired", "storefront-glazing",
                 "door-residential", "door-shop", "door-lobby",
                 "corner-convex", "corner-concave", "canopy-short", "canopy-long",
                 "plinth-full", "plinth-half", "plinth-corner", "cornice-centre",
                 "cornice-end", "cornice-corner", "balcony-slab", "rail-centre",
                 "buttress", "ac-unit", "wall-lamp", "vent", "sign-band"):
        assert f"{style}/{part}" in ids, f"{style}/{part}"
for part in parts:
    assert all(value > 0 for value in part["size"])
    assert part["triangles"] > 0
    assert part["triangles"] < 500, part["id"]
    assert all(part["bounds"]["min"][i] < part["bounds"]["max"][i] for i in range(3))
    assert part["front"] == "+Z"
    assert part["origin"] == "bottom-centre"
print(f"Validated {len(parts)} original parts, {sum(p['triangles'] for p in parts)} source triangles, {len(glb)}-byte GLB")
