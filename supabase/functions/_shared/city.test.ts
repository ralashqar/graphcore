import assert from "node:assert/strict";
import { parseProfile } from "./city.ts";
 Deno.test("sample media requires account ownership, still images and complete comparisons", () => {
  const user = "11111111-1111-4111-8111-111111111111";
  const image = `${user}/22222222-2222-4222-8222-222222222222.png`;
  const profile = { name: "Creator", tagline: "Try it", description: "A sample", website: "https://example.com", category: "Creators", color: "#547364", logo: "", hero: "", video: "", offer: { title: "", description: "", code: "", expiresAt: null, url: "" }, sample: { kind: "comparison", title: "Before and after", items: [{ label: "Before", image, description: "Original" }, { label: "After", image, description: "Result" }] } };
  assert.equal(parseProfile(profile, user).sample?.items.length, 2);
  const changed = structuredClone(profile);
  changed.sample.items[0].image = "";
  assert.throws(() => parseProfile(changed, user));
  changed.sample.items[0].image = image.replace(".png", ".mp4");
  assert.throws(() => parseProfile(changed, user));
  changed.sample.items[0].image = image.replace(user, "33333333-3333-4333-8333-333333333333");
  assert.throws(() => parseProfile(changed, user), /belong/);
});
import { publicIPv4, importURL, fetchPublicWebsite } from "./city-network.ts";
import { paymentState } from "./city-payments.ts";
import { verifySignature } from "../city-stripe-webhook/index.ts";
Deno.test(
  "imports reject private, loopback, metadata and reserved networks",
  () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "198.18.0.1",
      "203.0.113.1",
    ])
      assert.equal(publicIPv4(ip), false, ip);
    assert.equal(publicIPv4("93.184.216.34"), true);
    for (const url of [
      "http://example.com",
      "https://127.0.0.1",
      "https://[::1]",
      "https://u:p@example.com",
      "https://example.com:444",
      "https://host.local",
    ])
      assert.throws(() => importURL(url));
  },
);
Deno.test(
  "paid principal excludes tax and compensates refunds and disputes exactly once",
  () => {
    const order = { id: "order", amount: 10000 },
      session = {
        metadata: { city_order_id: "order" },
        currency: "gbp",
        amount_subtotal: 10000,
        amount_total: 12000,
        status: "complete",
        payment_status: "paid",
        payment_intent: "pi_test",
      },
      intent = {
        status: "succeeded",
        latest_charge: { currency: "gbp", amount: 12000, amount_refunded: 0 },
      };
    assert.equal(paymentState(order, session, intent).effective, 10000);
    intent.latest_charge.amount_refunded = 3000;
    assert.equal(paymentState(order, session, intent).effective, 7500);
    assert.equal(
      paymentState(order, session, intent, [{ status: "needs_response" }])
        .effective,
      0,
    );
    assert.equal(
      paymentState(order, session, intent, [{ status: "lost" }]).effective,
      0,
    );
    assert.equal(
      paymentState(order, session, intent, [{ status: "won" }]).effective,
      7500,
    );
    assert.throws(() =>
      paymentState(order, { ...session, currency: "usd" }, intent),
    );
    assert.throws(() =>
      paymentState(order, { ...session, amount_subtotal: 9999 }, intent),
    );
    assert.throws(() =>
      paymentState(order, session, { ...intent, status: "processing" }),
    );
    assert.equal(
      paymentState(order, { ...session, payment_status: "unpaid" }, null)
        .effective,
      0,
    );
    intent.latest_charge.amount_refunded = 12000;
    assert.equal(paymentState(order, session, intent).status, "refunded");
  },
);
Deno.test(
  "webhook HMAC accepts authentic payloads and rejects tampering/stale deliveries",
  async () => {
    const now = Date.now(),
      time = String(Math.floor(now / 1000)),
      secret = "test-secret",
      raw = '{"type":"checkout.session.completed"}';
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const digest = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${time}.${raw}`),
    );
    const signature = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const header = `t=${time},v1=${signature}`;
    assert.equal(await verifySignature(raw, header, secret, now), true);
    assert.equal(await verifySignature(`${raw} `, header, secret, now), false);
    assert.equal(
      await verifySignature(raw, header, secret, now + 301000),
      false,
    );
    assert.equal(
      await verifySignature(raw, `t=${time},v1=garbage`, secret, now),
      false,
    );
  },
);
if (Deno.env.get("CITY_NETWORK_SMOKE") === "true")
  Deno.test("pinned TLS imports a public HTTPS website", async () => {
    const response = await fetchPublicWebsite("https://example.com");
    assert.ok(response.bytes.length > 0);
    assert.ok(response.type.includes("text/html"));
  });

Deno.test(
  "billboard crop and media ownership are validated without breaking legacy profiles",
  async () => {
    const { parseProfile } = await import("./city.ts");
    const uid = "11111111-1111-4111-8111-111111111111";
    const profile = {
      name: "Test",
      tagline: "",
      description: "",
      website: "https://example.com",
      category: "Apps",
      color: "#547364",
      logo: "",
      hero: "",
      video: "",
      offer: { title: "", description: "", code: "", expiresAt: null, url: "" },
    };
    assert.equal(parseProfile(profile, uid).billboard, undefined);
    const valid = {
      ...profile,
      billboard: `${uid}/66666666-6666-4666-8666-666666666666.png`,
      billboardCrop: { x: 0, y: 100, zoom: 3 },
    };
    assert.deepEqual(
      parseProfile(valid, uid).billboardCrop,
      valid.billboardCrop,
    );
    assert.throws(() =>
      parseProfile({ ...valid, billboardCrop: { x: 101, y: 0, zoom: 1 } }, uid),
    );
    assert.throws(() =>
      parseProfile({ ...valid, billboardCrop: { x: 50, y: 0, zoom: 0 } }, uid),
    );
    assert.throws(
      () =>
        parseProfile(
          {
            ...valid,
            billboard: valid.billboard.replace(
              uid,
              "22222222-2222-4222-8222-222222222222",
            ),
          },
          uid,
        ),
      /belong/,
    );
  },
);
