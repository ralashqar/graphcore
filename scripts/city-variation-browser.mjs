import { chromium } from "playwright";
import assert from "node:assert/strict";
const origin = process.env.CITY_TEST_ORIGIN || "http://127.0.0.1:5188",
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
if(process.env.CITY_KIT_AUDIT === "1"){
 const {newDesign,normalizeV3}=await import("../src/domain/cityBuildingV3.ts");
 profile.buildingDesign=normalizeV3({...newDesign("kit-browser"),blueprint:"office",width:14,depth:10,middleFloors:1,crown:"none",finish:"facade",nativeFacade:"brick-classic",architecturalKit:{corners:"matching",roofline:"classical",entrance:"wood",frontage:"cafe",roof:"slate-dormers",connectedPlanters:true,stairRails:true,ornaments:true},textures:{wall:"none",wallBorder:"none"},stairExtension:"concrete"});
}
if(process.env.CITY_ENTRANCE_AUDIT === "1"){
 const {demoBuildingDesign}=await import("../src/domain/cityDemoDesign.ts");
 business.draft={...profile,buildingDesign:demoBuildingDesign(63,"#c6a262")};business.preview=business.draft;
}
if(process.env.CITY_FIRE_ESCAPE_AUDIT === "1") {
 const {newDesign,normalizeV3}=await import("../src/domain/cityBuildingV3.ts");
 profile.buildingDesign=normalizeV3({...newDesign("escape-browser"),blueprint:"terraces",width:16,depth:12,podium:true,crown:"recessed",middleFloors:3,finish:"facade",slots:{},solidSideWalls:true});
 business.draft=structuredClone(profile);business.published=structuredClone(profile);
}
if(process.env.CITY_TRIM_AUDIT === "1") {
 const {newDesign,normalizeV3}=await import("../src/domain/cityBuildingV3.ts");
 profile.buildingDesign=normalizeV3({...newDesign("solid-trim"),blueprint:"office",width:14,depth:10,podium:false,crown:"none",middleFloors:2,architecture:"glass",detailSet:"metal",finish:"facade",slots:{},architecturalKit:{corners:"matching",roofline:"industrial"}});
 business.draft=profile;business.preview=profile;
}
const errors = [];
const browser = await chromium.launch({
  channel:'msedge',
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
  if(process.env.CITY_LIGHTING_AUDIT === "1" || process.env.CITY_AO_AUDIT === "1") page.on("console",m=>{if(m.type()==="error" && !(process.env.CITY_RENDERER_RECOVERY==="1" && /WebGPU Device Lost/.test(m.text())) && /shader|WebGL|WebGPU|GPUValidation|GL_INVALID/i.test(m.text())){errors.push(m.text());console.error(m.text());}});
  await page.goto(`${origin}/city/manage${process.env.CITY_BACKEND==="webgl"?"?cityBackend=webgl":""}`);
  await page.getByRole("region", { name: "Live 3D building designer" })
    .waitFor();
  await page.locator(".city-design-canvas canvas").waitFor();
  await page.waitForTimeout(800);

  await page.getByRole('button',{name:'Variations',exact:true}).click();
  await page.getByLabel('Variation building template').selectOption('8');
  await page.getByRole('region',{name:'Building variations',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('.city-design-canvas canvas')?.dataset.cityStudioKit==='ready',null,{timeout:90000});
  assert.equal(await page.locator('.city-design-canvas canvas').getAttribute('data-city-backend'),process.env.CITY_BACKEND==='webgl'?'webgl2':'webgpu');
  await page.getByRole('button',{name:'Shuffle ground floor',exact:true}).click();
  await page.getByRole('button',{name:'Advanced rules',exact:true}).click();
  await page.getByLabel('Tile spacing',{exact:true}).fill('1');
  await page.getByRole('button',{name:'Add floor rule',exact:true}).click();
  assert.equal(await page.getByLabel('Variation target').locator('option').count(),2);
  await page.getByLabel('Tile coverage',{exact:true}).fill('0.5');
  await page.getByLabel('Variation target').selectOption('building');
  await page.getByLabel('upperHeight',{exact:true}).fill('4');
  await page.getByRole('button',{name:'Save property draft',exact:true}).click();
  await page.getByText('Draft saved. Verify the website, then submit it for review.',{exact:true}).waitFor();
  assert.equal(saved,1);assert.equal(business.draft.buildingDesign.generatorRevision,'city-variation-5');assert.equal(business.draft.buildingDesign.upperHeight,4);
  const intended=structuredClone(business.draft.buildingDesign);
  await page.locator('.city-building-workbench').scrollIntoViewIfNeeded();
  await page.locator('.city-building-workbench').screenshot({path:`output/playwright/city-variation-business-${process.env.CITY_BACKEND||'native'}.png`});
  await page.reload();await page.getByRole('button',{name:'Variations',exact:true}).click();
  await page.getByRole('region',{name:'Building variations',exact:true}).waitFor();
  assert.equal(await page.getByLabel('upperHeight',{exact:true}).inputValue(),'4');
  await page.getByRole('button',{name:'Shuffle ground floor',exact:true}).click();await page.getByRole('button',{name:'Undo',exact:true}).click();
  await page.getByRole('button',{name:'Save property draft',exact:true}).click();await page.getByText('Draft saved. Verify the website, then submit it for review.',{exact:true}).waitFor();
  assert.deepEqual(business.draft.buildingDesign,intended);
  await page.getByText('My presets · import / export',{exact:true}).click();
  await page.getByRole('button',{name:'Save preset locally',exact:true}).click();
  assert.ok(await page.evaluate(()=>localStorage.getItem('city-variation-presets-1')));
  const upload=page.getByLabel('Import JSON',{exact:true});
  await upload.setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,recipe:{...intended.modular.recipe,unexpected:true}}))});
  await page.getByRole('alert').filter({hasText:'Invalid'}).waitFor();
  await upload.setInputFiles({name:'building.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,recipe:intended.modular.recipe,groundHeight:intended.groundHeight,upperHeight:intended.upperHeight}))});
  await page.waitForFunction(()=>!document.querySelector('.city-variation [role=alert]'));
  await page.setViewportSize({width:390,height:844});const box=await page.getByRole('region',{name:'Building variations',exact:true}).boundingBox();assert.ok(box.x>=0&&box.x+box.width<=392);
  assert.deepEqual(errors,[]);console.log('Business variation template, pools, scope, dimensions, undo, mocked save/reload and mobile layout passed.');
}finally{await browser.close();}
