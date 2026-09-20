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

const space = {
  version: 1,
  layout: "courtyard",
  primaryId: "gallery",
  exhibits: [
    {
      id: "gallery",
      title: "Examples",
      kind: "gallery",
      confirmedPair: false,
      items: [
        {
          label: "One",
          image: "",
          description: "A real product",
          sourceUrl: "https://example.com",
        },
      ],
    },
  ],
};
await val("select city_mutate($1,'save',$2)", [
  owner,
  JSON.stringify({
    businessId: businesses[0],
    version: 1,
    profile: { ...profile, campus: space },
    host: "example.com",
  }),
]);
assert.equal(
  Number(await val("select count(*) from city_campus_revisions")),
  1,
);
assert.equal(
  await val("select published ? 'campus' from city_businesses where id=$1", [
    businesses[0],
  ]),
  false,
);
await q(
  "update city_businesses set verified_at=now(),verified_host='example.com' where id=$1",
  [businesses[0]],
);
await val("select city_mutate($1,'submit',$2)", [
  owner,
  JSON.stringify({ businessId: businesses[0], version: 2 }),
]);
await val("select city_mutate($1,'review',$2)", [
  admin,
  JSON.stringify({
    businessId: businesses[0],
    version: 2,
    decision: "approve",
  }),
]);
assert.deepEqual(
  await val("select published->'campus' from city_businesses where id=$1", [
    businesses[0],
  ]),
  space,
);
const input = {
  url: "https://example.com",
  host: "example.com",
  profile: { ...profile, campus: space },
  prompt: "",
};
const start = {
  businessId: businesses[0],
  version: 2,
  kind: "initial",
  requestKey: crypto.randomUUID(),
  input,
  model: "fixture-model",
  pricing: { input: 1, output: 2 },
  reserve: 100,
};
const command = (u, a, d) =>
  val("select city_setup_command($1,$2,$3)", [u, a, JSON.stringify(d)]);
await assert.rejects(command(owner, "start", start), /disabled/);
await q("update city_setup_budget set enabled=true");
await assert.rejects(command(visitor, "start", start), /owner/);
const job = await command(owner, "start", start);
assert.equal((await command(owner, "start", start)).id, job.id);
await assert.rejects(
  command(owner, "start", {
    ...start,
    input: { ...input, prompt: "different" },
  }),
  /Idempotency/,
);
await assert.rejects(
  command(owner, "start", {
    ...start,
    requestKey: crypto.randomUUID(),
    kind: "refine",
  }),
  /active/,
);
const claim = () => val("select city_setup_claim($1)", ["fixture-worker"]);
let lease = await claim();
assert.equal(lease.id, job.id);
assert.equal(await claim(), null);
const checkpoint = (j, a, d = {}) =>
  val("select city_setup_checkpoint($1,$2,$3,$4)", [
    j.id,
    j.lease,
    a,
    JSON.stringify(d),
  ]);
await assert.rejects(
  checkpoint({ ...lease, lease: crypto.randomUUID() }, "checkpoint"),
  /lease/,
);
await checkpoint(lease, "checkpoint", {
  manifest: { pages: [], images: [], warnings: [] },
});
await checkpoint(lease, "submit_provider");
await q(
  "update city_setup_jobs set heartbeat=now()-interval '4 minutes' where id=$1",
  [job.id],
);
assert.equal(await claim(), null);
assert.equal(
  await val("select status from city_setup_jobs where id=$1", [job.id]),
  "uncertain",
);
await assert.rejects(
  command(owner, "retry", { businessId: businesses[0], id: job.id }),
  /cannot/,
);
await command(owner, "cancel", { businessId: businesses[0], id: job.id });
assert.equal(
  Number(
    await val("select reserved_cents from city_setup_jobs where id=$1", [
      job.id,
    ]),
  ),
  100,
);
await assert.rejects(
  val("select city_setup_reconcile($1,$2,$3,$4)", [job.id, "short", 4, ""]),
  /receipt/,
);
await val("select city_setup_reconcile($1,$2,$3,$4)", [
  job.id,
  "provider-receipt-fixture-verified",
  4,
  "{}",
]);
assert.equal(
  Number(
    await val("select reserved_cents from city_setup_jobs where id=$1", [
      job.id,
    ]),
  ),
  4,
);
await assert.rejects(
  val("select city_setup_reconcile($1,$2,$3,$4)", [
    job.id,
    "provider-receipt-fixture-verified",
    4,
    "{}",
  ]),
  /No uncertain/,
);
const refine = { ...start, kind: "refine", requestKey: crypto.randomUUID() };
await q("update city_setup_budget set cap_cents=103");
await assert.rejects(command(owner, "start", refine), /budget exhausted/);
await q("update city_setup_budget set cap_cents=2000");
await assert.rejects(
  command(owner, "start", { ...refine, reserve: 101 }),
  /Invalid setup pricing/,
);
const next = await command(owner, "start", refine);
lease = await claim();
await checkpoint(lease, "submit_provider");
await checkpoint(lease, "provider_result", {
  cost: 7,
  responseId: "fixture-response",
  text: "{}",
});
await checkpoint(lease, "checkpoint", {
  candidate: {
    profile: { ...profile, campus: space },
    summary: "One exhibit",
    missing: [],
  },
});
await checkpoint(lease, "finish", { status: "ready" });
assert.equal(
  Number(
    await val("select reserved_cents from city_setup_jobs where id=$1", [
      next.id,
    ]),
  ),
  7,
);
await assert.rejects(
  command(owner, "apply", {
    businessId: businesses[0],
    id: next.id,
    version: 1,
  }),
  /stale/,
);
await command(owner, "apply", {
  businessId: businesses[0],
  id: next.id,
  version: 2,
});
assert.equal(
  Number(
    await val("select draft_version from city_businesses where id=$1", [
      businesses[0],
    ]),
  ),
  3,
);
await assert.rejects(
  command(owner, "apply", {
    businessId: businesses[0],
    id: next.id,
    version: 2,
  }),
  /stale/,
);
const third = await command(owner, "start", {
  ...refine,
  requestKey: crypto.randomUUID(),
  version: 3,
});
lease = await claim();
await checkpoint(lease, "checkpoint", {
  plan: { saved: true },
  manifest: {
    images: [{ url: "https://example.com/image.png", failed: true }],
    pages: [],
    warnings: [],
  },
});
await checkpoint(lease, "finish", { status: "ready" });
await command(owner, "retry", { businessId: businesses[0], id: third.id });
assert.equal(
  (await val("select manifest from city_setup_jobs where id=$1", [third.id]))
    .images[0].failed,
  undefined,
);
lease = await claim();
await checkpoint(lease, "finish", { status: "failed" });
await command(owner, "cancel", { businessId: businesses[0], id: third.id });
await assert.rejects(
  command(owner, "start", {
    ...refine,
    requestKey: crypto.randomUUID(),
    version: 3,
  }),
  /allowance/,
);
assert.equal(Number(await val("select count(*) from city_listings")), 0);
assert.equal(Number(await val("select count(*) from city_ledger")), 0);
for (const role of ["anon", "authenticated"]) {
  await db.exec(`set role ${role}`);
  for (const table of [
    "city_campus_revisions",
    "city_setup_jobs",
    "city_setup_budget",
    "city_campus_metrics",
  ])
    await assert.rejects(q(`select * from ${table}`), /permission denied/);
  await assert.rejects(claim(), /permission denied/);
  await db.exec("reset role");
}
console.log(
  "Campus database checks passed: atomic review, owner/RLS fences, idempotency, global lease, uncertain submission, held budget, retry, allowance, stale apply and no financial allocation.",
);
await db.close();
