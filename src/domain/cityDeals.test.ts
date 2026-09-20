import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type CityDeal,
  claimState,
  dealAvailability,
  dealChecklist,
  type DealClaim,
  parseDealCodes,
} from "./cityDeals.ts";
test("single-column CSV preserves quoted codes and rejects ambiguous or duplicate inventory", () => {
  assert.deepEqual(
    parseDealCodes('code\r\nONE\r\n"TWO,WITH-COMMA"\r\n"THREE"'),
    ["ONE", "TWO,WITH-COMMA", "THREE"],
  );
  for (const value of ["A\nA", "A,B", '"unclosed', "", "A\u0000"]) {
    assert.throws(() => parseDealCodes(value));
  }
});
test("deal availability is separate from entitlement status", () => {
  const d = {
    status: "approved",
    paused: false,
    ended: false,
    quantity: 1,
    issued: 0,
    terms: { startsAt: "2026-09-20T10:00:00Z", endsAt: "2026-09-20T11:00:00Z" },
  } as CityDeal;
  assert.equal(dealAvailability(d, Date.parse(d.terms.startsAt)), "live");
  assert.equal(dealAvailability(d, Date.parse(d.terms.endsAt)), "ended");
  assert.equal(
    dealAvailability({ ...d, issued: 1 }, Date.parse(d.terms.startsAt)),
    "sold out",
  );
  assert.equal(
    dealAvailability({ ...d, paused: true }, Date.parse(d.terms.startsAt)),
    "paused",
  );
  const c = {
    cancelled: false,
    redeemed_at: null,
    terms: { redeemBy: null },
  } as DealClaim;
  assert.equal(claimState(c), "active");
  assert.equal(
    claimState(
      { ...c, terms: { ...c.terms, redeemBy: d.terms.endsAt } },
      Date.parse(d.terms.endsAt),
    ),
    "expired",
  );
  assert.equal(claimState({ ...c, redeemed_at: d.terms.endsAt }), "used");
});

test("launch readiness distinguishes stale merchant evidence from approval and schedule", () => {
  const d = {
    status: "approved",
    paused: false,
    ended: false,
    businessReady: true,
    quantity: 3,
    issued: 0,
    checkoutTest: { current: true, outcome: "passed" },
    terms: { startsAt: "2026-09-20T10:00:00Z", endsAt: "2026-09-20T11:00:00Z" },
  } as CityDeal;
  const now = Date.parse("2026-09-20T09:00:00Z");
  assert.ok(dealChecklist(d, now).every((c) => c.done));
  assert.equal(
    dealChecklist({
      ...d,
      checkoutTest: { ...d.checkoutTest!, current: false },
    }, now)[2].done,
    false,
  );
  assert.equal(
    dealChecklist({ ...d, businessReady: false }, now)[0].done,
    false,
  );
  assert.equal(dealChecklist({ ...d, issued: 3 }, now)[1].done, false);
  assert.equal(dealChecklist({ ...d, status: "pending" }, now)[3].done, false);
});
