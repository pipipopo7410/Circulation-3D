const CACHE="blood3d-v0616-20261122"; const ASSETS=["./index.html", "./style.css", "./app.js", "./flow-network.mjs", "./flow/cardiopulmonary-stages.json", "./flow/systemic-left-arm-stages.json", "./flow/systemic-left-leg-stages.json", "./flow/extended-regions.json", "./flow/all-pairs-audit.json", "./manifest.webmanifest", "./icon.svg", "./home-button.js", "./models/mesh-levels.json", "./models/skin.glb", "./models/organs.glb", "./models/arteries-core-only.glb", "./models/arteries-main-extra.glb", "./models/arteries-fine-extra.glb", "./models/veins-core-only.glb", "./models/veins-main-extra.glb", "./models/veins-fine-extra.glb", "./vendor/three/build/three.module.js", "./vendor/three/examples/jsm/controls/OrbitControls.js", "./vendor/three/examples/jsm/loaders/GLTFLoader.js", "./vendor/three/examples/jsm/loaders/DRACOLoader.js", "./vendor/three/examples/jsm/utils/BufferGeometryUtils.js", "./vendor/three/examples/jsm/libs/draco/draco_decoder.js", "./vendor/three/examples/jsm/libs/draco/draco_decoder.wasm", "./vendor/three/examples/jsm/libs/draco/draco_wasm_wrapper.js"];

// Required by skin/organs.glb. Cache once while online for later offline use.
const MESHOPT_URL='https://cdn.jsdelivr.net/npm/meshoptimizer@0.22.0/meshopt_decoder.module.js';
self.addEventListener('install',e=>e.waitUntil((async()=>{
  const c=await caches.open(CACHE);
  await c.addAll(ASSETS);
  // Offline readiness improves if the remote module is fetched at install time;
  // network failure here should never block installation of the actual site.
  try{
    const r=await fetch(MESHOPT_URL,{mode:'cors'});
    if(r.ok)await c.put(MESHOPT_URL,r);
  }catch(err){console.warn('Optional Meshopt offline cache unavailable',err);}
  await self.skipWaiting();
})()));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('blood3d-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  const ours=u.origin===self.location.origin;
  const decoder=u.href===MESHOPT_URL;
  if(!ours&&!decoder)return;
  e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request).then(res=>{
    if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});}
    return res;
  })));
});
