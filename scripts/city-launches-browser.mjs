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
let interested = false;
const actions = [], errors = [];
let claims = [], saved = [], reminders = [], followed = [], read = false;
const launchId = "66666666-6666-4666-8666-666666666666";
const launchItem = {
  ...item,
  key: "launch:" + launchId,
  kind: "launch",
  content_id: launchId,
  title: "Creator launch",
  destination: "/city/launches/creator-launch",
  remaining: null,
  free: false,
  exclusive: false,
};
const stress = process.env.CITY_LAUNCH_STRESS === "1";
const properties = stress
  ? Array.from(
    { length: 400 },
    (_, i) =>
      i === 0 ? property : {
        ...property,
        id: crypto.randomUUID(),
        slug: "fixture-" + i,
        rank: i + 1,
        x: (i % 20) - 10 + (i % 20 >= 10 ? 1 : 0),
        z: Math.floor(i / 20) - 10 + (Math.floor(i / 20) >= 10 ? 1 : 0),
      },
  )
  : [property];
const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=d3d11"],
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.routeWebSocket("**/realtime/**", () => {});
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
      case "launch_catalog":
      case "launch_detail":
      case "launch_plaza":
        return reply({
          items: Array.from({
            length: stress && i.action === "launch_plaza" ? 12 : 1,
          }, (_, n) => ({
            id: n === 0 ? launchId : "fixture-launch-" + n,
            slug: n === 0 ? "creator-launch" : "fixture-launch-" + n,
            business_id: businessId,
            business_slug: "campus-studio",
            business_name: "Campus Studio",
            content: {
              title: "Creator launch",
              description: "A new creative editor",
              startsAt: new Date(Date.now() - 60000).toISOString(),
              endsAt: new Date(Date.now() + 86400000).toISOString(),
              rewardDealId: dealId,
              destination: "https://example.com",
            },
            phase: "launching",
            rank: 1,
            interested: interested ? 6 : 5,
            viewerInterested: interested,
            score: 24,
          })),
          hasMore: false,
          serverTime: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 300000).toISOString(),
          plazaEnabled: true,
        });
      case "launch_interest":
        interested = i.enabled;
        return reply({ ok: true });
      case "snapshot":
        return reply({
          revision: 1,
          capacity: 400,
          total: properties.length,
          properties,
          events: [],
          discoveryEnabled: true,
          campusEnabled: true,
          dealsEnabled: true,
          customerDiscoveryEnabled: true,
          storefrontsEnabled: true,
          activityEnabled: true,
          launchesEnabled: true,
          launchPlazaEnabled: true,
        });
      case "customer_city_state":
        return reply({
          states: i.ids.includes(businessId)
            ? [{
              businessId,
              kind: "ending",
              band: "very_busy",
              primary: item,
              windowStart: new Date(Date.now() - 172800000).toISOString(),
              measuredAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 300000).toISOString(),
              version: 1,
            }]
            : [],
        });
      case "customer_inbox":
        return reply({
          items: reminders.length
            ? [{
              key: "reminder:fixture",
              title: "Creator launch",
              business_name: "Campus Studio",
              destination: launchItem.destination,
              kind: "launch_reminder",
              at: new Date().toISOString(),
              read_at: read ? new Date().toISOString() : null,
            }]
            : [],
          unread: reminders.length && !read ? 1 : 0,
          total: reminders.length,
          reminders,
          follows: followed,
        });
      case "customer_reminder":
        reminders = i.enabled ? [i.launchId] : [];
        return reply({ ok: true });
      case "customer_inbox_read":
        read = true;
        return reply({ ok: true });
      case "customer_resolve_launch":
        return reply(launchItem);
      case "discovery_follow":
        followed = i.enabled ? [i.businessId] : [];
        return reply({ ok: true });
      case "customer_nearby":
        return reply({ items: [item] });
      case "customer_destination":
        return reply({ items: [item] });
      case "customer_search":
        return reply({
          items: i.filter === "drops"
            ? [launchItem]
            : (!i.query || "free editor trial".includes(i.query))
            ? [item]
            : [],
          hasMore: false,
          categories: ["Creators"],
          now: new Date().toISOString(),
          revision: 1,
        });
      case "customer_activity":
        return reply({
          items: [{
            key: item.key,
            label: "Campus Studio: Free editor trial · 10 codes available",
            destination: item.destination,
          }],
        });
      case "customer_resolve":
        return reply(item);
      case "customer_wallet":
        return reply({ active: claims.length, saved, reminders: [] });
      case "customer_merge":
        saved = [item];
        return reply({ merged: i.items.map((v) => v.id) });
      case "customer_save":
        saved = i.saved ? [item] : [];
        return reply({ ok: true });
      case "deal_catalog":
        return reply({ enabled: true, deals: [deal] });
      case "deal_wallet":
        return reply({ enabled: true, claims, hasMore: false });
      case "deal_claim":
        if (!claims.length) {
          claims = [{
            id: "receipt",
            deal_id: dealId,
            terms,
            code: "UNIQUE-FIXTURE-CODE",
            business_name: "Campus Studio",
            created_at: new Date().toISOString(),
            redeemed_at: null,
            cancelled: false,
          }];
          deal.issued = 1;
        }
        return reply(claims[0]);
      case "workspace":
        return reply({
          business: {id:businessId,owner_id:userId,slug:"campus-studio",draft:profile,published:profile,preview:profile,status:"approved",draft_version:1,land_value:10000,verified_at:new Date().toISOString()},
          orders: [],
          saved: [],
          claims: [],
          analytics: {},
          history: [],
          admin: false,
        });
      case "campus_workspace":return reply({jobs:[],metrics:{},setupEnabled:false});
      case "customer_metrics":return reply({});
      case "discovery_workspace":return reply({now:new Date().toISOString(),launchesEnabled:true,storefronts:[],entries:[],drafts:[],metrics:[],follows:[],savedLaunches:[],progress:[]});
      case "deal_workspace":return reply({enabled:true,deals:[deal]});
      case "launch_analytics":return reply({items:[]});
      case "customer_campaign_history":return reply({events:[],followers:0});
      case "discovery_catalog":
        return reply({
          storefronts: [],
          entries: [],
          follows: followed,
          savedLaunches: [],
          progress: [],
        });
      default:
        return reply({ ok: true });
    }
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/city");
  await page.getByRole("navigation", { name: "Discovery modes" }).getByRole(
    "button",
    { name: "Launches", exact: true },
  ).click();
  await page.waitForURL((url) => url.pathname === "/city/launches");
  const panel = page.getByRole("complementary", {
    name: "Launches",
    exact: true,
  });
  await panel.getByRole("heading", { name: "Launch Plaza", exact: true })
    .waitFor();
  await panel.getByRole("button", { name: "Explore launch", exact: false })
    .click();
  await page.waitForURL((url) =>
    url.pathname === "/city/launches/creator-launch"
  );
  await panel.getByRole("heading", { name: "Creator launch", exact: true })
    .waitFor();
  await panel.getByRole("button", { name: "Save launch", exact: true }).click();
  assert.equal(
    actions.filter((a) => a.action === "customer_reminder").length,
    0,
    "save is not reminder",
  );
  await panel.getByRole("button", { name: "Interested", exact: false }).click();
  await page.getByLabel("Email", { exact: true }).fill("fixture@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("dialog").getByRole("button", {
    name: "Sign in",
    exact: true,
  }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await panel.getByRole("button", { name: "Interested", exact: false }).click();
  await page.waitForFunction(() =>
    document.querySelector('.city-launch-card button[aria-pressed="true"]')
  );
  assert.ok(actions.some((a) => a.action === "launch_interest" && a.enabled));
  await panel.getByRole("button", { name: "Remind me in City", exact: true })
    .click();
  await panel.getByRole("button", {
    name: "Cancel in-app reminder",
    exact: true,
  }).waitFor();
  await panel.getByRole("button", { name: "Claim unique code", exact: true })
    .click();
  await panel.getByText("UNIQUE-FIXTURE-CODE", { exact: true }).waitFor();
  assert.ok(
    actions.some((a) =>
      a.action === "deal_claim" && a.sourceLaunchId === launchId
    ),
  );
  await mkdir("output/playwright", { recursive: true });
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: "output/playwright/city-launches-desktop.png",
  });
  const stats = await page.locator("canvas").first().getAttribute(
    "data-city-launch-stats",
  );
  if (stats) assert.ok(JSON.parse(stats).figures <= 96);
  await writeFile(
    "output/playwright/city-launches-evidence.json",
    JSON.stringify(
      {
        properties: properties.length,
        plazaDisplays: stress ? 12 : 1,
        stats,
        physicalDevice: false,
      },
      null,
      2,
    ),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(() =>
      document.documentElement.scrollWidth <= innerWidth
    ),
  );
  await panel.getByRole("button", { name: "Minimise", exact: true }).click();
  await panel.getByRole("button", { name: "Expand", exact: true }).waitFor();
  await page.screenshot({ path: "output/playwright/city-launches-mobile.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await panel.getByRole("heading", { name: "Creator launch", exact: true })
    .waitFor();
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(origin+'/city/manage');
  await page.getByRole('heading',{name:'Create a launch',exact:true}).waitFor();
  const studio=page.locator('.city-explore-studio');
  await studio.getByLabel('Title',{exact:true}).fill('New editor');
  await studio.getByLabel('Stable product identifier',{exact:false}).fill('editor');
  await studio.getByLabel('Permanent launch address',{exact:true}).fill('new-editor');
  await studio.getByLabel('Description',{exact:true}).fill('A new launch for creators');
  await studio.getByRole('button',{name:'Preview city presence',exact:true}).click();
  await studio.locator('.city-launch-preview').waitFor();
  await studio.getByRole('button',{name:'Save private draft',exact:true}).click();
  await studio.getByText('Private draft saved.',{exact:true}).waitFor();
  assert.ok(actions.some(a=>a.action==='discovery_entry_save'&&a.saveDraft&&a.content.schemaVersion===2));
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      passed: true,
      checks:
        "Launch Plaza navigation, deep link, guest save, explicit interest and reminder, attributed reward, mobile sheet, reduced motion, merchant preview/private draft, runtime",
    }),
  );
} finally {
  await browser.close();
}
