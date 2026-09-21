import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const origin=process.env.CITY_TEST_ORIGIN||'http://localhost:5183';
const browser=await chromium.launch({headless:true});
try {
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.routeWebSocket('**/realtime/**',()=>{});
 await context.route('**/functions/v1/city-*',r=>r.fulfill({json:{revision:1,capacity:400,total:0,properties:[],events:[],business:null,orders:[],saved:[],claims:[],analytics:{},history:[]}}));
 let authorization;
 await context.route('**/auth/v1/authorize?**',r=>{authorization=new URL(r.request().url());return r.fulfill({contentType:'text/html',body:'Google OAuth handoff fixture'});});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const destination='/city/manage?source=city';
 await page.goto(origin+destination);
 await page.getByRole('button',{name:'Sign in',exact:true}).first().click();
 const google=page.getByRole('button',{name:'Continue with Google',exact:true});await google.waitFor();
 await page.screenshot({path:'output/playwright/city-google-sign-in-mobile.png'});
 await google.click();await page.getByText('Google OAuth handoff fixture').waitFor();
 assert.equal(authorization.searchParams.get('provider'),'google');assert.equal(authorization.searchParams.get('redirect_to'),origin+destination);assert.equal(authorization.searchParams.get('scopes'),'email profile');
 // Exercise the shared callback/session bootstrap without interacting with a real account.
 const uid='11111111-1111-4111-8111-111111111111';const user={id:uid,aud:'authenticated',role:'authenticated',email:'fixture@example.com',app_metadata:{provider:'google'},user_metadata:{},created_at:new Date().toISOString()};
 const token=`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.fixture`;
 await context.route('**/auth/v1/user',r=>r.fulfill({json:user}));
 await page.goto(origin+destination+`#access_token=${token}&refresh_token=fixture&type=signup`);
 await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();assert.equal(new URL(page.url()).hash,'');assert.equal(new URL(page.url()).pathname,'/city/manage');assert.equal(new URL(page.url()).search,'?source=city');
 // Failure remains visible and allows another attempt. Same-origin redirect enforcement.
 await page.evaluate(async()=>{const {supabase}=await import('/src/utils/supabase.ts');await supabase.auth.signOut({scope:'local'});supabase.auth.signInWithOAuth=async()=>({data:{},error:new Error('Google could not be opened. Please try again.')});});
 await page.getByRole('button',{name:'Sign in',exact:true}).first().click();await page.getByRole('button',{name:'Continue with Google',exact:true}).click();await page.getByText('Google could not be opened. Please try again.').waitFor();assert.ok(await page.getByRole('button',{name:'Continue with Google',exact:true}).isEnabled());
 const blocked=await page.evaluate(async()=>{const {signInWithOAuthProvider}=await import('/src/data/auth.ts');try{await signInWithOAuthProvider('google','https://untrusted.invalid');return false;}catch(e){return e.message==='Sign-in must return to SynArc.';}});assert.equal(blocked,true);
 assert.deepEqual(errors,[]);console.log('City Google sign-in: mobile button, provider handoff, return URL, callback session, failure/retry and redirect restriction passed (mock OAuth).');
}finally{await browser.close();}
