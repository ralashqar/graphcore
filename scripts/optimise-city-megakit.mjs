import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  prune,
  weld,
  simplify,
  meshopt,
} from "@gltf-transform/functions";
import {
  MeshoptEncoder,
  MeshoptDecoder,
  MeshoptSimplifier,
} from "meshoptimizer";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
await Promise.all([
  MeshoptEncoder.ready,
  MeshoptDecoder.ready,
  MeshoptSimplifier.ready,
]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "meshopt.encoder": MeshoptEncoder,
    "meshopt.decoder": MeshoptDecoder,
  });
for (const pack of ["downtown", "offices"]) {
  const document = await io.read("output/city-kit/downtown.gltf");
  for (const node of [...document.getRoot().listNodes()]) {
    const key = node.getExtras().assetKey;
    if (key && (pack === "downtown" ? key.startsWith("Office_") : key.startsWith("Building_"))) node.dispose();
  }
  // Runtime uses shared Lambert materials: don't transfer maps or vertex layers it cannot use.
  for (const material of document.getRoot().listMaterials()) {
    material
      .setNormalTexture(null)
      .setOcclusionTexture(null)
      .setMetallicRoughnessTexture(null);
  }
  for (const mesh of document.getRoot().listMeshes())
    for (const primitive of mesh.listPrimitives()) {
      primitive
        .setAttribute("COLOR_0", null)
        .setAttribute("COLOR_1", null)
        .setAttribute("TEXCOORD_1", null);
    }
  await document.transform(
    dedup(),
    prune(),
    weld(),
    simplify({
      simplifier: MeshoptSimplifier,
      ratio: 0.5,
      error: 0.0005,
      lockBorder: true,
    }),
    meshopt({ encoder: MeshoptEncoder, level: "medium", quantizePosition: 16 }),
  );
  await mkdir(`public/city/${pack}`, { recursive: true });
  await io.write(`public/city/${pack}/${pack}.glb`, document);
  const manifest = JSON.parse(await readFile("output/city-kit/manifest.json", "utf8"));
  manifest.assets = Object.fromEntries(Object.entries(manifest.assets).filter(([key]) => pack === "downtown" ? !key.startsWith("Office_") : !key.startsWith("Building_")));
  await writeFile(`public/city/${pack}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
  console.log(pack, "kit bytes:", (await stat(`public/city/${pack}/${pack}.glb`)).size);
}
