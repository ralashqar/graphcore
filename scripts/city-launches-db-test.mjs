import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
await db.exec(
  `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
);
for (
  const name of [
    "20260920130959_synarc_city",
    "20260920145000_city_pilot_analytics",
    "20260920152544_city_discovery",
    "20260920160701_city_campus",
    "20260920172201_city_deals",
    "20260920182940_city_deal_launch",
    "20260920185857_city_customer_discovery",
    "20260920202005_city_market_competition",
    "20260920220724_city_landing_exposure",
    "20260920223031_city_living_storefronts",
    "20260920225908_city_launches_layer",
  ]
) {
  await db.exec(
    await readFile(
      new URL(`../supabase/migrations/${name}.sql`, import.meta.url),
      "utf8",
    ),
  );
}
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const owner = crypto.randomUUID(),
  business = crypto.randomUUID(),
  launch = crypto.randomUUID();
await q("insert into auth.users values($1)", [owner]);
await q(
  "insert into city_businesses(id,owner_id,slug,draft,published,status) values($1,$2,'launch-test',$3,$3,'approved')",
  [
    business,
    owner,
    JSON.stringify({
      name: "Launch test",
      category: "Creators",
      color: "#547364",
    }),
  ],
);
const content = {
  title: "New editor",
  description: "A creative launch",
  startsAt: new Date().toISOString(),
  endsAt: new Date(Date.now() + 86400000).toISOString(),
};
await q(
  "insert into city_discovery_entries(id,kind,slug,business_id,draft,published,status) values($1,'launch','editor-launch',$2,$3,$3,'published')",
  [launch, business, JSON.stringify(content)],
);
for (let i = 0; i < 5; i++) {
  const user = crypto.randomUUID();
  await q("insert into auth.users values($1)", [user]);
  await q("select city_launch_interest($1,$2,true)", [user, launch]);
  await q("select city_launch_interest($1,$2,false)", [user, launch]);
  await q("select city_launch_interest($1,$2,true)", [user, launch]);
}
let scores = await q("select * from city_launch_scores()");
assert.equal(Number(scores[0].actors), 5);
assert.equal(Number(scores[0].rank), 1);
assert.equal(Number(scores[0].interested), 5);
await q("select city_launch_interest($1,$2,true)", [owner, launch]);
scores = await q("select * from city_launch_scores()");
assert.equal(Number(scores[0].actors), 5);
assert.equal(Number(scores[0].interested), 5);
// Paid geography can move without granting any organic launch signal.
await q("update city_businesses set land_value=100 where id=$1", [business]);
const rivalOwner = crypto.randomUUID(), rival = crypto.randomUUID();
await q("insert into auth.users values($1)", [rivalOwner]);
await q(
  "insert into city_businesses(id,owner_id,slug,draft,published,status,land_value) values($1,$2,'central-rival',$3,$3,'approved',1000000)",
  [
    rival,
    rivalOwner,
    JSON.stringify({ name: "Central rival", color: "#547364" }),
  ],
);
await q("select city_reallocate()");
assert.equal(
  (await q("select rank from city_listings where business_id=$1", [business]))[
    0
  ].rank,
  2,
);
assert.equal(
  Number(
    (await q("select * from city_launch_scores() where launch_id=$1", [
      launch,
    ]))[0].rank,
  ),
  1,
);
await q("update city_businesses set land_value=2000000 where id=$1", [
  business,
]);
await q("select city_reallocate()");
assert.equal(
  (await q("select rank from city_listings where business_id=$1", [business]))[
    0
  ].rank,
  1,
);
assert.equal(
  Number(
    (await q("select * from city_launch_scores() where launch_id=$1", [
      launch,
    ]))[0].actors,
  ),
  5,
);
const before = await q(
  "select first_at from city_launch_signals where launch_id=$1",
  [launch],
);
await q(
  "update city_launch_signals set first_at=now()-interval '49 hours' where launch_id=$1",
  [launch],
);
scores = await q("select * from city_launch_scores()");
assert.equal(Number(scores[0].score), 0);
assert.equal(scores[0].rank, null);
await q(
  "update city_discovery_entries set status='pending',draft=draft||'{\"title\":\"Edited\"}' where id=$1",
  [launch],
);
const entry =
  (await q("select * from city_discovery_entries where id=$1", [launch]))[0];
assert.equal(entry.status, "published");
assert.equal(entry.published.title, "New editor");
const catalog =
  (await q("select city_launch_catalog(null,null,'all','','',0,false) data"))[0]
    .data;
assert.equal(catalog.items.length, 1);
assert.equal(catalog.items[0].content.title, "New editor");
assert.equal("user_id" in catalog.items[0], false);
await q("select city_discovery_mutate($1,'launch_pause',$2)", [
  owner,
  JSON.stringify({ id: launch, paused: true }),
]);
assert.equal(
  (await q("select city_launch_catalog(null,null,'all','','',0,false) data"))[0]
    .data.items.length,
  0,
);
for (const table of ["city_launch_signals"]) {
  assert.equal(
    (await q("select relrowsecurity from pg_class where relname=$1", [table]))[
      0
    ].relrowsecurity,
    true,
  );
  assert.equal(
    (await q("select has_table_privilege('anon',$1,'SELECT') ok", [table]))[0]
      .ok,
    false,
  );
}

// Draft submission and exact-version review retain publication and reject private drafts.
await q("insert into city_admins values($1)", [owner]);
const edit = (await q("select city_discovery_mutate($1,'entry_save',$2) data", [
  owner,
  JSON.stringify({
    kind: "launch",
    id: launch,
    version: 1,
    slug: "editor-launch",
    businessId: business,
    saveDraft: true,
    content: { ...content, title: "Private change" },
  }),
]))[0].data;
assert.equal(
  (await q("select review_state from city_discovery_entries where id=$1", [
    launch,
  ]))[0].review_state,
  "draft",
);
await assert.rejects(
  q("select city_discovery_mutate($1,'entry_review',$2)", [
    owner,
    JSON.stringify({ id: launch, version: edit.version, decision: "publish" }),
  ]),
  /Submit/,
);
await q("select city_discovery_mutate($1,'launch_pause',$2)", [
  owner,
  JSON.stringify({ id: launch, paused: false }),
]);
const submitted=(await q("select city_discovery_mutate($1,'entry_save',$2) data",[owner,JSON.stringify({kind:'launch',id:launch,version:edit.version,slug:'editor-launch',businessId:business,saveDraft:false,content:{...content,title:'Private change'}})]))[0].data;
assert.equal(submitted.review_state,'submitted');
assert.equal((await q('select review_state from city_discovery_entries where id=$1',[launch]))[0].review_state,'submitted');
const customer = crypto.randomUUID(), deal = crypto.randomUUID();
await q("insert into auth.users values($1)", [customer]);
const terms = {
  title: "Founder pack",
  description: "A unique founder pack",
  startsAt: new Date(Date.now() - 3600000).toISOString(),
  endsAt: new Date(Date.now() + 86400000).toISOString(),
};
await q(
  "insert into city_deals(id,business_id,terms,status,quantity) values($1,$2,$3,'approved',1)",
  [deal, business, JSON.stringify(terms)],
);
await q(
  "insert into city_deal_codes(deal_id,code) values($1,'SECRET-FOUNDER')",
  [deal],
);
await q(
  "update city_discovery_entries set published=published||jsonb_build_object('rewardDealId',$2::text),status='published' where id=$1",
  [launch, deal],
);
const claim = (await q("select city_deal_mutate($1,'claim',$2) data", [
  customer,
  JSON.stringify({ id: deal, sourceLaunchId: launch }),
]))[0].data;
assert.equal(claim.source_launch_id, launch);
assert.equal(claim.code, "SECRET-FOUNDER");
const retry = (await q("select city_deal_mutate($1,'claim',$2) data", [
  customer,
  JSON.stringify({ id: deal, sourceLaunchId: crypto.randomUUID() }),
]))[0].data;
assert.equal(retry.id, claim.id);
assert.equal(retry.source_launch_id, launch);
assert.equal(
  (await q("select issued from city_deals where id=$1", [deal]))[0].issued,
  1,
);
assert.equal(
  (await q(
    "select count(*) n from city_launch_signals where launch_id=$1 and kind='claim'",
    [launch],
  ))[0].n,
  1,
);
const publicPayload = JSON.stringify(
  (await q("select city_launch_catalog(null,null,'all','','',0,false) data"))[0]
    .data,
);
assert.ok(!publicPayload.includes("SECRET-FOUNDER"));
assert.ok(!publicPayload.includes(customer));
await q("update city_businesses set status='suspended' where id=$1", [
  business,
]);
assert.equal(
  (await q("select city_launch_catalog(null,null,'all','','',0,false) data"))[0]
    .data.items.length,
  0,
);
console.log("Launches database checks passed");
await db.close();
