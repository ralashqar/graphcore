import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
await db.exec(
  `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
);
for (const name of [
  "20260920130959_synarc_city",
  "20260920145000_city_pilot_analytics",
  "20260920152544_city_discovery",
  "20260920160701_city_campus",
  "20260920172201_city_deals",
  "20260920182940_city_deal_launch",
  "20260920185857_city_customer_discovery",
  "20260920202005_city_market_competition",
]) {
  await db.exec(
    await readFile(
      new URL(`../supabase/migrations/${name}.sql`, import.meta.url),
      "utf8",
    ),
  );
}
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const val = async (sql, args = []) => Object.values((await q(sql, args))[0])[0];

const profile = {
  name: "Market fixture",
  color: "#547364",
  category: "Creators",
};
async function business(slug, value) {
  const user = crypto.randomUUID();
  await q("insert into auth.users values($1)", [user]);
  return (
    await q(
      "insert into city_businesses(owner_id,slug,draft,published,status,land_value) values($1,$2,$3,$3,'approved',$4) returning *",
      [user, slug, profile, value],
    )
  )[0];
}
const a = await business("incumbent", 2000),
  b = await business("challenger", 1000);
await q("select city_reallocate()");
let quote = await val("select city_market_quote($1,1000)", [b.id]);
assert.equal(quote.rank, 2, "equal value never displaces earlier incumbent");
quote = await val("select city_market_quote($1,1001)", [b.id]);
assert.equal(quote.rank, 1);
assert.equal(quote.targets[0].amount, 1001);
const order = await val(
  "insert into city_orders(business_id,user_id,request_key,amount) values($1,$2,gen_random_uuid(),10000) returning id",
  [b.id, b.owner_id],
);
async function settle(value, status = "fulfilled") {
  const token = await val("select city_order_lease($1)", [order]);
  await q("select city_apply_payment($1,$2,$3,$4,$5)", [
    order,
    token,
    value,
    status,
    "pi_market",
  ]);
}
await settle(10000);
let event = (
  await q(
    "select * from city_market_transitions order by revision desc limit 1",
  )
)[0];
assert.equal(event.cause, "purchase");
assert.equal(event.moves.length, 2);
assert.equal(event.initiator, b.id);
assert.equal(event.moves.find((m) => m.id === a.id).after.rank, 2);
assert.equal(event.moves.find((m) => m.id === b.id).before.tier, 0);
assert.equal(event.moves.find((m) => m.id === b.id).after.tier, 1);
assert.equal(
  await val("select count(*)::int from city_listings"),
  2,
  "displaced company remains",
);
assert.equal(
  await val(
    "select count(*)::int from city_market_alerts where business_id=$1",
    [a.id],
  ),
  1,
);
const revision = event.revision;
await settle(10000);
assert.equal(
  await val("select max(revision) from city_market_transitions"),
  revision,
  "duplicate payment creates no replay or alert",
);
await settle(0, "refunded");
event = (
  await q(
    "select * from city_market_transitions order by revision desc limit 1",
  )
)[0];
assert.equal(event.cause, "correction");
await settle(10000);
event = (
  await q(
    "select * from city_market_transitions order by revision desc limit 1",
  )
)[0];
assert.equal(
  event.cause,
  "correction",
  "reinstated payment is not a new purchase",
);
await q(
  "insert into city_market_preferences(business_id,lose_central,leave_top_ten,below_rank) values($1,false,false,2)",
  [b.id],
);
await business("outside-region", 200000);
await business("another-region", 210000);
await q("select city_reallocate()");
assert.ok(
  await val(
    "select count(*)::int from city_market_alerts where business_id=$1 and from_rank<=2 and to_rank>2",
    [b.id],
  ),
);
quote = await val("select city_market_quote($1,1000)", [b.id]);
assert.equal(
  quote.rank,
  3,
  "quote includes all competitors independent of region",
);
await business("unreachable-leader", 9000000);
await q("select city_reallocate()");
quote = await val("select city_market_quote($1,1000)", [b.id]);
assert.equal(quote.targets.find((t) => t.rank === 1).available, false);
const first = await val("select city_market_read(null)");
const next = await val("select city_market_read($1)", [
  first.events.at(-1).revision,
]);
assert.ok(next.events.every((e) => e.revision < first.events.at(-1).revision));
await q("update city_businesses set status='suspended' where id=$1", [a.id]);
await q("select city_reallocate()");
assert.ok(
  (await val("select city_market_read(null)")).events.every((e) =>
    e.moves.every((m) => m.id !== a.id),
  ),
);
for (const role of ["anon", "authenticated"]) {
  await db.exec(`set role ${role}`);
  for (const sql of [
    "select * from city_market_attribution",
    "select * from city_market_preferences",
    "select * from city_market_transitions",
    "select city_market_read(null)",
  ])
    await assert.rejects(q(sql), /permission denied/);
  await db.exec("reset role");
}
// A quote is advisory: a competing settlement before this payment changes final rank.
const raceQuote = await val("select city_market_quote($1,50000)", [b.id]);
await business("racing-bidder", 65000);
await q("select city_reallocate()");
const raceOrder = await val(
  "insert into city_orders(business_id,user_id,request_key,amount) values($1,$2,gen_random_uuid(),50000) returning id",
  [b.id, b.owner_id],
);
const raceLease = await val("select city_order_lease($1)", [raceOrder]);
await q("select city_apply_payment($1,$2,50000,$3,$4)", [
  raceOrder,
  raceLease,
  "fulfilled",
  "pi_race",
]);
assert.equal(
  await val("select rank from city_listings where business_id=$1", [b.id]),
  raceQuote.rank + 1,
);
await assert.rejects(
  q("update city_market_transitions set cause='correction'"),
  /immutable/,
);
console.log(
  "Market SQL passed: ties, global rank, upgrades, displacement, exact target, max bounds, payment retry/refund/reinstatement, threshold alerts, pagination, moderation, RLS.",
);
await db.close();
