import type { MarketEvent } from "../../../src/domain/cityMarket.ts";
import { z } from "npm:zod@4";
import { requireUserClient } from "./auth.ts";
import {
  cityAdmin,
  flag,
  limit,
  listings,
  owner,
  publicKey,
  result,
  uuid,
} from "./city.ts";
import { HttpError } from "./http.ts";
export async function market(
  request: Request,
  raw: Record<string, unknown>,
  command = false,
) {
  if (!flag("CITY_BROWSING_ENABLED") || !flag("CITY_MARKET_ENABLED")) {
    throw new HttpError(503, "City market is not enabled.");
  }
  const db = cityAdmin(),
    action = String(raw.action).replace("market_", "");
  await limit(db, `market:${await publicKey(request)}`, 120);
  if (command && action === "exposure") {
    if (!flag("CITY_EXPOSURE_ENABLED")) return { ok: true };
    const body = z.object({
      ids: z.array(uuid).min(1).max(20),
      kind: z.enum(["canvas", "card"]),
    }).parse(raw);
    let userId: string | null = null;
    try {
      userId = (await requireUserClient(request, "city-exposure")).user.id;
    } catch { /* public browsing */ }
    const actor = userId ? `u:${userId}` : `n:${await publicKey(request)}`;
    result(
      await db.rpc("city_record_exposures", {
        p_actor: actor,
        p_user: userId,
        p_ids: [...new Set(body.ids)],
        p_kind: body.kind === "canvas" ? "canvas_exposure" : "card_impression",
      }),
    );
    return { ok: true };
  }
  if (!command && action === "public") {
    const before = z.number().int().positive().optional().parse(raw.before);
    const data = result(
      await db.rpc("city_market_read", { p_before: before ?? null }),
    );
    const events = data.events as MarketEvent[];
    const places = events
      .flatMap((e) => e.moves.flatMap((m) => [m.before, m.after]))
      .filter((p) => p !== null);
    const paths = [
      ...new Set(
        places
          .flatMap((p) => [p.logo, p.billboard])
          .filter((p): p is string => !!p),
      ),
    ];
    const urls = new Map<string, string>();
    const batches: string[][] = [];
    for (let offset = 0; offset < paths.length; offset += 100) {
      batches.push(paths.slice(offset, offset + 100));
    }
    const [top, signedGroups] = await Promise.all([
      listings(db, data.top),
      Promise.all(
        batches.map((batch) =>
          db.storage.from("city-media").createSignedUrls(batch, 3600)
        ),
      ),
    ]);
    for (const signed of signedGroups) {
      for (const item of signed.data || []) {
        if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
      }
    }
    for (const place of places) {
      place.logo = urls.get(place.logo || "") || "";
      place.billboard = urls.get(place.billboard || "") || "";
    }
    return { ...data, events, top };
  }
  const { user } = await requireUserClient(request, "city-market");
  const id = uuid.parse(raw.businessId);
  const business = await owner(db, user.id, id);
  if (!business) throw new HttpError(403, "Business access required.");
  if (!command && action === "quote") {
    const amount = z.number().int().min(1000).max(5000000).parse(raw.amount);
    return result(
      await db.rpc("city_market_quote", { p_business: id, p_amount: amount }),
    );
  }
  if (!command && action === "position") {
    const [place, history, alerts, prefs] = await Promise.all([
      db
        .from("city_listings")
        .select("rank,land_value,tier,x,z")
        .eq("business_id", id)
        .maybeSingle(),
      db
        .from("city_events")
        .select("id,from_rank,to_rank,kind,created_at,revision")
        .eq("business_id", id)
        .order("revision", { ascending: false })
        .limit(50),
      db
        .from("city_market_alerts")
        .select("*")
        .eq("business_id", id)
        .order("created_at", { ascending: false })
        .limit(30),
      db
        .from("city_market_preferences")
        .select("*")
        .eq("business_id", id)
        .maybeSingle(),
    ]);
    const best = result(
      await db
        .from("city_events")
        .select("to_rank")
        .eq("business_id", id)
        .order("to_rank")
        .limit(1),
    );
    const current = result(place);
    const comparison = current
      ? await db
        .from("city_listings")
        .select("business_id", { count: "exact", head: true })
        .eq("profile->>category", business.published?.category || "")
        .lt("rank", current.rank)
      : null;
    if (comparison?.error) throw comparison.error;
    const metrics = result(
      await db.rpc("city_market_metrics", { p_business: id }),
    );
    return {
      metrics,
      category: business.published?.category || null,
      categoryRank: current ? 1 + (comparison?.count || 0) : null,
      place: result(place),
      history: result(history),
      alerts: result(alerts),
      preferences: result(prefs),
      bestRank: best?.[0]?.to_rank ?? null,
    };
  }
  if (command && action === "preferences") {
    const p = z
      .object({
        lose_central: z.boolean(),
        leave_top_ten: z.boolean(),
        below_rank: z.number().int().min(1).max(100000).nullable(),
      })
      .parse(raw);
    result(
      await db
        .from("city_market_preferences")
        .upsert({ business_id: id, ...p }),
    );
    return { ok: true };
  }
  if (command && action === "read") {
    const alert = uuid.parse(raw.alertId);
    result(
      await db
        .from("city_market_alerts")
        .update({ read_at: new Date().toISOString() })
        .eq("id", alert)
        .eq("business_id", id),
    );
    return { ok: true };
  }
  throw new HttpError(400, "Unknown market action.");
}
