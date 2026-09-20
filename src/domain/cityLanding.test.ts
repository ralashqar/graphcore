import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clearCityViewport,
  exposureDwell,
  initialWelcome,
} from "./cityLanding.ts";
test("desktop framing excludes discovery and property panels", () => {
  const r = clearCityViewport(1440, 920, [{
    left: 20,
    top: 20,
    right: 350,
    bottom: 750,
  }, { left: 1100, top: 20, right: 1420, bottom: 850 }]);
  assert.equal(r.left, 374);
  assert.equal(r.right, 1076);
});
test("mobile framing excludes search and leader card", () => {
  const r = clearCityViewport(390, 780, [{
    left: 12,
    top: 12,
    right: 378,
    bottom: 240,
  }, { left: 140, top: 600, right: 378, bottom: 710 }]);
  assert.equal(r.top, 254);
  assert.equal(r.bottom, 586);
});
test("welcome follows exploration rather than auth, and skips deep links", () => {
  assert.equal(initialWelcome({ getItem: () => null }, "/city", ""), true);
  assert.equal(initialWelcome({ getItem: () => "1" }, "/city", ""), false);
  assert.equal(initialWelcome(null, "/city/business/test", ""), false);
  assert.equal(initialWelcome(null, "/city", "coffee"), false);
});
test("exposure requires stable consecutive visible samples", () => {
  let previous: Parameters<typeof exposureDwell>[0];
  for (const time of [0, 500, 1000, 1500]) {
    const r = exposureDwell(previous, time, 100, 100, true)!;
    assert.equal(r.qualified, false);
    previous = r.state;
  }
  assert.equal(exposureDwell(previous, 2000, 100, 100, true)?.qualified, true);
  assert.equal(exposureDwell(previous, 2000, 130, 100, true)?.qualified, false);
  assert.equal(exposureDwell(previous, 4000, 100, 100, true)?.qualified, false);
  assert.equal(exposureDwell(previous, 2000, 100, 100, false), null);
});
