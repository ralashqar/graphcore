import { z } from "npm:zod@4";
import { requireUserClient } from "./auth.ts";
import { cityAdmin, flag, owner, result, uuid } from "./city.ts";
import { HttpError } from "./http.ts";
import {
  activityBand,
  resolveStorefront,
  type StorefrontContent,
} from "../../../src/domain/cityLiving.ts";
export async function living(
  request: Request,
  raw: Record<string, unknown>,
  command: boolean,
) {
  const db = cityAdmin(), action = String(raw.action).replace("customer_", "");
  const storefronts = flag("CITY_STOREFRONTS_ENABLED"),
    activity = flag("CITY_ACTIVITY_ENABLED"),
    deals = flag("CITY_DEALS_ENABLED"),
    launches = flag("CITY_CAMPUS_ENABLED");
  if (!storefronts && !activity) {
    throw new HttpError(503, "Living city is not enabled.");
  }
  if (!command && action === "city_state") {
    const ids = z.array(uuid).max(100).parse(raw.ids),
      now = Date.now(),
      measured = Math.floor(now / 300000) * 300000;
    const businesses = result(
      await db.from("city_businesses").select("id").in("id", ids).not(
        "published",
        "is",
        null,
      ).neq("status", "suspended"),
    ) || [];
    const allowed = businesses.map((b: { id: string }) => b.id);
    const [contents, scores] = await Promise.all([
      storefronts
        ? db.rpc("city_living_content", {
          p_ids: allowed,
          p_deals: deals,
          p_launches: launches,
        })
        : Promise.resolve({ data: [], error: null }),
      activity
        ? db.rpc("city_activity_summary", { p_ids: allowed })
        : Promise.resolve({ data: [], error: null }),
    ]);
    const items = result(
      contents,
    ) as (StorefrontContent & { business_id: string })[];
    const aggregates = result(scores) as {
      business_id: string;
      actors: number;
      score: number;
    }[];
    return {
      now: new Date(now).toISOString(),
      states: allowed.map((id: string) => {
        const a = aggregates.find((s) => s.business_id === id);
        return {
          businessId: id,
          ...resolveStorefront(items.filter((i) => i.business_id === id), now),
          band: activityBand(Number(a?.score || 0), Number(a?.actors || 0)),
          windowStart: new Date(now - 172800000).toISOString(),
          measuredAt: new Date(measured).toISOString(),
          expiresAt: new Date(
            Math.min(
              measured + 300000,
              ...items.filter((i) => i.business_id === id).flatMap(
                (i) => [
                  i.starts_at,
                  i.ends_at,
                  i.sold_out_at
                    ? new Date(Date.parse(i.sold_out_at) + 86400000)
                      .toISOString()
                    : null,
                ],
              ).filter((v): v is string => !!v && Date.parse(v) > now).map(
                (v) => Date.parse(v),
              ),
            ),
          ).toISOString(),
          version: 1,
        };
      }),
    };
  }
  if (!command && action === "resolve_launch") {
    if (!storefronts || !launches) {
      throw new HttpError(404, "Launch unavailable.");
    }
    const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{2,47}$/).parse(raw.id);
    const entry = result(
      await db.from("city_discovery_entries").select("id").eq("kind", "launch")
        .eq("slug", slug).eq("status", "published").maybeSingle(),
    );
    const item = entry
      ? result(
        await db.from("city_customer_content").select(
          "key,business_id,slug,business_name,category,kind,content_id,title,description,destination,rank,x,z,created_at,starts_at,ends_at,remaining,free,exclusive,available",
        ).eq("key", "launch:" + entry.id).maybeSingle(),
      )
      : null;
    if (!item) throw new HttpError(404, "Launch unavailable.");
    return item;
  }
  if (!command && action === "moment") {
    const id = uuid.parse(raw.id),
      event = result(
        await db.from("city_content_events").select(
          "id,business_id,kind,title,business_name,destination,evidence,created_at",
        ).eq("id", id).maybeSingle(),
      );
    if (
      !event || (event.kind === "organic_milestone" && !activity) ||
      (["sold_out", "deal_published"].includes(event.kind) && !deals) ||
      (event.kind === "launch_published" && !launches)
    ) throw new HttpError(404, "Moment unavailable.");
    const b = result(
      await db.from("city_businesses").select("id").eq("id", event.business_id)
        .not("published", "is", null).neq("status", "suspended").maybeSingle(),
    );
    if (!b) throw new HttpError(404, "Moment unavailable.");
    return event;
  }
  const { user } = await requireUserClient(request, "city-living");
  if (!command && action === "inbox") {
    return result(
      await db.rpc("city_living_inbox", {
        p_user: user.id,
        p_deals: deals && storefronts,
        p_launches: launches && storefronts,
        p_activity: activity,
        p_offset: z.number().int().min(0).max(10000).default(0).parse(
          raw.offset,
        ),
      }),
    );
  }
  if (command && action === "inbox_read") {
    const keys = z.array(z.string().min(1).max(200)).min(1).max(40).parse(
      raw.keys,
    );
    result(
      await db.from("city_inbox_receipts").upsert(
        keys.map((item_key) => ({ user_id: user.id, item_key })),
        { onConflict: "user_id,item_key", ignoreDuplicates: true },
      ),
    );
    return { ok: true };
  }
  if (command && action === "reminder") {
    if (!storefronts || !launches) {
      throw new HttpError(503, "Launch reminders are not enabled.");
    }
    result(
      await db.rpc("city_living_preference", {
        p_user: user.id,
        p_launch: uuid.parse(raw.launchId),
        p_enabled: z.boolean().parse(raw.enabled),
      }),
    );
    return { ok: true };
  }
  if (!command && action === "campaign_history") {
    const id = uuid.parse(raw.businessId);
    await owner(db, user.id, id);
    const events = result(
      await db.from("city_content_events").select(
        "id,kind,title,business_name,destination,evidence,created_at",
      ).eq("business_id", id).order("created_at", { ascending: false }).range(
        z.number().int().min(0).max(10000).default(0).parse(raw.offset),
        z.number().int().min(0).max(10000).default(0).parse(raw.offset) + 39,
      ),
    ) || [];
    const follows = await db.from("city_follows").select("user_id", {
      count: "exact",
      head: true,
    }).eq("business_id", id);
    result(follows);
    const previewItems: StorefrontContent[] = [];
    if (storefronts && deals) {
      const drafts = result(
        await db.from("city_deals").select("id,terms,quantity,issued").eq(
          "business_id",
          id,
        ).neq("status", "approved").eq("ended", false).order("created_at", {
          ascending: false,
        }).limit(40),
      ) || [];
      for (const d of drafts) {
        previewItems.push({
          key: "deal:" + d.id,
          kind: "deal",
          title: d.terms.title,
          destination: "/city/deal/" + d.id,
          starts_at: d.terms.startsAt,
          ends_at: d.terms.endsAt,
          remaining: Math.max(0, d.quantity - d.issued),
          free: d.terms.freeConfirmed === true && d.terms.minimumSpend === 0,
          exclusive: d.terms.exclusive === true,
          available: true,
        });
      }
    }
    if (storefronts && launches) {
      const drafts = result(
        await db.from("city_discovery_entries").select("id,slug,draft").eq(
          "business_id",
          id,
        ).eq("kind", "launch").eq("status", "pending").order("created_at", {
          ascending: false,
        }).limit(40),
      ) || [];
      for (const e of drafts) {
        previewItems.push({
          key: "launch:" + e.id,
          kind: "launch",
          title: e.draft.title,
          destination: "/city/launches/" + e.slug,
          starts_at: e.draft.startsAt,
          ends_at: e.draft.endsAt,
          remaining: null,
          free: false,
          exclusive: false,
          available: true,
        });
      }
    }
    return {
      preview: resolveStorefront(previewItems, Date.now()),
      events: events.filter((e: { kind: string }) =>
        (activity || e.kind !== "organic_milestone") &&
        (deals || !["sold_out", "deal_published"].includes(e.kind)) &&
        (launches || e.kind !== "launch_published")
      ),
      followers: follows.count || 0,
    };
  }
  throw new HttpError(400, "Unknown living city action.");
}
