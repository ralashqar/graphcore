// Fixture-backed rendering benchmark; no hosted data, accounts or payments.
import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import {
  cityPlots,
  buildingTier,
  emptyCityProfile,
} from "../src/domain/city.ts";
const origin = process.env.CITY_TEST_ORIGIN || "http://127.0.0.1:5184";
const browser = await chromium.launch({
  headless: true,
  args: process.platform === "win32" ? ["--use-angle=d3d11"] : [],
});
const results = [];
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 960 },
      deviceScaleFactor: mobile ? 2 : 1,
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const properties = cityPlots().map((plot, i) => {
      const landValue = Math.max(
        1000,
        Math.round(6800000 / Math.pow(i + 1, 1.5)),
      );
      return {
        ...plot,
        id: `fixture-${i}`,
        slug: `fixture-${i}`,
        rank: i + 1,
        tier: buildingTier(landValue),
        landValue,
        saves: 0,
        claims: 0,
        profile: {
          ...emptyCityProfile(),
          name: `Fixture ${i + 1}`,
          website: "https://example.com",
        },
      };
    });
    await page.route("**/functions/v1/city-api", (route) =>
      route.fulfill({
        json: {
          revision: 1,
          capacity: 400,
          total: 400,
          properties,
          events: [],
          purchasesEnabled: false,
          onboardingEnabled: false,
          demo: true,
        },
      }),
    );
    await page.routeWebSocket("**/realtime/**", (socket) =>
      socket.onMessage(() => {}),
    );
    await page.goto(`${origin}/city`);
    await page
      .getByRole("button", { name: "01 Fixture 1", exact: true })
      .waitFor();
    await page.waitForTimeout(2000);
    const performance = await page.evaluate(
      () =>
        new Promise((resolve) => {
          let frames = 0;
          const start = performance.now();
          function tick(now) {
            frames++;
            if (now - start < 10000) requestAnimationFrame(tick);
            else
              resolve({
                frames,
                elapsed: now - start,
                fps: (frames * 1000) / (now - start),
              });
          }
          requestAnimationFrame(tick);
        }),
    );
    const stats = JSON.parse(
      await page.locator("canvas").getAttribute("data-city-render-stats"),
    );
    assert.deepEqual(errors, []);
    results.push({
      viewport: mobile ? "mobile-viewport-on-desktop-GPU" : "desktop",
      properties: 400,
      performance,
      stats,
    });
    await page.screenshot({
      path: `output/playwright/city-400-${mobile ? "mobile" : "desktop"}.png`,
    });
    await context.close();
  }
  await writeFile(
    "output/playwright/city-kit-benchmark.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
