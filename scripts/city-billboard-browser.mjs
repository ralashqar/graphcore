import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const origin = process.env.CITY_TEST_ORIGIN || "http://127.0.0.1:5184";
const browser = await chromium.launch({
  headless: true,
  args: process.platform === "win32" ? ["--use-angle=d3d11"] : [],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await mkdir("output/playwright", { recursive: true });
const requestedImages = new Set();
page.on("request", request => { if (request.url().includes("/city/demo-signs/")) requestedImages.add(request.url()); });
async function ready() {
  await page.waitForFunction(() => {
    const value = document.querySelector("canvas")?.dataset.cityBillboards;
    if (!value) return false;
    const stats = JSON.parse(value);
    return stats.slots === stats.ready && stats.ready > 0;
  });
  return JSON.parse(
    await page.locator("canvas").getAttribute("data-city-billboards"),
  );
}
// Demo geometry tests are isolated from hosted API availability.
await page.route("**/functions/v1/city-*", route => route.fulfill({ json: { error: "Demo fixture: backend unavailable" } }));
try {
  await page.goto(`${origin}/city?demo=1`);
  const loaded = await ready();
  // A pan must not decode the same artwork again after the atlas set changes.
  let repeatImages = 0;
  const initialImages = new Set(requestedImages);
  await page.route("**/city/demo-signs/**", route => { if (initialImages.has(route.request().url())) repeatImages++; return route.continue(); });
  await page.mouse.move(850,450);
  await page.mouse.down({button:"right"});
  await page.mouse.move(1020,520,{steps:15});
  await page.mouse.up({button:"right"});
  await page.waitForTimeout(1600);
  await ready();
  await page.getByRole("button", {name:"Return to Central Plaza",exact:true}).click();
  await page.waitForTimeout(1800);
  await ready();
  assert.equal(repeatImages, 0, "cached demo artwork is reused while panning");
  await page.unroute("**/city/demo-signs/**");
  assert.equal(loaded.slots, 32);
  assert.ok(loaded.decodedImages >= 10);
  assert.equal(loaded.failedImages, 0);
  await page.screenshot({ path: "output/playwright/city-billboards.png" });
  // Click the bottom-left Fieldwork sign in the estate's default framing.
  await page.mouse.click(832, 510);
  await page
    .getByRole("complementary", { name: "Fieldwork property" })
    .waitFor();
  await page
    .getByRole("button", { name: "Close property", exact: true })
    .click();
  // Successful HTTP response with undecodable bytes exercises image fallback without a network failure.
  await page.route("**/fieldwork-hero.svg", (r) =>
    r.fulfill({ contentType: "image/png", body: "invalid-image-fixture" }),
  );
  await page.goto(`${origin}/city?demo=1`);
  const fallback = await ready();
  assert.ok(fallback.failedImages >= 1);
  assert.equal(fallback.ready, 32);
  assert.equal(await page.locator("canvas").count(), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await ready();
  await page.screenshot({
    path: "output/playwright/city-billboards-mobile.png",
  });
  assert.deepEqual(errors, []);
  await writeFile(
    "output/playwright/city-billboard-results.json",
    JSON.stringify(
      {
        loaded,
        fallback,
        errors,
        checks: [
          "logo and hero fixtures",
          "bounded atlas",
          "real 3D display click",
          "undecodable-image fallback",
          "mobile viewport",
        ],
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ loaded, fallback, errors }));
} finally {
  await browser.close();
}
