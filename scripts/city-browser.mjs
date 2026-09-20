import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const origin = process.env.CITY_TEST_ORIGIN || "http://127.0.0.1:5184";
await mkdir("output/playwright", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: process.platform === "win32" ? ["--use-angle=d3d11"] : [],
});
const errors = [],
  checks = [];
let page;
try {
  page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`${origin}/city?demo=1`);
  await page
    .getByRole("button", { name: "01 Fieldwork", exact: true })
    .waitFor();
  assert.equal(await page.locator("canvas").count(), 1);
  await page.screenshot({ path: "output/playwright/city-desktop.png" });
  await page
    .getByRole("textbox", { name: "Search the city" })
    .fill("Offscript");
  await page
    .getByRole("button", { name: "O Offscript Games #2", exact: true })
    .click();
  await page
    .getByRole("complementary", { name: "Offscript property" })
    .waitFor();
  assert.ok(page.url().includes("/city/business/demo-1"));
  await page.getByRole("button", { name: "Save place", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "demonstration property" })
    .waitFor();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Share card", exact: true }).click();
  const download = await downloadPromise;
  await download.saveAs("output/playwright/city-share.png");
  await page
    .getByRole("button", { name: "Close property", exact: true })
    .click();
  await page.getByRole("button", { name: "Directory", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByText("Page 2", { exact: true }).waitFor();
  await page.getByRole("button", { name: "3D map", exact: true }).click();
  await page
    .getByRole("button", { name: "01 Fieldwork", exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: "01 Fieldwork", exact: true })
    .waitFor();
  checks.push(
    "desktop map, search, selection, demo guard, PNG download, directory pagination, context cleanup",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "output/playwright/city-mobile.png" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "mobile overflow",
  );
  await page
    .getByRole("button", {
      name: "F Fieldwork SaaS · Offer available #1",
      exact: true,
    })
    .click();
  await page
    .getByRole("complementary", { name: "Fieldwork property" })
    .waitFor();
  await page.screenshot({ path: "output/playwright/city-mobile-property.png" });
  await page
    .getByRole("button", { name: "Your business", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Sign in or create an account", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog
    .getByLabel("Email", { exact: true })
    .fill("city-test@example.com");
  await dialog
    .getByLabel("Password", { exact: true })
    .fill("not-submitted-password");
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  checks.push(
    "mobile layout, property bottom sheet, accessible business entry, auth form and Escape",
  );
  await page.goto(`${origin}/city/business/demo-0?demo=1`);
  await page
    .getByRole("complementary", { name: "Fieldwork property" })
    .waitFor();
  await page.locator("canvas").waitFor();
  await page
    .getByRole("button", { name: "01 Fieldwork", exact: true })
    .waitFor();
  await page.evaluate(() =>
    document
      .querySelector("canvas")
      .dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
  );
  await page
    .getByRole("status")
    .filter({ hasText: "3D map is unavailable" })
    .waitFor();
  await page
    .getByRole("button", { name: "Close property", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Search the city" }).fill("Forma");
  await page
    .getByRole("button", { name: "F Forma Shopping #3", exact: true })
    .waitFor();
  checks.push("deep links and searchable WebGL fallback");
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`${origin}/city?demo=1&stress=1`);
  await page
    .getByRole("button", { name: "01 Fieldwork", exact: true })
    .waitFor();
  const performance = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let count = 0;
        const start = performance.now();
        function tick(now) {
          count++;
          if (now - start < 2500) requestAnimationFrame(tick);
          else
            resolve({
              frames: count,
              elapsed: now - start,
              fps: (count * 1000) / (now - start),
            });
        }
        requestAnimationFrame(tick);
      }),
  );
  const renderer = await page.locator("canvas").evaluate((canvas) => {
    const gl = canvas.getContext("webgl2"),
      extension = gl?.getExtension("WEBGL_debug_renderer_info");
    return extension
      ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
      : "Unavailable";
  });
  await page.screenshot({ path: "output/playwright/city-2000.png" });
  checks.push("2,000-property scene loads");
  assert.deepEqual(errors, []);
  const evidence = {
    checks,
    errors,
    performance,
    renderer,
    note: "Headless desktop measurement; not a physical mobile-device certification.",
  };
  await writeFile(
    "output/playwright/city-browser-results.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  console.error(
    JSON.stringify(
      {
        errors,
        checks,
        body: await page
          ?.locator("body")
          .innerText()
          .catch(() => null),
      },
      null,
      2,
    ),
  );
  await page
    ?.screenshot({ path: "output/playwright/city-failure.png" })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
