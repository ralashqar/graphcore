import test from "node:test";
import assert from "node:assert/strict";
import {
  launchContribution,
  type LaunchItem,
  launchPhase,
  plazaLaunches,
} from "./cityLaunches.ts";
const start = Date.parse("2026-09-21T12:00:00Z");
const content = {
  title: "Launch",
  description: "New product",
  startsAt: new Date(start).toISOString(),
  endsAt: new Date(start + 10 * 86400000).toISOString(),
};
test("lifecycle boundaries and early end use one resolver", () => {
  assert.equal(launchPhase(content, start - 1), "coming_soon");
  assert.equal(launchPhase(content, start), "launching");
  assert.equal(launchPhase(content, start + 15 * 60000), "live");
  assert.equal(launchPhase(content, start + 86400000), "recent");
  assert.equal(launchPhase(content, start + 7 * 86400000), "archived");
  assert.equal(
    launchPhase(
      { ...content, endsAt: new Date(start + 1000).toISOString() },
      start + 1000,
    ),
    "archived",
  );
});
test("rolling contribution decays and never accepts paid value", () => {
  assert.equal(launchContribution(4, start, start + 6 * 3600000), 2);
  assert.equal(launchContribution(4, start, start + 49 * 3600000), 0);
});
test("Plaza reserves eight current and four upcoming slots with deterministic ordering", () => {
  const items: LaunchItem[] = Array.from({ length: 30 }, (_, n) => ({
    id: String(n).padStart(2, "0"),
    slug: "launch-" + n,
    business_id: "b" + n,
    business_name: "B",
    business_slug: "business",
    content: {
      ...content,
      startsAt: new Date(start + (n < 15 ? -1000 : 1000 + n)).toISOString(),
    },
    phase: n < 15 ? "live" : "coming_soon",
    rank: n < 15 ? n + 1 : null,
    score: 10,
    interested: 6,
    viewerInterested: false,
  }));
  const selected = plazaLaunches(items, start);
  assert.equal(selected.length, 12);
  assert.equal(selected.filter((i) => i.phase === "coming_soon").length, 4);
  assert.deepEqual(selected, plazaLaunches([...items].reverse(), start));
});
