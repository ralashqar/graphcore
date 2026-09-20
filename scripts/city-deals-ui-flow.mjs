// Browser contract test against an in-memory API fixture. No live account, payment or email is created.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const origin = process.env.CITY_TEST_ORIGIN || "http://127.0.0.1:5188";
const userId = "11111111-1111-4111-8111-111111111111",
  businessId = "44444444-4444-4444-8444-444444444444";
const jwt = `${
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  )
}.${
  Buffer.from(
    JSON.stringify({
      sub: userId,
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url")
}.fixture`;
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

let deals = [], claims = [];
const actions = [], errors = [];
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
  await context.route(
    "**/auth/v1/**",
    (r) =>
      r.fulfill({ json: r.request().url().includes("/user") ? user : session }),
  );
  await context.route("**/functions/v1/city-*", async (route) => {
    const i = route.request().postDataJSON(),
      reply = (json) => route.fulfill({ json });
    if (route.request().url().endsWith("city-api")) {
      if (i.action === "workspace") {
        return reply({
          business,
          orders: [],
          saved: [],
          claims: [],
          analytics: {},
          history: [],
          admin: true,
        });
      }
      if (i.action === "campus_workspace") return reply({jobs:[],metrics:{},setupEnabled:false});
      if (i.action === "admin") {
        return reply({ businesses: [], orders: [], reports: [] });
      }
      if (i.action === "deal_workspace") {
        return reply({
          enabled: true,
          deals: i.admin ? deals.filter((d) => d.status === "pending") : deals,
        });
      }
      if (i.action === "deal_catalog") {
        return reply({
          enabled: true,
          deals: deals.filter((d) => d.status === "approved"),
        });
      }
      if (i.action === "deal_wallet") {
        return reply({ enabled: true, claims, hasMore: false });
      }
      if (i.action === "deal_claims") return reply({ claims, hasMore: false });
      if (i.action === "campus_public") {
        return reply({
          businessId,
          profile: {
            ...profile,
            campus: {
              version: 1,
              layout: "courtyard",
              primaryId: "deals",
              exhibits: [{
                id: "deals",
                title: "Creator rewards",
                kind: "offer",
                confirmedPair: false,
                items: [],
                dealId: deals[0]?.id,
              }],
            },
          },
          launches: [],
        });
      }
      return reply({
        revision: 1,
        capacity: 400,
        total: 0,
        properties: [],
        events: [],
        campusEnabled: true,
        dealsEnabled: true,
        onboardingEnabled: true,
        purchasesEnabled: false,
      });
    }
    actions.push(i.action);
    let d = deals.find((d) => d.id === i.id);
    if (i.action === "deal_save") {
      d = {
        id: crypto.randomUUID(),
        business_id: businessId,
        terms: i.terms,
        status: "draft",
        paused: false,
        ended: false,
        version: 2,
        quantity: 0,
        issued: 0,
        opens: 0,
        clicks: 0,
        reported: 0,
        review_note: "",
      };
      deals.push(d);
      return reply(d);
    }
    if (i.action === "deal_import") {
      d.quantity += i.codes.length;
      d.version++;
      return reply(d);
    }
    if (i.action === "deal_submit") {
      d.status = "pending";
      d.version++;
      return reply(d);
    }
    if (i.action === "deal_review") {
      d.status = i.decision;
      d.version++;
      return reply(d);
    }
    if (i.action === "deal_claim") {
      let c = claims.find((c) => c.deal_id === d.id);
      if (!c) {
        c = {
          id: crypto.randomUUID(),
          deal_id: d.id,
          terms: d.terms,
          code: "TEST-CREATOR-001",
          business_name: profile.name,
          created_at: new Date().toISOString(),
          redeemed_at: null,
          cancelled: false,
        };
        claims.push(c);
        d.issued++;
      }
      return reply(c);
    }
    if (i.action === "deal_report") {
      claims.find((c) => c.id === i.claimId).redeemed_at = new Date()
        .toISOString();
      d.reported = 1;
      return reply(d);
    }
    if (i.action === "deal_correct") {
      claims.find((c) => c.id === i.claimId).redeemed_at = null;
      d.reported = 0;
      return reply(d);
    }
    if (i.action === "deal_pause") {
      d.paused = i.paused;
      d.version++;
      return reply(d);
    }
    return reply({ ok: true });
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => {errors.push(e.message);console.error("Browser runtime:",e.message);});
  await page.goto(`${origin}/city/manage`);
  await page.getByRole("button", { name: "Create deal", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill(
    "Creator launch discount",
  );
  await page.getByLabel("Reward terms and eligibility").fill(
    "20% off your first subscription. One code per customer.",
  );
  await page.getByLabel("Merchant destination").fill(
    "https://example.com/store",
  );
  await page.getByLabel("Claims start (local time)").fill("2026-01-01T10:00");
  await page.getByLabel("Claims end (local time)").fill("2027-01-01T10:00");
  await page.getByLabel("I confirm this reward is exclusive to City claims")
    .check();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByText("Draft saved. Upload codes", { exact: false }).waitFor();
  await page.getByLabel("Unique codes", { exact: false }).fill(
    "TEST-CREATOR-001\nTEST-CREATOR-002",
  );
  await page.getByRole("button", { name: "Import codes into this deal" })
    .click();
  await page.getByText("2 codes imported.").waitFor();
  await page.getByRole("button", { name: "Submit for review", exact: true })
    .last().click();
  await page.goto(`${origin}/city/admin`);
  await page.getByLabel("Review note", { exact: true }).fill(
    "Checked merchant terms and single-use inventory.",
  );
  await page.getByRole("button", { name: "Approve deal", exact: true }).click();
  await page.getByText("Creator launch discount", { exact: true }).waitFor({
    state: "hidden",
  });
  await page.goto(`${origin}/city/business/campus-studio/space/deals`);
  await page.getByRole("button", { name: "View terms and claim" }).click();
  await page.getByRole("button", { name: "Claim unique code", exact: true })
    .click();
  await page.getByText("TEST-CREATOR-001", { exact: true }).waitFor();
  assert.equal(deals[0].issued, 1);
  await page.getByRole("button", { name: "Claim unique code", exact: true })
    .click();
  assert.equal(deals[0].issued, 1);
  await page.screenshot({
    path: "output/playwright/city-deals-claimed.png",
    fullPage: true,
  });
  await page.goto(`${origin}/city/account`);
  await page.getByText("TEST-CREATOR-001", { exact: true }).waitFor();
  await page.reload();
  await page.getByText("TEST-CREATOR-001", { exact: true }).waitFor();
  await page.goto(`${origin}/city/manage`);
  await page.getByRole("button", { name: "Issued claim references" }).click();
  await page.getByLabel("Order reference (optional)").fill("ORDER-TEST");
  await page.getByRole("button", { name: "Report redeemed", exact: true })
    .click();
  await page.getByRole("button", { name: "Correct report (reason required)" })
    .waitFor();
  await page.goto(`${origin}/city/account`);
  await page.getByText("Redemption reported by the merchant", { exact: false })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(() =>
      document.documentElement.scrollWidth <= innerWidth + 1
    ),
    "Wallet fits mobile viewport",
  );
  await page.screenshot({
    path: "output/playwright/city-deals-mobile-wallet.png",
    fullPage: true,
  });
  // A new signed-out context proves the claim action opens authentication instead of issuing.
  const guest = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await guest.routeWebSocket("**/realtime/**", () => {});
  await guest.route("**/functions/v1/city-*", (r) => {
    const i = r.request().postDataJSON();
    return r.fulfill({
      json: i.action === "campus_public"
        ? { businessId, profile, launches: [] }
        : i.action === "deal_catalog"
        ? { enabled: true, deals }
        : {
          revision: 1,
          capacity: 400,
          total: 0,
          properties: [],
          events: [],
          campusEnabled: true,
          dealsEnabled: true,
        },
    });
  });
  const gp = await guest.newPage();
  await gp.goto(`${origin}/city/business/campus-studio/space`);
  await gp.getByRole("button", { name: "View terms and claim" }).click();
  await gp.getByRole("button", { name: "Sign in to claim", exact: true })
    .click();
  await gp.getByRole("dialog", { name: "Welcome back." }).waitFor();
  assert.equal(deals[0].issued, 1);
  await gp.getByRole("button", { name: "Close dialog" }).click();
  await gp.reload();
  await gp.getByRole("button", { name: "Sign in to claim", exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  assert.ok(
    [
      "deal_save",
      "deal_import",
      "deal_submit",
      "deal_review",
      "deal_claim",
      "deal_report",
    ].every((a) => actions.includes(a)),
  );
  console.log(
    "City Deals browser fixture passed: merchant create/import/review, campus claim and retry, wallet reload, reporting, mobile layout and guest sign-in return. No real coupon or checkout was used.",
  );
} finally {
  await browser.close();
}
