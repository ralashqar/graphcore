"""Resolve a bounded Unity prefab selection without copying vendor source into Git.
Requires Python PyYAML. Original Unity files are read-only inputs.
"""
import argparse,hashlib,json,pathlib,re
import yaml
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'output/megacity-showcase';OUT.mkdir(parents=True,exist_ok=True)
SELECTION=[('commercial-01','Corner shop','Buildings/SM_Buildings_Commercial_01.prefab',1),('commercial-04','Compact retail','Buildings/SM_Buildings_Commercial_04.prefab',1),('commercial-10','Small storefront','Buildings/SM_Buildings_Commercial_10.prefab',1),('commercial-18','Candy kiosk','Buildings/SM_Buildings_Commercial_18.prefab',3),('bank','Civic landmark','Buildings/SM_Buildings_Bank.prefab',4),('decor-01','Air-conditioning unit','BuildingsDecor/SM_BuildingsDecor_01.prefab',None),('decor-02','Wall vent','BuildingsDecor/SM_BuildingsDecor_02.prefab',None),('decor-03','Roof vent','BuildingsDecor/SM_BuildingsDecor_03.prefab',None)]
def documents(path):
 text=path.read_text(encoding='utf-8-sig'); chunks=re.split(r'^--- !u!\d+ &(-?\d+)[^\n]*\n',text,flags=re.M)
 return {int(chunks[i]):yaml.safe_load(chunks[i+1]) for i in range(1,len(chunks),2)}
def main(pack):
 guids={}
 for meta in pack.rglob('*.meta'):
  match=re.search(r'^guid: (\w+)',meta.read_text(encoding='utf-8-sig'),re.M)
  if match:guids[match[1]]=meta.with_suffix('')
 sources={};materials={}
 def source(path):
  sources[str(path.relative_to(pack))]=hashlib.sha256(path.read_bytes()).hexdigest();return str(path)
 def resolve(guid):
  if guid not in guids:raise ValueError('Unresolved Unity GUID: '+guid)
  source(guids[guid]);source(pathlib.Path(str(guids[guid])+'.meta'));return guids[guid]
 def material(guid):
  if guid in materials:return guid
  data=next(d['Material'] for d in documents(resolve(guid)).values() if 'Material' in d)
  props=data['m_SavedProperties']; tex={k:v for d in props['m_TexEnvs'] for k,v in d.items()}; colors={k:v for d in props['m_Colors'] for k,v in d.items()}
  texture=next((tex[k] for k in ['_BaseMap','_MainTex','_BaseColorMap'] if tex.get(k,{}).get('m_Texture',{}).get('guid')),None)
  color=colors.get('_BaseColor',colors.get('_Color',{'r':1,'g':1,'b':1,'a':1}))
  materials[guid]={'name':data['m_Name'],'color':[color.get(k,1) for k in ['r','g','b','a']], 'texture':source(resolve(texture['m_Texture']['guid'])) if texture else None,'scale':texture.get('m_Scale') if texture else None,'offset':texture.get('m_Offset') if texture else None}
  return guid
 assets=[]
 for key,label,relative,tier in SELECTION:
  path=pack/'Prefabs'/relative;source(path);docs=documents(path)
  if any('PrefabInstance' in d for d in docs.values()):raise ValueError('Nested prefab needs explicit resolution: '+relative)
  transforms={i:d['Transform'] for i,d in docs.items() if 'Transform' in d}
  by_game={t['m_GameObject']['fileID']:(i,t) for i,t in transforms.items()}
  renderers={d['MeshRenderer']['m_GameObject']['fileID']:d['MeshRenderer'] for d in docs.values() if 'MeshRenderer' in d}
  nodes=[]
  for d in docs.values():
   if 'MeshFilter' not in d:continue
   mf=d['MeshFilter'];game=mf['m_GameObject']['fileID'];renderer=renderers[game]
   if not renderer.get('m_Enabled',1) or not docs[game]['GameObject'].get('m_IsActive',1):continue
   tid,t=by_game[game];chain=[];cursor=tid
   while cursor:
    tr=transforms[cursor];chain.insert(0,{k:tr[k] for k in ['m_LocalPosition','m_LocalRotation','m_LocalScale']});cursor=tr['m_Father']['fileID']
   # Scene placement on the root does not belong in a reusable preset.
   chain[0]['m_LocalPosition']={'x':0,'y':0,'z':0};chain[0]['m_LocalRotation']={'x':0,'y':0,'z':0,'w':1}
   fbx=resolve(mf['m_Mesh']['guid']); importer=yaml.safe_load(pathlib.Path(str(fbx)+'.meta').read_text())['ModelImporter']
   if importer.get('meshes',{}).get('globalScale',1)!=1 or not importer.get('meshes',{}).get('useFileUnits',1):raise ValueError('Review custom Unity scale before conversion: '+str(fbx))
   nodes.append({'name':docs[game]['GameObject']['m_Name'],'fbx':source(resolve(mf['m_Mesh']['guid'])),'chain':chain,'materials':[material(m['guid']) for m in renderer['m_Materials']]})
  assets.append({'key':key,'label':label,'tier':tier,'nodes':nodes})
 (OUT/'resolved.json').write_text(json.dumps({'assets':assets,'materials':materials,'sources':sources},indent=2))
 print('Resolved',len(assets),'prefabs;',len(materials),'shared materials;',len(sources),'source dependencies')
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--source',required=True,type=pathlib.Path);main(parser.parse_args().source)
