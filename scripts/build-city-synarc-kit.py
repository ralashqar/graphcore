"""Build the original SynArc City low-poly architectural kit in Blender 5.2.

Run from Blender's Python console (including Blender MCP):
    exec(compile(open('scripts/build-city-synarc-kit.py', encoding='utf8').read(),
                 'scripts/build-city-synarc-kit.py', 'exec'))
The file is deliberately deterministic; the .blend is an editable source, while
the GLB and measured manifest are runtime artefacts.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "city" / "synarc-kit" / "v1"
RUNTIME = ROOT / "public" / "city" / "synarc-kit" / "v1"
SOURCE.mkdir(parents=True, exist_ok=True)
RUNTIME.mkdir(parents=True, exist_ok=True)

for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
for collection in list(bpy.data.collections):
    if collection.name.startswith("KIT/"):
        bpy.data.collections.remove(collection)

scene = bpy.context.scene
scene.name = "SynArc City Kit v1"
for other_scene in list(bpy.data.scenes):
    if other_scene != scene:
        bpy.data.scenes.remove(other_scene)
scene.unit_settings.system = "METRIC"
scene.render.engine = "BLENDER_EEVEE"
bpy.context.preferences.filepaths.save_version = 0
kit_collection = bpy.data.collections.new("KIT/SynArc City v1")
scene.collection.children.link(kit_collection)
style_collections = {}
part_collections = {}


def collection_for(style, category, name):
    style_collection = style_collections.get(style)
    if style_collection is None:
        style_collection = bpy.data.collections.new(f"KIT/{style}")
        kit_collection.children.link(style_collection)
        style_collections[style] = style_collection
    key = (style, category)
    category_collection = part_collections.get(key)
    if category_collection is None:
        category_collection = bpy.data.collections.new(f"KIT/{style}/{category}")
        style_collection.children.link(category_collection)
        part_collections[key] = category_collection
    leaf = bpy.data.collections.new(f"KIT/{style}/{category}/{name}")
    category_collection.children.link(leaf)
    return leaf

STYLES = {
    "warm-brick": {
        "wall": (0.57, 0.29, 0.20), "trim": (0.78, 0.69, 0.55),
        "frame": (0.18, 0.17, 0.15), "glass": (0.10, 0.23, 0.27),
        "door": (0.27, 0.18, 0.13), "accent": (0.68, 0.43, 0.30),
    },
    "painted-townhouse": {
        "wall": (0.70, 0.70, 0.61), "trim": (0.87, 0.83, 0.71),
        "frame": (0.24, 0.30, 0.29), "glass": (0.13, 0.25, 0.29),
        "door": (0.30, 0.43, 0.37), "accent": (0.57, 0.59, 0.51),
    },
    "modern-office": {
        "wall": (0.43, 0.51, 0.52), "trim": (0.66, 0.71, 0.68),
        "frame": (0.16, 0.23, 0.25), "glass": (0.07, 0.20, 0.26),
        "door": (0.19, 0.25, 0.25), "accent": (0.29, 0.39, 0.42),
    },
}


def make_material(name, color, roughness=0.82, metallic=0.0):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return material


MATERIALS = {
    style: {
        role: make_material(
            f"kit/{style}/{role}", color,
            0.26 if role == "glass" else 0.49 if role == "frame" else 0.82,
            0.12 if role == "frame" else 0.0,
        )
        for role, color in palette.items()
    }
    for style, palette in STYLES.items()
}

parts = []
tile_objects = []


def begin(style, name, category, role, width, height, depth=0.30,
          connections=("square", "square", "square", "square"),
          opening=None, anchor=None, lod="near"):
    part_id = f"{style}/{name}"
    root = bpy.data.objects.new(part_id, None)
    collection_for(style, category, name).objects.link(root)
    root["kit_id"] = part_id
    root["kit_role"] = role
    root["kit_style"] = style
    root["kit_width_m"] = width
    root["kit_height_m"] = height
    root["kit_depth_m"] = depth
    tile_objects.append(root)
    parts.append({
        "id": part_id, "category": category, "role": role, "style": style,
        "size": [width, height, depth], "front": "+Z", "origin": "bottom-centre",
        "connections": dict(zip(("left", "right", "bottom", "top"), connections)),
        "opening": opening, "anchor": anchor, "minDetail": lod,
        "materialSlots": list(STYLES[style]), "bounds": None,
    })
    return root


def box(root, name, centre, size, style, material, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = bpy.context.object
    obj.name = name
    for existing in list(obj.users_collection):
        existing.objects.unlink(obj)
    root.users_collection[0].objects.link(obj)
    obj.parent = root
    obj.location = centre
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(MATERIALS[style][material])
    if bevel:
        modifier = obj.modifiers.new("single-bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 1
        modifier.affect = "EDGES"
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def wall_relief(root, style, sections):
    """Large, shallow relief; never bevel the square connector faces."""
    for x0, x1, z0, z1 in sections:
        if style == "warm-brick":
            for row in range(8):
                z = .19 + row * .36
                if z - .14 < z0 or z + .14 > z1:
                    continue
                for col in range(-2, 5):
                    cx = -1.06 + col * .72 + (row % 2) * .36
                    lo, hi = max(x0 + .025, cx - .34), min(x1 - .025, cx + .34)
                    if hi - lo < .16:
                        continue
                    box(root, "broad brick", ((lo + hi)/2, -.161, z),
                        (hi-lo, .022, .28), style, "accent")
        elif style == "painted-townhouse" and x1-x0 > .55 and z1-z0 > .6:
            width, height = x1-x0-.18, z1-z0-.2
            x, z = (x0+x1)/2, (z0+z1)/2
            box(root, "raised wall panel", (x, -.165, z),
                (width, .028, height), style, "accent", .008)
            box(root, "panel inset", (x, -.182, z),
                (max(.1,width-.12), .014, max(.1,height-.12)), style, "wall")
        elif style == "modern-office" and x1-x0 > .5 and z1-z0 > .6:
            x, z = (x0+x1)/2, (z0+z1)/2
            box(root, "metal wall cassette", (x, -.16, z),
                (x1-x0-.1, .025, z1-z0-.1), style, "accent", .008)


def solid_wall(style, width, suffix):
    root = begin(style, f"wall-{suffix}", "shell", "wall", width, 3)
    box(root, "closed wall", (0, 0, 1.5), (width, .30, 3), style, "wall")
    if width >= 1:
        for z in (.57, 1.43, 2.29):
            box(root, "restrained course", (0, -.158, z), (width, .016, .025), style, "accent")
    wall_relief(root,style,[(-width/2,width/2,0,3)])
    return root


def opening_wall(style, name, opening_kind, decorated=False):
    is_door = opening_kind in ("door", "shop-door", "lobby-door")
    wide = opening_kind in ("storefront", "lobby-door")
    width = 2
    left = .24 if wide else .38
    sill = .08 if is_door else .30 if wide else .78
    top = 2.65 if is_door else 2.68 if wide else 2.43
    opening_width = width - 2 * left
    root = begin(style, name, "opening", opening_kind, width, 3,
                 opening={"width": opening_width, "bottom": sill, "top": top},
                 anchor="wall-bay")
    for side in (-1, 1):
        box(root, "wall jamb", (side * (width/2-left/2), 0, 1.5),
            (left, .30, 3), style, "wall")
    if sill > 0:
        box(root, "wall below opening", (0, 0, sill/2),
            (opening_width, .30, sill), style, "wall")
    box(root, "wall above opening", (0, 0, (top+3)/2),
        (opening_width, .30, 3-top), style, "wall")
    wall_relief(root,style,[(-1,-1+left,0,3),(1-left,1,0,3),
                            (-1+left,1-left,0,sill),(-1+left,1-left,top,3)])
    pane_role = "door" if is_door else "glass"
    box(root, "recessed leaf" if is_door else "recessed glass",
        (0, .024, (sill+top)/2), (opening_width-.08, .035, top-sill-.08),
        style, pane_role)
    for side in (-1, 1):
        box(root, "frame jamb", (side * (opening_width/2-.035), -.144, (sill+top)/2),
            (.075, .055, top-sill), style, "frame")
    box(root, "frame lintel", (0, -.144, top-.035),
        (opening_width, .055, .075), style, "frame")
    if not is_door:
        box(root, "window sill", (0, -.20, sill-.025),
            (opening_width+.16, .15, .07), style, "trim", .012)
        if opening_kind in ("paired-window", "storefront"):
            box(root, "central mullion", (0, -.15, (sill+top)/2),
                (.055, .055, top-sill), style, "frame")
    else:
        box(root, "threshold", (0, -.14, sill-.035),
            (opening_width+.1, .29, .07), style, "trim")
        if opening_kind == "lobby-door":
            box(root, "double door mullion", (0, -.15, (sill+top)/2),
                (.065, .045, top-sill), style, "frame")
        else:
            box(root, "handle", (.29, -.19, 1.23), (.06, .035, .13), style, "trim")
    if decorated:
        box(root, "raised lintel", (0, -.22, top+.10),
            (opening_width+.28, .16, .12), style, "trim", .012)
        for side in (-1, 1):
            box(root, "decorative jamb", (side*(opening_width/2+.07), -.205, (sill+top)/2),
                (.11, .11, top-sill+.16), style, "trim")
    return root


def trim(style, name, role, width, shape, anchor, connections):
    root = begin(style, name, "edge" if role != "buttress" else "base", role,
                 width, shape[2], shape[1], connections, anchor=anchor)
    box(root, role, (0, shape[0], shape[2]/2),
        (width, shape[1], shape[2]), style, "trim", .012)
    return root


def attachment(style, name, role, width, height, depth, anchor, lod="near"):
    return begin(style, name, "attachment", role, width, height, depth,
                 anchor=anchor, lod=lod)


for style in STYLES:
    for width, suffix in ((2, "full"), (1, "half"), (.5, "quarter")):
        solid_wall(style, width, suffix)
    opening_wall(style, "window-single", "window")
    opening_wall(style, "window-detailed", "window", True)
    opening_wall(style, "window-paired", "paired-window")
    opening_wall(style, "storefront-glazing", "storefront")
    opening_wall(style, "door-residential", "door", True)
    opening_wall(style, "door-shop", "shop-door")
    opening_wall(style, "door-lobby", "lobby-door", True)

    for name, role, position in (("corner-convex", "corner", 0),
                                 ("corner-concave", "corner", 0),
                                 ("wall-end", "end", 0)):
        root = begin(style, name, "shell", role, .50, 3, .50,
                     (name, name, "square", "square"), anchor="wall-joint")
        box(root, "corner closure", (0, 0, 1.5), (.50, .50, 3), style, "wall")
    for name, width in (("plinth-full", 2), ("plinth-half", 1),
                        ("plinth-corner", .5),
                        ("cornice-centre", 2), ("cornice-end", .5),
                        ("cornice-corner", .5)):
        role = "plinth" if name.startswith("plinth") else "cornice"
        corner = name.endswith("corner")
        root = attachment(style, name, role, width, .22, .5 if corner else .38,
                          "base-edge" if role == "plinth" else "roof-edge", "medium")
        box(root, role, (0, -.055 if not corner else 0, .11),
            (width, .5 if corner else .38, .22), style, "trim", .01)
    root = attachment(style, "buttress", "buttress", .5, 1.2, .58, "ground-solid-wall", "medium")
    box(root, "stone foot", (0, -.22, .6), (.5, .58, 1.2), style, "trim", .015)
    root = attachment(style, "canopy-short", "canopy", 2.2, .24, 1.35, "above-door", "medium")
    box(root, "canopy slab", (0, -.72, .12), (2.2, 1.35, .24), style, "accent", .02)
    root = attachment(style, "canopy-long", "canopy", 4.2, .24, 1.35, "above-door", "medium")
    box(root, "long canopy slab", (0, -.72, .12), (4.2, 1.35, .24), style, "accent", .02)
    root = attachment(style, "entrance-column", "column", .32, 2.8, .32, "beside-door", "medium")
    box(root, "column", (0, -.24, 1.4), (.32, .32, 2.8), style, "trim", .014)
    root = attachment(style, "balcony-slab", "balcony", 2, .18, 1.2, "under-upper-window", "medium")
    box(root, "slab", (0, -.76, .09), (2, 1.2, .18), style, "trim", .01)
    for name, width in (("rail-centre", 2), ("rail-end", .22), ("rail-corner", .22)):
        root = attachment(style, name, "rail", width, 1.05, .12, "balcony-or-plot-edge", "medium")
        box(root, "top rail", (0, -.05, 1.01), (width, .12, .08), style, "frame")
        for x in (-width/2+.08, width/2-.08) if width > .5 else (0,):
            box(root, "rail post", (x, -.05, .51), (.065, .08, 1.02), style, "frame")
    for name, role, dims in (("ac-unit", "ac", (.72,.42,.48)),
                             ("wall-lamp", "lamp", (.2,.22,.36)),
                             ("vent", "vent", (.48,.08,.38)),
                             ("sign-band", "sign", (2,.15,.42))):
        w, depth, height = dims
        root = attachment(style, name, role, w, height, depth, "solid-wall", "near")
        box(root, role, (0, -depth/2-.15, height/2),
            (w, depth, height), style, "frame" if role != "sign" else "trim", .012)


for root, part in zip(tile_objects, parts):
    # Dimensions are recorded from evaluated child meshes, not author estimates.
    bpy.context.view_layer.update()
    points = []
    triangles = 0
    for child in root.children:
        if child.type != "MESH":
            continue
        triangles += sum(len(poly.vertices)-2 for poly in child.data.polygons)
        for corner in child.bound_box:
            p = child.matrix_world @ Vector(corner)
            points.append((p.x, p.y, p.z))
    blender_bounds = [
        [min(p[i] for p in points), max(p[i] for p in points)] for i in range(3)
    ]
    part["meshBoundsBlender"] = blender_bounds
    part["bounds"] = {
        "min": [blender_bounds[0][0], blender_bounds[2][0], -blender_bounds[1][1]],
        "max": [blender_bounds[0][1], blender_bounds[2][1], -blender_bounds[1][0]],
    }
    part["triangles"] = triangles

manifest = {
    "version": 1, "module": {"width": 2, "height": 3, "thickness": .30,
                              "fillWidths": [1, .5], "groundHeightBand": [0, 1.5]},
    "coordinateSystem": {"blenderFront": "-Y", "runtimeFront": "+Z", "up": "+Y"},
    "styles": list(STYLES), "parts": parts,
}

source_file = SOURCE / "synarc-city-kit-v1.blend"
bpy.ops.wm.save_as_mainfile(filepath=str(source_file))
for obj in bpy.context.selected_objects:
    obj.select_set(False)
for root in tile_objects:
    root.select_set(True)
    for child in root.children:
        child.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(RUNTIME / "kit.glb"), export_format="GLB",
                          use_selection=True, export_apply=True)
manifest["sourceSha256"] = hashlib.sha256(source_file.read_bytes()).hexdigest()
manifest["glbSha256"] = hashlib.sha256((RUNTIME / "kit.glb").read_bytes()).hexdigest()
(RUNTIME / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
(SOURCE / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print("SYNARC_KIT_EXPORTED", len(parts), source_file, RUNTIME / "kit.glb")
