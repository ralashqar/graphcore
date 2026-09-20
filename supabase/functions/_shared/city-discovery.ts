import { LAUNCH_TYPES } from "../../../src/domain/cityLaunches.ts";
import { importURL } from "./city-network.ts";
import { z } from "npm:zod@4";
import { requireUserClient } from "./auth.ts";
import { HttpError } from "./http.ts";
import {
  cityAdmin,
  flag,
  result,
  signProfile,
  listings,
  uuid,
  limit,
  publicKey,
  isAdmin,
} from "./city.ts";
const title = z.string().trim().min(2).max(100),
  description = z.string().trim().min(1).max(1000);
const trail = z
  .object({
    title,
    description,
    outcome: z.string().trim().min(1).max(200),
    cover: z.string().max(300),
    stops: z
      .array(
        z
          .object({
            businessId: uuid,
            reason: z.string().trim().min(1).max(300),
          })
          .strict(),
      )
      .min(3)
      .max(5),
  })
  .strict()
  .refine(
    (v) => new Set(v.stops.map((s) => s.businessId)).size === v.stops.length,
    "Use distinct trail stops",
  );
const launch = z
  .object({
    title,
    description,
    schemaVersion: z.literal(2).optional(),
    launchType: z.enum(LAUNCH_TYPES).optional(),
    productKey: z.string().trim().max(80).optional(),
    tagline: z.string().trim().max(160).optional(),
    category: z.string().trim().max(60).optional(),
    secondaryCategories: z.array(z.string().trim().max(60)).max(2).optional(),
    cover: z.string().max(300).optional(),
    screenshots: z.array(z.string().max(300)).max(5).optional(),
    trailer: z.string().max(300).optional(),
    destination: z.string().max(2048).refine(v=>{try{return !v || !!importURL(v);}catch{return false;}}, "Use a public HTTPS destination").optional(),
    rewardDealId: uuid.nullable().optional(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
  })
  .strict()
  .refine(
    (v) => Date.parse(v.endsAt) > Date.parse(v.startsAt),
    "End must follow start",
  );
export async function discovery(
  request: Request,
  input: Record<string, unknown>,
  write = false,
) {
  if (!flag("CITY_DISCOVERY_ENABLED") || !flag("CITY_BROWSING_ENABLED"))
    throw new HttpError(503, "Discovery is not open yet.");
  const db = cityAdmin(),
    action = z
      .string()
      .parse(input.action)
      .replace(/^discovery_/, "");
  let userId: string | null = null;
  if ((write && action !== "track") || action === "workspace")
    userId = (await requireUserClient(request, "city-discovery")).user.id;
  else if (request.headers.get("authorization")) {
    try {
      userId = (await requireUserClient(request, "city-discovery")).user.id;
    } catch {
      /* anonymous public reads */
    }
  }
  await limit(db, `discovery:${userId || (await publicKey(request))}`, 120);
  if (!write) {
    const admin = userId ? await isAdmin(db, userId) : false;
    const query = z
        .string()
        .max(160)
        .parse(input.query || ""),
      offset = z
        .number()
        .int()
        .min(0)
        .max(100000)
        .parse(input.offset || 0);
    const entries =
      result(
        await db
          .from("city_discovery_entries")
          .select("*")
          .not("published", "is", null)
          .neq("status", "archived")
          .order("created_at", { ascending: false })
          .limit(100),
      ) || [];
    let businessesQuery = db
      .from("city_businesses")
      .select("id,slug,published,status")
      .not("published", "is", null)
      .neq("status", "suspended");
    if (input.slug)
      businessesQuery = businessesQuery.eq(
        "slug",
        z.string().max(48).parse(input.slug),
      );
    else if (query)
      businessesQuery = businessesQuery.ilike(
        "published->>name",
        `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`,
      );
    let businesses =
      result(await businessesQuery.order("id").range(offset, offset + 49)) ||
      [];
    const hasMore = businesses.length === 50;
    const followed = userId
      ? (
          result(
            await db
              .from("city_follows")
              .select("business_id")
              .eq("user_id", userId)
              .limit(500),
          ) || []
        ).map((v) => v.business_id)
      : [];
    const needed = [
      ...new Set([
        ...followed,
        ...entries.flatMap((e) =>
          e.kind === "launch"
            ? [e.business_id]
            : e.published.stops.map((s: any) => s.businessId),
        ),
      ]),
    ].filter((id) => !businesses.some((b) => b.id === id));
    if (needed.length && !query && !input.slug)
      businesses = [
        ...businesses,
        ...(result(
          await db
            .from("city_businesses")
            .select("id,slug,published,status")
            .in("id", needed)
            .not("published", "is", null)
            .neq("status", "suspended"),
        ) || []),
      ];
    // Eligibility for launches is checked independently of the current directory page/search.
    const launchIds = entries
      .filter((e) => e.kind === "launch")
      .map((e) => e.business_id);
    const validLaunchIds = launchIds.length
      ? new Set(
          (
            result(
              await db
                .from("city_businesses")
                .select("id")
                .in("id", launchIds)
                .not("published", "is", null)
                .neq("status", "suspended"),
            ) || []
          ).map((b) => b.id),
        )
      : new Set();
    const placements = businesses.length
      ? await listings(
          db,
          result(
            await db
              .from("city_listings")
              .select("*")
              .in(
                "business_id",
                businesses.map((b) => b.id),
              ),
          ) || [],
        )
      : [];
    const storefronts = await Promise.all(
      businesses.map(async (b) => {
        const lightweight = { ...b.published }; delete lightweight.campus;
        const profile = await signProfile(db, lightweight);
        profile.offer = { ...(profile.offer as object), code: "" };
        return {
          id: b.id,
          slug: b.slug,
          profile,
          placement: placements.find((p) => p.id === b.id) || null,
        };
      }),
    );
    const publicEntries = await Promise.all(
      entries
        .filter((e) => e.kind !== "launch" || validLaunchIds.has(e.business_id))
        .map(async (e) => {
          const content = { ...e.published };
          if (content.cover)
            content.cover =
              (
                await db.storage
                  .from("city-media")
                  .createSignedUrl(content.cover, 3600)
              ).data?.signedUrl || "";
          return {
            id: e.id,
            slug: e.slug,
            kind: e.kind,
            business_id: e.business_id,
            content,
            featured: e.featured,
          };
        }),
    );
    if (action === "share") {
      const kind = z.enum(["trail", "launch"]).parse(input.kind);
      const e = publicEntries.find(
        (e) => e.kind === kind && e.slug === input.slug,
      );
      if (!e) throw new HttpError(404, "Property unavailable.");
      return {
        name: e.content.title,
        description: e.content.description,
        kind,
        rank: 0,
        value: 0,
        color: "#547364",
        date: new Date().toISOString(),
        slug: e.slug,
      };
    }
    let drafts: any[] = [],
      metrics: any[] = [];
    if (action === "workspace" && userId) {
      let draftQuery = db
        .from("city_discovery_entries")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      const owned = result(
        await db
          .from("city_businesses")
          .select("id")
          .eq("owner_id", userId)
          .maybeSingle(),
      );
      if (admin) drafts = result(await draftQuery) || [];
      else if (owned)
        drafts = result(await draftQuery.eq("business_id", owned.id)) || [];
      let metricQuery = db
        .from("city_discovery_metrics")
        .select("scope,kind")
        .gte(
          "day",
          new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
        )
        .limit(10000);
      if (admin || owned) {
        const raw =
          result(
            await (admin
              ? metricQuery
              : metricQuery.eq("business_id", owned!.id)),
          ) || [];
        const counts = new Map<string, any>();
        for (const m of raw) {
          const key = m.scope + ":" + m.kind;
          counts.set(key, { ...m, count: (counts.get(key)?.count || 0) + 1 });
        }
        metrics = [...counts.values()];
      }
    }
    return {
      launchesEnabled: flag('CITY_LAUNCHES_ENABLED'),
      now: new Date().toISOString(),
      storefronts,
      entries: publicEntries,
      hasMore,
      drafts,
      metrics,
      follows: userId
        ? (
            result(
              await db
                .from("city_follows")
                .select("business_id")
                .eq("user_id", userId),
            ) || []
          ).map((v) => v.business_id)
        : [],
      savedLaunches: userId
        ? (
            result(
              await db
                .from("city_saved_launches")
                .select("launch_id")
                .eq("user_id", userId),
            ) || []
          ).map((v) => v.launch_id)
        : [],
      progress: userId
        ? result(
            await db
              .from("city_trail_progress")
              .select("trail_id,completed")
              .eq("user_id", userId),
          ) || []
        : [],
    };
  }
  if (action === "track") {
    const kind = z
      .enum([
        "trail_start",
        "trail_complete",
        "sample_start",
        "sample_interaction",
        "launch_view",
        "follow",
      ])
      .parse(input.kind);
    const businessId = input.businessId ? uuid.parse(input.businessId) : null,
      contextId = input.contextId ? uuid.parse(input.contextId) : null;
    if (!businessId && !contextId)
      throw new HttpError(400, "An event target is required.");
    if ((kind.startsWith("trail_") || kind === "launch_view") && !contextId)
      throw new HttpError(400, "An entry is required.");
    if ((kind.startsWith("sample_") || kind === "follow") && !businessId)
      throw new HttpError(400, "A business is required.");
    if (businessId) {
      const b = result(
        await db
          .from("city_businesses")
          .select("owner_id,published,status")
          .eq("id", businessId)
          .maybeSingle(),
      );
      if (!b?.published || b.status === "suspended")
        throw new HttpError(404, "Business unavailable.");
      if (b.owner_id === userId) return { ok: true };
    }
    if (contextId) {
      const e = result(
        await db
          .from("city_discovery_entries")
          .select("*")
          .eq("id", contextId)
          .maybeSingle(),
      );
      if (!e?.published || e.status === "archived")
        throw new HttpError(404, "Entry unavailable.");
      if ((kind.startsWith("trail_") && e.kind !== "trail") || (kind === "launch_view" && e.kind !== "launch"))
        throw new HttpError(400, "Invalid event context.");
      if (e.kind === "launch") {
        const business = result(await db.from("city_businesses").select("owner_id,published,status").eq("id", e.business_id).maybeSingle());
        if (!business?.published || business.status === "suspended") throw new HttpError(404, "Business unavailable.");
        if (business.owner_id === userId) return { ok: true };
      }
      if (
        businessId &&
        !(e.kind === "launch"
          ? e.business_id === businessId
          : e.published.stops.some((s: any) => s.businessId === businessId))
      )
        throw new HttpError(400, "Invalid attribution.");
    }
    if (
      kind === "follow" &&
      (!userId ||
        !businessId ||
        !result(
          await db
            .from("city_follows")
            .select("user_id")
            .eq("user_id", userId)
            .eq("business_id", businessId)
            .maybeSingle(),
        ))
    )
      return { ok: true };
    const scope = `${businessId || ""}:${contextId || ""}`;
    result(
      await db
        .from("city_discovery_metrics")
        .upsert(
          {
            business_id: businessId,
            context_id: contextId,
            scope,
            visitor_hash: await publicKey(request),
            kind,
          },
          { onConflict: "scope,visitor_hash,kind,day", ignoreDuplicates: true },
        ),
    );
    return { ok: true };
  }
  let data: Record<string, unknown>;
  if (action === "entry_save") {
    if (!flag("CITY_ONBOARDING_ENABLED"))
      throw new HttpError(503, "Content editing is paused.");
    const kind = z.enum(["trail", "launch"]).parse(input.kind);
    const content =
      kind === "trail"
        ? trail.parse(input.content)
        : launch.parse(input.content);
    if (
      "cover" in content &&
      content.cover &&
      !new RegExp(`^${userId}/[a-f\\d-]{36}\\.(png|jpg|webp)$`).test(
        content.cover,
      )
    )
      throw new HttpError(403, "Cover must be an owned image upload.");
    if(kind === "launch") {
      const c=content as z.infer<typeof launch>;
      for(const path of c.screenshots||[]) {
        if(!new RegExp(`^${userId}/[a-f\\d-]{36}\\.(png|jpg|webp)$`).test(path)) throw new HttpError(403,"Screenshots must be owned image uploads.");
      }
      if(c.trailer && !new RegExp(`^${userId}/[a-f\\d-]{36}\\.mp4$`).test(c.trailer)) throw new HttpError(403,"Trailer must be an owned MP4 upload.");
    }
    data = {
      saveDraft: z.boolean().parse(input.saveDraft ?? false),
      kind,
      content,
      slug: z
        .string()
        .regex(/^[a-z0-9][a-z0-9-]{2,47}$/)
        .parse(input.slug),
      ...(input.id
        ? {
            id: uuid.parse(input.id),
            version: z.number().int().positive().parse(input.version),
          }
        : {}),
      ...(kind === "launch"
        ? { businessId: uuid.parse(input.businessId) }
        : {}),
    };
  } else if (action === "entry_review")
    data = z
      .object({
        id: uuid,
        version: z.number().int().positive(),
        decision: z.enum(["publish", "reject", "archive"]),
        featured: z.boolean().default(false),
        overrideReason: z.string().trim().min(15).max(500).optional(),
      })
      .parse(input);
  else if(action === "launch_pause")
    data=z.object({id:uuid,paused:z.boolean()}).parse(input);
  else if (action === "follow")
    data = z.object({ businessId: uuid, enabled: z.boolean() }).parse(input);
  else if (action === "save_launch")
    data = z.object({ id: uuid, enabled: z.boolean() }).parse(input);
  else if (action === "progress")
    data = z.object({ id: uuid, completed: z.array(uuid).max(5) }).parse(input);
  else throw new HttpError(400, "Unknown discovery action.");
  return result(
    await db.rpc("city_discovery_mutate", {
      p_user: userId,
      p_action: action,
      p_data: data,
    }),
  );
}
