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
  required,
  owner,
  isAdmin,
  limit,
  uuid,
  parseProfile,
  mutate,
  stripe,
  reconcileOrder,
} from "../_shared/city.ts";
import { fetchPublicWebsite, importURL } from "../_shared/city-network.ts";

function mediaType(bytes: Uint8Array) {
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71)
    return ["image/png", "png"];
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return ["image/jpeg", "jpg"];
  if (
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  )
    return ["image/webp", "webp"];
  if (new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp")
    return ["video/mp4", "mp4"];
  throw new HttpError(400, "Upload a PNG, JPEG, WebP or MP4 file.");
}
function metadata(html: string, name: string) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attrs = Object.fromEntries(
      [...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map((m) => [
        m[1].toLowerCase(),
        m[2],
      ]),
    );
    if (attrs.property === name || attrs.name === name)
      return (attrs.content || "")
        .replaceAll("&amp;", "&")
        .replaceAll("&quot;", '"')
        .replace(/<[^>]*>/g, "");
  }
  return "";
}
Deno.serve(async (request) => {
  const options = maybeHandleOptions(request);
  if (options) return options;
  try {
    if (request.method !== "POST") throw new HttpError(405, "Use POST.");
    if (Number(request.headers.get("content-length") || 0) > 28_000_000)
      throw new HttpError(413, "Request is too large.");
    const raw = await request.text();
    if (raw.length > 28_000_000)
      throw new HttpError(413, "Request is too large.");
    const data = JSON.parse(raw),
      action = z.string().parse(data.action),
      db = cityAdmin();
    if (action === "track") {
      if (!flag("CITY_BROWSING_ENABLED"))
        throw new HttpError(503, "City is closed.");
      const id = uuid.parse(data.businessId),
        kind = z.enum(["view", "click", "share"]).parse(data.kind);
      const ip =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown";
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          `${required("CITY_ANALYTICS_SALT")}:${new Date().toISOString().slice(0, 10)}:${ip}`,
        ),
      );
      const hash = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      await limit(db, `track:${hash}`, 100, 3600);
      const row = result(
        await db
          .from("city_listings")
          .select("business_id")
          .eq("business_id", id)
          .maybeSingle(),
      );
      if (!row) throw new HttpError(404, "Property not found.");
      // Authenticated owners are excluded without trusting a user-provided identifier.
      if (request.headers.get("authorization")) {
        try {
          const { user } = await requireUserClient(request, "city-command");
          if (await owner(db, user.id, id)) return json({ ok: true });
        } catch {
          /* anonymous browser */
        }
      }
      result(
        await db
          .from("city_engagement")
          .upsert(
            { business_id: id, visitor_hash: hash, kind },
            {
              onConflict: "business_id,visitor_hash,kind,day",
              ignoreDuplicates: true,
            },
          ),
      );
      return json({ ok: true });
    }
    const { user } = await requireUserClient(request, "city-command");
    await limit(db, `command:${user.id}`, 60);
    if (
      ["create", "import", "upload", "save", "submit", "verify"].includes(
        action,
      ) &&
      !flag("CITY_ONBOARDING_ENABLED")
    )
      throw new HttpError(503, "Business onboarding is paused.");
    if (action === "create" || action === "save") {
      const profile = parseProfile(data.profile, user.id);
      if (action === "create")
        return json(
          await mutate(db, user.id, "create", {
            slug: z
              .string()
              .regex(/^[a-z0-9][a-z0-9-]{2,47}$/)
              .parse(data.slug),
            profile,
          }),
        );
      return json(
        await mutate(db, user.id, "save", {
          businessId: uuid.parse(data.businessId),
          version: z.number().int().positive().parse(data.version),
          profile,
          host: new URL(profile.website).hostname,
        }),
      );
    }
    if (action === "import") {
      await limit(db, `import:${user.id}`, 10, 3600);
      const site = await fetchPublicWebsite(
        z.string().max(2048).parse(data.website),
      );
      if (!site.type.includes("text/html"))
        throw new HttpError(
          400,
          "This website does not provide HTML. Enter the business details manually.",
        );
      const html = new TextDecoder().decode(site.bytes);
      const name =
        metadata(html, "og:site_name") ||
        metadata(html, "og:title") ||
        html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ||
        new URL(site.url).hostname;
      const description =
        metadata(html, "description") || metadata(html, "og:description");
      let hero = "";
      const image = metadata(html, "og:image");
      if (image) {
        try {
          const remote = await fetchPublicWebsite(
            new URL(image, site.url).toString(),
            5_000_000,
          );
          const [type, ext] = mediaType(remote.bytes);
          if (type.startsWith("image/")) {
            hero = `${user.id}/${crypto.randomUUID()}.${ext}`;
            result(
              await db.storage
                .from("city-media")
                .upload(hero, remote.bytes, { contentType: type }),
            );
          }
        } catch {
          /* metadata still useful when image fetch fails */
        }
      }
      return json({
        name: name.slice(0, 80),
        description: description.slice(0, 1200),
        tagline: description.slice(0, 140),
        website: site.url,
        hero,
      });
    }
    if (action === "upload") {
      await limit(db, `upload:${user.id}`, 30, 3600);
      const binary = atob(z.string().max(27_000_000).parse(data.base64));
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      const [type, ext] = mediaType(bytes);
      if (bytes.length > (type.startsWith("video/") ? 20_000_000 : 5_000_000))
        throw new HttpError(
          413,
          "Images may be up to 5 MB; videos up to 20 MB.",
        );
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      result(
        await db.storage
          .from("city-media")
          .upload(path, bytes, { contentType: type }),
      );
      return json({
        path,
        url: result(
          await db.storage.from("city-media").createSignedUrl(path, 3600),
        )!.signedUrl,
      });
    }
    if (action === "media_preview") {
      const path = z.string().parse(data.path);
      if (!path.startsWith(`${user.id}/`))
        throw new HttpError(403, "Media access denied.");
      return json({
        url: result(
          await db.storage.from("city-media").createSignedUrl(path, 3600),
        )!.signedUrl,
      });
    }
    if (action === "verify") {
      const business = await owner(db, user.id, uuid.parse(data.businessId));
      if (!business) throw new HttpError(404, "Business not found.");
      await limit(db, `verify:${user.id}`, 10, 3600);
      const host = importURL(business.draft.website).hostname,
        expected = `synarc-city=${business.verification_token}`;
      let verified = false;
      try {
        const records = await Deno.resolveDns(`_synarc-city.${host}`, "TXT");
        verified = records.some((parts) => parts.join("") === expected);
      } catch {
        /* file verification fallback */
      }
      if (!verified) {
        try {
          const file = await fetchPublicWebsite(
            `https://${host}/.well-known/synarc-city.txt`,
            4096,
          );
          verified =
            new URL(file.url).hostname === host &&
            new TextDecoder().decode(file.bytes).trim() === expected;
        } catch {
          /* explicit failure below */
        }
      }
      if (!verified)
        throw new HttpError(
          400,
          "Verification token not found. Publish the DNS record or verification file and try again.",
        );
      return json(
        await mutate(db, user.id, "verify", {
          businessId: business.id,
          version: business.draft_version,
          host,
        }),
      );
    }
    if (action === "checkout") {
      if (!flag("CITY_PURCHASES_ENABLED"))
        throw new HttpError(503, "Purchases are paused.");
      const payload = z
        .object({
          businessId: uuid,
          requestKey: uuid,
          amount: z.number().int().min(1000).max(5000000),
          termsVersion: z.literal("city-1"),
        })
        .parse(data);
      const taxMode = required("CITY_TAX_MODE");
      if (!["automatic", "merchant_exempt"].includes(taxMode))
        throw new HttpError(503, "Merchant tax configuration is incomplete.");
      const termsURL = importURL(required("CITY_TERMS_URL")).toString();
      const order = await mutate(db, user.id, "order", payload);
      if (order.checkout_url) {
        const prior = await stripe(
          `checkout/sessions/${encodeURIComponent(order.stripe_session_id)}`,
        );
        if (prior.status !== "open")
          throw new HttpError(
            409,
            "CHECKOUT_ENDED: This checkout has ended. Start a new purchase.",
          );
        return json({ orderId: order.id, url: order.checkout_url });
      }
      const origin = new URL(required("CITY_PUBLIC_ORIGIN")).origin;
      const body = new URLSearchParams({
        mode: "payment",
        success_url: `${origin}/city/manage?order=${order.id}`,
        cancel_url: `${origin}/city/manage?cancelled=1`,
        client_reference_id: order.id,
        "metadata[city_order_id]": order.id,
        "payment_intent_data[metadata][city_order_id]": order.id,
        "line_items[0][price_data][currency]": "gbp",
        "line_items[0][price_data][unit_amount]": String(order.amount),
        "line_items[0][price_data][product_data][name]":
          "Synarc City sponsored placement",
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][tax_behavior]": "exclusive",
        "custom_text[submit][message]": `Placement moves with ranking. Terms: ${termsURL}`,
        "payment_method_types[0]": "card",
        customer_email: user.email || "",
        billing_address_collection: "required",
      });
      if (taxMode === "automatic") body.set("automatic_tax[enabled]", "true");
      const session = await stripe(
        "checkout/sessions",
        body,
        `city-checkout-${order.id}`,
      );
      result(
        await db
          .from("city_orders")
          .update({
            stripe_session_id: session.id,
            checkout_url: session.url,
            status: "checkout",
          })
          .eq("id", order.id),
      );
      return json({ orderId: order.id, url: session.url });
    }
    if (action === "order_status") {
      const order = result(
        await db
          .from("city_orders")
          .select("id,status")
          .eq("id", uuid.parse(data.orderId))
          .eq("user_id", user.id)
          .single(),
      );
      if (!order) throw new HttpError(404, "Order not found.");
      if (["created", "checkout", "pending"].includes(order.status)) {
        try {
          await reconcileOrder(db, order.id);
        } catch {
          /* webhook/reconciliation remains authoritative */
        }
      }
      return json(
        result(
          await db
            .from("city_orders")
            .select("id,amount,status,last_error")
            .eq("id", order.id)
            .single(),
        ),
      );
    }
    if (action === "resolve_report") {
      if (!(await isAdmin(db, user.id)))
        throw new HttpError(403, "Administrator access required.");
      result(
        await db
          .from("city_reports")
          .update({ status: "resolved" })
          .eq("id", uuid.parse(data.reportId)),
      );
      return json({ ok: true });
    }
    if (action === "review") {
      const payload = z
        .object({
          businessId: uuid,
          version: z.number().int().positive(),
          decision: z.enum(["approve", "reject", "suspend"]),
          note: z.string().min(1).max(1000),
        })
        .parse(data);
      return json(await mutate(db, user.id, action, payload));
    }
    if (action === "submit")
      return json(
        await mutate(db, user.id, action, {
          businessId: uuid.parse(data.businessId),
          version: z.number().int().positive().parse(data.version),
        }),
      );
    if (action === "save_business")
      return json(
        await mutate(db, user.id, action, {
          businessId: uuid.parse(data.businessId),
          saved: z.boolean().parse(data.saved),
        }),
      );
    if (action === "claim")
      return json(
        await mutate(db, user.id, action, {
          businessId: uuid.parse(data.businessId),
        }),
      );
    if (action === "report") {
      await limit(db, `report:${user.id}`, 10, 3600);
      return json(
        await mutate(db, user.id, action, {
          businessId: uuid.parse(data.businessId),
          reason: z.string().trim().min(10).max(1000).parse(data.reason),
        }),
      );
    }
    throw new HttpError(400, "Unknown command.");
  } catch (error) {
    return errorResponse(error, "City command failed.");
  }
});
