import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const python =
  process.env.PYTHON_BIN ||
  (process.platform === "win32" ? "python" : "python3");
const blender =
  process.env.BLENDER_BIN ||
  (process.platform === "win32"
    ? "C:/Program Files/Blender Foundation/Blender 5.0/blender.exe"
    : "blender");
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed (${result.status})`);
}
if (process.env.CITY_MEGAKIT_SOURCE)
  run(python, [
    "scripts/prepare-city-megakit.py",
    "--source",
    process.env.CITY_MEGAKIT_SOURCE,
  ]);
run(blender, [
  "--background",
  "--python-exit-code",
  "1",
  "--python",
  "scripts/build-city-megakit.py",
]);
run(python, ["scripts/prepare-city-megakit.py", "--optimise"]);
run(process.execPath, ["scripts/optimise-city-megakit.mjs"]);
run(process.execPath, ["scripts/city-kit-test.mjs"]);
