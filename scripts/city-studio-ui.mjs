// Shared helpers for studio browser suites on the v2 UI (docs/city-studio-ui-v2.md): opening a seeded test plot,
// reading telemetry and driving the rail, brush and inspector by their accessible names.
export const origin=()=>process.env.CITY_TEST_ORIGIN||'http://127.0.0.1:5173';
export const studioUrl=(extra='')=>`${origin()}/city?demo=1&cityStudio=1&cityStudioTest=1${process.env.CITY_BACKEND==='webgl'?'&cityBackend=webgl':''}${extra}`;
export const studioState=page=>page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.cityStudio||'{}'));
export const savedSculpt=page=>page.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('city-land-v1-'));return JSON.parse(localStorage.getItem(k)).plots.find(p=>p.owner).draft.sculpt;});
/** Waits until the canvas telemetry reports `key` = `value`. The studio overlay is a separate React root, so its
 * clicks reach the scene a tick later; a test that clicks the canvas straight after a panel button waits here. */
export const telemetryIs=(page,key,value)=>page.waitForFunction(([k,v])=>JSON.stringify(JSON.parse(document.querySelector('canvas')?.dataset.cityStudio||'{}')[k])===JSON.stringify(v),[key,value],{timeout:10000});
const RAIL_IDS={Select:'select',Build:'build',Paint:'paint',Erase:'erase',Roof:'roof',Garden:'garden',Rooms:'rooms',Furnish:'furnish'};
const TARGET_IDS={Material:'material',Openings:'openings',Storefronts:'storefronts',Trims:'trims',Decorations:'decor','Roof details':'roof'};
/** Picks a rail tool by clicking it (the rail is the "Building tools" navigation). */
export async function rail(page,name){await page.getByRole('navigation',{name:'Building tools'}).getByRole('button',{name,exact:true}).click();await telemetryIs(page,'rail',RAIL_IDS[name]);}
/** Paint (or Erase) with a brush target: Material, Openings, Storefronts, Trims, Decorations, Roof details. */
export async function brush(page,target,{erase=false}={}){await rail(page,erase?'Erase':'Paint');await page.getByRole('group',{name:'Brush target'}).getByRole('button',{name:target,exact:true}).click();await telemetryIs(page,'target',TARGET_IDS[target]);}
/** Picks a brush size and waits for it to take (a click that lands during a re-render is retried once). */
export async function brushSize(page,name){const b=page.getByRole('group',{name:'Brush size'}).getByRole('button',{name,exact:true});for(let i=0;i<2;i++){await b.click();try{await page.waitForFunction(el=>el.getAttribute('aria-pressed')==='true',await b.elementHandle(),{timeout:2000});return;}catch{/* retry */}}throw Error(`Brush size ${name} did not take`);}
/** Opening type group inside Paint → Openings: Freeform, Windows, Doors, Walls. */
export async function openings(page,group){await brush(page,'Openings');await page.getByRole('group',{name:'Opening type'}).getByRole('button',{name:group,exact:true}).click();}
/** Select tool at a granularity: part, wall, tile, opening, object. */
export async function selectLevel(page,level){await rail(page,'Select');await page.getByRole('radiogroup',{name:'Select level'}).getByRole('radio',{name:`Select ${level}s`}).click();await telemetryIs(page,'level',level);}
export const inspector=page=>page.getByRole('complementary',{name:'Inspector'});
/** Steps the inspector breadcrumb back to the building (clears the selection). */
export async function inspectBuilding(page){await rail(page,'Select');await page.getByRole('navigation',{name:'Selection path'}).getByRole('button',{name:'Building',exact:true}).click();}
/** Opens the Facade rhythm section of the inspector (was Openings → Rhythm). */
export async function openRhythm(page){const t=inspector(page).getByRole('button',{name:'Rhythm',exact:true});if(await t.getAttribute('aria-expanded')!=='true')await t.click();}
/** True when a screen point lands on the canvas rather than a panel. */
export const onCanvas=(page,x,y)=>page.evaluate(([x,y])=>document.elementFromPoint(x,y)?.tagName==='CANVAS',[x,y]);
/** Bays from telemetry that are visible on the canvas (not hidden behind panels). */
export async function visibleBays(page,filter=()=>true){const out=[];for(const b of ((await studioState(page)).bays??[]).filter(filter))if(await onCanvas(page,b.x,b.y))out.push(b);return out;}
