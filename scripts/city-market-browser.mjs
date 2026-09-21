// Browser contract test against an in-memory API fixture. No live account, payment or email is created.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const origin = process.env.CITY_TEST_ORIGIN || "http://127.0.0.1:5188";
const userId = "11111111-1111-4111-8111-111111111111",
  businessId = "44444444-4444-4444-8444-444444444444";
const jwt = `${
  Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url")
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

const dealId = "55555555-5555-4555-8555-555555555555";
const terms = {
  title: "Free editor trial",
  description:
    "Try the editor free, with a card required. Cancel before renewal.",
  kind: "trial_access",
  value: 0,
  currency: "GBP",
  minimumSpend: 0,
  maximumDiscount: null,
  destination: "https://example.com",
  startsAt: new Date(Date.now() - 10000).toISOString(),
  endsAt: new Date(Date.now() + 3600000).toISOString(),
  redeemBy: null,
  exclusive: true,
  merchantExpiryConfirmed: false,
  freeConfirmed: true,
  cardRequired: true,
  renewalTerms: "Renews at 10 GBP monthly",
};
const deal = {
  id: dealId,
  business_id: businessId,
  terms,
  status: "approved",
  paused: false,
  ended: false,
  quantity: 10,
  issued: 0,
  version: 1,
};
const item = {
  key: "deal:" + dealId,
  business_id: businessId,
  slug: "campus-studio",
  business_name: "Campus Studio",
  category: "Creators",
  kind: "deal",
  content_id: dealId,
  title: terms.title,
  description: terms.description,
  destination: "/city/deal/" + dealId,
  rank: 1,
  x: 1,
  z: 1,
  created_at: new Date().toISOString(),
  starts_at: terms.startsAt,
  ends_at: terms.endsAt,
  remaining: 10,
  free: true,
  exclusive: true,
  available: true,
  trending: false,
};
const property = {
  id: businessId,
  slug: "campus-studio",
  profile,
  rank: 1,
  x: 1,
  z: 1,
  tier: 1,
  landValue: 10000,
  saves: 0,
  claims: 0,
};

const actions = [],
  errors = [];
const rival = {
  ...property,
  id: "66666666-6666-4666-8666-666666666666",
  slug: "rival-studio",
  profile: { ...profile, name: "Rival Studio" },
  rank: 1,
  x: -1,
  z: -1,
  landValue: 20000,
};
property.rank = 2;
property.x = -1;
property.z = 1;
const event = {
  version: 1,
  revision: 2,
  cause: "purchase",
  initiator: rival.id,
  created_at: new Date(Date.now() - 60000).toISOString(),
  moves: [
    {
      id: rival.id,
      before: {
        id: rival.id,
        slug: rival.slug,
        name: rival.profile.name,
        color: profile.color,
        rank: 2,
        value: 9000,
        x: -1,
        z: 1,
        tier: 0,
      },
      after: {
        id: rival.id,
        slug: rival.slug,
        name: rival.profile.name,
        color: profile.color,
        rank: 1,
        value: 20000,
        x: -1,
        z: -1,
        tier: 1,
      },
    },
    {
      id: businessId,
      before: {
        id: businessId,
        slug: property.slug,
        name: profile.name,
        color: profile.color,
        rank: 1,
        value: 10000,
        x: -1,
        z: -1,
        tier: 1,
      },
      after: {
        id: businessId,
        slug: property.slug,
        name: profile.name,
        color: profile.color,
        rank: 2,
        value: 10000,
        x: -1,
        z: 1,
        tier: 1,
      },
    },
  ],
};
const business = {
  id: businessId,
  slug: property.slug,
  draft: profile,
  published: profile,
  preview: profile,
  status: "approved",
  land_value: 10000,
  draft_version: 1,
  verified_at: new Date().toISOString(),
};
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
    const i = route.request().postDataJSON();
    actions.push(i);
    const reply = (json) => route.fulfill({ json });
    switch (i.action) {
      case "snapshot":
        return reply({
          revision: 2,
          capacity: 400,
          total: 2,
          properties: [rival, property],
          events: [],
          marketEnabled: true,
          exposureEnabled: true,
          onboardingEnabled: true,
          purchasesEnabled: true,
          termsUrl: "https://example.com/terms",
        });
      case "market_public":
        return reply({
          revision: 2,
          top: [rival, property],
          events: i.before && i.before <= 2 ? [] : [event],
        });
      case "market_quote":
        return reply({
          revision: 2,
          quotedAt: new Date().toISOString(),
          businessId,
          amount: i.amount,
          leader: {
            id: rival.id,
            name: rival.profile.name,
            value: rival.landValue,
          },
          currentRank: 2,
          currentValue: 10000,
          newValue: 10000 + i.amount,
          rank: i.amount > 10000 ? 1 : 2,
          currentTier: 1,
          tier: 1,
          from: { x: -1, z: 1 },
          to: { x: -1, z: i.amount > 10000 ? -1 : 1 },
          targets: [{ rank: 1, amount: 10001, available: true }],
          overtaken: i.amount > 10000
            ? [{ name: "Rival Studio", rank: 1 }]
            : [],
        });
      case "market_position":
        return reply({
          metrics: [{ source: "paid_top_spots", kind: "view", count: 4 }],
          place: { rank: 2, land_value: 10000, tier: 1 },
          bestRank: 1,
          history: [
            {
              id: "history",
              from_rank: 1,
              to_rank: 2,
              kind: "move",
              created_at: event.created_at,
            },
          ],
          alerts: [
            {
              id: "77777777-7777-4777-8777-777777777777",
              from_rank: 1,
              to_rank: 2,
              read_at: null,
            },
          ],
          preferences: null,
        });
      case "workspace":
        return reply({
          business,
          orders: [],
          saved: [],
          claims: [],
          analytics: {},
          history: [],
          admin: false,
        });
      default:
        return reply({ ok: true });
    }
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/city");
  await page
    .getByRole("button", { name: "#1 Rival Studio", exact: true })
    .waitFor();
  assert.ok(await page.locator(".city-landing-welcome").count());
  await page.getByRole("button", { name: "About City", exact: true }).click();
  await page.getByRole("dialog", { name: "Welcome to Synarc City" }).waitFor();
  const coveredCount = actions.filter(a => a.action === "market_exposure" && a.kind === "canvas").length;
  await page.waitForTimeout(2500);
  assert.equal(actions.filter(a => a.action === "market_exposure" && a.kind === "canvas").length, coveredCount, "dialog-covered canvas does not record exposure");
  await page.keyboard.press("Escape");
  assert.ok(
    await page.locator(".city-landing-welcome").count(),
    "about/login does not dismiss welcome",
  );
  await page.locator("canvas").waitFor();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: "output/playwright/city-landing-desktop.png" });
  const ticker = page.getByRole("region", { name: "Latest paid market activity" });
  await ticker.waitFor();
  assert.match(await ticker.innerText(), /PAID MARKET/);
  await ticker.locator(".city-market-ticker-headline").click();
  await page.getByRole("dialog", { name: "City market" }).waitFor();
  await page.locator(".city-market-event").first().waitFor();
  await page.keyboard.press("Escape");
  await ticker.getByRole("button", { name: "Replay latest market movement" }).click();
  await page.getByText(/Historical movement replay/).waitFor();
  await page.waitForTimeout(3500);
  await page.getByRole("button", { name: "Top spots & market feed" }).click();
  await page.getByRole("dialog", { name: "City market" }).waitFor();
  await page.getByRole("dialog", { name: "City market" })
    .getByText("Rival Studio took Central Plaza", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Replay movement" }).click();
  await page.getByText(/Historical movement replay/).waitFor();
  await page.waitForTimeout(4000);
  assert.equal(await page.locator(".city-market-replay").count(), 0);
  await mkdir("output/playwright", { recursive: true });
  await page.screenshot({ path: "output/playwright/city-market-desktop.png" });
  await page
    .getByRole("button", { name: "#1 Rival Studio", exact: true })
    .click();
  await page.waitForURL("**/city/business/rival-studio?source=paid_top_spots");
  await page.waitForTimeout(2400);
  assert.ok(
    actions.some(
      (a) =>
        a.action === "track" &&
        a.kind === "view" &&
        a.source === "paid_top_spots",
    ),
  );
  await page.goto(origin + "/city");
  await page.locator(".city-landing-compact").waitFor();
  await page.getByRole("button", { name: "Challenge #1 ↗", exact: true })
    .click();
  await page.waitForURL((url) =>
    url.pathname === "/city/manage" && url.searchParams.get("challenge") === "1"
  );
  await page.getByText("Best recorded position: #1").waitFor();
  await page.getByText("Current leader: Rival Studio · £200 City Value")
    .waitFor();
  await page.getByText("Potentially passing: Rival Studio.").waitFor();
  assert.ok(
    actions.some((a) => a.action === "market_quote" && a.amount === 10001),
  );
  await page.getByRole("button", { name: "Save in-app alerts" }).click();
  await page.getByText("Alert preferences saved.").waitFor();
  await page.getByRole("button", { name: "Mark read" }).click();
  await page.waitForTimeout(250);
  assert.ok(actions.some((a) => a.action === "market_read"));
  await page.screenshot({ path: "output/playwright/city-market-merchant.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + "/city");
  await page.getByRole("button", { name: "Top spots & market feed" }).waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "no horizontal overflow",
  );
  await page.locator("canvas").waitFor();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "output/playwright/city-market-mobile.png" });
  await page.getByRole("button", { name: "Top spots & market feed" }).click();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("dialog[open]").count(), 0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(origin + "/city?market=2");
  await page.getByText(/Historical movement replay/).waitFor();
  assert.ok(
    actions.some((a) => a.action === "market_exposure" && a.kind === "card"),
    "card exposure recorded separately",
  );
  assert.ok(
    actions.some((a) => a.action === "market_exposure" && a.kind === "canvas"),
    "visible building exposure recorded",
  );
  assert.ok(
    !actions.some((a) => a.action === "checkout"),
    "challenge preview never starts payment",
  );
  assert.deepEqual(errors, []);
  console.log(
    "City market browser passed: leader, feed, replay, paid attribution, global quote targets, merchant alerts, mobile, reduced motion event link, runtime.",
  );
} finally {
  await browser.close();
}
