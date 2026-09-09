export async function acceptActionGame(page, reports, design) {
  for (const p of design.mechanics?.actions ?? []) {
    try {
      await page.locator('#restart').click()
      await page.locator('canvas').focus()
      await page.waitForFunction(()=>{const s=window.__gameAcceptance.state();return s.actors.find(a=>a.id===s.player).mode==='ground'})
      const before=await page.evaluate(()=>window.__gameAcceptance.state())
      if(p.capability==='combo'){
        await page.keyboard.press('f')
        for(let i=0;i<2;i++){
          const strike=p.strikes[i]
          const threshold=Math.round(strike.windup*60)+Math.round(strike.active*60)
          await page.waitForFunction(({i,threshold})=>{
            const s=window.__gameAcceptance.state(),a=s.actors.find(a=>a.id===s.player)
            return a.action?.ability===`runtime.combo.${i}`&&a.action.tick>=threshold
          },{i,threshold},{timeout:4000})
          await page.keyboard.press('f')
        }
        await page.waitForFunction(()=>window.__gameAcceptance.state().events.some(e=>e.type==='release'&&e.detail==='runtime.combo.2'),undefined,{timeout:4000})
      }else{
        await page.keyboard.press('q')
        await page.waitForFunction(()=>window.__gameAcceptance.state().events.some(e=>e.type==='action_stage'&&e.detail==='dash:1'),undefined,{timeout:4000})
      }
      await page.waitForFunction(()=>{const s=window.__gameAcceptance.state(),a=s.actors.find(a=>a.id===s.player);return !a.action&&a.mode==='ground'},undefined,{timeout:5000})
      const after=await page.evaluate(()=>window.__gameAcceptance.state()),a=after.actors.find(a=>a.id===after.player),b=before.actors.find(a=>a.id===before.player)
      if(p.capability==='dash'&&(a.shieldUntil!==b.shieldUntil||Math.hypot(a.position.x-b.position.x,a.position.z-b.position.z)>p.distance+.1))throw Error('Dash exceeded movement/protection contract')
      reports.push({nodeKey:`action.${p.capability}.keyboard`,passed:true})
    }catch(error){reports.push({nodeKey:`action.${p.capability}.keyboard`,passed:false,message:String(error)})}
  }
}
