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
  val("select city_deal_mutate($1,$2,$3)", [u, a, JSON.stringify(d)]);
const terms = {
  title: "Creator tools trial",
  description: "One trial per account, merchant terms apply.",
  image: "",
  kind: "trial_access",
  value: 0,
  currency: "GBP",
  minimumSpend: 0,
  maximumDiscount: null,
  destination: "https://example.com",
  startsAt: new Date(Date.now() - 60000).toISOString(),
  endsAt: new Date(Date.now() + 86400000).toISOString(),
  redeemBy: null,
  exclusive: true,
  merchantExpiryConfirmed: false,
};

const checkout = (u, a, p) =>
  val("select city_deal_checkout_command($1,$2,$3)", [u, a, JSON.stringify(p)]);
let d = await mutate(owner, "save", { businessId: businesses[0], terms });
let d2 = await mutate(owner, "save", { businessId: businesses[0], terms });
d = await mutate(owner, "import", {
  id: d.id,
  version: d.version,
  codes: ["CUSTOMER-1", "CUSTOMER-2"],
});
await assert.rejects(
  checkout(visitor, "register", {
    id: d.id,
    version: d.version,
    code: "TEST-1",
  }),
  /Owner/,
);
await assert.rejects(
  checkout(owner, "register", { id: d.id, version: 1, code: "TEST-1" }),
  /Stale/,
);
await assert.rejects(
  checkout(owner, "register", {
    id: d.id,
    version: d.version,
    code: "CUSTOMER-1",
  }),
  /Customer inventory/,
);
await assert.rejects(
  checkout(owner, "register", {
    id: d2.id,
    version: d2.version,
    code: "CUSTOMER-1",
  }),
  /Customer inventory/,
);
let t = await checkout(owner, "register", {
  id: d.id,
  version: d.version,
  code: "TEST-1",
});
assert.equal(
  (await checkout(owner, "register", {
    id: d.id,
    version: d.version,
    code: "TEST-1",
  })).id,
  t.id,
);
assert.equal(
  await val("select quantity from city_deals where id=$1", [d.id]),
  2,
);
await assert.rejects(
  mutate(owner, "import", {
    id: d2.id,
    version: d2.version,
    codes: ["TEST-1"],
  }),
  /test codes/,
);
await assert.rejects(
  checkout(owner, "report", {
    id: d.id,
    version: d.version,
    testId: t.id,
    outcome: "passed",
    confirmed: false,
    note: "Checked discount and use count",
  }),
  /Confirm/,
);
await assert.rejects(
  checkout(owner, "report", {
    id: d2.id,
    version: d2.version,
    testId: t.id,
    outcome: "passed",
    confirmed: true,
    note: "Checked discount and use count",
  }),
  /match/,
);
await checkout(owner, "report", {
  id: d.id,
  version: d.version,
  testId: t.id,
  outcome: "passed",
  confirmed: true,
  note: "Checked discount, eligibility and single use",
});
let summary =
  (await q("select * from city_deal_launch_summary(array[$1]::uuid[])", [
    d.id,
  ]))[0];
assert.equal(summary.checkout.current, true);
assert.equal(summary.checkout.outcome, "passed");
assert.equal(JSON.stringify(summary).includes("TEST-1"), false);
d = await mutate(owner, "save", {
  id: d.id,
  version: d.version,
  terms: { ...terms, title: "Changed trial" },
});
summary =
  (await q("select * from city_deal_launch_summary(array[$1]::uuid[])", [
    d.id,
  ]))[0];
assert.equal(summary.checkout.current, false);
await assert.rejects(
  checkout(owner, "report", {
    id: d.id,
    version: d.version,
    testId: t.id,
    outcome: "passed",
    confirmed: true,
    note: "Old test result must not pass",
  }),
  /match/,
);
await assert.rejects(
  checkout(owner, "register", { id: d.id, version: d.version, code: "TEST-1" }),
  /fresh/,
);
assert.equal(await val("select count(*)::int from city_deal_claims"), 0);
assert.equal(await val("select count(*)::int from city_deal_metrics"), 0);
assert.equal(
  await val("select count(*)::int from city_deal_exhibit_metrics"),
  0,
);
const campus = {
  version: 1,
  layout: "courtyard",
  primaryId: "compare",
  exhibits: [{
    id: "compare",
    title: "See the difference",
    kind: "comparison",
    dealId: d.id,
    confirmedPair: true,
    items: [],
  }],
};
await q(
  "update city_businesses set published=published||jsonb_build_object('campus',$2::jsonb) where id=$1",
  [businesses[0], JSON.stringify(campus)],
);
d = await mutate(owner, "submit", { id: d.id, version: d.version });
d = await mutate(admin, "review", {
  id: d.id,
  version: d.version,
  decision: "approved",
  note: "Reviewed",
});
await assert.rejects(
  mutate(visitor, "claim", { id: d.id, sourceExhibitId: "invented" }),
  /no longer links/,
);
await assert.rejects(
  mutate(visitor, "claim", { id: d.id, sourceExhibitId: "welcome" }),
  /no longer links/,
);
const c = await mutate(visitor, "claim", {
  id: d.id,
  sourceExhibitId: "compare",
});
assert.equal(c.source_exhibit_id, "compare");
assert.equal(c.source_exhibit_title, "See the difference");
assert.equal(
  (await mutate(visitor, "claim", { id: d.id })).source_exhibit_id,
  "compare",
);
await mutate(owner, "report", {
  id: d.id,
  claimId: c.id,
  orderId: "TEST-ORDER",
});
const stats =
  (await q("select * from city_deal_exhibit_stats(array[$1]::uuid[])", [d.id]))[
    0
  ];
assert.equal(Number(stats.claims), 1);
assert.equal(Number(stats.reported), 1);
await q("update city_businesses set published=published-'campus' where id=$1", [
  businesses[0],
]);
assert.equal(
  (await q("select * from city_deal_exhibit_stats(array[$1]::uuid[])", [d.id]))[
    0
  ].title,
  "See the difference",
);
for (const table of ["city_deal_checkout_tests", "city_deal_exhibit_metrics"]) {
  assert.equal(
    await val("select relrowsecurity from pg_class where oid=$1::regclass", [
      table,
    ]),
    true,
  );
  for (const role of ["anon", "authenticated"]) {
    assert.equal(
      await val("select has_table_privilege($1,$2,'SELECT')", [role, table]),
      false,
    );
  }
}
for (
  const f of [
    "city_deal_checkout_command(uuid,text,jsonb)",
    "city_deal_launch_summary(uuid[])",
    "city_deal_exhibit_stats(uuid[])",
  ]
) {
  for (const role of ["anon", "authenticated"]) {
    assert.equal(
      await val("select has_function_privilege($1,$2,'EXECUTE')", [role, f]),
      false,
    );
  }
}
console.log(
  "Launch database checks passed: isolated test codes across campaigns, unchanged customer inventory/metrics, owner/version fences, stale evidence, private summaries and immutable exhibit attribution.",
);
await db.close();
