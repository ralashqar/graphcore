"""Bound embedded decorator textures while preserving authored UVs and PBR channels."""
import io,json,struct
from pathlib import Path
from PIL import Image
path=Path('public/city/decorators/decorators.glb')
data=path.read_bytes();size=struct.unpack_from('<I',data,12)[0]
doc=json.loads(data[20:20+size]);binary=data[28+size:]
images={i['bufferView'] for i in doc.get('images',[]) if 'bufferView' in i}
out=bytearray()
for index,view in enumerate(doc['bufferViews']):
 start=view.get('byteOffset',0);chunk=binary[start:start+view['byteLength']]
 if index in images:
  image=Image.open(io.BytesIO(chunk));image.thumbnail((512,512),Image.Resampling.LANCZOS)
  buffer=io.BytesIO();image.save(buffer,format='PNG',optimize=True);chunk=buffer.getvalue()
  for item in doc['images']:
   if item.get('bufferView')==index:item['mimeType']='image/png'
 view['byteOffset']=len(out);view['byteLength']=len(chunk);out.extend(chunk)
 out.extend(b'\x00'*((-len(out))%4))
doc['buffers'][0]['byteLength']=len(out)
metadata=json.dumps(doc,separators=(',',':')).encode();metadata+=b' '*((-len(metadata))%4)
path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(metadata)+len(out))+struct.pack('<II',len(metadata),0x4e4f534a)+metadata+struct.pack('<II',len(out),0x004e4942)+out)
print('Resized decorator GLB bytes:',path.stat().st_size)
