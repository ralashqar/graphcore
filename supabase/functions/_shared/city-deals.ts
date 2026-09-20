import { z } from "npm:zod@4";
import { requireUserClient } from "./auth.ts";
import {
  cityAdmin,
  flag,
  isAdmin,
  limit,
  owner,
  publicKey,
  result,
  uuid,
} from "./city.ts";
import { HttpError } from "./http.ts";
import { importURL } from "./city-network.ts";
export const dealTermsSchema = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(10).max(2000),
  image: z.string().max(300),
  kind: z.enum(["percentage", "fixed", "free_product", "trial_access"]),
  value: z.number().int().min(0).max(10000000),
  currency: z.enum(["GBP", "USD", "EUR"]),
  minimumSpend: z.number().int().min(0).max(10000000),
  maximumDiscount: z.number().int().positive().max(10000000).nullable(),
  destination: z.string().max(2048).transform((v, ctx) => {
    try {
      return importURL(v).toString();
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "A public HTTPS merchant destination is required.",
      });
      return z.NEVER;
    }
  }),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  redeemBy: z.string().datetime().nullable(),
  exclusive: z.boolean(),
  merchantExpiryConfirmed: z.boolean(),
  freeConfirmed: z.boolean().optional(),
  cardRequired: z.boolean().optional(),
  renewalTerms: z.string().trim().max(400).optional(),
}).strict().superRefine((t, c) => {
  if(t.freeConfirmed && (!['free_product','trial_access'].includes(t.kind) || t.minimumSpend!==0 || (t.kind==='trial_access' && !t.renewalTerms))) c.addIssue({code:'custom',message:'Free rewards must have no minimum purchase; free trials need renewal and cancellation terms.'});
  if (Date.parse(t.endsAt) <= Date.parse(t.startsAt)) {
    c.addIssue({ code: "custom", message: "End must follow start" });
  }
  if (
    t.redeemBy &&
    (!t.merchantExpiryConfirmed ||
      Date.parse(t.redeemBy) < Date.parse(t.endsAt))
  ) {
    c.addIssue({
      code: "custom",
      message: "Merchant-enforced deadline must cover the claim window",
    });
  }
  if (
    (t.kind === "percentage" && (t.value < 1 || t.value > 100)) ||
    (t.kind === "fixed" && t.value < 1)
  ) c.addIssue({ code: "custom", message: "Enter a valid discount value" });
});
export async function deals(
  request: Request,
  data: Record<string, unknown>,
  command = false,
) {
  const db = cityAdmin(), action = String(data.action).replace(/^deal_/, "");
  if (!flag("CITY_DEALS_ENABLED")) {
    if (!command && ["catalog", "wallet", "workspace"].includes(action)) {
      return { enabled: false, deals: [], claims: [] };
    }
    throw new HttpError(503, "City Deals are not enabled.");
  }
  if (!command && action === "catalog") {
    if (!flag("CITY_BROWSING_ENABLED")) {
      throw new HttpError(503, "City is closed.");
    }
    await limit(db, `deals-public:${await publicKey(request)}`, 180);
    const businessId = uuid.parse(data.businessId);
    const rows = result(
      await db.from("city_deals").select(
        "id,business_id,terms,status,paused,ended,quantity,issued,version,city_businesses!inner(published,status)",
      ).eq("business_id", businessId).eq("status", "approved").neq(
        "city_businesses.status",
        "suspended",
      ).not("city_businesses.published", "is", null).limit(100),
    ) || [];
    const signed = await Promise.all(rows.map(async (row: any) => {
      const { city_businesses, ...d } = row;
      return {
        ...d,
        business_name: city_businesses.published.name,
        imageUrl: d.terms.image
          ? result(
            await db.storage.from("city-media").createSignedUrl(
              d.terms.image,
              3600,
            ),
          )?.signedUrl
          : "",
      };
    }));
    return { enabled: true, deals: signed };
  }
  if (command && action === "track") {
    if (!flag("CITY_BROWSING_ENABLED")) {
      throw new HttpError(503, "City is closed.");
    }
    const id = uuid.parse(data.id),
      kind = z.enum(["open", "click"]).parse(data.kind),
      key = await publicKey(request);
    await limit(db, `deal-track:${key}`, 100, 3600);
    const d = result(
      await db.from("city_deals").select(
        "id,business_id,city_businesses!inner(status,published)",
      ).eq("id", id).eq("status", "approved").neq(
        "city_businesses.status",
        "suspended",
      ).not("city_businesses.published", "is", null).maybeSingle(),
    );
    if (d) {
      const source = data.sourceExhibitId === undefined
        ? null
        : z.string().regex(/^[a-z0-9][a-z0-9-]{0,59}$/).parse(
          data.sourceExhibitId,
        );
      if (
        source &&
        !(d as any).city_businesses.published?.campus?.exhibits?.some((
          e: any,
        ) => e.id === source && e.dealId === id)
      ) throw new HttpError(400, "Exhibit link is no longer published.");
      if (request.headers.get("authorization")) {
        try {
          const { user } = await requireUserClient(request, "city-deals-track");
          if (await owner(db, user.id, d.business_id)) return { ok: true };
        } catch { /* public anonymous metric */ }
      }
      if (source) {
        result(
          await db.from("city_deal_exhibit_metrics").upsert({
            deal_id: id,
            exhibit_id: source,
            visitor_hash: key,
            kind,
          }, {
            onConflict: "deal_id,exhibit_id,visitor_hash,kind,day",
            ignoreDuplicates: true,
          }),
        );
      }
      result(
        await db.from("city_deal_metrics").upsert({
          deal_id: id,
          visitor_hash: key,
          kind,
        }, {
          onConflict: "deal_id,visitor_hash,kind,day",
          ignoreDuplicates: true,
        }),
      );
    }
    return { ok: true };
  }
  const { user } = await requireUserClient(request, "city-deals");
  if (user.is_anonymous) {
    throw new HttpError(
      403,
      "Sign in with a permanent account to claim deals.",
    );
  }
  await limit(db, `deals:${user.id}`, 60);
  if (!command && action === "wallet") {
    const offset = z.number().int().min(0).max(100000).parse(data.offset ?? 0);
    const rows = result(
      await db.from("city_deal_claims").select(
        "id,deal_id,terms,business_name,created_at,redeemed_at,cancelled,source_exhibit_id,city_deal_codes!inner(code)",
      ).eq("user_id", user.id).order("created_at", { ascending: false })
        .range(offset, offset + 49),
    ) || [];
    return {
      enabled: true,
      claims: rows.map((r: any) => {
        const { city_deal_codes, ...c } = r;
        return { ...c, code: city_deal_codes.code };
      }),
      hasMore: rows.length === 50,
    };
  }
  if (!command && action === "launch") {
    const id = uuid.parse(data.id),
      d = result(
        await db.from("city_deals").select("business_id").eq("id", id).single(),
      );
    if (!d || !await owner(db, user.id, d.business_id)) {
      throw new HttpError(403, "Owner access required.");
    }
    const tests = result(
      await db.from("city_deal_checkout_tests").select("*").eq("deal_id", id)
        .order("created_at", { ascending: false }).order("id", {
          ascending: false,
        }).limit(10),
    ) || [];
    return { tests };
  }
  if (command && ["test_register", "test_report"].includes(action)) {
    const payload: Record<string, unknown> = {
      id: uuid.parse(data.id),
      version: z.number().int().positive().parse(data.version),
    };
    if (action === "test_register") {
      payload.code = z.string().trim().min(1).max(200).regex(/^[^\x00-\x1f]+$/)
        .parse(data.code);
    } else {
      payload.testId = uuid.parse(data.testId);
      payload.outcome = z.enum(["passed", "failed"]).parse(data.outcome);
      payload.note = z.string().trim().min(10).max(1000).parse(data.note);
      payload.confirmed = z.boolean().parse(data.confirmed);
    }
    const r = await db.rpc("city_deal_checkout_command", {
      p_user: user.id,
      p_action: action === "test_register" ? "register" : "report",
      p_data: payload,
    });
    if (r.error) {
      throw new HttpError(
        409,
        r.error.message.includes("unique constraint")
          ? "Test code already registered; reload."
          : r.error.message,
      );
    }
    return r.data;
  }
  if (!command && action === "workspace") {
    const admin = data.admin === true;
    if (admin) {
      if (!await isAdmin(db, user.id)) {
        throw new HttpError(403, "Operator access required.");
      }
    } else if (!await owner(db, user.id, uuid.parse(data.businessId))) {
      throw new HttpError(403, "Owner access required.");
    }
    let query = db.from("city_deals").select(
      "*,city_businesses!inner(published,status)",
    ).order("created_at", {
      ascending: false,
    }).limit(100);
    query = admin
      ? query.eq("status", "pending")
      : query.eq("business_id", data.businessId);
    const rows = result(await query) || [];
    const stats = rows.length
      ? result(
        await db.rpc("city_deal_stats", { p_ids: rows.map((d: any) => d.id) }),
      ) || []
      : [];
    const ids = rows.map((d: any) => d.id);
    const tests = ids.length
      ? result(await db.rpc("city_deal_launch_summary", { p_ids: ids })) || []
      : [];
    const exhibits = ids.length
      ? result(await db.rpc("city_deal_exhibit_stats", { p_ids: ids })) || []
      : [];
    const enriched = await Promise.all(rows.map(async (row: any) => {
      const { city_businesses, ...d } = row;
      const t = tests.find((t: any) => t.deal_id === d.id);
      return {
        ...d,
        ...stats.find((v: any) => v.id === d.id),
        businessReady: !!city_businesses.published &&
          city_businesses.status !== "suspended",
        checkoutTest: t?.checkout || null,
        exhibitStats: exhibits.filter((v: any) => v.deal_id === d.id),
        imageUrl: d.terms.image
          ? result(
            await db.storage.from("city-media").createSignedUrl(
              d.terms.image,
              3600,
            ),
          )?.signedUrl
          : "",
      };
    }));
    return { enabled: true, deals: enriched };
  }
  if (!command && action === "claims") {
    const id = uuid.parse(data.id),
      d = result(
        await db.from("city_deals").select("business_id").eq("id", id).single(),
      );
    if (!d || !await owner(db, user.id, d.business_id)) {
      throw new HttpError(403, "Owner access required.");
    }
    const offset = z.number().int().min(0).max(100000).parse(data.offset ?? 0);
    const rows = result(
      await db.from("city_deal_claims").select(
        "id,deal_id,created_at,redeemed_at,merchant_order_id",
      ).eq("deal_id", id).order("created_at", { ascending: false }).range(
        offset,
        offset + 49,
      ),
    );
    return { claims: rows, hasMore: rows?.length === 50 };
  }
  if (!command) throw new HttpError(400, "Unknown deal read.");
  const payload: Record<string, unknown> = {};
  if (action === "save") {
    const terms = dealTermsSchema.parse(data.terms);
    if (
      terms.image &&
      !new RegExp(`^${user.id}/[a-f0-9-]{36}\\.(png|jpg|webp)$`).test(
        terms.image,
      )
    ) throw new HttpError(400, "Use an image uploaded by your account.");
    payload.terms = terms;
    if (!data.id) payload.businessId = uuid.parse(data.businessId);
  }
  if (action !== "save" || data.id) payload.id = uuid.parse(data.id);
  if (!["claim", "report", "correct"].includes(action) && data.id) {
    payload.version = z.number().int().positive().parse(data.version);
  }
  if (action === "import") {
    const codes = z.array(
      z.string().trim().min(1).max(200).regex(/^[^\x00-\x1f]+$/),
    ).min(1).max(1000).parse(data.codes);
    if (new Set(codes).size !== codes.length) {
      throw new HttpError(400, "Duplicate codes; nothing imported.");
    }
    payload.codes = codes;
  }
  if (action === "review") {
    payload.decision = z.enum(["approved", "rejected"]).parse(data.decision);
    payload.note = z.string().trim().min(3).max(1000).parse(data.note);
  }
  if (action === "pause") payload.paused = z.boolean().parse(data.paused);
  if (["report", "correct"].includes(action)) {
    payload.claimId = uuid.parse(data.claimId);
    payload.orderId = z.string().trim().max(120).parse(data.orderId ?? "");
    payload.note = z.string().trim().min(action === "correct" ? 3 : 0).max(1000)
      .parse(data.note ?? "");
  }
  if (
    ![
      "save",
      "import",
      "submit",
      "review",
      "pause",
      "end",
      "claim",
      "report",
      "correct",
    ].includes(action)
  ) throw new HttpError(400, "Unknown deal command.");
  if (action === "claim" && data.sourceExhibitId !== undefined) {
    payload.sourceExhibitId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,59}$/)
      .parse(data.sourceExhibitId);
  }
  if (action === "claim" && !flag("CITY_BROWSING_ENABLED")) {
    throw new HttpError(503, "City is closed.");
  }
  if(action === 'claim' && data.sourceLaunchId !== undefined) payload.sourceLaunchId=uuid.parse(data.sourceLaunchId);
  const response = await db.rpc("city_deal_mutate", {
    p_user: user.id,
    p_action: action,
    p_data: payload,
  });
  if (response.error) {
    const message = response.error.message;
    throw new HttpError(
      409,
      message.includes("unique constraint")
        ? "A code already exists. Nothing imported."
        : message,
    );
  }
  return response.data;
}
