"""Assemble the v5 collection from the same placements resolved by the game."""
from pathlib import Path
root=Path(CITY_STUDIO_ROOT)
code=(root/'scripts/build-city-nyc-showcase.py').read_text().replace('synarc-kit/v4','synarc-kit/v5').replace('Kit v4','Kit v5').replace('kit-v4.blend','kit-v5.blend').replace('new-york-buildings.blend','architecture-collection.blend').replace('NYC / ','Collection / ')
code=code.replace("presets=json.loads((folder/'presets.json').read_text())", "presets=json.loads((folder/'presets.json').read_text())\nselection=globals().get('CITY_COLLECTION_IDS')\nif selection:presets=[p for p in presets if p['id'] in selection]\nfor p in presets:\n    previous=bpy.data.scenes.get('Collection / '+p['name'])\n    if previous:previous.name='Collection previous / '+p['name']")
# Runtime roof patches carry independent roof and gable finishes.
start=code.index("    vertices=preset['studio']['roof'];")
end=code.index("    bpy.ops.object.select_all(action='DESELECT');building",start)
code=code[:start]+'''    def surface(name,vertices,color):
        if not vertices:return
        mesh=bpy.data.meshes.new(name)
        mesh.from_pydata([(vertices[i],-vertices[i+2],vertices[i+1]) for i in range(0,len(vertices),3)],[],[tuple(range(i,i+3)) for i in range(0,len(vertices)//3,3)])
        mesh.materials.append(material(name,color));obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj);obj.parent=building
    for patch in preset['studio'].get('roofPatches',[]):
        surface('Roof '+patch['partId'],patch['vertices'],patch.get('color') or ('#a36745' if patch.get('finish')=='terracotta' else '#626963'))
        surface('Gable '+patch['partId'],patch.get('wallVertices',[]),patch.get('wallColor') or preset['wall'])
    surface('Foundation',preset.get('foundation',[]),'#b4aa93')
'''+code[end:]
code=code.replace("scene.render.engine='BLENDER_EEVEE';", "\n    try:scene.render.engine='BLENDER_EEVEE'\n    except TypeError:pass\n    ")
code=code.replace("scene.render.image_settings.file_format='PNG';", "scene.render.image_settings.file_format=next(i.identifier for i in scene.render.image_settings.bl_rna.properties['file_format'].enum_items if i.identifier=='PNG');")
code=code.replace('resolution_x=720','resolution_x=512').replace('resolution_y=720','resolution_y=512')
code=code.replace("height=3.8+(preset['floors']-1)*3", "height=3*preset['floors']+2")
code=code.replace("max(height+10,preset['width']*2.25)","max(height+7,preset['width']*1.8,preset['depth']*1.8)")
code=code.replace("str(source/'architecture-collection.blend'),set(scenes)","str(source/'architecture-collection.blend'),set(s for s in bpy.data.scenes if s.name.startswith('Collection / '))")
exec(compile(code,str(root/'scripts/build-city-nyc-showcase.py'),'exec'),globals())
