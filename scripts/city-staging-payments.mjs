// Real sandbox acceptance. Requires two completed test Checkouts in a dedicated staging project.
// Refunds the second order in full; never accepts live Stripe keys or live sessions.
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
const env = process.env;
const required = (key) => {
  if (!env[key]) throw new Error(`Missing ${key}`);
  return env[key];
};
const evidence = {
  checkedAt: new Date().toISOString(),
  checks: [],
  status: "blocked",
};
try {
  const origin = new URL(required("CITY_STAGING_SUPABASE_URL"));
  assert.ok(
    origin.protocol === "https:" &&
      origin.hostname.endsWith(".supabase.co") &&
      origin.hostname !== "znwdatidqdkzidempvkt.supabase.co" &&
      !origin.username &&
      !origin.password,
    "Use an isolated staging project",
  );
  const key = required("CITY_STRIPE_SECRET_KEY");
  assert.match(key, /^sk_test_/, "Only sandbox/test keys are accepted");
  const webhookSecret = required("CITY_STRIPE_WEBHOOK_SECRET");
  const db = createClient(origin.origin, required("CITY_STAGING_SERVICE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ids = [
    required("CITY_STAGING_ORDER_A"),
    required("CITY_STAGING_ORDER_B"),
  ];
  assert.notEqual(ids[0], ids[1]);
  async function stripe(path, body) {
    const response = await fetch(`https://api.stripe.com/v1/${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
        ...(body ? { "Idempotency-Key": `city-staging-refund-${ids[1]}` } : {}),
      },
      body,
      signal: AbortSignal.timeout(20000),
    });
    assert.ok(response.ok, `Stripe operation failed (${response.status})`);
    return response.json();
  }
  async function rows(table, column, values) {
    const { data, error } = await db.from(table).select("*").in(column, values);
    assert.ok(!error, `${table} read failed`);
    return data;
  }
  async function waitValues(expected) {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      const orders = await rows("city_orders", "id", ids);
      if (
        orders.length === 2 &&
        ids.every(
          (id, i) =>
            Number(orders.find((o) => o.id === id).effective_value) ===
            expected[i],
        )
      )
        return orders;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error(
      "Timed out waiting for webhook/reconciliation ledger values",
    );
  }
  const orders = await rows("city_orders", "id", ids);
  assert.equal(orders.length, 2);
  const a = orders.find((o) => o.id === ids[0]),
    b = orders.find((o) => o.id === ids[1]);
  assert.notEqual(
    a.business_id,
    b.business_id,
    "Use two different test businesses",
  );
  assert.ok(
    Number(b.amount) > Number(a.amount),
    "Order B must overtake order A",
  );
  const sessions = await Promise.all(
    [a, b].map((o) =>
      stripe(`checkout/sessions/${encodeURIComponent(o.stripe_session_id)}`),
    ),
  );
  sessions.forEach((s, i) => {
    assert.equal(s.livemode, false);
    assert.equal(s.payment_status, "paid");
    assert.equal(s.metadata.city_order_id, ids[i]);
  });
  await waitValues([Number(a.amount), Number(b.amount)]);
  const businessIds = [a.business_id, b.business_id];
  const listings = await rows("city_listings", "business_id", businessIds);
  assert.equal(listings.length, 2);
  assert.ok(
    listings.find((l) => l.business_id === b.business_id).rank <
      listings.find((l) => l.business_id === a.business_id).rank,
  );
  evidence.checks.push(
    "Two real sandbox Checkouts credited and higher purchaser ranked ahead",
  );
  const before = await rows("city_ledger", "order_id", ids);
  const events = await stripe(
    "events?type=checkout.session.completed&limit=100",
  );
  const event = events.data.find((e) => e.data.object.id === sessions[1].id);
  assert.ok(
    event && event.livemode === false,
    "Recent sandbox Checkout event is required for replay",
  );
  const payload = JSON.stringify(event),
    timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  const replay = await fetch(
    `${origin.origin}/functions/v1/city-stripe-webhook`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": `t=${timestamp},v1=${signature}`,
      },
      body: payload,
      signal: AbortSignal.timeout(30000),
    },
  );
  assert.ok(replay.ok, "Signed replay rejected");
  assert.equal(
    (await rows("city_ledger", "order_id", ids)).length,
    before.length,
  );
  evidence.checks.push(
    "Authentic test event replay does not duplicate ledger entries",
  );
  const refund = await stripe(
    "refunds",
    new URLSearchParams({ payment_intent: sessions[1].payment_intent }),
  );
  assert.equal(refund.status, "succeeded");
  await waitValues([Number(a.amount), 0]);
  const after = await rows("city_ledger", "order_id", ids);
  assert.equal(
    after
      .filter((l) => l.order_id === ids[1])
      .reduce((sum, l) => sum + Number(l.delta), 0),
    0,
  );
  const finalListings = await rows("city_listings", "business_id", businessIds);
  const rankA = finalListings.find(
    (l) => l.business_id === a.business_id,
  )?.rank;
  const rankB = finalListings.find(
    (l) => l.business_id === b.business_id,
  )?.rank;
  assert.ok(
    rankA && (!rankB || rankA < rankB),
    "Refund must restore A ahead of B; use businesses without other purchases",
  );
  evidence.checks.push(
    "Full sandbox refund compensates ledger and restores rank ordering",
  );
  evidence.status = "passed";
} catch (error) {
  evidence.reason = error.message;
  process.exitCode = 2;
}
await mkdir("output/city-staging", { recursive: true });
await writeFile(
  "output/city-staging/payments.json",
  JSON.stringify(evidence, null, 2),
);
console.log(JSON.stringify(evidence, null, 2));
