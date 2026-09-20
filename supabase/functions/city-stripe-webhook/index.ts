import {
  cityAdmin,
  result,
  required,
  reconcileOrder,
} from "../_shared/city.ts";
// Raw-body HMAC verification; no client session required for Stripe delivery.
export async function verifySignature(
  raw: string,
  header: string,
  secret: string,
  now = Date.now(),
) {
  const parts = header.split(",").map((p) => p.split("=")),
    timestamp = parts.find((p) => p[0] === "t")?.[1];
  if (
    !timestamp ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300
  )
    return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  for (const [kind, signature] of parts) {
    if (kind !== "v1" || !/^[a-f\d]{64}$/.test(signature)) continue;
    const bytes = Uint8Array.from(signature.match(/../g)!, (x) =>
      parseInt(x, 16),
    );
    if (
      await crypto.subtle.verify(
        "HMAC",
        key,
        bytes,
        new TextEncoder().encode(`${timestamp}.${raw}`),
      )
    )
      return true;
  }
  return false;
}
if (import.meta.main)
  Deno.serve(async (request) => {
    try {
      if (request.method !== "POST")
        return new Response("Use POST", { status: 405 });
      const raw = await request.text();
      if (raw.length > 1_000_000)
        return new Response("Too large", { status: 413 });
      if (
        !(await verifySignature(
          raw,
          request.headers.get("stripe-signature") || "",
          required("CITY_STRIPE_WEBHOOK_SECRET"),
        ))
      )
        return new Response("Invalid signature", { status: 400 });
      const event = JSON.parse(raw),
        object = event.data?.object,
        db = cityAdmin();
      if (
        ![
          "checkout.session.completed",
          "checkout.session.async_payment_succeeded",
          "checkout.session.expired",
          "charge.refunded",
          "charge.dispute.created",
          "charge.dispute.updated",
          "charge.dispute.closed",
          "payment_intent.succeeded",
        ].includes(event.type)
      )
        return new Response("Ignored");
      let orderId = object.metadata?.city_order_id;
      if (!orderId) {
        const intent =
          typeof object.payment_intent === "string"
            ? object.payment_intent
            : object.payment_intent?.id;
        if (intent) {
          const row = result(
            await db
              .from("city_orders")
              .select("id")
              .eq("stripe_payment_intent", intent)
              .maybeSingle(),
          );
          orderId = row?.id;
          if (!orderId) {
            const { stripe } = await import("../_shared/city.ts");
            orderId = (
              await stripe(`payment_intents/${encodeURIComponent(intent)}`)
            ).metadata?.city_order_id;
          }
        }
      }
      if (!orderId) return new Response("Not a city order");
      if (event.type.startsWith("checkout.session.")) {
        // Recover a successful Stripe create whose database acknowledgement failed.
        result(
          await db
            .from("city_orders")
            .update({ stripe_session_id: object.id })
            .eq("id", orderId)
            .is("stripe_session_id", null),
        );
      }
      result(
        await db
          .from("city_payment_events")
          .upsert(
            { stripe_event_id: event.id, order_id: orderId },
            { onConflict: "stripe_event_id", ignoreDuplicates: true },
          ),
      );
      const existing = result(
        await db
          .from("city_payment_events")
          .select("status")
          .eq("stripe_event_id", event.id)
          .single(),
      );
      if (existing?.status === "processed")
        return new Response("Already processed");
      try {
        await reconcileOrder(db, orderId);
        result(
          await db
            .from("city_payment_events")
            .update({
              status: "processed",
              processed_at: new Date().toISOString(),
              error: null,
            })
            .eq("stripe_event_id", event.id),
        );
      } catch (error) {
        await db
          .from("city_payment_events")
          .update({ status: "failed", error: String(error).slice(0, 500) })
          .eq("stripe_event_id", event.id);
        throw error;
      }
      return new Response("OK");
    } catch (error) {
      console.error("City webhook failed", String(error));
      return new Response("Reconciliation pending", { status: 500 });
    }
  });
