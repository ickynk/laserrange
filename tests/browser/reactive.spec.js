import {test,expect} from '@playwright/test';
test('Reactive editor settings persist while custom image targets remain available',async({page})=>{
 await page.goto('/');await page.locator('#addTarget').click();
 await page.locator('#targetAsset').selectOption('can-stack');
 await expect(page.locator('#reactiveProperties')).toBeVisible();
 await page.locator('#stackRows').fill('4');await page.locator('#stackRows').blur();
 await page.locator('#reactiveElevation').fill('.5');await page.locator('#reactiveElevation').blur();
 await page.locator('#impactStrength').fill('1.4');await page.locator('#impactStrength').blur();
 await expect(page.locator('#targetPath')).toBeDisabled();await page.locator('#save').click();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('laser-range.scenario.v1')));
 expect(saved.targets.at(-1)).toMatchObject({asset:'can-stack',stackRows:4,elevation:.5,impactStrength:1.4,path:[]});
 await page.reload();await page.locator('#load').click();await page.locator('#objects').selectOption(saved.targets.at(-1).id);
 await expect(page.locator('#stackRows')).toHaveValue('4');
 await page.locator('#targetAsset').selectOption('cardboard');await expect(page.locator('#reactiveProperties')).toBeHidden();
 await expect(page.locator('#targetPath')).toBeEnabled();
});
test('All reactive models render; support hits miss, falling and broken targets stop scoring, history restores',async({page})=>{
 await page.goto('/');
 const results=await page.evaluate(async()=>{
  const {RangeScene}=await import('/range.js'),THREE=await import('/vendor/three/build/three.module.js');
  const {defaultScenario}=await import('/core/scenario.js');const {reactiveDefaults}=await import('/core/reactive-types.js');
  const range=new RangeScene(document.createElement('canvas'));range.resize(960,540);const out=[];
  for(const asset of Object.keys(reactiveDefaults)){
   const s=defaultScenario();s.barriers=[];s.targets=[{...s.targets[0],id:'toy',kind:'shoot',x:0,z:-4,asset,width:reactiveDefaults[asset][0],height:reactiveDefaults[asset][1],path:[]}];range.setScenario(s);range.render(1,1);
   const part=range.physics.parts.find(p=>p.score&&p.active);const pt=new THREE.Vector3().copy(part.body.position).project(range.camera),x=(pt.x+1)/2,y=(1-pt.y)/2;
   const shot=range.score(x,y,1,1);range.react(shot.reaction);if(shot.impact)range.addImpact(shot.impact);range.render(1,3);
   const after=range.score(x,y,1,3);const past=range.score(x,y,1,.5);
   out.push({asset,first:shot.result,after:after.result,past:past.result,clock:range.physicsTime});
   if(asset==='dueling-tree'){
    const stand=range.physics.parts.find(p=>p.name==='base'),v=new THREE.Vector3().copy(stand.body.position).project(range.camera);
    out.push({asset:'stand',first:range.score((v.x+1)/2,(1-v.y)/2,1,3).result});
    const paddle=range.physics.parts.find(p=>p.name==='paddle-2');
    const arm=new THREE.Vector3(.1,paddle.body.position.y,0).project(range.camera);
    out.push({asset:'arm',first:range.score((arm.x+1)/2,(1-arm.y)/2,1,3).result});
   }
  }
  range.renderer.dispose();return out;
 });
 for(const r of results.filter(r=>!['stand','arm'].includes(r.asset))){expect(r.first,r.asset).toBe('hit');expect(r.past,r.asset).toBe('hit');expect(r.clock).toBe(3);}
 for(const asset of ['stand','arm'])expect(results.find(r=>r.asset===asset).first).toBe('miss');
 for(const asset of ['drop-plate','glass-bottle'])expect(results.find(r=>r.asset===asset).after).toBe('miss');
});
for(const separate of [false,true])test(`Live knockdown persists through a camera hold and resets on restart (${separate?'projector':'single'})`,async({page})=>{
 await page.goto('/');
 const s=await page.evaluate(async()=>{const {defaultScenario}=await import('/core/scenario.js');const s=defaultScenario();s.barriers=[];s.cameraMotion=true;s.pauseAtSegments=true;s.cameraPath=[{x:0,z:9},{x:0,z:8.9}];s.targets=[{...s.targets[0],id:'steel',kind:'shoot',asset:'drop-plate',width:1,height:2.6,x:0,z:-4,path:[]}];return s;});
 await page.locator('#importScenario').setInputFiles({name:'steel.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(s))});
 let display=page;
 if(separate){const pop=page.waitForEvent('popup');await page.locator('#openProjector').click();display=await pop;await expect(page.locator('#notice')).toContainText('Projector ready');}
 const surface=display.locator(separate?'#projectorStage':'#range');
 async function fire(){const box=await surface.boundingBox();await surface.click({position:{x:box.width*.5,y:box.height*.5}});}
 await page.locator('#startRun').click();await expect(page.locator('#segmentStatus')).toContainText('Holding');await page.waitForTimeout(250);await fire();
 await expect(page.locator('#statHits')).toHaveText('1');await page.waitForTimeout(1200);await fire();
 await expect(page.locator('#statShots')).toHaveText('2');await expect(page.locator('#statHits')).toHaveText('1');
 await page.locator('#stopRun').click();await page.locator('#startRun').click();await page.waitForTimeout(500);await fire();await expect(page.locator('#statHits')).toHaveText('1');
 if(separate)await display.close();
});
