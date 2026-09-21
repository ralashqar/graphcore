import { execFileSync } from "node:child_process";
import { NodeIO } from "@gltf-transform/core";
import { dedup, prune, simplify, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import { stat } from "node:fs/promises";
await MeshoptSimplifier.ready;
const io = new NodeIO(),
  path = "public/city/decorators/decorators.glb",
  doc = await io.read(path);
await doc.transform(
  dedup(),
  prune(),
  weld(),
  simplify({
    simplifier: MeshoptSimplifier,
    ratio: .7,
    error: .0001,
    lockBorder: true,
  }),
);
await io.write(path, doc);
console.log("Decorator GLB bytes:", (await stat(path)).size);

execFileSync("python", ["scripts/resize-city-decorator-textures.py"], {stdio:"inherit"});

// Freeze measured mounting planes, packing cells and doorway apertures with the pack.
execFileSync(process.execPath, ["scripts/measure-city-native-modules.mjs"], {stdio:"inherit"});
