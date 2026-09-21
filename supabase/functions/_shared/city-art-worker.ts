import sharp from "npm:sharp@0.33.5";
import {
  CITY_ART_MODELS,
  CITY_ART_POLICY,
  cityArtPrompt,
} from "../../../src/domain/cityBuildingArt.ts";
import { alignCityArt, cutoutCityArt } from "./city-art-pixels.ts";

const references = [
  [
    "tile-reference.png",
    "3d467f4f60ac0e6db082fce8f35411fe14bfa18704a32bd936ef7b6d0fba8fe3",
  ],
  [
    "studio.png",
    "94dd44b3845e57f92c3c71d9bc5df6e44ae9eac92c3cf2a031190f1add852305",
  ],
];
type Job = {
  id: string;
  requestedBy: string | null;
  model: string;
  input: Record<string, any>;
  metadata: Record<string, any>;
};
export async function processCityArt(job: Job, helpers: {
  sign: (path: string) => Promise<string>;
  generate: (prompt: string, urls: string[]) => Promise<Uint8Array>;
  download: (url: string) => Promise<Uint8Array>;
  upload: (path: string, bytes: Uint8Array) => Promise<void>;
  checkpoint: (metadata: Record<string, unknown>) => Promise<void>;
}) {
  if (
    job.input.policy !== CITY_ART_POLICY ||
    !Object.values(CITY_ART_MODELS).includes(job.model as any) ||
    !job.requestedBy
  ) throw new Error("Unsupported City art policy or model.");
  const rawPath = `${job.requestedBy}/${job.id}.raw.png`,
    storagePath = `${job.requestedBy}/${job.id}.png`;
  let bytes: Uint8Array;
  if (job.metadata.cityRawPath === rawPath) {
    bytes = await helpers.download(await helpers.sign(rawPath));
  } else {
    const urls: string[] = [];
    for (const [file, hash] of references) {
      const data = await Deno.readFile(
        new URL(`../../../public/city/sprites/${file}`, import.meta.url),
      );
      const digest = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
      ).map((n) => n.toString(16).padStart(2, "0")).join("");
      if (digest !== hash) {
        throw new Error(
          "City art reference changed without a policy revision.",
        );
      }
      let binary = "";
      for (let i = 0; i < data.length; i += 8192) {
        binary += String.fromCharCode(...data.subarray(i, i + 8192));
      }
      urls.push(`data:image/png;base64,${btoa(binary)}`);
    }
    const b = job.input.business;
    for (const path of [b.logo, b.hero].filter(Boolean)) {
      if (
        typeof path !== "string" || !path.startsWith(`${job.requestedBy}/`) ||
        !/^[-a-f\d]{36}\/[-a-f\d]{36}\.(png|jpg|webp)$/.test(path)
      ) throw new Error("Invalid business reference.");
      urls.push(await helpers.sign(path));
    }
    bytes = await helpers.generate(
      cityArtPrompt({
        name: b.name,
        description: b.description,
        category: b.category,
        color: b.color,
      }, job.input.direction),
      urls,
    );
    await helpers.upload(rawPath, bytes);
    await helpers.checkpoint({
      cityRawPath: rawPath,
      phase: "city_art_validating",
    });
  }
  if (bytes.length > 20 * 1024 * 1024) {
    throw new Error("Generated image is too large.");
  }
  const meta = await sharp(bytes, { limitInputPixels: 16_777_216 }).metadata();
  if (
    !meta.width || meta.width !== meta.height || meta.width < 512 ||
    (meta.pages || 1) > 1
  ) throw new Error("Expected a single square building image.");
  const rgba = await sharp(bytes, { limitInputPixels: 16_777_216 }).resize(
    512,
    512,
  ).ensureAlpha().raw().toBuffer();
  const cutout = cutoutCityArt(new Uint8Array(rgba), 512, 512);
  const output = new Uint8Array(
    await sharp(alignCityArt(cutout), {
      raw: { width: 512, height: 512, channels: 4 },
    }).png().toBuffer(),
  );
  await helpers.upload(storagePath, output);
  return {
    assets: [],
    storagePath,
    policy: CITY_ART_POLICY,
    validated: true,
    width: 512,
    height: 512,
    evidence: cutout.evidence,
  };
}
