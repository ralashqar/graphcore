import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL("..", import.meta.url));
const source = process.env.CITY_MEGACITY_SOURCE;
if (!source)
  throw new Error(
    "Set CITY_MEGACITY_SOURCE to the original JC_LP_MegaCity folder",
  );
const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
};
run(process.env.PYTHON_BIN || "python", [
  "scripts/prepare-city-megacity.py",
  "--source",
  source,
]);
run(
  process.env.BLENDER_BIN ||
    (process.platform === "win32"
      ? "C:/Program Files/Blender Foundation/Blender 5.0/blender.exe"
      : "blender"),
  [
    "--background",
    "--python-exit-code",
    "1",
    "--python",
    "scripts/build-city-megacity.py",
  ],
);
run(process.execPath, ["scripts/optimise-city-megacity.mjs"]);
