import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const origin=process.env.CITY_TEST_ORIGIN||'http://localhost:5183',userId='11111111-1111-4111-8111-111111111111',businessId='44444444-4444-4444-8444-444444444444';
const user={id:userId,aud:'authenticated',role:'authenticated',email:'fixture@example.com',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
const token=`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:userId,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.fixture`;
const session={access_token:token,refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user};
const profile={name:'Fieldwork',description:'Design tools for independent studios',tagline:'Make room',website:'https://example.com',category:'Apps',color:'#335577',logo:'',hero:'',video:'',offer:{title:'',description:'',code:'',expiresAt:null,url:''}};
const business={id:businessId,slug:'fieldwork',draft:profile,published:null,draft_version:1,status:'draft',verified_at:null,verification_token:businessId,review_note:null,land_value:1000,preview:profile};
let jobs=[],calls=[];const errors=[];
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
try {
 const context=await browser.newContext({viewport:{width:1440,height:960}});await context.routeWebSocket('**/realtime/**',()=>{});
 await context.addInitScript(s=>localStorage.setItem('sb-znwdatidqdkzidempvkt-auth-token',JSON.stringify(s)),session);
 await context.route('**/auth/v1/**',r=>r.fulfill({json:r.request().url().includes('/user')?user:session}));
 await context.route('**/functions/v1/city-*',async r=>{const p=r.request().postDataJSON(),url=r.request().url();const reply=json=>r.fulfill({json});
  if(url.endsWith('city-building-art')) {
   if(p.action==='generate'){assert.equal(p.model,'nano');assert.equal(p.direction,'A creative studio with a welcoming entrance');assert.equal(p.prompt,undefined);calls.push(p);jobs=[{id:p.jobId,status:'completed',preview:`${origin}/output/playwright/city-art-validated.png`,error:null,phase:'completed',credits:10,version:1,createdAt:new Date().toISOString()}];}
   if(p.action==='apply'){calls.push(p);business.draft={...business.draft,buildingArt:`${userId}/${p.jobId}.png`};business.preview={...business.draft,buildingArt:jobs[0].preview};business.draft_version++;}
   return reply({enabled:true,prices:{nano:10,gpt:20},jobs});
  }
  if(url.endsWith('city-api')&&p.action==='workspace')return reply({business,orders:[],saved:[],claims:[],analytics:{},history:[],admin:false});
  if(url.endsWith('city-api'))return reply({revision:1,capacity:400,total:business.published?1:0,properties:business.published?[{id:businessId,slug:'fieldwork',profile:business.preview,rank:1,landValue:1000,tier:0,x:-1,z:-1,saves:0,claims:0}]:[],events:[],onboardingEnabled:true,purchasesEnabled:false});
  return reply({ok:true});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto(`${origin}/city/manage`);
 await page.getByRole('heading',{name:'A place that looks like your business'}).waitFor();
 await page.getByLabel('Business direction',{exact:true}).fill('A creative studio with a welcoming entrance');
 await page.getByRole('button',{name:'Generate building · 10 credits',exact:true}).click();
 await page.getByAltText('Generated building for Fieldwork',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Use in property draft',exact:true}).click();
 await page.getByAltText('Fieldwork building preview',{exact:true}).waitFor();assert.equal(business.published,null);assert.equal(calls.length,2);assert.equal(calls[1].jobId,calls[0].jobId);
 await page.getByRole('region',{name:'Building artwork'}).scrollIntoViewIfNeeded();await page.screenshot({path:'output/playwright/city-art-editor.png'});
 await page.reload();await page.getByAltText('Fieldwork building preview',{exact:true}).waitFor();await page.setViewportSize({width:390,height:844});await page.getByRole('region',{name:'Building artwork'}).scrollIntoViewIfNeeded();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:'output/playwright/city-art-editor-mobile.png'});
 business.published=business.draft;await page.setViewportSize({width:1440,height:960});await page.goto(`${origin}/city`);await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.cityCamera);await page.waitForTimeout(1600);await page.screenshot({path:'output/playwright/city-art-map.png'});await page.mouse.click(886,520);await page.getByRole('complementary',{name:'Fieldwork property',exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log('City art browser: business input, generation, preview, draft apply, reload and mobile passed (mock API, no paid inference).');
} finally {await browser.close();}
