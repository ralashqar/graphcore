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
let d = await mutate(owner, "save", { businessId: businesses[0], terms });
await assert.rejects(
  mutate(visitor, "save", { businessId: businesses[0], terms }),
  /owner/i,
);
await assert.rejects(
  mutate(owner, "submit", { id: d.id, version: d.version }),
  /Upload codes/,
);
await assert.rejects(
  mutate(owner, "import", { id: d.id, codes: ["X"] }),
  /Stale/,
);
d = await mutate(owner, "import", {
  id: d.id,
  version: d.version,
  codes: ["CODE-A", "CODE-B"],
});
await assert.rejects(
  mutate(owner, "import", {
    id: d.id,
    version: d.version,
    codes: ["CODE-C", "CODE-A"],
  }),
  /unique/,
);
assert.equal(
  await val("select count(*)::int from city_deal_codes"),
  2,
  "Duplicate batch rolled back completely",
);
await assert.rejects(mutate(visitor, "claim", { id: d.id }), /not available/);
d = await mutate(owner, "submit", { id: d.id, version: d.version });
await assert.rejects(
  mutate(owner, "review", {
    id: d.id,
    version: d.version,
    decision: "approved",
    note: "Self approval",
  }),
  /Operator/,
);
await assert.rejects(
  mutate(admin, "review", {
    id: d.id,
    version: d.version - 1,
    decision: "approved",
    note: "Old version",
  }),
  /Stale/,
);
d = await mutate(admin, "review", {
  id: d.id,
  version: d.version,
  decision: "approved",
  note: "Terms checked",
});
const first = await mutate(visitor, "claim", { id: d.id });
const repeated = await Promise.all(
  Array.from({ length: 8 }, () => mutate(visitor, "claim", { id: d.id })),
);
assert.ok(repeated.every((c) => c.id === first.id && c.code === first.code));
assert.equal(await val("select issued from city_deals where id=$1", [d.id]), 1);
await assert.rejects(
  mutate(owner, "save", {
    id: d.id,
    version: d.version,
    terms: { ...terms, title: "Changed" },
  }),
  /frozen/,
);
const users = [crypto.randomUUID(), crypto.randomUUID()];
for (const id of users) await q("insert into auth.users values($1)", [id]);
const race = await Promise.allSettled(
  users.map((u) => mutate(u, "claim", { id: d.id })),
);
assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
assert.equal(
  await val("select count(distinct code_id)::int from city_deal_claims"),
  2,
);
assert.equal(await val("select issued from city_deals where id=$1", [d.id]), 2);
assert.equal(
  (await mutate(visitor, "claim", { id: d.id })).id,
  first.id,
  "Retry survives sold out",
);
await assert.rejects(
  mutate(users[0], "report", { id: d.id, claimId: first.id }),
  /Owner/,
);
await mutate(owner, "report", {
  id: d.id,
  claimId: first.id,
  orderId: "ORDER-1",
});
await mutate(owner, "report", {
  id: d.id,
  claimId: first.id,
  orderId: "ORDER-1",
});
assert.equal(
  await val("select count(*)::int from city_deal_audit where action='report'"),
  1,
);
await assert.rejects(
  mutate(owner, "correct", { id: d.id, claimId: first.id, note: "" }),
  /reason/,
);
await mutate(owner, "correct", {
  id: d.id,
  claimId: first.id,
  note: "Wrong customer reference",
});
assert.equal(
  await val("select redeemed_at from city_deal_claims where id=$1", [first.id]),
  null,
);
assert.equal(
  await val("select count(*)::int from city_deal_codes where assigned"),
  2,
  "Corrections do not release codes",
);
d = await mutate(owner, "import", {
  id: d.id,
  version: d.version,
  codes: ["CODE-C"],
});
d = await mutate(owner, "pause", {
  id: d.id,
  version: d.version,
  paused: true,
});
await assert.rejects(mutate(admin, "claim", { id: d.id }), /not available/);
assert.equal((await mutate(visitor, "claim", { id: d.id })).code, first.code);
d = await mutate(owner, "pause", {
  id: d.id,
  version: d.version,
  paused: false,
});
await q("update city_businesses set status='suspended' where id=$1", [
  businesses[0],
]);
await assert.rejects(mutate(admin, "claim", { id: d.id }), /not available/);
await q("update city_businesses set status='approved' where id=$1", [
  businesses[0],
]);
d = await mutate(owner, "end", { id: d.id, version: d.version });
await assert.rejects(mutate(admin, "claim", { id: d.id }), /not available/);
for (
  const [name, updates] of [["future", {
    startsAt: new Date(Date.now() + 100000).toISOString(),
  }], ["expired", {
    startsAt: new Date(Date.now() - 200000).toISOString(),
    endsAt: new Date(Date.now() - 100000).toISOString(),
  }]]
) {
  let e = await mutate(owner, "save", {
    businessId: businesses[0],
    terms: { ...terms, ...updates },
  });
  e = await mutate(owner, "import", {
    id: e.id,
    version: e.version,
    codes: [name],
  });
  e = await mutate(owner, "submit", { id: e.id, version: e.version });
  e = await mutate(admin, "review", {
    id: e.id,
    version: e.version,
    decision: "approved",
    note: "Schedule checked",
  });
  await assert.rejects(mutate(admin, "claim", { id: e.id }), /not available/);
}
for (
  const table of [
    "city_deals",
    "city_deal_codes",
    "city_deal_claims",
    "city_deal_audit",
    "city_deal_metrics",
  ]
) {
  assert.equal(
    await val("select relrowsecurity from pg_class where oid=$1::regclass", [
      table,
    ]),
    true,
  );
  for (const role of ["anon", "authenticated"]) {
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      assert.equal(
        await val("select has_table_privilege($1,$2,$3)", [
          role,
          table,
          privilege,
        ]),
        false,
      );
    }
  }
}
for (const role of ["anon", "authenticated"]) {
  assert.equal(
    await val(
      "select has_function_privilege($1,'city_deal_mutate(uuid,text,jsonb)','EXECUTE')",
      [role],
    ),
    false,
  );
}
await db.exec("set role authenticated");
await assert.rejects(q("select * from city_deal_codes"), /permission denied/);
await db.exec("reset role");
assert.equal(
  await val("select quantity-issued from city_deals where id=$1", [d.id]),
  1,
);
console.log(
  "City Deals: allocation, idempotency, final inventory, review fencing, authorization, schedules, suspension, audit and private grants passed. PGlite serializes connections; hosted concurrent-session acceptance remains separate.",
);
await db.close();
