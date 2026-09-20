// Browser contract test against an in-memory API fixture. No live account, payment or email is created.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const origin = process.env.CITY_TEST_ORIGIN || "http://127.0.0.1:5188";
const userId = "11111111-1111-4111-8111-111111111111",
  businessId = "44444444-4444-4444-8444-444444444444";
const jwt = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: userId, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.fixture`;
const user = {
  id: userId,
  aud: "authenticated",
  role: "authenticated",
  email: "fixture@example.com",
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
};
const session = {
  access_token: jwt,
  refresh_token: "fixture-refresh",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user,
};
const profile = {
  name: "Campus Studio",
  website: "https://example.com/",
  tagline: "Try the possibilities",
  description: "Tools for creators",
  category: "Creators",
  color: "#547364",
  logo: "",
  hero: "",
  video: "",
  offer: { title: "", description: "", code: "", expiresAt: null, url: "" },
};
let business = {
  id: businessId,
  slug: "campus-studio",
  draft: profile,
  preview: profile,
  published: profile,
  draft_version: 1,
  submitted_version: null,
  status: "approved",
  verified_at: new Date().toISOString(),
  verification_token: "fixture",
  review_note: null,
  land_value: 0,
};
let jobs = [];
const actions = [],
  errors = [];
const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=d3d11"],
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.routeWebSocket("**/realtime/**", () => {});
  await context.addInitScript(
    (value) =>
      localStorage.setItem(
        "sb-znwdatidqdkzidempvkt-auth-token",
        JSON.stringify(value),
      ),
    session,
  );
  await context.route("**/auth/v1/**", (route) =>
    route.fulfill({
      json: route.request().url().includes("/user") ? user : session,
    }),
  );

  await context.route("**/functions/v1/city-*", async (route) => {
    const input = route.request().postDataJSON();
    const reply = (value) => route.fulfill({ json: value });
    if (route.request().url().endsWith("city-api")) {
      if (input.action === "workspace")
        return reply({
          business,
          orders: [],
          saved: [],
          claims: [],
          analytics: {},
          history: [],
          admin: true,
        });
      if (input.action === "campus_workspace")
        return reply({ jobs, metrics: {}, setupEnabled: true });
      if (input.action === "admin")
        return reply({ businesses: [business], orders: [], reports: [] });
      return reply({
        revision: 1,
        capacity: 400,
        total: 0,
        properties: [],
        events: [],
        campusEnabled: true,
        setupEnabled: true,
        onboardingEnabled: true,
        purchasesEnabled: false,
      });
    }
    actions.push(input.action);
    if (input.action === "campus_save") {
      business = {
        ...business,
        draft: { ...business.draft, campus: input.campus },
        draft_version: business.draft_version + 1,
      };
      business.preview = business.draft;
      return reply(business);
    }
    if (input.action === "campus_start") {
      jobs = [
        {
          id: "fixture-job",
          kind: "initial",
          status: "ready",
          stage: "ready",
          base_version: business.draft_version,
          created_at: new Date().toISOString(),
          candidate: {
            profile: {
              ...business.draft,
              campus: { ...business.draft.campus, layout: "avenue" },
            },
            summary: "Change to an avenue layout while retaining exhibits",
            missing: [],
          },
          manifest: {
            pages: [{ url: "https://example.com", text: "Evidence" }],
            images: [],
            warnings: [],
          },
        },
      ];
      return reply({ id: "fixture-job", status: "queued" });
    }
    if (input.action === "campus_apply") {
      assert.equal(input.version, business.draft_version);
      business = {
        ...business,
        draft: jobs[0].candidate.profile,
        draft_version: business.draft_version + 1,
      };
      business.preview = business.draft;
      jobs[0].status = "applied";
      return reply({ id: "fixture-job", status: "applied" });
    }
    if (input.action === "submit") {
      business.status = "pending";
      business.submitted_version = business.draft_version;
      return reply(business);
    }
    if (input.action === "review") {
      assert.equal(input.version, business.draft_version);
      business.published = business.draft;
      business.status = "approved";
      return reply(business);
    }
    return reply({ ok: true });
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${origin}/city/manage`);
  await page
    .getByRole("heading", { name: "One address. More to discover." })
    .waitFor();
  await page.getByRole("button", { name: "Add exhibit", exact: true }).click();
  await page
    .getByLabel("Exhibit title", { exact: true })
    .fill("Try the template collection");
  await page.getByLabel("Item 1 label").fill("Editorial");
  await page
    .getByLabel("Explanation", { exact: true })
    .fill("A real supplied example");
  await page.getByRole("button", { name: "Use as primary exhibit" }).click();
  await page.getByRole("button", { name: "Save campus draft" }).click();
  await page.getByText("Campus draft saved.", { exact: false }).waitFor();
  assert.equal(business.draft.campus.exhibits.length, 3);
  await page
    .getByRole("button", { name: "Build my space from my website" })
    .click();
  await page
    .getByText("Change to an avenue layout while retaining exhibits")
    .waitFor();
  await page
    .getByRole("button", { name: "Apply reviewed candidate to draft" })
    .click();
  await page
    .getByText("Candidate applied to draft.", { exact: false })
    .waitFor();
  assert.equal(business.draft.campus.layout, "avenue");
  await page.getByRole("button", { name: /Submit for review/ }).click();
  await page.goto(`${origin}/city/admin`);
  await page.getByText("Review submitted campus", { exact: false }).waitFor();
  await page
    .getByLabel("Decision reason")
    .fill("Reviewed the exact campus revision and website evidence.");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  assert.equal(business.published.campus.exhibits.length, 3);
  assert.deepEqual(errors, []);
  assert.ok(
    ["campus_save", "campus_start", "campus_apply", "submit", "review"].every(
      (a) => actions.includes(a),
    ),
  );
  await page.screenshot({
    path: "output/playwright/city-campus-editor-flow.png",
    fullPage: true,
  });
  console.log(
    "Campus authenticated UI fixture passed: manual edit → save → URL candidate → apply → submit → review.",
  );
} finally {
  await browser.close();
}
