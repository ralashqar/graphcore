// Browser contract test against an in-memory API fixture. No live account, payment or email is created.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const origin = process.env.CITY_TEST_ORIGIN || "http://127.0.0.1:5188";
const userId = "11111111-1111-4111-8111-111111111111",
  businessId = "44444444-4444-4444-8444-444444444444";
const jwt = `${
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
const user = {
  id: userId,
  aud: "authenticated",
  role: "authenticated",
  email: "fixture@example.com",
  app_metadata: {},
  user_metadata: {},
  created_at: new Date().toISOString(),
};
const session = {
  access_token: jwt,
  refresh_token: "fixture-refresh",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user,
};
const profile = {
  name: "Campus Studio",
  website: "https://example.com/",
  tagline: "Try the possibilities",
  description: "Tools for creators",
  category: "Creators",
  color: "#547364",
  logo: "",
  hero: "",
  video: "",
  offer: { title: "", description: "", code: "", expiresAt: null, url: "" },
};

const dealId='55555555-5555-4555-8555-555555555555';
const terms={title:'Free editor trial',description:'Try the editor free, with a card required. Cancel before renewal.',kind:'trial_access',value:0,currency:'GBP',minimumSpend:0,maximumDiscount:null,destination:'https://example.com',startsAt:new Date(Date.now()-10000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString(),redeemBy:null,exclusive:true,merchantExpiryConfirmed:false,freeConfirmed:true,cardRequired:true,renewalTerms:'Renews at 10 GBP monthly'};
const deal={id:dealId,business_id:businessId,terms,status:'approved',paused:false,ended:false,quantity:10,issued:0,version:1};
const item={key:'deal:'+dealId,business_id:businessId,slug:'campus-studio',business_name:'Campus Studio',category:'Creators',kind:'deal',content_id:dealId,title:terms.title,description:terms.description,destination:'/city/deal/'+dealId,rank:1,x:1,z:1,created_at:new Date().toISOString(),starts_at:terms.startsAt,ends_at:terms.endsAt,remaining:10,free:true,exclusive:true,available:true,trending:false};
const property={id:businessId,slug:'campus-studio',profile,rank:1,x:1,z:1,tier:1,landValue:10000,saves:0,claims:0};
const actions=[],errors=[];let claims=[],saved=[];
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.routeWebSocket('**/realtime/**',()=>{});
 await context.route('**/auth/v1/**',r=>r.fulfill({json:r.request().url().includes('/user')?user:session}));
 await context.route('**/functions/v1/city-*',async route=>{
  const i=route.request().postDataJSON();actions.push(i);const reply=json=>route.fulfill({json});
  switch(i.action){
   case 'snapshot':return reply({revision:1,capacity:400,total:1,properties:[property],events:[],discoveryEnabled:true,campusEnabled:true,dealsEnabled:true,customerDiscoveryEnabled:true});
   case 'customer_nearby':return reply({items:[item]});
   case 'customer_destination':return reply({items:[item]});
   case 'customer_search':return reply({items:(!i.query||'free editor trial'.includes(i.query))?[item]:[],hasMore:false,categories:['Creators'],now:new Date().toISOString(),revision:1});
   case 'customer_activity':return reply({items:[{key:item.key,label:'Campus Studio: Free editor trial · 10 codes available',destination:item.destination}]});
   case 'customer_resolve':return reply(item);
   case 'customer_wallet':return reply({active:claims.length,saved,reminders:[]});
   case 'customer_merge':saved=[item];return reply({merged:i.items.map(v=>v.id)});
   case 'customer_save':saved=i.saved?[item]:[];return reply({ok:true});
   case 'deal_catalog':return reply({enabled:true,deals:[deal]});
   case 'deal_wallet':return reply({enabled:true,claims,hasMore:false});
   case 'deal_claim':if(!claims.length){claims=[{id:'receipt',deal_id:dealId,terms,code:'UNIQUE-FIXTURE-CODE',business_name:'Campus Studio',created_at:new Date().toISOString(),redeemed_at:null,cancelled:false}];deal.issued=1;}return reply(claims[0]);
   case 'workspace':return reply({business:null,orders:[],saved:[],claims:[],analytics:{},history:[],admin:false});
   case 'discovery_catalog':return reply({storefronts:[],entries:[],follows:[],savedLaunches:[],progress:[]});
   default:return reply({ok:true});
  }
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const started=Date.now();await page.goto(origin+'/city');
 await page.getByRole('heading',{name:'Discover what’s happening here.'}).waitFor();
 const usefulContentMs=Date.now()-started;
 await page.getByRole('button',{name:'Save deal',exact:true}).click();
 assert.equal(actions.filter(a=>a.action==='deal_claim').length,0);
 await page.getByRole('button',{name:'My deals, 0 active'}).click();
 await page.getByRole('heading',{name:'Saved · this device'}).waitFor();
 await page.getByRole('button',{name:'Close wallet',exact:true}).click();
 await page.getByRole('button',{name:'Hot now',exact:true}).click();
 await page.getByRole('heading',{name:'New discoveries',exact:true}).waitFor();
 await page.getByRole('button',{name:'Freebies',exact:true}).click();
 await page.getByRole('button',{name:/Free editor trial.*Campus Studio|Free.*Campus Studio.*Free editor trial/}).first().click();
 await page.waitForURL(url=>url.pathname==='/city/deal/'+dealId);
 await page.getByRole('button',{name:'Sign in to claim',exact:true}).click();
 await page.getByLabel('Email', {exact:true}).fill('fixture@example.com');
 await page.getByLabel('Password',{exact:true}).fill('test-password');
 await page.getByRole('dialog').getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('button',{name:'Claim unique code',exact:true}).waitFor();
 assert.equal(actions.filter(a=>a.action==='deal_claim').length,0,'sign-in must not auto-claim');
 await page.getByRole('button',{name:'Claim unique code',exact:true}).click();
 await page.getByText('UNIQUE-FIXTURE-CODE',{exact:true}).waitFor();
 await page.getByRole('button',{name:'My deals, 1 active'}).waitFor();
 assert.ok(actions.some(a=>a.action==='customer_merge'),'guest save merged');
 await mkdir('output/playwright',{recursive:true});
 await page.waitForTimeout(2500);
 const labelBox=await page.locator('.city-map-label.is-selected').boundingBox();
 const searchBox=await page.locator('.city-discovery').boundingBox();
 const dealBox=await page.locator('.city-linked-deal').boundingBox();
 assert.ok(labelBox && searchBox && dealBox && labelBox.x>searchBox.x+searchBox.width && labelBox.x+labelBox.width<dealBox.x,'selected building framed between panels');
 await page.screenshot({path:'output/playwright/city-customer-desktop.png'});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'no mobile horizontal overflow');
 await page.screenshot({path:'output/playwright/city-customer-mobile.png'});
 await page.getByRole('button',{name:'My deals, 1 active'}).click();
 await page.getByRole('heading',{name:'Active',exact:true}).waitFor();
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('dialog[open]').count(),0);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,usefulContentMs,checks:'guest saves, organic cold start, filters, deal deep link, explicit claim after login, wallet, mobile overflow, dialog escape, runtime'}));
}finally{await browser.close();}
