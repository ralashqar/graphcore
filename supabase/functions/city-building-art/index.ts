import { z } from "npm:zod@4";
import { requireUserClient } from "../_shared/auth.ts";
import { cityAdmin, flag, limit, owner, result } from "../_shared/city.ts";
import {
  errorResponse,
  HttpError,
  json,
  maybeHandleOptions,
} from "../_shared/http.ts";
import { notifyWorkerWakeBestEffort } from "../_shared/worker-wake.ts";
import {
  CITY_ART_MODELS,
  CITY_ART_POLICY,
} from "../../../src/domain/cityBuildingArt.ts";

const schema = z.object({
  action: z.enum(["read", "generate", "apply", "retry"]),
  businessId: z.string().uuid(),
  jobId: z.string().uuid().optional(),
  version: z.number().int().positive().optional(),
  model: z.enum(["nano", "gpt"]).default("nano"),
  direction: z.string().trim().max(1200).default(""),
}).strict();
function price(name: string) {
  const n = Number(Deno.env.get(name));
  return Number.isInteger(n) && n > 0 && n <= 1000 ? n : 0;
}
Deno.serve(async (request) => {
  const options = maybeHandleOptions(request);
  if (options) return options;
  try {
    if (request.method !== "POST") throw new HttpError(405, "POST required.");
    const { user } = await requireUserClient(request, "city-building-art");
    if (Number(request.headers.get("content-length") || 0) > 10000) {
      throw new HttpError(413, "Request too large.");
    }
    const raw = await request.text();
    if (raw.length > 10000) throw new HttpError(413, "Request too large.");
    const p = schema.parse(JSON.parse(raw)), db = cityAdmin();
    await limit(db, `city-art:${user.id}`, 40);
    const business = await owner(db, user.id, p.businessId);
    if (!business) throw new HttpError(404, "Business not found.");
    const prices = {
      nano: price("CITY_ART_NANO_CREDITS"),
      gpt: price("CITY_ART_GPT_CREDITS"),
    };
    const enabled = flag("CITY_BUILDING_ART_ENABLED");
    if (p.action === "generate") {
      if (!enabled || !prices[p.model]) {
        throw new HttpError(
          503,
          "Building generation is not enabled for this model.",
        );
      }
      if (!p.jobId || !p.version) {
        throw new HttpError(
          400,
          "Request ID and saved draft version required.",
        );
      }
      const input = {
        business: business.draft,
        direction: p.direction,
        version: p.version,
        policy: CITY_ART_POLICY,
      };
      result(
        await db.rpc("city_art_start", {
          p_user: user.id,
          p_business: business.id,
          p_id: p.jobId,
          p_version: p.version,
          p_input: input,
          p_model: CITY_ART_MODELS[p.model],
          p_credits: prices[p.model],
        }),
      );
      await notifyWorkerWakeBestEffort({
        family: "visual",
        source: "city-building-art",
        jobId: p.jobId,
      });
    }
    if (p.action === "retry") {
      if (!p.jobId) throw new HttpError(400, "Candidate required.");
      result(
        await db.rpc("city_art_retry", {
          p_user: user.id,
          p_business: business.id,
          p_job: p.jobId,
        }),
      );
      await notifyWorkerWakeBestEffort({
        family: "visual",
        source: "city-building-art",
        jobId: p.jobId,
      });
    }
    if (p.action === "apply") {
      if (!p.jobId || !p.version) {
        throw new HttpError(400, "Candidate and draft version required.");
      }
      result(
        await db.rpc("city_art_apply", {
          p_user: user.id,
          p_business: business.id,
          p_job: p.jobId,
          p_version: p.version,
        }),
      );
    }
    const rows = result(
      await db.from("visual_generation_jobs").select(
        "id,status,error_message,outputs,metadata,input,created_at",
      ).eq("city_business_id", business.id).eq("requested_by", user.id).order(
        "created_at",
        { ascending: false },
      ).limit(8),
    ) || [];
    const jobs = await Promise.all(rows.map(async (r) => ({
      id: r.id,
      status: r.status,
      error: r.error_message,
      phase: r.metadata?.phase || r.status,
      version: r.input?.version,
      credits: r.metadata?.creditsRefunded ? 0 : r.metadata?.credits || 0,
      recoverable: !!(r.metadata?.falRequestId || r.metadata?.cityRawPath),
      createdAt: r.created_at,
      preview: r.status === "completed" && r.outputs?.validated
        ? result(
          await db.storage.from("city-media").createSignedUrl(
            r.outputs.storagePath,
            900,
          ),
        )?.signedUrl || ""
        : "",
    })));
    return json({ enabled, prices, jobs });
  } catch (error) {
    return errorResponse(error, "Could not generate building art.");
  }
});
