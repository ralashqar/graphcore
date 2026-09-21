import { chromium } from "playwright";
const origin = process.env.CITY_TEST_ORIGIN || "http://localhost:5183";
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage({viewport:{width:512,height:512},deviceScaleFactor:1});
  await page.goto(origin);
  await page.evaluate(async () => {
    const T = await import('/node_modules/three/build/three.module.js');
    document.body.replaceChildren();
    document.body.style.cssText='margin:0;background:transparent';
    const renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
    renderer.setSize(512,512); renderer.setClearColor(0xffffff,0);
    document.body.appendChild(renderer.domElement);
    const scene=new T.Scene();
    const size=48*Math.SQRT2*512/448;
    const camera=new T.OrthographicCamera(-size/2,size/2,size/2,-size/2,.1,2000);
    camera.position.set(420,380,420);camera.lookAt(0,0,0);
    const shift=new T.Vector3(0,1,0).applyQuaternion(camera.quaternion).multiplyScalar(104*size/512);
    camera.position.add(shift);camera.lookAt(shift);
    const tile=new T.Mesh(new T.BoxGeometry(47.8,.14,47.8),new T.MeshLambertMaterial({color:'#8e9d79'}));
    tile.position.y=-.07;scene.add(tile);
    scene.add(new T.AmbientLight(0xffffff,2));
    renderer.render(scene,camera);
  });
  await page.locator('canvas').screenshot({path:'public/city/sprites/tile-reference.png',omitBackground:true});
} finally {await browser.close();}
