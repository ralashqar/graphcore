// Fixture-backed rendering benchmark; no hosted data, accounts or payments.
import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import {
  buildingTier,
  cityPlots,
  emptyCityProfile,
} from "../src/domain/city.ts";
const design = process.env.CITY_DESIGN_VERSION === "3"
  ? (await import("../src/domain/cityBuildingV3.ts")).newDesign("benchmark")
  : process.env.CITY_DESIGN_V2 === "1"
  ? (await import("../src/domain/cityBuildingV2.ts")).DEFAULT_DESIGN_V2
  : {
    version: 1,
    blueprint: "terraces",
    floors: 4,
    width: 16,
    setback: 1,
    facade: "ribbon",
    tile: "garden",
    landscaping: true,
    rotation: 0,
  };
const officeModule=process.env.CITY_OFFICE_BENCHMARK==="1"?await import("../src/domain/cityBuildingV3.ts"):null;
const residentialModule=process.env.CITY_RESIDENTIAL_BENCHMARK==="1"?await import("../src/domain/cityBuildingV3.ts"):null;
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
    if(process.env.CITY_SCENE_QUALITY)await context.addInitScript(quality=>localStorage.setItem("city-scene-look-v1",JSON.stringify({look:"daylight",quality})),process.env.CITY_SCENE_QUALITY);
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
          buildingDesign: {
            ...design,
            ...(officeModule && i%2===0 ? officeModule.applyComposition(officeModule.newDesign("benchmark"),26+(i/2)%6) : {}),
            ...(residentialModule && i%2===0 ? residentialModule.applyComposition(residentialModule.newDesign("benchmark"),18+(i/2)%8) : {}),
            ...(process.env.CITY_DETAIL_BENCHMARK==="1" && design.version===3 ? {windowFamily:["storefront","warehouse","sash","picture","arched"][i%5],stairExtension:i%40===5?"spiral":"none",roof:"flat",roofVariant:"standard"}:{}),
            ...(design.version !== 1
              ? {
                architecture: ["glass", "brick", "boutique", "creative"][i % 4],
                finish: i % 3 === 0
                  ? "facade"
                  : i % 3 === 1
                  ? "accents"
                  : "procedural",
              }
              : {}),
          },
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
      }));
    await page.routeWebSocket(
      "**/realtime/**",
      (socket) => socket.onMessage(() => {}),
    );
    await page.goto(`${origin}/city`);
    await page
      .getByRole("button", { name: "01 Fixture 1", exact: true })
      .waitFor();
    await page.waitForFunction(min=>Number(document.querySelector("[data-city-resident-count]")?.getAttribute("data-city-resident-count"))>=min,mobile?200:280,{timeout:60000});
    await page.waitForTimeout(2000);
    const performance = await page.evaluate(
      () =>
        new Promise((resolve) => {
          let frames = 0, previous = performance.now();
          const durations = [];
          const start = performance.now();
          function tick(now) {
            frames++;
            durations.push(now - previous);
            previous = now;
            if (now - start < 10000) requestAnimationFrame(tick);
            else {
              resolve({
                frames,
                frameMsP50: durations.toSorted((a, b) =>
                  a - b
                )[Math.floor(durations.length * .5)],
                frameMsP95: durations.toSorted((a, b) =>
                  a - b
                )[Math.floor(durations.length * .95)],
                jsHeapBytes: performance.memory?.usedJSHeapSize ?? null,
                elapsed: now - start,
                fps: (frames * 1000) / (now - start),
              });
            }
          }
          requestAnimationFrame(tick);
        }),
    );
    const stats = JSON.parse(
      await page.locator("canvas").getAttribute("data-city-render-stats"),
    );
    const residents = page.locator("[data-city-resident-count]");
    const initialResidents = Number(
      await residents.getAttribute("data-city-resident-count"),
    );
    await page.mouse.move(mobile ? 260 : 950, mobile ? 430 : 500);
    for (let i = 0; i < 22; i++) {
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(2200);
    const closeStats = JSON.parse(
      await page.locator("canvas").getAttribute("data-city-render-stats"),
    );
    const closeResidents = Number(
      await residents.getAttribute("data-city-resident-count"),
    );
    assert.ok(
      closeResidents < initialResidents,
      "zooming in releases distant property instances",
    );
    assert.deepEqual(errors, []);
    const gpu=await page.evaluate(()=>{const gl=document.querySelector("canvas")?.getContext("webgl2");const ext=gl?.getExtension("WEBGL_debug_renderer_info");return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):"unavailable";});
    results.push({
      gpu,
      viewport: mobile ? "mobile-viewport-on-desktop-GPU" : "desktop",
      properties: 400,
      initialResidents,
      closeResidents,
      closeStats,
      performance,
      stats,
    });
    await page.screenshot({
      path: `output/playwright/city-400-${mobile ? "mobile" : "desktop"}.png`,
    });
    await context.close();
  }
  await writeFile(
    `output/playwright/city-design-benchmark-${design.version}.json`,
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
