"""Run via Blender MCP. Reuses established modules and authors the v5 extension."""
from pathlib import Path
import bpy
root=Path(CITY_STUDIO_ROOT)
previous=bpy.data.scenes.get('SynArc Studio Kit v5')
if previous:
    previous.name='Collection previous module scene'
    for obj in previous.objects:
        if obj.get('catalogue_id'):obj.name='previous/'+obj.name
code=(root/'scripts/build-city-studio-kit.py').read_text()
# Preserve the v4 archival branch; enable its measured export contract for v5.
code=code.replace("if VERSION == 4:\n    exec", "if VERSION >= 4:\n    exec")
code=code.replace("roots=[]", "exec((ROOT/'scripts/city-collection-geometry.py').read_text(), globals())\nroots=[]")
code=code.replace("if VERSION == 4 and 'nyc' in ident:","if VERSION == 5 and 'collection-' in ident:\n        build_collection(part, root)\n    elif VERSION >= 4 and 'nyc' in ident:")
code=code.replace('        if VERSION == 4:', '        if VERSION >= 4:').replace('    if VERSION == 4:points=', '    if VERSION >= 4:points=')
exec(compile(code,str(root/'scripts/build-city-studio-kit.py'),'exec'),{'CITY_STUDIO_ROOT':str(root),'CITY_STUDIO_VERSION':5,'__file__':str(root/'scripts/build-city-studio-kit.py')})
