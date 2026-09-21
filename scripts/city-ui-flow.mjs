// Browser contract test against an in-memory API fixture. No live account, payment or email is created.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const origin = process.env.CITY_TEST_ORIGIN || "http://127.0.0.1:5184";
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
let business = null;
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
    const input = route.request().postDataJSON(),
      url = route.request().url();
    const reply = (value) => route.fulfill({ json: value });
    if (url.endsWith("city-api")) {
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
      if (input.action === "admin")
        return reply({
          businesses: business ? [business] : [],
          reports: [],
          orders: [],
        });
      return reply({
        revision: 1,
        capacity: 400,
        total: 0,
        properties: [],
        events: [],
        onboardingEnabled: true,
        purchasesEnabled: true,
        termsUrl: "https://example.com/terms",
      });
    }
    if(url.endsWith("city-building-art"))return reply({enabled:false,prices:{nano:0,gpt:0},jobs:[]});
    actions.push(input.action);
    if (input.action === "import")
      return reply({
        name: "Field Notes Studio",
        website: "https://example.com/",
        description: "Thoughtful tools for independent teams.",
        tagline: "Make room for better work.",
      });
    if (input.action === "upload")
      return reply({
        path: `${userId}/66666666-6666-4666-8666-666666666666.png`,
        url: `${origin}/city/demo-signs/forma-hero.svg`,
      });
    if (input.action === "save") {
      business.draft = input.profile;
      business.draft_version++;
      return reply(business);
    }
    if (input.action === "create") {
      business = {
        id: businessId,
        slug: input.slug,
        draft: input.profile,
        published: null,
        draft_version: 1,
        submitted_version: null,
        status: "draft",
        verified_at: null,
        verification_token: "55555555-5555-4555-8555-555555555555",
        review_note: null,
        land_value: 0,
        preview: {
          ...input.profile,
          billboard: `${origin}/city/demo-signs/forma-hero.svg`,
        },
      };
      return reply(business);
    }
    if (input.action === "verify") {
      business.verified_at = new Date().toISOString();
      return reply(business);
    }
    if (input.action === "submit") {
      business.status = "pending";
      business.submitted_version = business.draft_version;
      return reply(business);
    }
    if (input.action === "review") {
      business.status = "approved";
      business.published = business.draft;
      business.review_note = input.note;
      return reply(business);
    }
    if (input.action === "checkout") {
      assert.equal(input.amount, 12345);
      assert.equal(input.termsVersion, "city-1");
      return reply({
        orderId: "fixture-order",
        url: `${origin}/city/manage?fixture-checkout=1`,
      });
    }
    return reply({ ok: true });
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${origin}/city/manage`);
  await page
    .getByRole("heading", { name: "Your place in the city." })
    .waitFor();
  await page
    .getByLabel("Business website", { exact: true })
    .fill("https://example.com");
  await page
    .getByRole("button", { name: "Import details", exact: true })
    .click();
  await page
    .getByLabel("Business name", { exact: true })
    .fill("Field Notes Studio");
  await page
    .getByLabel("Property address", { exact: true })
    .fill("field-notes");
  await page
    .getByLabel("Offer title", { exact: true })
    .fill("A welcome for the city");
  await page.getByLabel("Upload billboard", { exact: true }).setInputFiles({
    name: "billboard.png",
    mimeType: "image/png",
    buffer: Buffer.from("fixture"),
  });
  await page.getByAltText("billboard preview").waitFor();
  await page.getByLabel("Vertical position", { exact: true }).fill("80");
  await page.getByLabel("Image zoom", { exact: true }).fill("1.5");
  await page.waitForFunction(() => {
    const raw = document.querySelector(
      '[aria-label="Live building preview"] canvas',
    )?.dataset.cityBillboards;
    return raw && JSON.parse(raw).decodedImages === 1;
  });
  await mkdir("output/playwright", { recursive: true });
  await page.screenshot({
    path: "output/playwright/city-branding-editor.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Save property draft", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Check website verification", exact: true })
    .waitFor();
  assert.deepEqual(business.draft.billboardCrop, { x: 50, y: 80, zoom: 1.5 });
  await page.reload();
  await page.getByLabel("Vertical position", { exact: true }).waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="Vertical position"]')?.value ===
      "80",
  );
  await page.getByAltText("billboard preview").waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("img", { name: "Billboard crop preview" })
    .scrollIntoViewIfNeeded();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.screenshot({ path: "output/playwright/city-branding-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Check website verification", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Submit for review", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Waiting for review", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Operations", exact: true }).click();
  await page
    .getByLabel("Decision reason", { exact: true })
    .fill("Verified the website, profile and offer.");
  await page.getByRole("region", { name: "Pilot dashboard" }).waitFor();
  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export pilot results" }).click();
  assert.equal(
    (await csvDownload).suggestedFilename(),
    "synarc-city-pilot.csv",
  );
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page
    .getByRole("button", { name: "Your business", exact: true })
    .click();
  await page.getByLabel("Add City Value (£)", { exact: true }).fill("123.45");
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Continue to secure checkout" })
    .click();
  await page.waitForURL("**/city/manage?fixture-checkout=1");
  assert.deepEqual(actions, [
    "import",
    "upload",
    "create",
    "verify",
    "submit",
    "review",
    "checkout",
  ]);
  assert.deepEqual(errors, []);
  await mkdir("output/playwright", { recursive: true });
  await writeFile(
    "output/playwright/city-ui-flow.json",
    JSON.stringify(
      { actions, errors, mode: "Mock API contracts; no live Stripe payment" },
      null,
      2,
    ),
  );
  console.log("Business UI flow passed:", actions.join(" → "));
} finally {
  await browser.close();
}
