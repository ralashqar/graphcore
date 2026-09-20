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
])
  await db.exec(
    await readFile(
      new URL(`../supabase/migrations/${name}.sql`, import.meta.url),
      "utf8",
    ),
  );
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const val = async (sql, args = []) => Object.values((await q(sql, args))[0])[0];
const admin = crypto.randomUUID(),
  owner = crypto.randomUUID(),
  visitor = crypto.randomUUID();
for (const id of [admin, owner, visitor])
  await q("insert into auth.users values($1)", [id]);
await q("insert into city_admins values($1)", [admin]);
const profile = {
  name: "Creator",
  website: "https://example.com",
  color: "#547364",
  offer: {
    title: "Try it",
    code: "HELLO",
    description: "Welcome",
    url: "https://example.com",
    expiresAt: null,
  },
};
const businesses = [];
for (let i = 0; i < 3; i++) {
  const user = i ? crypto.randomUUID() : owner;
  if (i) await q("insert into auth.users values($1)", [user]);
  businesses.push(
    await val(
      "insert into city_businesses(owner_id,slug,draft,published,status) values($1,$2,$3,$3,'approved') returning id",
      [user, `creator-${i}`, JSON.stringify(profile)],
    ),
  );
}
const mutate = (u, a, d) =>
  val("select city_discovery_mutate($1,$2,$3)", [u, a, JSON.stringify(d)]);
const content = {
  title: "First trail",
  description: "An introduction",
  outcome: "A creative direction",
  cover: "",
  stops: businesses.map((businessId) => ({
    businessId,
    reason: "Try a sample",
  })),
};
await assert.rejects(
  mutate(owner, "entry_save", { kind: "trail", slug: "first-trail", content }),
  /Operator/,
);
const trail = await mutate(admin, "entry_save", {
  kind: "trail",
  slug: "first-trail",
  content,
});
await assert.rejects(
  mutate(owner, "entry_review", {
    id: trail.id,
    version: 1,
    decision: "publish",
  }),
  /Operator/,
);
await assert.rejects(
  mutate(admin, "entry_review", {
    id: trail.id,
    version: 2,
    decision: "publish",
  }),
  /stale/,
);
await mutate(admin, "entry_review", {
  id: trail.id,
  version: 1,
  decision: "publish",
});
const edit = await mutate(admin, "entry_save", {
  id: trail.id,
  version: 1,
  kind: "trail",
  slug: trail.slug,
  content: { ...content, title: "Edited" },
});
assert.equal(edit.published.title, "First trail");
await assert.rejects(
  mutate(admin, "entry_review", {
    id: trail.id,
    version: 1,
    decision: "publish",
  }),
  /stale/,
);
await mutate(visitor, "follow", { businessId: businesses[0], enabled: true });
await mutate(visitor, "follow", { businessId: businesses[0], enabled: true });
assert.equal(Number(await val("select count(*) from city_follows")), 1);
await mutate(visitor, "follow", { businessId: businesses[0], enabled: false });
assert.equal(Number(await val("select count(*) from city_follows")), 0);
await mutate(visitor, "progress", { id: trail.id, completed: [] });
await mutate(visitor, "progress", { id: trail.id, completed: [] });
assert.deepEqual(await val("select completed from city_trail_progress"), []);
await mutate(visitor, "progress", {
  id: trail.id,
  completed: [businesses[0], crypto.randomUUID()],
});
await mutate(visitor, "progress", {
  id: trail.id,
  completed: [businesses[1], businesses[0]],
});
assert.equal(
  (await val("select completed from city_trail_progress")).length,
  2,
);
const launchContent = {
  title: "New sample",
  description: "Meet the tool",
  startsAt: "2026-01-01T12:00:00Z",
  endsAt: "2099-01-01T12:00:00Z",
};
await assert.rejects(
  mutate(visitor, "entry_save", {
    kind: "launch",
    slug: "new-sample",
    businessId: businesses[0],
    content: launchContent,
  }),
  /owner/,
);
const launch = await mutate(owner, "entry_save", {
  kind: "launch",
  slug: "new-sample",
  businessId: businesses[0],
  content: launchContent,
});
await assert.rejects(
  mutate(visitor, "save_launch", { id: launch.id, enabled: true }),
  /unavailable/,
);
await mutate(admin, "entry_review", {
  id: launch.id,
  version: 1,
  decision: "publish",
  featured: true,
});
await mutate(visitor, "save_launch", { id: launch.id, enabled: true });
await mutate(visitor, "save_launch", { id: launch.id, enabled: true });
assert.equal(Number(await val("select count(*) from city_saved_launches")), 1);
for (let i = 0; i < 5; i++) {
  const next = await mutate(owner, "entry_save", { kind: "launch", slug: `featured-launch-${i}`, businessId: businesses[0], content: launchContent });
  const publish = () => mutate(admin, "entry_review", { id: next.id, version: 1, decision: "publish", featured: true });
  if (i < 4) await publish();
  else await assert.rejects(publish(), /five featured/);
}
assert.equal(
  (
    await val("select city_mutate($1,'claim',$2)", [
      visitor,
      JSON.stringify({ businessId: businesses[0] }),
    ])
  ).code,
  "HELLO",
);
await val("select city_mutate($1,'save_business',$2)", [
  visitor,
  JSON.stringify({ businessId: businesses[0], saved: true }),
]);
assert.equal(Number(await val("select count(*) from city_listings")), 0);
assert.equal(Number(await val("select count(*) from city_ledger")), 0);
await q("update city_businesses set status='suspended' where id=$1", [
  businesses[0],
]);
await assert.rejects(
  mutate(visitor, "follow", { businessId: businesses[0], enabled: true }),
  /unavailable/,
);
await assert.rejects(
  mutate(visitor, "save_launch", { id: launch.id, enabled: true }),
  /unavailable/,
);
await assert.rejects(
  val("select city_mutate($1,'claim',$2)", [
    visitor,
    JSON.stringify({ businessId: businesses[0] }),
  ]),
  /unavailable/,
);
await mutate(admin, "entry_review", {
  id: trail.id,
  version: 2,
  decision: "archive",
});
await assert.rejects(
  mutate(visitor, "progress", { id: trail.id, completed: [] }),
  /unavailable/,
);
for (const role of ["anon", "authenticated"]) {
  await db.exec(`set role ${role}`);
  for (const sql of [
    "select * from city_follows",
    "select * from city_trail_progress",
    "select * from city_discovery_entries",
    "select * from city_discovery_reviews",
    "select city_discovery_mutate(null,'follow','{}')",
  ])
    await assert.rejects(q(sql), /permission denied/);
  await db.exec("reset role");
}
assert.equal(
  Number(
    await val(
      "select count(*) from pg_class where relname like 'city_%' and relkind='r' and not relrowsecurity",
    ),
  ),
  0,
);
console.log(
  "Discovery database checks passed: free eligibility, owner/operator fences, stale review, published revision, progress merge, follows, saves, suspension, archives and RLS.",
);
await db.close();
