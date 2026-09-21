import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const origin = process.env.CITY_TEST_ORIGIN || "http://127.0.0.1:5184";
const browser = await chromium.launch({
  headless: true,
  args: process.platform === "win32" ? ["--use-angle=d3d11"] : [],
});
await mkdir("output/playwright", { recursive: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
// Demo geometry tests are isolated from hosted API availability.
await page.route("**/functions/v1/city-*", route => route.fulfill({ json: { error: "Demo fixture: backend unavailable" } }));
try {
  await page.goto(`${origin}/city?demo=1&cityRender=offices`);
  await page
    .getByRole("button", { name: "01 Fieldwork", exact: true })
    .waitFor();
  await page.mouse.move(950, 530);
  for (let i = 0; i < 18; i++) {
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(70);
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "output/playwright/city-downtown-close.png" });
  // Drag the real map controls, then recover the original plaza through its public control.
  await page.mouse.move(950, 530);
  await page.mouse.down();
  await page.mouse.move(540, 760, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(1300);
  await page.screenshot({ path: "output/playwright/city-downtown-pan.png" });
  await page
    .getByRole("button", { name: "Return to Central Plaza", exact: true })
    .click();
  await page.waitForTimeout(1600);
  assert.equal(await page.locator("canvas").count(), 1);
  const stats = JSON.parse(
    await page.locator("canvas").getAttribute("data-city-render-stats"),
  );
  assert.ok(stats.triangles > 0 && stats.calls < 300, JSON.stringify(stats));
  assert.deepEqual(errors, []);
  await writeFile(
    "output/playwright/city-kit-browser.json",
    JSON.stringify(
      {
        errors,
        stats,
        checks: [
          "detailed assemblies",
          "road and plot zoom",
          "drag navigation",
          "return to plaza",
        ],
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ errors, stats }));
} finally {
  await browser.close();
}
