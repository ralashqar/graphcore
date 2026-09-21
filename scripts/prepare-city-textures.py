from pathlib import Path
import urllib.request,zipfile,io,json,hashlib
from PIL import Image
from concurrent.futures import ThreadPoolExecutor
root=Path('public/city/textures');root.mkdir(exist_ok=True)
ids=['Bricks051','PaintedPlaster017','Concrete034','RoofingTiles012A','Metal032','WoodSiding005','PavingStones036','Tiles074']
def fetch(asset):
 url=f'https://ambientcg.com/get?file={asset}_1K-JPG.zip'
 request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Referer':f'https://ambientcg.com/view?id={asset}'})
 data=urllib.request.urlopen(request,timeout=90).read();z=zipfile.ZipFile(io.BytesIO(data));files={}
 for role in ['Color','Roughness']:
  name=next(n for n in z.namelist() if n.endswith('_'+role+'.jpg'))
  out=root/f'{asset}-{role}.webp';Image.open(io.BytesIO(z.read(name))).resize((512,512),Image.Resampling.LANCZOS).save(out,quality=87)
  files[role]={'file':out.name,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()}
 return {'id':asset,'source':f'https://ambientcg.com/view?id={asset}','download':url,'license':'CC0-1.0','sourceSha256':hashlib.sha256(data).hexdigest(),'files':files}
results=list(ThreadPoolExecutor(max_workers=3).map(fetch,ids));(root/'sources.json').write_text(json.dumps(results,indent=2),encoding='utf-8');print([r['id'] for r in results])
