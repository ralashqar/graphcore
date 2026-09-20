import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
// npm ci provides PGlite; CITY_PGLITE_MODULE permits an isolated local test install.
const { PGlite } = await import(
  process.env.CITY_PGLITE_MODULE || "@electric-sql/pglite"
);
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key);
create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
const migration = await readFile(
  new URL(
    "../supabase/migrations/20260920130959_synarc_city.sql",
    import.meta.url,
  ),
  "utf8",
);
await db.exec(migration);
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const scalar = async (sql, args = []) =>
  Object.values((await q(sql, args))[0])[0];
const user = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222",
  admin = "33333333-3333-4333-8333-333333333333";
await q("insert into auth.users(id) values($1),($2),($3)", [
  user,
  other,
  admin,
]);
await q("insert into city_admins values($1)", [admin]);
const profile = {
  name: "Test Studio",
  website: "https://example.com",
  category: "Apps",
  description: "A test",
  tagline: "Test",
  color: "#547364",
  logo: "",
  hero: "",
  video: "",
  offer: {
    title: "Test offer",
    code: "HELLO",
    description: "Welcome",
    expiresAt: null,
    url: "https://example.com",
  },
};
const mutate = (id, action, data) =>
  scalar("select city_mutate($1,$2,$3::jsonb)", [
    id,
    action,
    JSON.stringify(data),
  ]);
const a = await mutate(user, "create", { slug: "test-studio", profile }),
  b = await mutate(other, "create", {
    slug: "second-studio",
    profile: { ...profile, name: "Other Studio" },
  });
await assert.rejects(
  mutate(other, "save", {
    businessId: a.id,
    version: 1,
    profile,
    host: "example.com",
  }),
  /Owner access/,
);
await assert.rejects(
  mutate(user, "submit", { businessId: a.id, version: 1 }),
  /Verify the website/,
);
for (const [id, business] of [
  [user, a],
  [other, b],
]) {
  await mutate(id, "verify", {
    businessId: business.id,
    version: 1,
    host: "example.com",
  });
  await mutate(id, "submit", { businessId: business.id, version: 1 });
  await assert.rejects(
    mutate(id, "review", {
      businessId: business.id,
      version: 1,
      decision: "approve",
      note: "No",
    }),
    /Administrator/,
  );
  await mutate(admin, "review", {
    businessId: business.id,
    version: 1,
    decision: "approve",
    note: "Approved fixture",
  });
}
const order = await mutate(user, "order", {
  businessId: a.id,
  requestKey: crypto.randomUUID(),
  amount: 10000,
});
assert.equal(
  (
    await mutate(user, "order", {
      businessId: a.id,
      requestKey: order.request_key,
      amount: 10000,
    })
  ).id,
  order.id,
);
await assert.rejects(
  mutate(user, "order", {
    businessId: a.id,
    requestKey: order.request_key,
    amount: 20000,
  }),
  /different purchase/,
);
const lease = () => scalar("select city_order_lease($1)", [order.id]);
const apply = (token, value, status = "fulfilled") =>
  q("select city_apply_payment($1,$2,$3,$4,$5)", [
    order.id,
    token,
    value,
    status,
    "pi_test",
  ]);
const token = await lease();
assert.ok(token);
assert.equal(await lease(), null);
await apply(token, 10000);
assert.equal(
  Number(
    await scalar("select land_value from city_businesses where id=$1", [a.id]),
  ),
  10000,
);
assert.equal(await scalar("select count(*)::int from city_listings"), 1);
await assert.rejects(apply(token, 10000), /lease expired/);
await apply(await lease(), 10000);
assert.equal(
  await scalar("select count(*)::int from city_ledger"),
  1,
  "retry does not post another entry",
);
await apply(await lease(), 7500, "partially_refunded");
await apply(await lease(), 0, "disputed");
await apply(await lease(), 7500, "partially_refunded");
assert.equal(
  Number(
    await scalar("select land_value from city_businesses where id=$1", [a.id]),
  ),
  7500,
  "won dispute restores only remaining principal",
);
assert.equal(Number(await scalar("select sum(delta) from city_ledger")), 7500);
await assert.rejects(q("update city_ledger set delta=0"), /immutable/);
const competitor = await mutate(other, "order", {
  businessId: b.id,
  requestKey: crypto.randomUUID(),
  amount: 7500,
});
const competitorLease = await scalar("select city_order_lease($1)", [
  competitor.id,
]);
await q("select city_apply_payment($1,$2,7500,$3,$4)", [
  competitor.id,
  competitorLease,
  "fulfilled",
  "pi_competitor",
]);
assert.equal(
  await scalar("select business_id from city_listings where rank=1"),
  a.id,
  "equal value retains earlier incumbent",
);
await mutate(user, "save_business", { businessId: a.id, saved: true });
await mutate(user, "save_business", { businessId: a.id, saved: true });
assert.equal(await scalar("select count(*)::int from city_saves"), 1);
await mutate(user, "claim", { businessId: a.id });
await mutate(user, "claim", { businessId: a.id });
assert.equal(await scalar("select count(*)::int from city_claims"), 1);
const publicSnapshot = await scalar(
  "select city_public_snapshot(p_mode=>'directory',p_sort=>'saves')",
);
assert.equal(publicSnapshot.properties[0].business_id, a.id);
assert.equal(publicSnapshot.total, 2);
assert.equal(
  publicSnapshot.properties.some((p) => "owner_id" in p),
  false,
);
await q(
  "update city_businesses set published=jsonb_set(published,'{offer,expiresAt}',to_jsonb('2020-01-01T00:00:00Z'::text)) where id=$1",
  [a.id],
);
await q("select city_reallocate()");
await assert.rejects(mutate(other, "claim", { businessId: a.id }), /expired/);
await mutate(user, "save", {
  businessId: a.id,
  version: 1,
  profile: { ...profile, name: "Unreviewed" },
  host: "example.com",
});
assert.equal(
  await scalar(
    "select profile->>'name' from city_listings where business_id=$1",
    [a.id],
  ),
  "Test Studio",
  "draft does not leak",
);
await assert.rejects(
  mutate(admin, "review", {
    businessId: a.id,
    version: 1,
    decision: "approve",
  }),
  /stale/,
);
// Populate 401 paid businesses and verify append-only capacity expansion.
const initial = await q("select * from city_plots order by priority");
for (let i = 0; i < 399; i++) {
  const id = crypto.randomUUID();
  await q("insert into auth.users values($1)", [id]);
  await q(
    "insert into city_businesses(owner_id,slug,draft,published,status,land_value) values($1,$2,$3::jsonb,$3::jsonb,'approved',1000)",
    [id, `fixture-${i}`, JSON.stringify(profile)],
  );
}
await q("select city_reallocate()");
assert.deepEqual(
  await q("select * from city_plots where priority<=400 order by priority"),
  initial,
);
assert.equal(await scalar("select count(*)::int from city_listings"), 401);
assert.equal(
  await scalar("select count(distinct rank)::int from city_listings"),
  401,
);
assert.equal(await scalar("select count(*)::int from city_plots"), 484);
await mutate(admin, "review", {
  businessId: a.id,
  version: 2,
  decision: "suspend",
  note: "Fixture suspension",
});
assert.equal(
  await scalar("select count(*)::int from city_listings where business_id=$1", [
    a.id,
  ]),
  0,
);
assert.equal(
  Number(
    await scalar("select land_value from city_businesses where id=$1", [a.id]),
  ),
  7500,
);
for (const role of ["anon", "authenticated"]) {
  await db.exec(`set role ${role}`);
  assert.equal(await scalar("select count(*)::int from city_state"), 1);
  for (const sql of [
    "select * from city_businesses",
    "select * from city_orders",
    "select * from city_ledger",
    "select city_reallocate()",
    "update city_state set revision=999",
  ]) {
    await assert.rejects(q(sql), /permission denied/);
  }
  await db.exec("reset role");
}
assert.equal(
  await scalar(
    "select count(*)::int from pg_class where relname like 'city_%' and relkind='r' and not relrowsecurity",
  ),
  0,
);
console.log(
  "City PostgreSQL tests passed: migration, owner/admin fences, payment retries, refunds/disputes, 401 allocations, suspension, grants and RLS.",
);
await db.close();
