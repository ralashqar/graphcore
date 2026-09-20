import test from "node:test";
import assert from "node:assert/strict";
import {
  type CustomerItem,
  discoveryLabel,
  surpriseItem,
} from "./cityCustomer.ts";
const item = (
  id: string,
  extras: Partial<CustomerItem> = {},
): CustomerItem => ({
  key: id,
  business_id: id,
  content_id: id,
  slug: id,
  business_name: id,
  category: "Creators",
  kind: "business",
  title: id,
  description: "",
  destination: "/city",
  rank: null,
  x: null,
  z: null,
  created_at: "",
  starts_at: null,
  ends_at: null,
  remaining: null,
  free: false,
  exclusive: false,
  available: true,
  ...extras,
});
test("surprise excludes unavailable and recently visited businesses", () => {
  assert.equal(
    surpriseItem(
      [item("a"), item("b"), item("c", { available: false })],
      ["a"],
      0,
    )?.business_id,
    "b",
  );
  assert.equal(surpriseItem([], [], 0), null);
});
test("cold start does not label businesses trending", () => {
  assert.equal(discoveryLabel(item("a"), "hot"), "Explore");
  assert.equal(
    discoveryLabel(item("a", { trending: true }), "hot"),
    "↗ Hot now",
  );
  assert.equal(discoveryLabel(item("b", { kind: "launch" })), "↑ Launch");
});
