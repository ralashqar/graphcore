import { processCityArt } from "../supabase/functions/_shared/city-art-worker.ts";
import { strict as assert } from "node:assert";
const files = new Map<string, Uint8Array>();
let generations = 0;
let metadata: Record<string, unknown> = {};
const user = "11111111-1111-4111-8111-111111111111",
  id = "44444444-4444-4444-8444-444444444444";
const job = {
  id,
  requestedBy: user,
  model: "fal-ai/nano-banana-2/edit",
  input: {
    policy: "city-building-sprite-1.0.0",
    version: 1,
    direction: "Design tools",
    business: {
      name: "Studio",
      description: "A design business",
      category: "Apps",
      color: "#336699",
      logo: `${user}/55555555-5555-4555-8555-555555555555.png`,
      hero: "",
    },
  },
  metadata: {},
};
const helpers = {
  sign: async (path: string) => `https://fixture.invalid/${path}`,
  download: async (url: string) => {
    const bytes = files.get(url.replace("https://fixture.invalid/", ""));
    if (!bytes) throw new Error("Missing fixture");
    return bytes;
  },
  upload: async (path: string, bytes: Uint8Array) => {
    files.set(path, bytes);
  },
  checkpoint: async (patch: Record<string, unknown>) => {
    metadata = { ...metadata, ...patch };
  },
  generate: async (prompt: string, urls: string[]) => {
    generations++;
    assert.equal(urls.length, 3);
    assert.ok(urls[0].startsWith("data:image/png;base64,"));
    assert.match(prompt, /fixed|orthographic/);
    return await Deno.readFile("public/city/sprites/studio.png");
  },
};
const output = await processCityArt(job, helpers);
assert.equal(output.validated, true);
assert.equal(output.width, 512);
assert.equal(files.size, 2);
await processCityArt({ ...job, metadata }, helpers);
assert.equal(generations, 1, "CPU recovery must reuse saved provider output");
await assert.rejects(
  processCityArt(
    { ...job, input: { ...job.input, policy: "unknown" } },
    helpers,
  ),
);
await Deno.mkdir("output/playwright", { recursive: true });
await Deno.writeFile(
  "output/playwright/city-art-validated.png",
  files.get(output.storagePath)!,
);
console.log(
  "City art worker: pinned references, branded edit input, RGBA output, saved-source recovery and policy rejection passed. No provider call.",
);
