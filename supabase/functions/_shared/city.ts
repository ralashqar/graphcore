import { primarySample } from "../../../src/domain/cityCampus.ts";
import { campusSchema } from "./city-campus-schema.ts";
import { z } from "npm:zod@4";
import { createAdminClient } from "./auth.ts";
import { HttpError } from "./http.ts";
import { importURL } from "./city-network.ts";
import { paymentState } from "./city-payments.ts";

export const cityAdmin = () => createAdminClient("city");
export type CityDB = ReturnType<typeof cityAdmin>;
export const flag = (name: string) => Deno.env.get(name) === "true";
export const required = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new HttpError(503, `${name} is not configured.`);
  return value;
};
export function result<T>(response: { data: T; error: unknown }): T {
  if (response.error) throw response.error;
  return response.data;
}
export const uuid = z.string().uuid();
const media = z
  .string()
  .max(300)
  .refine(
    (v) => !v || /^[a-f\d-]{36}\/[a-f\d-]{36}\.(png|jpg|webp|mp4)$/.test(v),
    "Upload media through the property editor.",
  );
export const profileSchema = z
  .object({
    campus: campusSchema.nullable().optional(),
    name: z.string().trim().min(2).max(80),
    tagline: z.string().trim().max(140),
    description: z.string().trim().max(1200),
    website: z
      .string()
      .max(2048)
      .transform((v) => importURL(v).toString()),
    category: z.enum([
      "Shopping",
      "AI",
      "Games",
      "Apps",
      "Food",
      "Travel",
      "SaaS",
      "Creators",
      "Entertainment",
      "Finance",
      "Local",
    ]),
    color: z.string().regex(/^#[\da-fA-F]{6}$/),
    logo: media,
    hero: media,
    billboard: media
      .refine(
        (v) => !v || !v.endsWith(".mp4"),
        "Use a still image for the billboard.",
      )
      .optional(),
    billboardCrop: z
      .object({
        x: z.number().min(0).max(100),
        y: z.number().min(0).max(100),
        zoom: z.number().min(1).max(3),
      })
      .strict()
      .optional(),
    video: media,
    sample: z
      .object({
        kind: z.enum(["comparison", "gallery", "guided"]),
        title: z.string().trim().min(1).max(100),
        items: z
          .array(
            z
              .object({
                label: z.string().trim().min(1).max(80),
                image: media.refine((v) => !v || !v.endsWith(".mp4")),
                description: z.string().max(500),
              })
              .strict(),
          )
          .min(2)
          .max(5),
      })
      .strict()
      .refine(
        (v) => v.kind !== "comparison" || (v.items.length === 2 && v.items.every((item) => Boolean(item.image))),
        "Comparisons need two images",
      )
      .nullable()
      .optional(),
    offer: z
      .object({
        title: z.string().trim().max(100),
        description: z.string().trim().max(500),
        code: z.string().max(80),
        expiresAt: z.string().datetime().nullable(),
        url: z
          .string()
          .max(2048)
          .refine((v) => !v || !!importURL(v)),
      })
      .strict(),
  })
  .strict();
export function parseProfile(value: unknown, userId: string) {
  const profile = profileSchema.parse(value);
  for (const path of [
    profile.logo,
    profile.hero,
    profile.video,
    profile.billboard,
    ...(profile.sample?.items.map((i) => i.image) || []),
    ...(profile.campus?.exhibits.flatMap(e=>e.items.map(i=>i.image)) || []),
  ])
    if (path && !path.startsWith(`${userId}/`))
      throw new HttpError(403, "Media must belong to this account.");
  if (profile.campus) profile.sample = primarySample(profile.campus);
  return profile;
}
export async function limit(db: CityDB, key: string, max = 60, seconds = 60) {
  if (
    !result(
      await db.rpc("city_rate_limit", {
        p_key: key,
        p_limit: max,
        p_seconds: seconds,
      }),
    )
  )
    throw new HttpError(429, "Too many requests. Please try again shortly.");
}
export async function owner(db: CityDB, userId: string, id?: string) {
  let query = db.from("city_businesses").select("*").eq("owner_id", userId);
  if (id) query = query.eq("id", uuid.parse(id));
  return result(await query.maybeSingle());
}
export async function isAdmin(db: CityDB, userId: string) {
  return !!result(
    await db
      .from("city_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle(),
  );
}
export async function mutate(
  db: CityDB,
  userId: string,
  action: string,
  data: unknown,
) {
  return result(
    await db.rpc("city_mutate", {
      p_user: userId,
      p_action: action,
      p_data: data,
    }),
  );
}
export async function signProfile(
  db: CityDB,
  profile: Record<string, unknown>,
) {
  const copy = { ...profile };
  for (const key of ["logo", "hero", "video", "billboard"])
    if (typeof copy[key] === "string" && copy[key]) {
      const signed = await db.storage
        .from("city-media")
        .createSignedUrl(copy[key] as string, 3600);
      copy[key] = signed.data?.signedUrl || "";
    }
  if (copy.sample && typeof copy.sample === "object") {
    const sample = copy.sample as { items: { image: string }[] };
    copy.sample = {
      ...sample,
      items: await Promise.all(
        sample.items.map(async (item) => ({
          ...item,
          image: item.image
            ? (
                await db.storage
                  .from("city-media")
                  .createSignedUrl(item.image, 3600)
              ).data?.signedUrl || ""
            : "",
        })),
      ),
    };
  }
  if (copy.campus) {
    const campus = copy.campus as import("../../../src/domain/cityCampus.ts").CityCampus;
    copy.campus = { ...campus, exhibits: await Promise.all(campus.exhibits.map(async e => ({...e, items: await Promise.all(e.items.map(async i => ({...i, image: i.image ? (await db.storage.from("city-media").createSignedUrl(i.image,3600)).data?.signedUrl || "" : ""}))) }))) };
  }
  return copy;
}
export async function listing(db: CityDB, row: Record<string, unknown>) {
  const profile = await signProfile(db, row.profile as Record<string, unknown>);
  profile.offer = { ...(profile.offer as object), code: "" };
  return {
    id: row.business_id,
    slug: row.slug,
    profile,
    landValue: Number(row.land_value),
    rank: row.rank,
    x: row.x,
    z: row.z,
    tier: row.tier,
    saves: Number(row.saves),
    claims: Number(row.claims),
  };
}
export async function listings(db: CityDB, rows: any[]) {
  const activeDeals = flag("CITY_DEALS_ENABLED") && rows.length ? result(await db.from("city_deals").select("business_id,terms,quantity,issued").in("business_id",rows.map(r=>r.business_id)).eq("status","approved").eq("paused",false).eq("ended",false)) || [] : [];
  const deals = new Set(activeDeals.filter((d:any)=>d.quantity>d.issued && Date.parse(d.terms.startsAt)<=Date.now() && Date.parse(d.terms.endsAt)>Date.now()).map((d:any)=>d.business_id));
  const paths = [
    ...new Set(
      rows.flatMap((row) =>
        [
          ...["logo", "hero", "video", "billboard"].map(
            (key) => row.profile[key],
          ),
          ...(row.profile.sample?.items || []).map((i: any) => i.image),
        ].filter((p): p is string => typeof p === "string" && !!p),
      ),
    ),
  ];
  const signed = paths.length
    ? result(
        await db.storage.from("city-media").createSignedUrls(paths, 3600),
      ) || []
    : [];
  const urls = new Map(signed.map((item) => [item.path, item.signedUrl]));
  return rows.map((row) => {
    const profile = {
      ...row.profile,
      offer: { ...row.profile.offer, code: "" },
    };
    delete profile.campus;
    for (const key of ["logo", "hero", "video", "billboard"])
      profile[key] = urls.get(profile[key]) || "";
    if (profile.sample)
      profile.sample = {
        ...profile.sample,
        items: profile.sample.items.map((i: any) => ({
          ...i,
          image: urls.get(i.image) || "",
        })),
      };
    return {
      id: row.business_id,
      hasDeal: deals.has(row.business_id),
      slug: row.slug,
      profile,
      landValue: Number(row.land_value),
      rank: row.rank,
      x: row.x,
      z: row.z,
      tier: row.tier,
      saves: Number(row.saves),
      claims: Number(row.claims),
    };
  });
}
export async function publicKey(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `${required("CITY_ANALYTICS_SALT")}:${new Date().toISOString().slice(0, 10)}:${ip}`,
    ),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export function event(row: Record<string, unknown>) {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    kind: row.kind,
    fromRank: row.from_rank,
    toRank: row.to_rank,
    createdAt: row.created_at,
  };
}
export async function stripe(
  path: string,
  body?: URLSearchParams,
  key?: string,
): Promise<any> {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${required("CITY_STRIPE_SECRET_KEY")}`,
      "Stripe-Version": "2024-06-20",
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body,
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new HttpError(
      502,
      data.error?.message || "Payment provider unavailable.",
    );
  return data;
}
export async function reconcileOrder(db: CityDB, id: string) {
  const token = result(await db.rpc("city_order_lease", { p_order: id }));
  if (!token) throw new HttpError(409, "Payment is already being reconciled.");
  try {
    const order = result(
      await db.from("city_orders").select("*").eq("id", id).single(),
    );
    if (!order.stripe_session_id)
      throw new Error(
        "Order has no Checkout Session; retry checkout with the same request key.",
      );
    const session = await stripe(
      `checkout/sessions/${encodeURIComponent(order.stripe_session_id)}`,
    );
    const intent =
      session.payment_status === "paid" && session.payment_intent
        ? await stripe(
            `payment_intents/${encodeURIComponent(session.payment_intent)}?expand[]=latest_charge`,
          )
        : null;
    const disputes = intent?.latest_charge
      ? await stripe(
          `disputes?charge=${encodeURIComponent(intent.latest_charge.id)}&limit=100`,
        )
      : { data: [] };
    const { effective, status, intentId } = paymentState(
      order,
      session,
      intent,
      disputes.data,
    );
    result(
      await db.rpc("city_apply_payment", {
        p_order: id,
        p_token: token,
        p_effective: effective,
        p_status: status,
        p_intent: intentId,
      }),
    );
    return { id, status };
  } catch (error) {
    await db
      .from("city_orders")
      .update({
        lease_token: null,
        lease_until: null,
        last_error: String(error).slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("lease_token", token);
    throw error;
  }
}
