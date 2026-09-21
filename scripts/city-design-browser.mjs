import { chromium } from "playwright";
import assert from "node:assert/strict";
const origin = process.env.CITY_TEST_ORIGIN || "http://localhost:5183",
  userId = "11111111-1111-4111-8111-111111111111",
  businessId = "44444444-4444-4444-8444-444444444444";
const user = {
  id: userId,
  aud: "authenticated",
  role: "authenticated",
  email: "fixture@example.com",
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
};
const token = `${
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
const session = {
  access_token: token,
  refresh_token: "fixture-refresh",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user,
};
const profile = {
  name: "Fieldwork",
  description: "Design tools for independent studios",
  tagline: "Make room",
  website: "https://example.com",
  category: "Apps",
  color: "#335577",
  logo: `${origin}/city/demo-signs/common-ground-logo.svg`,
  hero: "",
  video: "",
  offer: { title: "", description: "", code: "", expiresAt: null, url: "" },
};
const business = {
  id: businessId,
  slug: "fieldwork",
  draft: profile,
  published: null,
  draft_version: 1,
  status: "draft",
  verified_at: null,
  verification_token: businessId,
  review_note: null,
  land_value: 1000,
  preview: profile,
};
const errors = [];
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
    (s) =>
      localStorage.setItem(
        "sb-znwdatidqdkzidempvkt-auth-token",
        JSON.stringify(s),
      ),
    session,
  );
  await context.route(
    "**/auth/v1/**",
    (r) =>
      r.fulfill({ json: r.request().url().includes("/user") ? user : session }),
  );
  let saved = 0;
  await context.route("**/functions/v1/city-*", async (r) => {
    const p = r.request().postDataJSON(), url = r.request().url();
    const reply = (json) => r.fulfill({ json });
    if (url.endsWith("city-command") && p.action === "save") {
      business.draft = p.profile;
      business.preview = p.profile;
      business.draft_version++;
      saved++;
      return reply({ ok: true });
    }
    if (url.endsWith("city-api") && p.action === "workspace") {
      return reply({
        business,
        orders: [],
        saved: [],
        claims: [],
        analytics: {},
        history: [],
        admin: false,
      });
    }
    if (url.endsWith("city-api")) {
      return reply({
        revision: 1,
        capacity: 400,
        total: business.published ? 1 : 0,
        properties: business.published
          ? [{
            id: businessId,
            slug: "fieldwork",
            profile: business.preview,
            rank: 1,
            landValue: 1000,
            tier: 0,
            x: -1,
            z: -1,
            saves: 0,
            claims: 0,
          }]
          : [],
        events: [],
        onboardingEnabled: true,
        purchasesEnabled: false,
      });
    }
    if (url.endsWith("city-building-art")) {
      return reply({ enabled: false, prices: { nano: 0, gpt: 0 }, jobs: [] });
    }
    return reply({ ok: true });
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${origin}/city/manage`);
  await page.getByRole("region", { name: "Live 3D building designer" })
    .waitFor();
  await page.locator(".city-design-canvas canvas").waitFor();
  await page.waitForTimeout(800);
  const before = await page.locator(".city-design-canvas").screenshot();
  await page.getByRole("button", { name: /Corner studio/ }).click();
  await page.getByLabel("Floors", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Architecture", exact: true }).click();
  await page.getByRole("button", { name: "Warm brick", exact: true }).click();
  await page.getByLabel("Building finish", { exact: true }).selectOption(
    "facade",
  );
  await page.getByRole("button", { name: "Grounds", exact: true }).click();
  await page.getByLabel("Tile styling", { exact: true }).selectOption("slate");
  await page.getByRole("button", { name: "Shape", exact: true }).click();
  await page.getByText("Advanced dimensions", { exact: true }).click();
  await page.getByLabel("Building orientation", { exact: true }).selectOption(
    "1",
  );
  assert.equal(
    await page.locator(".city-design-canvas").getAttribute("data-blueprint"),
    "l-shape",
  );
  assert.equal(
    await page.locator(".city-design-canvas").getAttribute("data-floors"),
    "5",
  );
  const after = await page.locator(".city-design-canvas").screenshot();
  assert.notDeepEqual(before, after);
  await page.getByRole("region", { name: "Live 3D building designer" })
    .evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.screenshot({
    path: "output/playwright/city-design-v2-desktop.png",
  });
  await page.getByRole("button", { name: "Blueprint view", exact: true })
    .click();
  await page.getByRole("img", { name: "l-shape footprint blueprint" })
    .waitFor();
  await page.screenshot({
    path: "output/playwright/city-design-v2-blueprint.png",
  });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal(
    await page.getByLabel("Building orientation", { exact: true }).inputValue(),
    "0",
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  assert.equal(
    await page.getByLabel("Building orientation", { exact: true }).inputValue(),
    "1",
  );
  await page.getByRole("button", { name: "Save property draft", exact: true })
    .click();
  await page.getByText(
    "Draft saved. Verify the website, then submit it for review.",
    { exact: true },
  ).waitFor();
  assert.equal(saved, 1);
  assert.equal(business.draft.buildingDesign.blueprint, "l-shape");
  assert.equal(business.draft.buildingArt, "");
  await page.reload();
  await page.locator('.city-design-canvas[data-floors="5"]').waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("region", { name: "Live 3D building designer" })
    .evaluate((el) => el.scrollIntoView({ block: "start" }));
  assert.ok(await page.locator(".city-design-canvas canvas").isVisible());
  assert.ok(
    await page.evaluate(() =>
      document.documentElement.scrollWidth <= innerWidth + 1
    ),
  );
  await page.screenshot({
    path: "output/playwright/city-design-v2-mobile.png",
  });
  business.published = business.draft;
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/city`);
  await page.waitForFunction(() =>
    document.querySelector("canvas")?.dataset.cityCamera
  );
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "output/playwright/city-design-v2-map.png" });
  await page.mouse.click(885, 553);
  await page.getByRole("complementary", {
    name: "Fieldwork property",
    exact: true,
  }).waitFor();
  // A failed optional pack leaves procedural geometry and editing usable.
  await context.route("**/city/decorators/decorators.glb*", (r) => r.abort());
  await page.goto(`${origin}/city/manage`);
  await page.locator(".city-design-canvas canvas").waitFor();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Architecture", exact: true }).click();
  assert.equal(
    await page.getByLabel("Building finish", { exact: true }).inputValue(),
    "facade",
  );
  await page.screenshot({
    path: "output/playwright/city-design-v2-fallback.png",
  });
  // Legacy designs remain v1 until an explicit upgrade; undo restores the exact recipe.
  business.draft = {
    ...profile,
    buildingDesign: {
      version: 1,
      blueprint: "office",
      floors: 3,
      width: 14,
      setback: 1,
      facade: "ribbon",
      tile: "garden",
      landscaping: true,
      rotation: 0,
    },
  };
  business.preview = business.draft;
  await page.reload();
  await page.locator('.city-design-canvas[data-version="1"]').waitFor();
  assert.ok(await page.getByLabel("Floors", { exact: true }).isDisabled());
  await page.getByRole("button", { name: "Upgrade design", exact: true })
    .click();
  await page.locator('.city-design-canvas[data-version="2"]').waitFor();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.locator('.city-design-canvas[data-version="1"]').waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "3D designer: live presets, geometry changes, blueprint, save/reload, mobile and city rendering passed (mock API).",
  );
} finally {
  await browser.close();
}
