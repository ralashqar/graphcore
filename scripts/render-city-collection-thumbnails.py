from pathlib import Path
CITY_STUDIO_VERSION=5
CITY_STUDIO_THUMBNAIL_IDS=[p['id'] for p in __import__('json').loads((Path(CITY_STUDIO_ROOT)/'public/city/synarc-kit/v5/catalogue.json').read_text())['parts'] if 'collection-' in p['id']]
exec(compile((Path(CITY_STUDIO_ROOT)/'scripts/render-city-studio-thumbnails.py').read_text(),'render-city-studio-thumbnails.py','exec'),globals())
