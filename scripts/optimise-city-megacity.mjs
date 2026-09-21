import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";
import {
  dedup,
  prune,
  weld,
  meshopt,
  getBounds,
  textureCompress,
} from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import assert from "node:assert/strict";
import validator from "gltf-validator";
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    "meshopt.encoder": MeshoptEncoder,
    "meshopt.decoder": MeshoptDecoder,
  });
const doc = await io.read("output/megacity-showcase/showcase.gltf");
await doc.transform(
  textureCompress({
    encoder: sharp,
    targetFormat: "webp",
    resize: [2048, 2048],
    quality: 90,
  }),
  dedup(),
  prune(),
  weld(),
  meshopt({ encoder: MeshoptEncoder, level: "medium", quantizePosition: 16 }),
);
const folder = "public/city/megacity";
await mkdir(folder, { recursive: true });
await io.write(`${folder}/showcase.glb`, doc);
const manifest = JSON.parse(
  await readFile("output/megacity-showcase/manifest.json", "utf8"),
);
for (const asset of manifest.assets) {
  for (const lod of ["near", "far"]) {
    const node = doc
      .getRoot()
      .listNodes()
      .find((n) => n.getExtras().assetKey === `${asset.key}_${lod}`);
    assert.ok(node, `${asset.key}: missing ${lod}`);
    const { min, max } = getBounds(node);
    assert.ok(
      min[1] > -0.02 && max[0] - min[0] <= 16 && max[2] - min[2] <= 16,
      `${asset.key}: invalid envelope`,
    );
    assert.ok(
      node
        .getMesh()
        .listPrimitives()
        .every(
          (p) =>
            !p.getMaterial()?.getBaseColorTexture() ||
            p.getAttribute("TEXCOORD_0"),
        ),
      `${asset.key}: missing UVs`,
    );
  }
  assert.ok(
    asset.farTriangles < asset.triangles,
    `${asset.key}: ineffective LOD`,
  );
}
manifest.bytes = (await stat(`${folder}/showcase.glb`)).size;
assert.ok(manifest.bytes < 4 * 1024 * 1024, "Showcase pack exceeds 4 MB");
manifest.materials = doc.getRoot().listMaterials().length;
manifest.textures = doc.getRoot().listTextures().length;
// Keep a portable source-hash inventory; no absolute workstation paths or vendor source files.
await writeFile(
  `${folder}/manifest.json`,
  JSON.stringify(manifest, null, 2) + "\n",
);
for (const ext of doc.getRoot().listExtensionsUsed())
  if (ext.extensionName === "EXT_meshopt_compression") ext.dispose();
const report = await validator.validateBytes(await io.writeBinary(doc), {
  maxIssues: 50,
});
assert.equal(
  report.issues.numErrors,
  0,
  JSON.stringify(report.issues.messages),
);
console.log(
  JSON.stringify({
    bytes: manifest.bytes,
    presets: manifest.assets.length,
    materials: manifest.materials,
    textures: manifest.textures,
    validationErrors: report.issues.numErrors,
  }),
);
