import { discovery } from "../_shared/city-discovery.ts";
import { z } from "npm:zod@4";
import { requireUserClient } from "../_shared/auth.ts";
import {
  json,
  maybeHandleOptions,
  errorResponse,
  HttpError,
} from "../_shared/http.ts";
import {
  cityAdmin,
  result,
  flag,
  listings,
  event,
  owner,
  isAdmin,
  limit,
  uuid,
  signProfile,
  publicKey,
} from "../_shared/city.ts";

Deno.serve(async (request) => {
  const options = maybeHandleOptions(request);
  if (options) return options;
  try {
    if (request.method !== "POST") throw new HttpError(405, "Use POST.");
    const raw = await request.json();
    if (
      ["discovery_catalog", "discovery_workspace", "discovery_share"].includes(
        raw.action,
      )
    )
      return json(await discovery(request, raw));
    const body = z
      .object({
        action: z.enum([
          "snapshot",
          "search",
          "workspace",
          "admin",
          "saved",
          "directory",
          "share",
        ]),
        query: z.string().max(160).optional(),
        eventId: uuid.optional(),
        sort: z.enum(["rank", "saves", "claims"]).optional(),
        offset: z.number().int().min(0).max(100000).optional(),
        slug: z.string().max(48).optional(),
        x: z.number().int().min(-10000).max(10000).optional(),
        z: z.number().int().min(-10000).max(10000).optional(),
      })
      .parse(raw);
    const db = cityAdmin();
    if (["share", "snapshot", "search", "directory"].includes(body.action)) {
      if (!flag("CITY_BROWSING_ENABLED"))
        throw new HttpError(503, "The city is not open yet.");
      await limit(db, `public:${await publicKey(request)}`, 180);
    }
    if (body.action === "share") {
      if (!flag("CITY_BROWSING_ENABLED"))
        throw new HttpError(503, "The city is not open yet.");
      if (body.eventId) {
        const item = result(
          await db
            .from("city_events")
            .select("*,city_businesses!inner(status,slug)")
            .eq("id", body.eventId)
            .neq("city_businesses.status", "suspended")
            .maybeSingle(),
        );
        if (!item) throw new HttpError(404, "City moment unavailable.");
        return json({
          name: item.name,
          rank: item.to_rank,
          value: Number(item.land_value),
          color: item.color,
          date: item.created_at,
          slug: item.city_businesses.slug,
        });
      }
      if (!body.slug)
        throw new HttpError(400, "A property address is required.");
      const item = result(
        await db
          .from("city_listings")
          .select("*")
          .eq("slug", body.slug)
          .maybeSingle(),
      );
      if (!item && flag("CITY_DISCOVERY_ENABLED")) {
        const b = result(
          await db
            .from("city_businesses")
            .select("slug,published")
            .eq("slug", body.slug)
            .not("published", "is", null)
            .neq("status", "suspended")
            .maybeSingle(),
        );
        if (b)
          return json({
            name: b.published.name,
            description: b.published.tagline,
            kind: "storefront",
            rank: 0,
            value: 0,
            color: b.published.color,
            date: new Date().toISOString(),
            slug: b.slug,
          });
      }
      if (!item) throw new HttpError(404, "Property unavailable.");
      return json({
        name: item.profile.name,
        description: item.profile.tagline,
        rank: item.rank,
        value: Number(item.land_value),
        color: item.profile.color,
        date: new Date().toISOString(),
        slug: item.slug,
      });
    }
    if (
      body.action === "snapshot" ||
      body.action === "search" ||
      body.action === "directory"
    ) {
      if (!flag("CITY_BROWSING_ENABLED"))
        throw new HttpError(503, "The city is not open yet.");
      const snapshot = result(
        await db.rpc("city_public_snapshot", {
          p_x: body.x || 0,
          p_z: body.z || 0,
          p_slug: body.slug || null,
          p_mode: body.action,
          p_query: body.query || "",
          p_sort: body.sort || "rank",
          p_offset: body.offset || 0,
        }),
      );
      return json({
        ...snapshot,
        properties: await listings(db, snapshot.properties),
        events: snapshot.events.map(event),
        purchasesEnabled: flag("CITY_PURCHASES_ENABLED"),
        onboardingEnabled: flag("CITY_ONBOARDING_ENABLED"),
        discoveryEnabled: flag("CITY_DISCOVERY_ENABLED"),
        termsUrl: Deno.env.get("CITY_TERMS_URL") || null,
      });
    }
    const { user } = await requireUserClient(request, "city-api");
    await limit(db, `read:${user.id}`, 120);
    if (body.action === "saved") {
      const saved =
        result(
          await db
            .from("city_saves")
            .select("business_id")
            .eq("user_id", user.id),
        ) || [];
      const rows = saved.length
        ? result(
            await db
              .from("city_listings")
              .select("*")
              .in(
                "business_id",
                saved.map((s) => s.business_id),
              ),
          )
        : [];
      const storefronts =
        saved.length && flag("CITY_DISCOVERY_ENABLED")
          ? (
              result(
                await db
                  .from("city_businesses")
                  .select("id,slug,published")
                  .in(
                    "id",
                    saved.map((s) => s.business_id),
                  )
                  .not("published", "is", null)
                  .neq("status", "suspended"),
              ) || []
            ).map((b) => ({ id: b.id, slug: b.slug, name: b.published.name }))
          : [];
      return json({ properties: await listings(db, rows || []), storefronts });
    }
    if (body.action === "admin") {
      if (!(await isAdmin(db, user.id)))
        throw new HttpError(403, "Administrator access required.");
      const businesses =
        result(
          await db
            .from("city_businesses")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(100),
        ) || [];
      return json({
        businesses: await Promise.all(
          businesses.map(async (b) => ({
            ...b,
            preview: await signProfile(db, b.draft),
            analytics: result(
              await db.rpc("city_analytics", { p_business: b.id }),
            ),
          })),
        ),
        reports: result(
          await db
            .from("city_reports")
            .select("*")
            .eq("status", "open")
            .limit(100),
        ),
        orders: result(
          await db
            .from("city_orders")
            .select("*")
            .not("last_error", "is", null)
            .limit(50),
        ),
      });
    }
    const business = await owner(db, user.id);
    return json({
      business: business
        ? { ...business, preview: await signProfile(db, business.draft) }
        : null,
      orders: business
        ? result(
            await db
              .from("city_orders")
              .select("id,amount,status,created_at,checkout_url")
              .eq("business_id", business.id)
              .order("created_at", { ascending: false })
              .limit(50),
          )
        : [],
      saved: (
        result(
          await db
            .from("city_saves")
            .select("business_id")
            .eq("user_id", user.id),
        ) || []
      ).map((s) => s.business_id),
      claims:
        result(
          await db
            .from("city_claims")
            .select("business_id,created_at,business_name,offer")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(100),
        ) || [],
      analytics: business
        ? result(
            await db.rpc("city_analytics", {
              p_business: uuid.parse(business.id),
            }),
          )
        : {},
      history: business
        ? (
            result(
              await db
                .from("city_events")
                .select("*")
                .eq("business_id", business.id)
                .order("created_at", { ascending: false })
                .limit(30),
            ) || []
          ).map(event)
        : [],
      admin: await isAdmin(db, user.id),
    });
  } catch (error) {
    return errorResponse(error, "Unable to load the city.");
  }
});
