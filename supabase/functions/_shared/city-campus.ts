import { z } from "npm:zod@4";
import { requireUserClient } from "./auth.ts";
import { HttpError } from "./http.ts";
import {
  cityAdmin,
  flag,
  result,
  uuid,
  owner,
  limit,
  publicKey,
  signProfile,
  parseProfile,
  mutate,
  required,
  isAdmin,
} from "./city.ts";
import { campusSchema } from "./city-campus-schema.ts";
import { legacyCampus, primarySample } from "../../../src/domain/cityCampus.ts";
import type { CityProfile } from "../../../src/domain/city.ts";
import { notifyWorkerWakeBestEffort } from "./worker-wake.ts";
import { importURL } from "./city-network.ts";
export function setupPricing(model: string, input: number, output: number) {
  if (
    !model ||
    !Number.isFinite(input) ||
    !Number.isFinite(output) ||
    input <= 0 ||
    output <= 0
  )
    throw new HttpError(503, "Setup pricing is unavailable.");
  const reserve =
    2 * Math.ceil(((65000 * input + 3000 * output) / 1000000) * 100);
  if (reserve < 1 || reserve > 100)
    throw new HttpError(
      503,
      "Configured model exceeds the pilot request limit.",
    );
  return {
    model,
    reserve,
    pricing: {
      input,
      output,
      inputTokens: 65000,
      outputTokens: 3000,
      calls: 2,
    },
  };
}
export async function campus(
  request: Request,
  input: Record<string, unknown>,
  write = false,
) {
  if (!flag("CITY_CAMPUS_ENABLED") || !flag("CITY_BROWSING_ENABLED"))
    throw new HttpError(503, "Business spaces are not open yet.");
  const db = cityAdmin(),
    action = String(input.action).replace(/^campus_/, "");
  const publicRead = !write && action === "public";
  const anonymousTrack = write && action === "track";
  let userId: string | null = null;
  if (!publicRead && !anonymousTrack)
    userId = (await requireUserClient(request, "city-campus")).user.id;
  else if (request.headers.get("authorization")) {
    try {
      userId = (await requireUserClient(request, "city-campus")).user.id;
    } catch {
      /* public read */
    }
  }
  await limit(db, `campus:${userId || (await publicKey(request))}`, 120);
  if (publicRead || anonymousTrack) {
    const b = result(
      await db
        .from("city_businesses")
        .select("id,slug,published,status,owner_id")
        .eq(
          anonymousTrack ? "id" : "slug",
          anonymousTrack
            ? uuid.parse(input.businessId)
            : z.string().max(48).parse(input.slug),
        )
        .maybeSingle(),
    );
    if (!b?.published || b.status === "suspended")
      throw new HttpError(404, "Business space unavailable.");
    const raw = b.published as CityProfile,
      space = legacyCampus(raw);
    if (anonymousTrack) {
      const exhibitId = z.string().max(60).parse(input.exhibitId),
        kind = z
          .enum(["view", "sample_start", "sample_interaction", "click"])
          .parse(input.kind);
      if (!space.exhibits.some((e) => e.id === exhibitId))
        throw new HttpError(404, "Exhibit unavailable.");
      if (b.owner_id !== userId)
        result(
          await db
            .from("city_campus_metrics")
            .upsert(
              {
                business_id: b.id,
                exhibit_id: exhibitId,
                kind,
                visitor_hash: await publicKey(request),
              },
              {
                onConflict: "business_id,exhibit_id,kind,visitor_hash,day",
                ignoreDuplicates: true,
              },
            ),
        );
      return { ok: true };
    }
    const profile = await signProfile(db, { ...raw, campus: space });
    profile.offer = { ...(profile.offer as object), code: "" };
    const launches = result(
      await db
        .from("city_discovery_entries")
        .select("id,slug,published")
        .eq("business_id", b.id)
        .eq("kind", "launch")
        .not("published", "is", null)
        .neq("status", "archived")
        .limit(20),
    );
    return {
      businessId: b.id,
      slug: b.slug,
      profile,
      launches: launches || [],
    };
  }
  const businessId = uuid.parse(input.businessId);
  const owned = await owner(db, userId!, businessId);
  if (!owned) throw new HttpError(403, "Business owner required.");
  if (action === "workspace") {
    const jobs =
      result(
        await db
          .from("city_setup_jobs")
          .select(
            "id,status,stage,kind,error,base_version,candidate,manifest,created_at",
          )
          .eq("business_id", businessId)
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(10),
      ) || [];
    const metrics =
      result(
        await db
          .from("city_campus_metrics")
          .select("exhibit_id,kind")
          .eq("business_id", businessId)
          .gte(
            "day",
            new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
          )
          .limit(10000),
      ) || [];
    const counts: Record<string, number> = {};
    for (const m of metrics) {
      const key = m.exhibit_id + ":" + m.kind;
      counts[key] = (counts[key] || 0) + 1;
    }
    return {
      jobs: await Promise.all(
        jobs.map(async (j) => ({
          ...j,
          preview: j.candidate
            ? await signProfile(db, j.candidate.profile)
            : null,
        })),
      ),
      metrics: counts,
      setupEnabled: flag("CITY_SETUP_ENABLED"),
    };
  }
  if (action === "save") {
    if (!flag("CITY_ONBOARDING_ENABLED"))
      throw new HttpError(503, "Editing is paused.");
    const b = await owner(db, userId!, businessId),
      space = campusSchema.parse(input.campus);
    const profile = parseProfile(
      { ...b.draft, campus: space, sample: primarySample(space) },
      userId!,
    );
    return mutate(db, userId!, "save", {
      businessId,
      version: z.number().int().positive().parse(input.version),
      profile,
      host: new URL(profile.website).hostname,
    });
  }
  if (["start", "refine", "retry", "apply", "cancel"].includes(action)) {
    const b = await owner(db, userId!, businessId);
    let data: Record<string, unknown> = { businessId };
    let command = action;
    if (action === "start" || action === "refine") {
      if (!flag("CITY_SETUP_ENABLED") || !flag("CITY_ONBOARDING_ENABLED"))
        throw new HttpError(
          503,
          "Automatic setup is paused. Manual editing is available.",
        );
      await limit(db, `campus-setup:${userId}`, 6, 86400);
      const url = importURL(b.draft.website).toString();
      data = {
        ...data,
        ...setupPricing(
          required("CITY_SETUP_MODEL"),
          Number(required("CITY_SETUP_INPUT_USD_PER_MILLION")),
          Number(required("CITY_SETUP_OUTPUT_USD_PER_MILLION")),
        ),
        version: z.number().int().positive().parse(input.version),
        requestKey: uuid.parse(input.requestKey),
        kind: action === "start" ? "initial" : "refine",
        input: {
          url,
          host: new URL(url).hostname,
          profile: b.draft,
          prompt: z
            .string()
            .max(1500)
            .parse(input.prompt || ""),
        },
      };
      command = "start";
    } else {
      data.id = uuid.parse(input.id);
      if (action === "apply") {
        if (!flag("CITY_ONBOARDING_ENABLED"))
          throw new HttpError(503, "Editing is paused.");
        data.version = z.number().int().positive().parse(input.version);
        const j = result(
          await db
            .from("city_setup_jobs")
            .select("candidate")
            .eq("id", data.id)
            .eq("user_id", userId)
            .eq("business_id", businessId)
            .maybeSingle(),
        );
        if (!j?.candidate) throw new HttpError(404, "Candidate unavailable.");
        parseProfile(j.candidate.profile, userId!);
      }
      if (action === "retry" && !flag("CITY_SETUP_ENABLED"))
        throw new HttpError(503, "Setup is paused.");
    }
    const job = result(
      await db.rpc("city_setup_command", {
        p_user: userId,
        p_action: command,
        p_data: data,
      }),
    );
    if (["start", "retry"].includes(command))
      await notifyWorkerWakeBestEffort({
        family: "city_setup",
        jobId: job.id,
        source: "city-command",
      });
    return { id: job.id, status: job.status };
  }
  throw new HttpError(400, "Unknown campus action.");
}
