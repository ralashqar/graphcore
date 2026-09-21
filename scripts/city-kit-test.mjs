import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { getBounds } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";
import validator from "gltf-validator";
await MeshoptDecoder.ready;
const inventory = JSON.parse(
  await readFile("assets/city/megakit/source-manifest.json", "utf8"),
);
for (const [file, hash] of Object.entries(inventory.files)) {
  const bytes = await readFile(`assets/city/megakit/source/${file}`);
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    hash,
    `Changed source: ${file}`,
  );
}
const bytes = await readFile("public/city/downtown/downtown.glb");
assert.ok(bytes.length < 12 * 1024 * 1024, "Initial asset budget exceeded");
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const doc = await io.readBinary(bytes);
// Validate decompressed geometry: the Khronos validator cannot inspect meshopt streams itself.
for (const extension of doc.getRoot().listExtensionsUsed())
  if (extension.extensionName === "EXT_meshopt_compression")
    extension.dispose();
const report = await validator.validateBytes(await io.writeBinary(doc), {
  maxIssues: 100,
});
assert.equal(
  report.issues.numErrors,
  0,
  JSON.stringify(report.issues.messages),
);
assert.ok(!doc.getRoot().listMaterials().some(m => /collision/i.test(m.getName())), "Source collision hulls must not render");
const manifest = JSON.parse(await readFile("public/city/downtown/manifest.json", "utf8"));
assert.ok(manifest.assets.Road_Arrows.markings.includes("Decal_ArrowStraight"));
assert.ok(manifest.assets.Street_Curve_4LaneShort.markings.includes("Decal_Curve_4LaneShort_DoubleYellow"));
let buildings = 0, offices = 0;
for (const node of doc.getRoot().listNodes()) {
  const key = node.getExtras().assetKey;
  if (key?.startsWith("Office_")) {
    const {min,max}=getBounds(node);
    assert.ok(min[1]>=-0.05 && max[1]<36 && max[0]-min[0]<34 && max[2]-min[2]<30, `${key}: office bounds`);
    assert.ok(node.getMesh()?.listPrimitives().length, `${key}: empty office`);
    offices++; continue;
  }
  if (!key?.startsWith("Building_")) continue;
  const { min, max } = getBounds(node);
  assert.ok(
    max[0] - min[0] <= 16.01 && max[2] - min[2] <= 16.01,
    `${key} exceeds setback`,
  );
  assert.ok(min[1] >= -0.05 && max[1] < 36, `${key} is ungrounded or too tall`);
  assert.ok(node.getMesh()?.listPrimitives().length, `${key} is empty`);
  buildings++;
}
assert.equal(buildings, 24);
assert.equal(offices, 0);
for (const texture of doc.getRoot().listTextures())
  assert.ok(texture.getImage()?.length, "Missing embedded texture");
console.log(
  JSON.stringify({
    buildings,
    bytes: bytes.length,
    materials: doc.getRoot().listMaterials().length,
    textures: doc.getRoot().listTextures().length,
    validationErrors: report.issues.numErrors,
  }),
);
