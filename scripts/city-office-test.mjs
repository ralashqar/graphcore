import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { getBounds } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";
import validator from "gltf-validator";

await MeshoptDecoder.ready;
const bytes = await readFile("public/city/offices/offices.glb");
assert.ok(bytes.length < 12 * 1024 * 1024, "Office pack exceeds 12 MiB");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const doc = await io.readBinary(bytes);
const offices = new Map();
for (const node of doc.getRoot().listNodes()) {
  const key = node.getExtras().assetKey;
  assert.ok(!key?.startsWith("Building_"), "Legacy buildings must stay in their own pack");
  if (!key?.startsWith("Office_")) continue;
  const { min, max } = getBounds(node);
  assert.ok(min[1] >= -0.05 && max[1] < 36 && max[0] - min[0] < 34 && max[2] - min[2] < 30, `${key}: plot clearance`);
  const primitives = node.getMesh()?.listPrimitives() ?? [];
  assert.ok(primitives.length, `${key}: missing geometry`);
  offices.set(key, primitives.reduce((sum, p) => sum + (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()), 0));
}
assert.equal(offices.size, 12);
for (let i = 0; i < 6; i++) {
  assert.ok(offices.get(`Office_${i}_near`) > offices.get(`Office_${i}_far`), `Office ${i}: far LOD must reduce geometry`);
}
for (const texture of doc.getRoot().listTextures()) assert.ok(texture.getImage()?.length);
for (const extension of doc.getRoot().listExtensionsUsed()) {
  if (extension.extensionName === "EXT_meshopt_compression") extension.dispose();
}
const report = await validator.validateBytes(await io.writeBinary(doc), { maxIssues: 100 });
assert.equal(report.issues.numErrors, 0, JSON.stringify(report.issues.messages));
console.log(JSON.stringify({ offices: offices.size, bytes: bytes.length, validationErrors: report.issues.numErrors }));
