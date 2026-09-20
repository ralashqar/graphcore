import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const origin = process.env.CITY_TEST_ORIGIN || "http://127.0.0.1:5188";
await mkdir("output/playwright", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: process.platform === "win32" ? ["--use-angle=d3d11"] : [],
});
const errors = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${origin}/city/trails/first-creative-launch?demo=1&stop=2`);
  await page.getByRole("button", { name: "Enter business space" }).waitFor();
  await page.getByRole("button", { name: "Enter business space" }).click();
  await page.getByRole("heading", { name: "Forma", exact: true }).waitFor();
  await page.getByRole("navigation", { name: "Campus exhibits" }).waitFor();
  await page.locator("canvas").waitFor();
  await page.getByText("HEADQUARTERS", { exact: true }).waitFor();
  assert.equal(await page.locator("canvas").count(), 1);
  await page.getByRole("button", { name: "Expressive", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Campus exhibits" })
    .getByRole("button")
    .last()
    .click();
  assert.ok(page.url().includes("/space/launches"));
  await page.screenshot({
    path: "output/playwright/city-campus-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Back to city / trail" }).click();
  assert.ok(page.url().includes("stop=2"));
  await page.getByText("SHARED PAVILION EXHIBIT", { exact: true }).waitFor();
  await page.goto(`${origin}/city/business/creator-2/space/sample?demo=1`);
  await page.getByRole("button", { name: "Expressive", exact: true }).waitFor();
  await page.getByText("HEADQUARTERS", { exact: true }).waitFor();
  await page
    .locator("canvas")
    .evaluate((el) =>
      el.dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
    );
  await page.getByText("Explore all exhibits using the list below.").waitFor();
  await page.getByRole("button", { name: "Editorial", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "output/playwright/city-campus-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "output/playwright/city-campus-results.json",
    JSON.stringify(
      {
        errors,
        checks: [
          "free campus entry",
          "one renderer",
          "interactive exhibit",
          "station deep link",
          "trail return preserves stop",
          "WebGL fallback",
          "mobile overflow",
        ],
      },
      null,
      2,
    ),
  );
  console.log("Campus browser checks passed.");
} finally {
  await browser.close();
}
