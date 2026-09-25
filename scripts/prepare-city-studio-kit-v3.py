"""Build the versioned connected-access catalogue from the unchanged v2 kit."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = root / 'public/city/synarc-kit/v2/catalogue.json'
target = root / 'public/city/synarc-kit/v3/catalogue.json'
catalogue = json.loads(source.read_text())
catalogue['version'] = 3
catalogue['id'] = 'synarc-kit-3'

def part(ident, label, category, size, stretch=(), detail='near', collision='solid', eligibility=()):
    w, h, d = size
    return {
        'id': ident, 'category': category, 'label': label, 'size': list(size),
        'front': '+Z', 'origin': 'bottom-centre', 'opening': None,
        'stretch': list(stretch), 'channels': ['wall', 'trim', 'frame', 'door', 'glass'],
        'connectors': {
            'left': [-w/2, 0, 0], 'right': [w/2, 0, 0],
            'top': [0, h, 0], 'bottom': [0, 0, 0],
        },
        'clearance': {'size': list(size)}, 'collision': collision,
        'minDetail': detail, 'eligibility': list(eligibility),
    }

catalogue['parts'].extend([
    part('stair-stringer-left', 'Left stair edge', 'stair', (.12, 1.05, 2.4), ('y','z'), eligibility=('stair-flight',)),
    part('stair-stringer-right', 'Right stair edge', 'stair', (.12, 1.05, 2.4), ('y','z'), eligibility=('stair-flight',)),
    part('stair-return-guard', 'Stair return guard', 'stair', (1.4, 1.05, .10), ('x',), eligibility=('switchback-landing',)),
    part('stair-top-threshold', 'Upper door threshold', 'stair', (1.3, .18, .55), (), eligibility=('upper-door',)),
    part('stair-balcony-link', 'Stair to balcony link', 'stair', (1.3, .18, .9), (), eligibility=('balcony-exit',)),
    part('canopy-end-left', 'Canopy left end', 'canopy', (.25, .25, 1.2), (), eligibility=('canopy-run',)),
    part('canopy-end-right', 'Canopy right end', 'canopy', (.25, .25, 1.2), (), eligibility=('canopy-run',)),
    part('canopy-corner', 'Canopy corner', 'canopy', (1.2, .25, 1.2), (), eligibility=('canopy-corner',)),
])
assert len(catalogue['parts']) == 72
assert len({part['id'] for part in catalogue['parts']}) == 72
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(catalogue, indent=2) + '\n')
print(target)
