import test from "node:test";
import assert from "node:assert/strict";
import { launchState, eligibleStorefront } from "./cityDiscovery.ts";
test("launch state follows exact UTC boundaries", () => {
  const c = {
    title: "Launch",
    description: "",
    startsAt: "2026-10-01T12:00:00Z",
    endsAt: "2026-10-01T13:00:00Z",
  };
  assert.equal(launchState(c, Date.parse(c.startsAt) - 1), "Upcoming");
  assert.equal(launchState(c, Date.parse(c.startsAt)), "Live");
  assert.equal(launchState(c, Date.parse(c.endsAt)), "Past");
});
test("approved content stays public while a new draft is pending; suspension hides it", () => {
  assert.equal(eligibleStorefront({ published: {}, status: "pending" }), true);
  assert.equal(
    eligibleStorefront({ published: null, status: "pending" }),
    false,
  );
  assert.equal(
    eligibleStorefront({ published: {}, status: "suspended" }),
    false,
  );
});
