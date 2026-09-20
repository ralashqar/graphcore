import assert from "node:assert/strict";
import { dealTermsSchema } from "./city-deals.ts";
const terms = {
  title: "Creator trial",
  description: "One trial per account.",
  image: "",
  kind: "percentage",
  value: 20,
  currency: "GBP",
  minimumSpend: 0,
  maximumDiscount: null,
  destination: "https://example.com",
  startsAt: "2026-09-20T10:00:00Z",
  endsAt: "2026-09-20T11:00:00Z",
  redeemBy: null,
  exclusive: false,
  merchantExpiryConfirmed: false,
};
Deno.test("deal terms enforce monetary and merchant expiry constraints", () => {
  assert.ok(dealTermsSchema.safeParse(terms).success);
  for (
    const change of [
      { value: 101 },
      { value: 0 },
      { value: 2.5 },
      { currency: "JPY" },
      { destination: "javascript:alert(1)" },
      { destination: "http://127.0.0.1" },
      { endsAt: terms.startsAt },
      { redeemBy: "2026-09-20T12:00:00Z" },
      { redeemBy: terms.startsAt, merchantExpiryConfirmed: true },
    ]
  ) {
    assert.equal(
      dealTermsSchema.safeParse({ ...terms, ...change }).success,
      false,
      JSON.stringify(change),
    );
  }
  assert.ok(
    dealTermsSchema.safeParse({
      ...terms,
      redeemBy: terms.endsAt,
      merchantExpiryConfirmed: true,
    }).success,
  );
});
