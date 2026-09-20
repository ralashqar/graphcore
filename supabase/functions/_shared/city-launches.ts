import { z } from "npm:zod@4";
import { requireUserClient } from "./auth.ts";
import { cityAdmin, flag, limit, publicKey, result, uuid } from "./city.ts";
import { HttpError } from "./http.ts";
import { launchPhase } from "../../../src/domain/cityLaunches.ts";

export async function launches(
  request: Request,
  input: Record<string, unknown>,
  write = false,
) {
  if (
    !flag("CITY_LAUNCHES_ENABLED") || !flag("CITY_BROWSING_ENABLED") ||
    !flag("CITY_DISCOVERY_ENABLED")
  ) throw new HttpError(503, "Launch discovery is not enabled.");
  const db = cityAdmin(), action = String(input.action).replace(/^launch_/, "");
  let userId: string | null = null;
  if ((write && action !== "track") || action === "analytics") {
    const { user } = await requireUserClient(request, "city-launches");
    userId = user.id;
    if (
      action === "interest" && !user.email_confirmed_at &&
      !user.phone_confirmed_at
    ) {
      throw new HttpError(
        403,
        "Verify your account before expressing interest.",
      );
    }
  } else if (request.headers.get("authorization")) {
    try {
      userId = (await requireUserClient(request, "city-launches")).user.id;
    } catch {}
  }
  await limit(
    db,
    `launch:${userId || await publicKey(request)}`,
    write ? 60 : 180,
  );
  if (write) {
    if (action === "track") {
      const id = uuid.parse(input.id),
        kind = z.enum(["impression", "product_visit", "share"]).parse(
          input.kind,
        );
      const e = result(
        await db.from("city_discovery_entries").select(
          "business_id,published,status,launch_paused",
        ).eq("id", id).eq("kind", "launch").maybeSingle(),
      );
      if (!e?.published || e.status !== "published" || e.launch_paused) {
        throw new HttpError(404, "Launch unavailable.");
      }
      const b = result(
        await db.from("city_businesses").select("owner_id,status,published").eq(
          "id",
          e.business_id,
        ).maybeSingle(),
      );
      if (!b?.published || b.status === "suspended") {
        throw new HttpError(404, "Business unavailable.");
      }
      if (b.owner_id !== userId) {
        result(
          await db.from("city_launch_observations").upsert({
            launch_id: id,
            actor: userId ? "u:" + userId : await publicKey(request),
            kind,
          }, {
            onConflict: "launch_id,actor,kind,day",
            ignoreDuplicates: true,
          }),
        );
      }
      return { ok: true };
    }
    if (action !== "interest") {
      throw new HttpError(400, "Unknown launch action.");
    }
    return result(
      await db.rpc("city_launch_interest", {
        p_user: userId,
        p_id: uuid.parse(input.id),
        p_enabled: z.boolean().parse(input.enabled),
      }),
    );
  }
  const id = input.id ? z.string().max(48).parse(input.id) : null;
  if (action === "share") {
    const e = result(
      await db.from("city_discovery_entries").select(
        "business_id,status,published",
      ).eq("id", uuid.parse(id)).eq("kind", "launch").maybeSingle(),
    );
    const b = e
      ? result(
        await db.from("city_businesses").select("published,status").eq(
          "id",
          e.business_id,
        ).maybeSingle(),
      )
      : null;
    if (
      !e?.published || e.status !== "published" || !b?.published ||
      b.status === "suspended"
    ) throw new HttpError(404, "Launch unavailable.");
    const moment = result(
      await db.from("city_content_events").select("id").eq(
        "content_key",
        "launch:" + id,
      ).in("kind", ["launch_published", "launch_milestone"]).order(
        "created_at",
        { ascending: false },
      ).limit(1).maybeSingle(),
    );
    if (!moment) throw new HttpError(404, "No confirmed publication card yet.");
    return moment;
  }
  if (action === "analytics") {
    const businessId = uuid.parse(input.businessId);
    const b = result(
      await db.from("city_businesses").select("owner_id").eq("id", businessId)
        .maybeSingle(),
    );
    if (b?.owner_id !== userId) {
      throw new HttpError(403, "Business owner required.");
    }
    return result(
      await db.rpc("city_launch_analytics", { p_business: businessId }),
    );
  }
  if(action==='history'){
    const businessId=uuid.parse(input.businessId),offset=z.number().int().min(0).max(10000).parse(input.offset||0);
    const b=result(await db.from('city_businesses').select('id,published,status').eq('id',businessId).maybeSingle());
    if(!b?.published||b.status==='suspended')throw new HttpError(404,'Business unavailable.');
    const rows=result(await db.from('city_discovery_entries').select('id,slug,published').eq('business_id',businessId).eq('kind','launch').eq('status','published').eq('launch_paused',false).not('published','is',null).order('created_at',{ascending:false}).range(offset,offset+24))||[];
    const scores=rows.length?result(await db.rpc('city_launch_scores').in('launch_id',rows.map(r=>r.id)))||[]:[];
    return {items:rows.map(e=>({id:e.id,slug:e.slug,title:e.published.title,startsAt:e.published.startsAt,phase:launchPhase(e.published,Date.now()),interested:Number(scores.find((s:any)=>s.launch_id===e.id)?.interested||0)})),hasMore:rows.length===25};
  }
  if (!["catalog", "detail", "plaza"].includes(action)) {
    throw new HttpError(400, "Unknown launch read.");
  }
  const data = result(
    await db.rpc("city_launch_catalog", {
      p_user: userId,
      p_slug: id,
      p_filter: z.enum([
        "all",
        "today",
        "upcoming",
        "trending",
        "recent",
        "saved",
        "reminders",
      ]).parse(input.filter || "all"),
      p_query: z.string().max(160).parse(input.query || ""),
      p_category: z.string().max(60).parse(input.category || ""),
      p_offset: z.number().int().min(0).max(10000).parse(input.offset || 0),
      p_plaza: action === "plaza",
    }),
  );
  const items = await Promise.all((data.items || []).map(async (item: any) => {
    const content = { ...item.content };
    if(action!=='detail') { delete content.trailer; delete content.screenshots; }
    if(action==='plaza') delete content.cover;
    for (const field of ["cover", "trailer"]) {
      if (content[field]) {
        content[field] = (await db.storage.from("city-media").createSignedUrl(
          content[field],
          900,
        )).data?.signedUrl || "";
      }
    }
    content.screenshots = await Promise.all(
      (content.screenshots || []).map(async (path: string) =>
        (await db.storage.from("city-media").createSignedUrl(path, 900)).data
          ?.signedUrl || ""
      ),
    );
    return { ...item, content, phase: launchPhase(content, Date.now()) };
  }));
  if (action === "detail" && !items.length) {
    throw new HttpError(404, "Launch unavailable.");
  }
  return {
    ...data,
    items,
    serverTime: new Date().toISOString(),
    expiresAt: new Date((Math.floor(Date.now() / 300000) + 1) * 300000)
      .toISOString(),
    plazaEnabled: flag("CITY_LAUNCH_PLAZA_ENABLED"),
  };
}
