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
const val = async (sql, args = []) => Object.values((await q(sql, args))[0])[0];
const admin = crypto.randomUUID(),
  owner = crypto.randomUUID(),
  visitor = crypto.randomUUID();
for (const id of [admin, owner, visitor]) {
  await q("insert into auth.users values($1)", [id]);
}
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

const bid = await val(
  "insert into city_businesses(owner_id,slug,draft,published,status) values($1,'free-creator',$2,$2,'approved') returning id",
  [
    owner,
    JSON.stringify({
      ...profile,
      category: "Creators",
      campus: {
        exhibits: [{
          id: "demo",
          title: "Video editor demo",
          items: [{ description: "Try a timeline" }],
        }],
      },
    }),
  ],
);
const terms = {
  title: "Free creative trial",
  description: "One month free, card required, renews at 10 GBP.",
  kind: "trial_access",
  minimumSpend: 0,
  freeConfirmed: true,
  cardRequired: true,
  renewalTerms: "Cancel before renewal",
  startsAt: new Date(Date.now() - 1000).toISOString(),
  endsAt: new Date(Date.now() + 3600000).toISOString(),
  exclusive: true,
};
const deal = await val(
  "insert into city_deals(business_id,terms,status,quantity) values($1,$2,'approved',10) returning id",
  [bid, JSON.stringify(terms)],
);
const search = (query = "", filter = "all", deals = true, campus = true) =>
  val("select city_customer_search($1,$2,'',0,$3,$4)", [
    query,
    filter,
    deals,
    campus,
  ]);
let result = await search();
assert.equal(result.items.length, 3);
assert.ok(result.items.every((x) => x.rank === null));
assert.equal((await search("timeline")).items[0].kind, "exhibit");
assert.equal((await search("", "free")).items[0].content_id, deal);
assert.equal((await search("", "ending")).items.length, 1);
assert.equal((await search("", "all", false, false)).items.length, 1);
assert.ok(!JSON.stringify(result).includes("code_id"));
await q("select city_customer_record($1,$2,'property_open')", [
  bid,
  "u:" + owner,
]);
assert.equal(await val("select count(*)::int from city_customer_activity"), 0);
for (let i = 0; i < 5; i++) {
  await q("select city_customer_record($1,$2,'property_open')", [
    bid,
    "n:visitor" + i,
  ]);
}
await q("select city_customer_record($1,'n:visitor1','property_open')", [bid]);
assert.equal(await val("select count(*)::int from city_customer_activity"), 5);
assert.ok((await search("", "hot")).items.every((x) => x.trending));
await q(
  "update city_customer_activity set created_at=now()-interval '49 hours'",
);
assert.ok((await search("", "hot")).items.every((x) => !x.trending));
await q("select city_customer_save_deal($1,$2,true)", [visitor, deal]);
await q("select city_customer_save_deal($1,$2,true)", [visitor, deal]);
assert.equal(await val("select count(*)::int from city_saved_deals"), 1);
assert.equal(
  await val(
    "select count(*)::int from city_customer_activity where kind='save'",
  ),
  1,
);
assert.equal(await val("select issued from city_deals where id=$1", [deal]), 0);
await q("update city_deals set paused=true where id=$1", [deal]);
assert.equal((await search("", "free")).items.length, 0);
assert.equal(
  await val(
    "select count(*)::int from city_customer_content where kind='deal'",
  ),
  1,
);
const merged=await val('select city_customer_merge($1,$2,true)',[visitor,JSON.stringify([{kind:'business',id:bid},{kind:'deal',id:deal},{kind:'deal',id:deal}])]);
assert.ok(merged.includes(bid));assert.equal(await val('select count(*)::int from city_saved_deals'),1);
assert.equal(await val('select count(*)::int from city_saves where user_id=$1',[visitor]),1);
assert.equal(await val('select issued from city_deals where id=$1',[deal]),0);
const launch=await val("insert into city_discovery_entries(kind,slug,business_id,draft,published,status) values('launch','new-editor',$1,$2,$2,'published') returning id",[bid,JSON.stringify({title:'New editor',description:'Upcoming launch',startsAt:new Date(Date.now()+60000).toISOString(),endsAt:new Date(Date.now()+7200000).toISOString()})]);
await val('select city_customer_merge($1,$2,true)',[visitor,JSON.stringify([{kind:'launch',id:launch}])]);
assert.equal(await val('select count(*)::int from city_saved_launches where user_id=$1',[visitor]),1);
assert.equal((await search('new editor')).items[0].kind,'launch');
await q("update city_businesses set status='suspended' where id=$1", [bid]);
assert.equal((await search()).items.length, 0);
assert.ok(await val("select revision>0 from city_customer_revision"));
await db.exec("set role anon");
await assert.rejects(
  q("select * from city_customer_activity"),
  /permission denied/,
);
await assert.rejects(
  q("select * from city_customer_content"),
  /permission denied/,
);
await assert.rejects(q("select * from city_saved_deals"), /permission denied/);
await assert.rejects(q("select city_customer_search()"), /permission denied/);
assert.equal((await q("select * from city_customer_revision")).length, 1);
await db.close();
console.log(
  "Customer search, availability, deduplication, organic ranking, saves and private access checks passed.",
);
