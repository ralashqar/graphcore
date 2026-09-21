import { test } from "node:test";
import assert from "node:assert/strict";
import { marketMotion, marketHeadline, marketTickerHeadline, type MarketMove } from "./cityMarket.ts";
const before = {
  id: "a",
  slug: "a",
  name: "Acme",
  color: "#aaa",
  rank: 8,
  value: 1000,
  x: 3,
  z: 4,
  tier: 0,
};
const after = { ...before, rank: 1, value: 50000, x: -1, z: -1, tier: 2 };
const move: MarketMove = { id: "a", before, after };
test("movement begins at old plot, travels with lift, and settles exactly", () => {
  assert.equal(marketMotion(move, 0)?.x, 3);
  assert.equal(marketMotion(move, 0)?.z, 4);
  assert.ok(marketMotion(move, 1500)!.lift > 0);
  assert.deepEqual(marketMotion(move, 4000), {
    x: -1,
    z: -1,
    lift: Math.sin(Math.PI) * 6,
    scale: 1,
    turn: 1,
    done: true,
  });
});
test("refund and moderation never announce takeover", () => {
  const event = {
    version: 1,
    revision: 1,
    cause: "correction" as const,
    initiator: "a",
    created_at: "",
    moves: [move],
  };
  assert.equal(marketHeadline(event), "City positions updated");
  assert.equal(
    marketHeadline({ ...event, cause: "purchase" }),
    "Acme took Central Plaza",
  );
});

test("ticker names only a confirmed displaced competitor and never invents purchase activity", () => {
  const event = { version: 1, revision: 4, cause: "purchase" as const, initiator: "a", created_at: "", moves: [move,
    { id: "b", before: { ...after, id: "b", name: "Rival" }, after: { ...after, id: "b", rank: 2 } }] };
  assert.equal(marketTickerHeadline(event), "Acme overtook Rival in Central Plaza");
  assert.equal(marketTickerHeadline({ ...event, cause: "correction" }), "City positions updated");
  assert.equal(marketTickerHeadline({ ...event, moves: [move] }), "Acme took Central Plaza");
});
