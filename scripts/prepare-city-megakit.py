"""Vendor only required CC0 dependencies; optimise exported textures after Blender.
python scripts/prepare-city-megakit.py --source PATH
blender --background --python scripts/build-city-megakit.py
python scripts/prepare-city-megakit.py --optimise
"""
import argparse, hashlib, json, pathlib, shutil
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/city/megakit/source'
OUTPUT = ROOT / 'output/city-kit'
MODELS = [
    'Street_4Lane', 'Street_4WayIntersection', 'Street_TIntersection',
    'Street_Curve_4LaneShort', 'Street_2Lane', 'Street_Curve_2Lane',
    'Street_Asphalt_6x6', 'Sidewalk_NoCurb_3m', 'Sidewalk_Straight_3m',
    'Sidewalk_Corner_Round_3m', 'Prop_Planter_Single', 'Prop_Bollard',
    'Prop_ACUnit', 'Brick_Window_Trim', 'Brick_Plain_3', 'Brick_Plain_1',
    'Metal_Window_Half', 'Metal_FirstFloor_Window', 'Metal_Plain_3',
    'Trim_FirstFloor_Window', 'Cornice_Brick_Center', 'Cornice_Metal_Center',
    'Roof_2x2', 'Floor_2x2', 'Door_1', 'DoorFrame_Trim', 'DoorFrame_Metal_Single',
    'WhiteBrick_Window', 'WhiteBrick_Plain_3', 'Marble_Window', 'Marble_Plain_3',
    'Cornice_WhiteBrick_Center', 'Cornice_Marble_Center', 'Prop_Awning',
    'Decal_DoubleYellow_Straight', 'Decal_BrokenLine_Straight', 'Decal_ArrowStraight',
    'Decal_Curve_4LaneShort_DoubleYellow', 'Decal_Curve_4LaneShort_Stripe',
]

def vendor(pack):
    folder = pack / 'Exports/glTF (Godot)'
    SOURCE.mkdir(parents=True, exist_ok=True)
    files = set()
    for name in MODELS:
        filename = name + '.gltf'
        data = json.loads((folder / filename).read_text())
        files.add(filename)
        for item in data.get('buffers', []) + data.get('images', []):
            uri = item.get('uri')
            if uri and not uri.startswith('data:'):
                if pathlib.Path(uri).name != uri:
                    raise ValueError('Unexpected external asset path: ' + uri)
                files.add(uri)
    for filename in sorted(files):
        shutil.copy2(folder / filename, SOURCE / filename)
    # Remove only obsolete files previously owned by this vendor manifest.
    previous = SOURCE.parent / 'source-manifest.json'
    if previous.exists():
        for filename in json.loads(previous.read_text())['files']:
            target = (SOURCE / filename).resolve()
            if filename not in files and target.parent == SOURCE.resolve():
                target.unlink(missing_ok=True)
    license_text = (pack / 'License_Source.txt').read_text()
    (SOURCE.parent / 'LICENSE.txt').write_text('\n'.join(line.rstrip() for line in license_text.splitlines()) + '\n')
    manifest = {'source': 'Quaternius Downtown City MegaKit Source', 'license': 'CC0-1.0',
                'models': MODELS, 'files': {f: hashlib.sha256((SOURCE/f).read_bytes()).hexdigest() for f in sorted(files)}}
    (SOURCE.parent / 'source-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print('Vendored', len(MODELS), 'models and', len(files), 'dependency files')

def optimise():
    file = OUTPUT / 'downtown.gltf'
    data = json.loads(file.read_text())
    converted = {}
    for image in data.get('images', []):
        old = image['uri']
        if old.endswith('.webp'):
            continue
        if old not in converted:
            source = OUTPUT / old
            with Image.open(source) as im:
                im.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
                target = pathlib.Path(old).with_suffix('.webp').name
                im.save(OUTPUT / target, 'WEBP', quality=88, method=6)
            converted[old] = target
        image['uri'] = converted[old]
        image['mimeType'] = 'image/webp'
    # EXT_texture_webp is required, not a falsely-labelled PNG fallback.
    for texture in data.get('textures', []):
        if 'source' in texture:
            texture.setdefault('extensions', {})['EXT_texture_webp'] = {'source': texture.pop('source')}
    for key in ['extensionsUsed', 'extensionsRequired']:
        data[key] = sorted(set(data.get(key, []) + ['EXT_texture_webp']))
    file.write_text(json.dumps(data, separators=(',', ':')) + '\n')
    # Only remove the specific generated PNGs just converted inside OUTPUT.
    for old in converted:
        target = (OUTPUT / old).resolve()
        if target.parent == OUTPUT.resolve():
            target.unlink()
    print('Runtime texture bytes:', sum(p.stat().st_size for p in OUTPUT.glob('*.webp')))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=pathlib.Path)
    parser.add_argument('--optimise', action='store_true')
    args = parser.parse_args()
    if args.source: vendor(args.source)
    if args.optimise: optimise()
