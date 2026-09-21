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
if (process.env.CITY_PRESET_THUMBNAILS === "1") {
  const {newDesign} = await import("../src/domain/cityBuildingV3.ts");
  Object.assign(profile, {name:"SynArc", logo:"", color:"#446c60"});
  business.draft = {...profile, buildingDesign:newDesign("preset-gallery-v1")};
  business.preview = business.draft;
}
if(process.env.CITY_ENTRANCE_AUDIT === "1"){
 const {demoBuildingDesign}=await import("../src/domain/cityDemoDesign.ts");
 business.draft={...profile,buildingDesign:demoBuildingDesign(63,"#c6a262")};business.preview=business.draft;
}
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
  page.on("pageerror", (e) => errors.push(e.stack || e.message));
  await page.goto(`${origin}/city/manage`);
  await page.getByRole("region", { name: "Live 3D building designer" })
    .waitFor();
  await page.locator(".city-design-canvas canvas").waitFor();
  await page.waitForTimeout(800);
  if(process.env.CITY_ENTRANCE_AUDIT === "1"){
   page.on("console",m=>{if(m.type()==="error" && /shader|WebGL|GL_INVALID/i.test(m.text()))errors.push(m.text());});
   await page.waitForTimeout(1800);
   const canvas=page.locator(".city-design-canvas canvas");await canvas.scrollIntoViewIfNeeded();const b=await canvas.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);
   for(let i=0;i<10;i++){await page.mouse.wheel(0,-120);await page.waitForTimeout(35);}
   await page.waitForTimeout(500);
   await page.locator(".city-design-canvas").screenshot({path:"output/playwright/city-native-entry-fixed.png"});
   await page.getByLabel("Building finish",{exact:true}).selectOption("facade");
   await page.getByLabel("Quaternius detail set",{exact:true}).selectOption("brick");
   await page.getByRole("button",{name:"Branding",exact:true}).click();
   await page.getByLabel("wall texture",{exact:true}).selectOption("none");
   await page.getByLabel("wallBorder texture",{exact:true}).selectOption("none");
   await page.waitForTimeout(700);
   await page.locator(".city-design-canvas").screenshot({path:"output/playwright/city-native-brick-colour-fixed.png"});
   assert.deepEqual(errors,[]);console.log("Native entrance and brick colour fixture rendered without errors.");await browser.close();process.exit(0);
  }
  if (process.env.CITY_NATIVE_CATALOGUE_AUDIT === "1") {
    page.on("console",m=>{if(m.type()==="error" && /shader|WebGL|GL_INVALID/i.test(m.text()))errors.push(m.text());});
    await page.getByRole("button",{name:/^Glass headquarters /}).click();
    const picker=page.getByLabel("Quaternius facade module",{exact:true});
    const ids=await picker.locator("option").evaluateAll(options=>options.map(o=>o.value));
    assert.equal(ids.length,40);
    assert.equal(await page.getByRole("group",{name:"Quaternius source modules"}).getByRole("button").count(),39);
    for(const id of ids){
      await picker.selectOption(id);
      await page.waitForTimeout(240);
      if(["white-left","white-right","trim-bay","worn-top","brick-clean","worn-inset-wall","brick-classic","brick-inset","brick-bay","metal-bay","marble-triple","worn-triple"].includes(id))
        await page.locator(".city-design-canvas").screenshot({path:`output/playwright/city-module-${id}.png`});
    }
    await picker.selectOption("brick-classic");
    await page.getByRole("button",{name:"Save property draft",exact:true}).click();
    await page.getByText("Draft saved. Verify the website, then submit it for review.",{exact:true}).waitFor();
    assert.equal(business.draft.buildingDesign.nativeFacade,"brick-classic");
    await page.reload();
    await page.waitForFunction(()=>document.querySelector('select[aria-label="Quaternius facade module"]')?.value==="brick-classic");
    assert.equal(await picker.inputValue(),"brick-classic");
    await picker.selectOption("marble-triple");
    await page.getByRole("button",{name:"Undo",exact:true}).click();
    assert.equal(await picker.inputValue(),"brick-classic");
    await page.getByRole("button",{name:"Redo",exact:true}).click();
    assert.equal(await picker.inputValue(),"marble-triple");
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.deepEqual(errors,[]);
    console.log("All 39 native modules, mocked save/reload, undo/redo and mobile layout passed.");
    await browser.close();process.exit(0);
  }
  if (process.env.CITY_TEXTURE_AUDIT === "1") {
    page.on("console",m=>{if(m.type()==="error" && /shader|WebGL|GL_INVALID/i.test(m.text()))errors.push(m.text());});
    await page.getByRole("button",{name:/^Glass headquarters /}).click();
    await page.getByLabel("Building finish",{exact:true}).selectOption("facade");
    await page.getByLabel("Side stairs",{exact:true}).selectOption("concrete");
    await page.getByLabel("Solid side walls with native panels",{exact:true}).check();
    await page.getByRole("button",{name:"Branding",exact:true}).click();
    for(const id of ["brick","plaster","concrete","terracotta","metal","timber","pavers","checker","none"]){
      await page.getByLabel("wall texture",{exact:true}).selectOption(id);
      await page.waitForTimeout(150);
    }
    await page.getByLabel("wall texture",{exact:true}).selectOption("brick");
    await page.getByLabel("wallBorder texture",{exact:true}).selectOption("primary");
    await page.getByLabel("groundBorder texture",{exact:true}).selectOption("concrete");
    await page.getByLabel("roof texture",{exact:true}).selectOption("terracotta");
    await page.getByLabel("ground texture",{exact:true}).selectOption("pavers");
    await page.getByRole("button",{name:"Save property draft",exact:true}).click();
    await page.getByText("Draft saved. Verify the website, then submit it for review.",{exact:true}).waitFor();
    assert.equal(business.draft.buildingDesign.stairExtension,"concrete");
    assert.equal(business.draft.buildingDesign.solidSideWalls,true);
    assert.deepEqual(business.draft.buildingDesign.textures,{wall:"brick",roof:"terracotta",ground:"pavers",wallBorder:"primary",groundBorder:"concrete"});
    await page.reload();
    await page.getByRole("button",{name:"Branding",exact:true}).click();
    assert.equal(await page.getByLabel("wall texture",{exact:true}).inputValue(),"brick");
    assert.equal(await page.getByLabel("groundBorder texture",{exact:true}).inputValue(),"concrete");
    assert.equal(await page.getByLabel("wallBorder texture",{exact:true}).inputValue(),"primary");
    await page.locator(".city-design-canvas").screenshot({path:"output/playwright/city-textures.png"});
    await page.getByLabel("wall texture",{exact:true}).selectOption("none");
    await page.getByLabel("wallBorder texture",{exact:true}).selectOption("none");
    await page.waitForTimeout(1000);
    await page.locator(".city-design-canvas").screenshot({path:"output/playwright/city-native-textures.png"});
    assert.deepEqual(errors,[]);
    console.log("Texture choices, shader compilation and mocked save/reload passed.");await browser.close();process.exit(0);
  }
  if (process.env.CITY_PRESET_THUMBNAILS === "1") {
    const {COMPOSITIONS} = await import("../src/domain/cityBuildingV3.ts");
    const {mkdir, writeFile} = await import("node:fs/promises");
    const sharp = (await import("sharp")).default;
    await mkdir("public/city/presets", {recursive:true});
    await page.getByRole("button", {name:"City camera", exact:true}).click();
    for (const preset of COMPOSITIONS) {
      await page.getByRole("button", {name:new RegExp(`^${preset.name} `)}).click();
      await page.waitForTimeout(250);
      const shot = await page.locator(".city-design-canvas").screenshot();
      await sharp(shot).resize(360,280,{fit:"cover"}).webp({quality:85}).toFile(`public/city/presets/${preset.name.toLowerCase().replaceAll(" ", "-")}.webp`);
    }
    await writeFile("public/city/presets/README.md", "# City preset previews\n\nRendered from the shared City building recipes using the mocked business editor, with a fixed camera and neutral SynArc identity. No AI generation or external asset provider. Regenerate with CITY_PRESET_THUMBNAILS=1 and CITY_TEST_ORIGIN set to the local dev server, then run node --experimental-strip-types scripts/city-design-browser.mjs.\n");
    assert.deepEqual(errors, []);
    console.log(`Rendered ${COMPOSITIONS.length} preset thumbnails.`);
    await browser.close();
    process.exit(0);
  }
  if (process.env.CITY_AD_AUDIT === "1") {
    await page.getByRole("button", {name:/^Glass headquarters /}).click();
    await page.getByRole("button", {name:"Advertising",exact:true}).click();
    await page.getByRole("button", {name:"Preview from city camera",exact:true}).click();
    await page.getByLabel("Large façade · bottom left",{exact:true}).check();
    await page.getByLabel("Fence / entrance edge · bottom right",{exact:true}).check();
    await page.getByLabel("Advert width",{exact:true}).fill("14");
    await page.getByLabel("Advert height",{exact:true}).fill("6");
    assert.ok(!(await page.getByLabel("Large façade · bottom left",{exact:true}).evaluate(el=>el.closest("label").textContent)).includes("Unavailable"));
    await page.waitForTimeout(400);
    await page.getByRole("region",{name:"Live 3D building designer"}).evaluate(el=>el.scrollIntoView({block:"start"}));
    await page.screenshot({path:"output/playwright/city-advertising.png"});
    await page.getByRole("button",{name:"Save property draft",exact:true}).click();
    await page.getByText("Draft saved. Verify the website, then submit it for review.",{exact:true}).waitFor();
    assert.deepEqual(business.draft.buildingDesign.advertising.placements,["facade-left","fence-right"]);
    await page.reload();
    await page.getByRole("button",{name:"Advertising",exact:true}).click();
    assert.ok(await page.getByLabel("Large façade · bottom left",{exact:true}).isChecked());
    await page.getByLabel("Placeholder artwork",{exact:true}).selectOption("text");
    await page.getByRole("button",{name:"Undo",exact:true}).click();
    assert.equal(await page.getByLabel("Placeholder artwork",{exact:true}).inputValue(),"image");
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.deepEqual(errors,[]);
    console.log("Advertising placements, dimensions, mocked save/reload, undo and mobile layout passed.");
    await browser.close();process.exit(0);
  }
  if (process.env.CITY_FACADE_AUDIT === "1") {
    await page.getByRole("button", {name:/^Glass headquarters /}).click();
    await page.getByLabel("Building finish", {exact:true}).selectOption("facade");
    const canvas=page.locator(".city-design-canvas canvas");
    await canvas.scrollIntoViewIfNeeded();
    const bounds=await canvas.boundingBox();
    await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
    for(let i=0;i<10;i++){await page.mouse.wheel(0,-120);await page.waitForTimeout(35);}
    await page.waitForTimeout(400);
    for (const family of ["brick","white-brick","marble","metal"]) {
      await page.getByLabel("Quaternius detail set", {exact:true}).selectOption(family);
      await page.waitForTimeout(600);
      await page.locator(".city-design-canvas").screenshot({path:`output/playwright/city-facade-${family}.png`});
    }
    assert.deepEqual(errors, []);
    console.log("Four native facade families rendered without page errors.");
    await browser.close(); process.exit(0);
  }
  const before = await page.locator(".city-design-canvas").screenshot();
  await page.getByRole("button", { name: "Corner showroom L-shaped footprint", exact: true }).click();
  await page.getByLabel("Floors", { exact: true }).fill("5");
  assert.equal(await page.getByRole("button", { name: "Shape", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Architecture", exact: true }).count(), 0);
  assert.equal(await page.locator(".city-preset-picker").count(), 1);
  assert.equal(await page.getByLabel("Footprint", { exact: true }).count(), 0);
  assert.equal(await page.getByLabel("Floors", { exact: true }).inputValue(), "5");

  await page.getByRole("button", { name: "Presets", exact: true }).click();
  await page.getByRole("button", { name: "Warm brick", exact: true }).click();
  await page.getByLabel("Quaternius detail set", { exact: true }).selectOption("white-brick");
  await page.getByLabel("Detail placement", { exact: true }).selectOption("all");
  await page.getByLabel("Building finish", { exact: true }).selectOption(
    "facade",
  );
  await page.getByRole("button", { name: "Grounds", exact: true }).click();
  await page.getByLabel("Tile styling", { exact: true }).selectOption("checker");
  await page.getByLabel("Boundary and entrance", { exact: true }).selectOption("garden-wall");

  await page.getByRole("button", { name: "Presets", exact: true }).click();
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
  await page.getByRole("button", { name: "Presets", exact: true }).click();
  await page.getByText("Advanced floor stack", { exact: true }).click();
  await page.getByLabel("Middle floors", { exact: true }).fill("3");
  await page.getByLabel("Crown", { exact: true }).selectOption("penthouse");
  await page.getByLabel("Façade rhythm", { exact: true }).selectOption(
    "alternating",
  );
  await page.getByRole("button", { name: "Vary façade", exact: true }).click();
  await page.getByRole("button", { name: "Branding", exact: true }).click();
  await page.getByLabel("Attachment slot", { exact: true }).selectOption(
    "brand.roof",
  );
  await page.getByLabel("Slot component", { exact: true }).selectOption(
    "brand",
  );
  await page.getByRole("button", { name: "Grounds", exact: true }).click();
  await page.getByRole("button", { name: "Vary grounds", exact: true }).click();
  await page.getByLabel("Attachment slot", { exact: true }).selectOption(
    "terrace.left",
  );
  await page.getByLabel("Slot component", { exact: true }).selectOption(
    "planter",
  );
  await page.getByRole("button", { name: "City camera", exact: true }).click();
  await page.getByRole("button", { name: "Select Roof-edge sign", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Attachment slot", { exact: true }).inputValue(),
    "brand.roof",
  );
  await page.screenshot({ path: "output/playwright/city-design-v3-slots.png" });
  await page.getByRole("button", { name: "Save property draft", exact: true })
    .click();
  await page.getByText(
    "Draft saved. Verify the website, then submit it for review.",
    { exact: true },
  ).waitFor();
  assert.equal(saved, 1);
  assert.equal(business.draft.buildingDesign.blueprint, "l-shape");
  assert.equal(business.draft.buildingDesign.enclosure, "garden-wall");
  assert.equal(business.draft.buildingDesign.pavingPattern, "checker");
  assert.equal(business.draft.buildingDesign.detailSet, "white-brick");
  assert.equal(business.draft.buildingDesign.version, 3);
  assert.equal(business.draft.buildingDesign.crown, "penthouse");
  assert.equal(business.draft.buildingDesign.slots["brand.roof"], "brand");
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
  await page.getByRole("button", { name: "01 Fieldwork", exact: true }).click();
  await page.getByRole("complementary", {
    name: "Fieldwork property",
    exact: true,
  }).waitFor();
  // A failed optional pack leaves procedural geometry and editing usable.
  await context.route("**/city/decorators/decorators.glb*", (r) => r.abort());
  await page.goto(`${origin}/city/manage`);
  await page.locator(".city-design-canvas canvas").waitFor();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Presets", exact: true }).click();
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
  await page.locator('.city-design-canvas[data-version="3"]').waitFor();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.locator('.city-design-canvas[data-version="1"]').waitFor();
  const { DEFAULT_DESIGN_V2 } = await import("../src/domain/cityBuildingV2.ts");
  business.draft = { ...profile, buildingDesign: DEFAULT_DESIGN_V2 };
  business.preview = business.draft;
  await page.reload();
  await page.locator('.city-design-canvas[data-version="2"]').waitFor();
  await page.getByRole("button", { name: "Upgrade design", exact: true })
    .click();
  await page.locator('.city-design-canvas[data-version="3"]').waitFor();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.locator('.city-design-canvas[data-version="2"]').waitFor();
  await page.getByRole("button", { name: "Upgrade design", exact: true })
    .click();
  await page.getByRole("button", { name: "Presets", exact: true }).click();
  for (
    const name of [
      "Retail flagship",
      "Glass headquarters",
      "Brick creative studio",
      "Stepped garden office",
      "Courtyard workspace",
      "Corner showroom",
    ]
  ) {
    await page.getByRole("button", { name: new RegExp(`^${name} `) }).click();
    await page.waitForTimeout(80);
  }
  await page.getByRole("button", { name: "Brick creative studio Rectangular footprint", exact: true })
    .click();
  await page.getByRole("button", { name: "Branding", exact: true }).click();
  await page.getByLabel("Attachment slot", { exact: true }).selectOption(
    "brand.roof",
  );
  await page.getByLabel("Slot component", { exact: true }).selectOption(
    "brand",
  );
  await page.getByText(
    "Inactive: A pitched roof does not support this sign. Your selection is retained.",
    { exact: true },
  ).waitFor();
  await page.getByRole("button", { name: "Presets", exact: true }).click();
  await page.screenshot({ path: "output/playwright/city-design-pitched-roof.png" });
  await page.getByLabel("Roof style", { exact: true }).selectOption("flat");
  await page.getByRole("button", { name: "Branding", exact: true }).click();
  assert.equal(
    await page.getByLabel("Slot component", { exact: true }).inputValue(),
    "brand",
  );
  assert.equal(await page.getByText(/Inactive: A pitched roof/).count(), 0);
  await page.getByLabel("Attachment slot", { exact: true }).selectOption(
    "campaign.side",
  );
  await page.getByLabel("Slot component", { exact: true }).selectOption(
    "campaign",
  );
  await page.screenshot({
    path: "output/playwright/city-design-v3-composition.png",
  });
  await page.getByRole("button", { name: "Presets", exact: true }).click();
  await page.getByLabel("Quaternius detail set", { exact: true }).selectOption("metal");
  await page.getByLabel("Detail placement", { exact: true }).selectOption("crown");
  await page.getByRole("button", { name: "Grounds", exact: true }).click();
  for (const style of ["terracotta", "basalt", "ribbon"]) await page.getByLabel("Tile styling", { exact: true }).selectOption(style);
  for (const boundary of ["brick-court", "open-rail"]) await page.getByLabel("Boundary and entrance", { exact: true }).selectOption(boundary);
  await page.screenshot({ path: "output/playwright/city-design-grounds-presets.png" });
  await page.getByRole("button", { name: "Presets", exact: true }).click();
  if (await page.getByRole("button", {name:"Attachment slots", exact:true}).getAttribute("aria-pressed") === "true") await page.getByRole("button", {name:"Attachment slots", exact:true}).click();
  for (const name of ["Terrace cafe", "Gabled cafe", "Village shop", "Canopy kiosk", "Gabled kiosk", "City museum", "Boutique hotel", "Civic bank"]) {
    await page.getByRole("button", { name: new RegExp(`^${name} `) }).click();
    await page.waitForTimeout(80);
    if (["Gabled cafe", "Canopy kiosk", "City museum"].includes(name)) await page.locator(".city-design-canvas").screenshot({path:`output/playwright/city-preset-${name.toLowerCase().replaceAll(" ", "-")}.png`});
  }
  await page.getByLabel("Footprint depth", { exact: true }).fill("18");
  await page.getByText(/Inactive: This entrance needs/).waitFor();
  await page.getByLabel("Footprint depth", { exact: true }).fill("12");
  assert.equal(await page.getByText(/Inactive: This entrance needs/).count(), 0);
  await page.screenshot({ path: "output/playwright/city-design-bank.png" });
  await page.getByLabel("Building type", {exact:true}).selectOption("Civic");
  assert.equal(await page.locator(".city-preset-picker button").count(), 2);
  await page.getByRole("button", {name:/^City museum /}).click();
  await page.getByLabel("Roof style", {exact:true}).selectOption("sawtooth");
  await page.screenshot({path:"output/playwright/city-design-museum-sawtooth.png"});
  const loaded = await page.locator(".city-preset-render").evaluateAll(images => images.every(i => i.complete && i.naturalWidth > 0));
  assert.ok(loaded, "Rendered preset previews should load");
  await page.getByLabel("Building type", {exact:true}).selectOption("All");
  assert.deepEqual(errors, []);
  console.log(
    "3D designer: live presets, geometry changes, blueprint, save/reload, mobile and city rendering passed (mock API).",
  );
} finally {
  await browser.close();
}
