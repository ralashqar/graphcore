import test from "node:test";
import assert from "node:assert/strict";
import {
  activeOffer,
  buildingTier,
  cityPlots,
  emptyCityProfile,
  parsePurchase,
  rankBusinesses,
  safeWebsite,
} from "./city.ts";
test("400 saleable plots and append-only expansion retain every priority", () => {
  const initial = cityPlots(),
    expanded = cityPlots(401);
  assert.equal(initial.length, 400);
  assert.deepEqual(expanded.slice(0, 400), initial);
  assert.equal(
    new Set(expanded.map((p) => `${p.x},${p.z}`)).size,
    expanded.length,
  );
  assert.ok(expanded.length > 400);
  assert.ok(cityPlots(2000).length >= 2000);
});
test("equal values retain earlier incumbent and ranking ignores nonpositive value", () => {
  const rows = [
    { id: "a", landValue: 1000, reachedAt: "2026-09-20" },
    { id: "b", landValue: 1000, reachedAt: "2026-09-19" },
    { id: "c", landValue: 2000, reachedAt: "2026-09-20" },
    { id: "d", landValue: 0, reachedAt: "2026-09-01" },
  ];
  assert.deepEqual(
    rankBusinesses(rows).map((r) => r.id),
    ["c", "b", "a"],
  );
});
test("purchase parsing is exact and rejects ambiguous and out-of-range money", () => {
  assert.equal(parsePurchase("12.34"), 1234);
  assert.equal(parsePurchase("50000"), 5000000);
  for (const input of [
    "1e4",
    "10.001",
    "-10",
    "NaN",
    "9.99",
    "50000.01",
    " 10",
  ])
    assert.throws(() => parsePurchase(input));
});
test("building tiers use inclusive GBP penny thresholds", () => {
  assert.equal(buildingTier(9999), 0);
  assert.equal(buildingTier(10000), 1);
  assert.equal(buildingTier(5000000), 5);
});
test("offers expire exactly at the boundary; unsafe website schemes fail", () => {
  const profile = emptyCityProfile();
  profile.offer.title = "Founders offer";
  profile.offer.expiresAt = "2026-09-20T12:00:00Z";
  assert.equal(
    activeOffer(profile, Date.parse(profile.offer.expiresAt)),
    false,
  );
  assert.throws(() => safeWebsite("javascript:alert(1)"));
  assert.throws(() => safeWebsite("https://user:pass@example.com"));
  assert.equal(safeWebsite("https://example.com"), "https://example.com/");
});
