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
const coords=Array.from({length:20},(_,i)=>i<10?i-10:i-9);
const fixturePlots=coords.flatMap(x=>coords.map(z=>({x,z}))).sort((a,b)=>a.x*a.x+a.z*a.z-b.x*b.x-b.z*b.z).map((p,i)=>({...property,...p,id:i===0?businessId:`aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12,'0')}`,rank:i+1,tier:i===0?5:1,slug:'fixture-'+i,profile:{...profile,name:'Fixture '+i},landValue:i===0?1000000:100}));
const actions=[],errors=[];let claims=[],saved=[],reminders=[],followed=[],read=false;
const launchId="66666666-6666-4666-8666-666666666666";
const launchItem={...item,key:"launch:"+launchId,kind:"launch",content_id:launchId,title:"Creator launch",destination:"/city/launches/creator-launch",remaining:null,free:false,exclusive:false};
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.routeWebSocket('**/realtime/**',()=>{});
 await context.route('**/auth/v1/**',r=>r.fulfill({json:r.request().url().includes('/user')?user:session}));
 await context.route('**/functions/v1/city-*',async route=>{
  const i=route.request().postDataJSON();actions.push(i);const reply=json=>route.fulfill({json});
  switch(i.action){
   case 'snapshot':return reply({revision:1,capacity:400,total:400,properties:fixturePlots,events:[],discoveryEnabled:true,campusEnabled:true,dealsEnabled:true,customerDiscoveryEnabled:true,storefrontsEnabled:true,activityEnabled:true});
   case 'customer_city_state':return reply({states:i.ids.map(id=>({businessId:id,kind:'quiet',band:id===businessId?'quiet':'very_busy',primary:null,windowStart:new Date(Date.now()-172800000).toISOString(),measuredAt:new Date().toISOString(),expiresAt:new Date(Date.now()+300000).toISOString(),version:1}))});
   case 'customer_inbox':return reply({items:reminders.length?[{key:'reminder:fixture',title:'Creator launch',business_name:'Campus Studio',destination:launchItem.destination,kind:'launch_reminder',at:new Date().toISOString(),read_at:read?new Date().toISOString():null}]:[],unread:reminders.length&&!read?1:0,total:reminders.length,reminders,follows:followed});
   case 'customer_reminder':reminders=i.enabled?[i.launchId]:[];return reply({ok:true});
   case 'customer_inbox_read':read=true;return reply({ok:true});
   case 'customer_resolve_launch':return reply(launchItem);
   case 'discovery_follow':followed=i.enabled?[i.businessId]:[];return reply({ok:true});
   case 'customer_nearby':return reply({items:[item]});
   case 'customer_destination':return reply({items:[item]});
   case 'customer_search':return reply({items:i.filter==='drops'?[launchItem]:(!i.query||'free editor trial'.includes(i.query))?[item]:[],hasMore:false,categories:['Creators'],now:new Date().toISOString(),revision:1});
   case 'customer_activity':return reply({items:[{key:item.key,label:'Campus Studio: Free editor trial · 10 codes available',destination:item.destination}]});
   case 'customer_resolve':return reply(item);
   case 'customer_wallet':return reply({active:claims.length,saved,reminders:[]});
   case 'customer_merge':saved=[item];return reply({merged:i.items.map(v=>v.id)});
   case 'customer_save':saved=i.saved?[item]:[];return reply({ok:true});
   case 'deal_catalog':return reply({enabled:true,deals:[deal]});
   case 'deal_wallet':return reply({enabled:true,claims,hasMore:false});
   case 'deal_claim':if(!claims.length){claims=[{id:'receipt',deal_id:dealId,terms,code:'UNIQUE-FIXTURE-CODE',business_name:'Campus Studio',created_at:new Date().toISOString(),redeemed_at:null,cancelled:false}];deal.issued=1;}return reply(claims[0]);
   case 'workspace':return reply({business:null,orders:[],saved:[],claims:[],analytics:{},history:[],admin:false});
   case 'discovery_catalog':return reply({storefronts:[],entries:[],follows:followed,savedLaunches:[],progress:[]});
   default:return reply({ok:true});
  }
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/city');await page.locator('canvas').waitFor();
 await page.waitForFunction(()=>Number(JSON.parse(document.querySelector('canvas')?.dataset.cityStreetStats||'{}').figures)>0);
 const street=await page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.cityStreetStats));assert.ok(street.figures<=96);
 await page.waitForFunction(()=>!!document.querySelector('canvas')?.dataset.cityRenderStats);
 const render=await page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.cityRenderStats||'{}'));
 await page.screenshot({path:'output/playwright/city-living-400.png'});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(1500);
 const mobile=await page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.cityStreetStats));assert.ok(mobile.figures<=48);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,fixtureProperties:400,desktop:street,mobile,render,physicalDevice:false}));
}finally{await browser.close();}
