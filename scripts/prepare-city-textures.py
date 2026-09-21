from pathlib import Path
import urllib.request,zipfile,io,json,hashlib,sys
from PIL import Image
from concurrent.futures import ThreadPoolExecutor
root=Path('public/city/textures');root.mkdir(exist_ok=True)
ids=['Bricks051','PaintedPlaster017','Concrete034','RoofingTiles012A','Metal032','WoodSiding005','PavingStones036','Grass005','Grass003','Grass004']
def fetch(asset):
 url=f'https://ambientcg.com/get?file={asset}_1K-JPG.zip'
 request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Referer':f'https://ambientcg.com/view?id={asset}'})
 data=urllib.request.urlopen(request,timeout=90).read();z=zipfile.ZipFile(io.BytesIO(data));files={}
 for role in ['Color','Roughness']:
  name=next(n for n in z.namelist() if n.endswith('_'+role+'.jpg'))
  out=root/f'{asset}-{role}.webp';Image.open(io.BytesIO(z.read(name))).resize((512,512),Image.Resampling.LANCZOS).save(out,quality=87)
  files[role]={'file':out.name,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()}
 # Pack linear height and roughness together: no extra runtime texture sampler.
 height_name=next(n for n in z.namelist() if '_Displacement.' in n)
 rough_name=next(n for n in z.namelist() if n.endswith('_Roughness.jpg'))
 height=Image.open(io.BytesIO(z.read(height_name))).convert('L').resize((512,512),Image.Resampling.LANCZOS)
 rough=Image.open(io.BytesIO(z.read(rough_name))).convert('L').resize((512,512),Image.Resampling.LANCZOS)
 out=root/f'{asset}-Surface.webp'
 Image.merge('RGB',(height,rough,Image.new('L',(512,512),0))).save(out,lossless=True)
 files['Surface']={'file':out.name,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'channels':{'r':'displacement','g':'roughness','b':'unused'}}
 return {'id':asset,'source':f'https://ambientcg.com/view?id={asset}','download':url,'license':'CC0-1.0','sourceSha256':hashlib.sha256(data).hexdigest(),'files':files}
selected=sys.argv[1:] or ids
assert all(asset in ids for asset in selected)
existing=json.loads((root/'sources.json').read_text()) if (root/'sources.json').exists() else []
fetched=list(ThreadPoolExecutor(max_workers=3).map(fetch,selected))
by_id={r['id']:r for r in existing+fetched}
results=[by_id[asset] for asset in ids if asset in by_id];(root/'sources.json').write_text(json.dumps(results,indent=2),encoding='utf-8');print([r['id'] for r in results])
