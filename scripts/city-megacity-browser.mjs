import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const origin = process.env.CITY_TEST_ORIGIN || "http://localhost:5182";
const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=d3d11"],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
try {
  await mkdir("output/playwright", { recursive: true });
  await page.goto(`${origin}/city/asset-showcase`);
  await page.waitForFunction(
    () => document.querySelector("canvas")?.dataset.showcaseStats,
  );
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "output/playwright/megacity-collection.png" });
  await page.getByLabel("Sample billboards").uncheck();
  await page.getByRole("button", { name: /01.*Corner shop/ }).click();
  await page.waitForTimeout(1400);
  await page.screenshot({ path: "output/playwright/megacity-corner-shop.png" });
  await page.getByRole("button", { name: /05.*Civic landmark/ }).click();
  await page.waitForTimeout(1400);
  await page.screenshot({ path: "output/playwright/megacity-landmark.png" });
  for (let i = 0; i < 3; i++) {
    await page
      .getByRole("navigation", { name: "Decorative presets" })
      .getByRole("button")
      .nth(i)
      .click();
    await page.waitForTimeout(1400);
    await page.screenshot({
      path: `output/playwright/megacity-decor-${i + 1}.png`,
    });
  }
  await page.getByRole("combobox").selectOption("far");
  await page.waitForTimeout(600);
  await page.getByLabel("400-building stress scene").check();
  await page.waitForTimeout(1800);
  const benchmark = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let count = 0;
        const start = performance.now();
        function tick() {
          count++;
          const elapsed = performance.now() - start;
          if (elapsed < 5000) requestAnimationFrame(tick);
          else
            resolve({
              frames: count,
              elapsed,
              fps: (count * 1000) / elapsed,
              stats: JSON.parse(
                document.querySelector("canvas").dataset.showcaseStats,
              ),
            });
        }
        requestAnimationFrame(tick);
      }),
  );
  await page.screenshot({ path: "output/playwright/megacity-stress.png" });
  await writeFile(
    "output/playwright/megacity-benchmark.json",
    JSON.stringify(benchmark, null, 2),
  );
  await page.getByRole("button", { name: "Show collection" }).click();
  await page.getByRole("combobox").selectOption("near");
  await page.getByLabel("Sample billboards").check();
  await page.getByLabel("Quaternius comparison").uncheck();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: /01.*Corner shop/ }).click();
  await page.waitForTimeout(700);
  await page.screenshot({
    path: "output/playwright/megacity-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "Mobile horizontal overflow",
  );
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ benchmark, errors }));
} finally {
  await browser.close();
}
