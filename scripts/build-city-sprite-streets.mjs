import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, meshopt } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
await Promise.all([MeshoptDecoder.ready,MeshoptEncoder.ready]);
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({"meshopt.decoder":MeshoptDecoder,"meshopt.encoder":MeshoptEncoder});
const doc=await io.read('public/city/downtown/downtown.glb');
for(const node of [...doc.getRoot().listNodes()]) {
  const key=node.getExtras().assetKey;
  if(key && !key.startsWith('Street_') && !key.startsWith('Road_') && key!=='Sidewalk_NoCurb_3m') node.dispose();
}
await doc.transform(prune(),meshopt({encoder:MeshoptEncoder,level:'medium',quantizePosition:16}));
await io.write('public/city/sprites/streets.glb',doc);
