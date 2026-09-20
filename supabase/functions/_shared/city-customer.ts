import { living } from "./city-living.ts";
import { z } from "npm:zod@4";
import { requireUserClient } from "./auth.ts";
import {
  cityAdmin,
  flag,
  limit,
  owner,
  publicKey,
  result,
  uuid,
} from "./city.ts";
import { HttpError } from "./http.ts";

export async function customer(
  request: Request,
  raw: Record<string, unknown>,
  command = false,
) {
  if (
    !flag("CITY_DISCOVERY_ENABLED") || !flag("CITY_BROWSING_ENABLED") ||
    !flag("CITY_CUSTOMER_DISCOVERY_ENABLED")
  ) throw new HttpError(503, "Customer discovery is not enabled.");
  const db = cityAdmin(), action = String(raw.action).replace("customer_", "");
  const key = await publicKey(request);
  await limit(
    db,
    `customer:${command ? action : "read"}:${key}`,
    command ? (action === "event" ? 600 : 120) : 180,
    command ? 3600 : 60,
  );
  if (
    [
      "city_state",
      "inbox",
      "inbox_read",
      "reminder",
      "campaign_history",
      "moment",
      "resolve_launch",
    ].includes(action)
  ) return living(request, raw, command);
  if (!command && action === "nearby") {
    const point = z.object({
      x: z.number().min(-10000).max(10000),
      z: z.number().min(-10000).max(10000),
    }).parse(raw);
    const kinds = [
      ...(flag("CITY_DEALS_ENABLED") ? ["deal"] : []),
      ...(flag("CITY_CAMPUS_ENABLED") ? ["exhibit", "launch"] : []),
    ];
    if (!kinds.length) return { items: [] };
    const items = result(
      await db.from("city_customer_content").select(
        "key,business_id,slug,business_name,category,kind,content_id,title,description,destination,rank,x,z,created_at,starts_at,ends_at,remaining,free,exclusive,available",
      ).gte("x", point.x - 6).lte("x", point.x + 6).gte("z", point.z - 6).lte(
        "z",
        point.z + 6,
      ).in("kind", kinds).eq("available", true).order("created_at", {
        ascending: false,
      }).limit(40),
    ) || [];
    return {
      items: items.filter((
        i: { starts_at: string | null; ends_at: string | null },
      ) =>
        (!i.starts_at || Date.parse(i.starts_at) <= Date.now()) &&
        (!i.ends_at || Date.parse(i.ends_at) > Date.now())
      ).slice(0, 12),
    };
  }
  if (!command && action === "destination") {
    const id = uuid.parse(raw.businessId);
    const kinds = [
      "business",
      ...(flag("CITY_DEALS_ENABLED") ? ["deal"] : []),
      ...(flag("CITY_CAMPUS_ENABLED") ? ["exhibit", "launch"] : []),
    ];
    const items = result(
      await db.from("city_customer_content").select(
        "key,business_id,slug,business_name,category,kind,content_id,title,description,destination,rank,x,z,created_at,starts_at,ends_at,remaining,free,exclusive,available",
      ).eq("business_id", id).in("kind", kinds).eq("available", true).order(
        "created_at",
        { ascending: false },
      ).limit(24),
    ) || [];
    const priority = (
      item: { kind: string; exclusive: boolean; free: boolean },
    ) =>
      item.kind === "deal"
        ? (item.exclusive ? 0 : 1)
        : item.kind === "exhibit"
        ? 2
        : item.kind === "launch"
        ? 3
        : 4;
    return {
      items: items.filter((i: { ends_at: string | null }) =>
        !i.ends_at || Date.parse(i.ends_at) > Date.now()
      ).sort((a: any, b: any) => priority(a) - priority(b)).slice(0, 3),
    };
  }
  if (!command && action === "search") {
    const p = z.object({
      query: z.string().max(160).default(""),
      filter: z.enum(["all", "hot", "free", "exclusive", "ending", "drops", "deals"])
        .default(
          "all",
        ),
      category: z.string().max(80).default(""),
      offset: z.number().int().min(0).max(10000).default(0),
    }).parse(raw);
    const data = result(
      await db.rpc("city_customer_search", {
        p_query: p.query,
        p_filter: p.filter,
        p_category: p.category,
        p_offset: p.offset,
        p_deals: flag("CITY_DEALS_ENABLED"),
        p_campus: flag("CITY_CAMPUS_ENABLED"),
      }),
    );
    return {
      ...data,
      hasMore: data.items.length > 40,
      items: data.items.slice(0, 40),
    };
  }
  if (!command && (action === "resolve" || action === "share")) {
    if (!flag("CITY_DEALS_ENABLED")) {
      throw new HttpError(404, "Deal unavailable.");
    }
    const id = uuid.parse(raw.id),
      row = result(
        await db.from("city_customer_content").select(
          "key,business_id,slug,business_name,category,kind,content_id,title,description,destination,rank,x,z,created_at,starts_at,ends_at,remaining,free,exclusive,available",
        ).eq("kind", "deal").eq("content_id", id).maybeSingle(),
      );
    if (!row) throw new HttpError(404, "Property unavailable.");
    return action === "share"
      ? {
        kind: "deal",
        name: row.title,
        description: row.description,
        rank: 0,
        value: 0,
        color: "#355b45",
        date: row.created_at,
        slug: id,
      }
      : row;
  }
  if (!command && action === "activity") {
    const rows = result(
      await db.from("city_customer_content").select(
        "key,business_id,business_name,title,kind,destination,created_at,starts_at,ends_at,remaining,available",
      ).in(
        "kind",
        flag("CITY_DEALS_ENABLED") ? ["deal", "launch"] : ["launch"],
      ).eq("available", true).order("created_at", { ascending: false }).limit(
        12,
      ),
    ) || [];
    return {
      items: [
        ...(flag("CITY_DEALS_ENABLED")
          ? result(await db.rpc("city_customer_claim_activity")) || []
          : []),
        ...rows.map((r: any) => ({
          ...r,
          label: r.kind === "deal"
            ? `${r.business_name}: ${r.title} · ${r.remaining} codes available`
            : `${r.business_name}: ${r.title}`,
        })),
      ],
    };
  }
  let userId: string | null = null;
  if (request.headers.get("authorization")) {
    try {
      userId = (await requireUserClient(request, "city-customer")).user.id;
    } catch { /* anonymous browse */ }
  }
  if (command && action === "track") {
    const id = uuid.parse(raw.businessId),
      kind = z.enum(["property_open", "deal_open"]).parse(raw.kind);
    if (kind === "deal_open") {
      if (!flag("CITY_DEALS_ENABLED")) return { ok: true };
      const d = result(
        await db.from("city_customer_content").select("business_id").eq(
          "kind",
          "deal",
        ).eq("content_id", uuid.parse(raw.dealId)).eq("business_id", id)
          .maybeSingle(),
      );
      if (!d) throw new HttpError(404, "Deal unavailable.");
    }
    result(
      await db.rpc("city_customer_record", {
        p_business: id,
        p_actor: userId ? `u:${userId}` : `n:${key}`,
        p_kind: kind,
      }),
    );
    return { ok: true };
  }
  if (command && action === "event") {
    const kind = z.enum([
      "city_open",
      "search",
      "search_result_click",
      "surprise_me",
      "wallet_open",
      "property_impression",
      "deal_impression",
      "merchant_visit",
    ]).parse(raw.kind);
    let businessId = raw.businessId ? uuid.parse(raw.businessId) : null;
    if (raw.dealId && flag("CITY_DEALS_ENABLED")) {
      const deal = result(
        await db.from("city_customer_content").select("business_id").eq(
          "kind",
          "deal",
        ).eq("content_id", uuid.parse(raw.dealId)).maybeSingle(),
      );
      if (!deal) return { ok: true };
      businessId = deal.business_id;
    }
    if (businessId) {
      const b = result(
        await db.from("city_businesses").select("owner_id").eq("id", businessId)
          .not("published", "is", null).neq("status", "suspended")
          .maybeSingle(),
      );
      if (!b || b.owner_id === userId) return { ok: true };
    }
    result(
      await db.from("city_customer_metrics").upsert({
        actor: userId ? `u:${userId}` : `n:${key}`,
        kind,
        business_id: businessId,
        scope: businessId || "city",
      }, { onConflict: "actor,kind,scope,day", ignoreDuplicates: true }),
    );
    return { ok: true };
  }
  if (!userId) throw new HttpError(401, "Sign in to access your wallet.");
  if (command && action === "merge") {
    const items = z.array(
      z.object({ id: uuid, kind: z.enum(["deal", "business", "launch"]) }),
    ).max(200).parse(raw.items);
    return {
      merged: result(
        await db.rpc("city_customer_merge", {
          p_user: userId,
          p_items: items,
          p_deals: flag("CITY_DEALS_ENABLED"),
        }),
      ),
    };
  }
  if (!command && action === "metrics") {
    const id = uuid.parse(raw.businessId);
    if (!await owner(db, userId, id)) {
      throw new HttpError(403, "Business owner required.");
    }
    return result(await db.rpc("city_customer_funnel", { p_business: id }));
  }
  if (command && action === "save" && raw.kind === "launch") {
    result(
      await db.rpc("city_discovery_mutate", {
        p_user: userId,
        p_action: "save_launch",
        p_data: {
          id: uuid.parse(raw.id),
          enabled: z.boolean().parse(raw.saved),
        },
      }),
    );
    return { ok: true };
  }
  if (command && action === "save" && raw.kind === "business") {
    result(
      await db.rpc("city_mutate", {
        p_user: userId,
        p_action: "save_business",
        p_data: {
          businessId: uuid.parse(raw.id),
          saved: z.boolean().parse(raw.saved),
        },
      }),
    );
    return { ok: true };
  }
  if (command && action === "save") {
    if (!flag("CITY_DEALS_ENABLED")) {
      throw new HttpError(503, "Deals are unavailable.");
    }
    result(
      await db.rpc("city_customer_save_deal", {
        p_user: userId,
        p_deal: uuid.parse(raw.id),
        p_saved: z.boolean().parse(raw.saved),
      }),
    );
    return { ok: true };
  }
  if (!command && action === "wallet") {
    const saved = flag("CITY_DEALS_ENABLED")
      ? result(
        await db.from("city_saved_deals").select("deal_id").eq(
          "user_id",
          userId,
        ).order("created_at", { ascending: false }).limit(200),
      ) || []
      : [];
    const ids = saved.map((s: any) => s.deal_id);
    const items = ids.length
      ? result(
        await db.from("city_customer_content").select(
          "key,business_id,slug,business_name,kind,content_id,title,description,destination,available,ends_at,remaining",
        ).eq("kind", "deal").in("content_id", ids),
      ) || []
      : [];
    const count = flag("CITY_DEALS_ENABLED")
      ? await db.from("city_deal_claims").select("id", {
        count: "exact",
        head: true,
      }).eq("user_id", userId).eq("cancelled", false).is("redeemed_at", null)
        .or(
          `terms->>redeemBy.is.null,terms->>redeemBy.gt.${
            new Date().toISOString()
          }`,
        )
      : null;
    if (count?.error) throw count.error;
    const businesses = result(
      await db.from("city_saves").select("business_id").eq("user_id", userId)
        .limit(200),
    ) || [];
    const businessItems = businesses.length
      ? result(
        await db.from("city_customer_content").select(
          "key,business_id,slug,business_name,kind,content_id,title,description,destination,available,ends_at,remaining",
        ).eq("kind", "business").in(
          "business_id",
          businesses.map((b: any) => b.business_id),
        ),
      ) || []
      : [];
    const follows = result(
      await db.from("city_follows").select("business_id").eq(
        "user_id",
        userId,
      ).limit(200),
    ) || [];
    const launches = result(
      await db.from("city_saved_launches").select("launch_id").eq(
        "user_id",
        userId,
      ).limit(200),
    ) || [];
    const columns =
      "key,business_id,content_id,title,business_name,destination,starts_at,ends_at,kind,available";
    const followed = follows.length
      ? result(
        await db.from("city_customer_content").select(columns).in(
          "business_id",
          follows.map((f: any) => f.business_id),
        ).in(
          "kind",
          flag("CITY_DEALS_ENABLED") ? ["launch", "deal"] : ["launch"],
        ).eq("available", true).order("created_at", { ascending: false }).limit(
          20,
        ),
      ) || []
      : [];
    const savedLaunches = launches.length
      ? result(
        await db.from("city_customer_content").select(columns).eq(
          "kind",
          "launch",
        ).in("content_id", launches.map((l: any) => l.launch_id)).eq(
          "available",
          true,
        ).limit(20),
      ) || []
      : [];
    const reminders = [
      ...new Map([...savedLaunches, ...followed].map((r: any) => [r.key, r]))
        .values(),
    ];
    return {
      active: count?.count || 0,
      saved: [...items, ...businessItems, ...savedLaunches],
      savedIds: ids,
      reminders,
    };
  }
  throw new HttpError(400, "Unknown customer action.");
}
