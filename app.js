import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { buildFlowNetwork, FLOW_PLACES } from './flow-network.mjs';

const $=(id)=>document.getElementById(id);
const stage=$('canvas'), load=$('loading');
const flowState={network:null, route:null, meshNames:new Set(), samples:[], oxygen:[], cumulative:[], length:0, travel:0, speed:1};
const state={mode:'main',arteries:true,veins:true,shell:true,heart:true,heartMode:'opaque',chamberSelection:['LV'],selectionExplicit:true,chamberOpacity:{RA:.07,RV:.07,LA:.07,LV:.96},chamberPreset:'',studyOnlyConnected:true,heartDetails:false,organs:{kidney:false,lung:false,liver:false,intestine:false},models:[],heartMeshes:[],loaded:{},ready:false,controlMode:'rotate'};
const levelData=await fetch('./models/mesh-levels.json').then(r=>r.json());
const infoByName={}; const names=[];
for(const kind of ['arteries','veins']) for(const item of levelData[kind]){infoByName[item.name]={...item,kind}; names.push(item.name);} names.sort((a,b)=>a.localeCompare(b));
const files=[{name:'arteries-core-only.glb',kind:'arteries',tier:'core'},{name:'veins-core-only.glb',kind:'veins',tier:'core'},{name:'arteries-main-extra.glb',kind:'arteries',tier:'main'},{name:'veins-main-extra.glb',kind:'veins',tier:'main'},{name:'arteries-fine-extra.glb',kind:'arteries',tier:'fine'},{name:'veins-fine-extra.glb',kind:'veins',tier:'fine'}];

const scene=new THREE.Scene(); scene.fog=new THREE.FogExp2(0x102939,.20);
const camera=new THREE.PerspectiveCamera(32,1,.025,12), center=new THREE.Vector3(0,0.95,0);
camera.position.set(0,0.98,2.95);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.localClippingEnabled=false;
// v0.6.10: CSS display size MUST remain identical to the stage bounds.
// The v0.6.9 dynamic DPR changed the canvas backing dimensions without a fixed
// CSS display size: an implicit canvas width changed during pointer events.
// Keep a single, moderate DPR for the lifetime of this scene. No render buffer
// reallocation on every zoom-start / zoom-end; do not modify anatomical coords.
const fixedRenderDpr=Math.min(window.devicePixelRatio||1,
  window.matchMedia('(pointer:coarse)').matches?1:1.1);
renderer.setPixelRatio(fixedRenderDpr);
stage.appendChild(renderer.domElement);
renderer.domElement.style.width='100%';
renderer.domElement.style.height='100%';
renderer.domElement.style.display='block';
scene.add(new THREE.HemisphereLight(0xd8f4ff,0x304958,1.8));
const key=new THREE.DirectionalLight(0xffffff,2.25); key.position.set(2.5,3,4); scene.add(key);
const fill=new THREE.DirectionalLight(0x7ea9d3,1.15); fill.position.set(-2,2,-3); scene.add(fill);

const controls=new OrbitControls(camera,renderer.domElement); controls.target.copy(center); controls.enableDamping=true; controls.dampingFactor=.10; controls.zoomSpeed=.95; controls.enablePan=true; controls.enableZoom=true; controls.minDistance=0.085; controls.maxDistance=7.5; controls.maxPolarAngle=Math.PI*.82; controls.minPolarAngle=.14; controls.update();
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
// One finger or left mouse: orbit. Two fingers: pan + pinch-to-zoom.
// Mouse right drag: pan. Wheel: dolly. No modal navigation tool to learn.
controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};
controls.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_PAN};
// One finger rotates, two fingers dolly/pan. Render dimensions never change on gesture start/end.
const vesselRoot=new THREE.Group(); scene.add(vesselRoot);
// Independent, disposable route visualization. No GLB geometry is modified.
const routeRoot=new THREE.Group();routeRoot.name='教學血流路徑（非原始解剖模型）';scene.add(routeRoot);
const routeLines=new THREE.Group();routeRoot.add(routeLines);
const routeDots=new THREE.Group();routeRoot.add(routeDots);
// Discreet warm path colour; only heart chamber routes and capillary beds
// are drawn as tubes. Other coordinates are for animation, not student view.
const heartRouteMaterials={
  // Real light-based shading makes a round tube appear round from every view.
  // No outlines, overlaid stripes, or screen-space fake 3D effects.
  right:new THREE.MeshStandardMaterial({color:0x67b1dc,roughness:.57,metalness:0,
    emissive:0x16374b,emissiveIntensity:.055,side:THREE.FrontSide,
    transparent:false,depthTest:true,depthWrite:true}),
  left:new THREE.MeshStandardMaterial({color:0xed8795,roughness:.57,metalness:0,
    emissive:0x49252f,emissiveIntensity:.05,side:THREE.FrontSide,
    transparent:false,depthTest:true,depthWrite:true})
};
const capillaryMaterial=new THREE.MeshBasicMaterial({color:0xe5d4a5,transparent:true,opacity:.82,depthTest:true,depthWrite:false});
// Enlarged glowing tracer represents blood position, NOT a scaled erythrocyte.
const dotGeometry=new THREE.SphereGeometry(.0112,20,16);
const oxygenatedMaterial=new THREE.MeshBasicMaterial({color:0xff2b36,depthTest:false,depthWrite:false,toneMapped:false,fog:false});
const deoxygenatedMaterial=new THREE.MeshBasicMaterial({color:0xb42b42,depthTest:false,depthWrite:false,toneMapped:false,fog:false});
function makeGlowTexture(){
  const c=document.createElement('canvas');c.width=c.height=128;
  const ctx=c.getContext('2d');
  const g=ctx.createRadialGradient(64,64,4,64,64,63);
  g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.18,'rgba(255,255,255,.9)');
  g.addColorStop(.40,'rgba(255,255,255,.34)');g.addColorStop(.72,'rgba(255,255,255,.09)');
  g.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,128,128);
  return new THREE.CanvasTexture(c);
}
const glowTexture=makeGlowTexture();
const glowHighMaterial=new THREE.SpriteMaterial({map:glowTexture,color:0xff3848,transparent:true,
  opacity:1,blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false,sizeAttenuation:false,toneMapped:false,fog:false});
const glowLowMaterial=new THREE.SpriteMaterial({map:glowTexture,color:0xe24b66,transparent:true,
  opacity:.98,blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false,sizeAttenuation:false,toneMapped:false,fog:false});
const flowDots=Array.from({length:1},()=>{
  const dot=new THREE.Mesh(dotGeometry,oxygenatedMaterial);dot.visible=false;dot.renderOrder=1001;
  const glow=new THREE.Sprite(glowHighMaterial);glow.scale.set(.084,.084,1);glow.renderOrder=1000;
  dot.add(glow);dot.userData.glow=glow;routeDots.add(dot);return dot;
});

const shellRoot=new THREE.Group(); scene.add(shellRoot);
const heartRoot=new THREE.Group(); scene.add(heartRoot);
const organRoot=new THREE.Group();organRoot.name='真實器官薄透模式';scene.add(organRoot);
const ORGAN_KEYS=['kidney','lung','liver','intestine'];const organMeshes={kidney:[],lung:[],liver:[],intestine:[]};
const ORGAN_COLORS={kidney:0xcfa5a2,lung:0x9db7cf,liver:0xb3a7a2,intestine:0xd8aab1};
const chamberLabelRoot=new THREE.Group(); chamberLabelRoot.name='四腔室構造內中文標籤'; heartRoot.add(chamberLabelRoot);
const chamberLabels=new Map();
window.__blood3dQA={version:'0.6.16',heartLoaded:false,chamberLabels:0,chamberOpacity:{...state.chamberOpacity},linkedVessels:[],midHiddenIntercostal:[]};
window.__blood3dQA.renderDpr=Number(fixedRenderDpr.toFixed(3));
window.__blood3dQA.tabletGestures='單指旋轉，雙指平移及縮放';
let shellMaterial=null, selectedObject=null, heartBox=null, heartLoaded=false, meshoptReady=false;
const raycaster=new THREE.Raycaster(), pointer=new THREE.Vector2(); let lastPointer={x:0,y:0};

const mats={
  artery:new THREE.MeshStandardMaterial({color:0xd85c67,roughness:.38,metalness:.06,side:THREE.DoubleSide}),
  vein:new THREE.MeshStandardMaterial({color:0x4b88d3,roughness:.38,metalness:.08,side:THREE.DoubleSide}),
  pulmArtery:new THREE.MeshStandardMaterial({color:0x4b88d3,roughness:.4,side:THREE.DoubleSide}),
  pulmVein:new THREE.MeshStandardMaterial({color:0xe8757a,roughness:.4,side:THREE.DoubleSide}),
  heartBlue:new THREE.MeshPhysicalMaterial({color:0x648fc9,roughness:.56,metalness:.02,transparent:true,opacity:.78,side:THREE.DoubleSide,clearcoat:.08}),
  heartBlueDark:new THREE.MeshPhysicalMaterial({color:0x557db6,roughness:.58,metalness:.02,transparent:true,opacity:.80,side:THREE.DoubleSide,clearcoat:.08}),
  heartRed:new THREE.MeshPhysicalMaterial({color:0xcc5c63,roughness:.55,metalness:.02,transparent:true,opacity:.78,side:THREE.DoubleSide,clearcoat:.08}),
  heartRedDark:new THREE.MeshPhysicalMaterial({color:0xb54852,roughness:.58,metalness:.02,transparent:true,opacity:.80,side:THREE.DoubleSide,clearcoat:.08}),
  valve:new THREE.MeshPhysicalMaterial({color:0xf4e4b1,roughness:.62,metalness:.0,transparent:true,opacity:.95,side:THREE.DoubleSide}),
  highlight:new THREE.MeshStandardMaterial({color:0xffd66c,roughness:.23,metalness:.12,emissive:0xb1761f,emissiveIntensity:.35,side:THREE.DoubleSide}),
  flowYellow:new THREE.MeshStandardMaterial({color:0xf2d58d,roughness:.39,metalness:.02,emissive:0x725a1c,emissiveIntensity:.13,side:THREE.DoubleSide})
};
// Lightweight two-sided transparency: one draw pass instead of separate
// back/front passes. Keep all original heart/skin/organ meshes and opacity values.
for(const material of Object.values(heartRouteMaterials))material.forceSinglePass=true;
for(const k of ['heartBlue','heartBlueDark','heartRed','heartRedDark','valve'])mats[k].forceSinglePass=true;
const gltf=new GLTFLoader(); const draco=new DRACOLoader(); draco.setDecoderPath('./vendor/three/examples/jsm/libs/draco/'); draco.preload(); gltf.setDRACOLoader(draco);
async function prepareMeshopt(){
  if(meshoptReady) return;
  const urls=[
    'https://cdn.jsdelivr.net/npm/meshoptimizer@0.22.0/meshopt_decoder.module.js',
    'https://cdn.jsdelivr.net/gh/zeux/meshoptimizer@master/js/meshopt_decoder.module.js',
    'https://cdn.jsdelivr.net/gh/zeux/meshoptimizer@master/js/meshopt_decoder.mjs'
  ];
  let lastError;
  for(const url of urls){
    try {
      const imported=await import(/* webpackIgnore: true */ url);
      const decoder=imported.MeshoptDecoder || imported.default?.MeshoptDecoder || imported.default;
      if(!decoder || !decoder.supported || !decoder.decodeGltfBufferAsync) throw Error('無法辨識 MeshoptDecoder');
      await decoder.ready;
      gltf.setMeshoptDecoder(decoder);
      meshoptReady=true;
      return;
    } catch(err){ lastError=err; console.warn('Meshopt source unavailable',url,err); }
  }
  throw Error('Meshopt 解碼器未能載入（需連網）：'+(lastError?.message||'未知錯誤'));
}

function cleanName(n){return n.replace(/\.\d{3}$/,'');}
function setProgress(p,m){$('bar').style.width=p+'%'; $('loadDetail').textContent=m;}
function showError(message){$('loadTitle').textContent='模型載入失敗'; $('loadDetail').textContent=message; load.hidden=false;}
// Z-Anatomy actual zname from core-tier GLBs; no invented vessels.
const CHAMBER_VESSEL_LINKS={
  RA:['Superior vena cava','Inferior vena cava (thoracic part)','Inferior vena cava (abdominal part)'],
  RV:['Pulmonary trunk','Bifurcation of pulmonary trunk','Right pulmonary artery','Left pulmonary artery'],
  LA:['Right superior pulmonary vein','Right inferior pulmonary vein','Left superior pulmonary vein','Left inferior pulmonary vein'],
  LV:['Ascending aorta','Aortic arch']
};
const LINKED_VESSEL_SET=new Set(Object.values(CHAMBER_VESSEL_LINKS).flat());
// The source contains only four short proximal pulmonary vein meshes.
// A purely visual continuation is added at their distal (lung-facing) ends
// in chamber-study mode. It is deliberately NEVER shown in full anatomy mode.
const PULMONARY_VEIN_NAMES=CHAMBER_VESSEL_LINKS.LA;
const veinContinuationRoot=new THREE.Group();veinContinuationRoot.name='肺靜脈肺側延長（教學示意，非原始解剖）';vesselRoot.add(veinContinuationRoot);
const veinContinuations=[];
function buildPulmonaryVeinContinuations(){
  veinContinuationRoot.clear();veinContinuations.length=0;
  const la=state.heartMeshes.find(m=>m.userData.heartRole==='LA');
  if(!la)return;
  const laCenter=new THREE.Box3().setFromObject(la).getCenter(new THREE.Vector3());
  for(const vesselName of PULMONARY_VEIN_NAMES){
    const vessel=state.models.find(m=>m.userData.canonicalName===vesselName);
    if(!vessel)continue;
    vessel.updateWorldMatrix(true,false);
    const attr=vessel.geometry.getAttribute('position');
    if(!attr || attr.count<8)continue;
    const center=new THREE.Box3().setFromObject(vessel).getCenter(new THREE.Vector3());
    const outward=center.clone().sub(laCenter);
    if(outward.length()<.00001)continue;
    outward.normalize();
    const samples=[];
    const step=Math.max(1,Math.floor(attr.count/2200));
    for(let i=0;i<attr.count;i+=step){
      const p=new THREE.Vector3().fromBufferAttribute(attr,i).applyMatrix4(vessel.matrixWorld);
      samples.push({p,s:p.clone().sub(laCenter).dot(outward)});
    }
    if(samples.length<8)continue;
    samples.sort((a,b)=>a.s-b.s);
    const count=Math.max(4,Math.floor(samples.length*.05));
    const terminal=samples.slice(-count);
    const start=new THREE.Vector3();for(const t of terminal)start.add(t.p);start.multiplyScalar(1/terminal.length);
    const inside=samples.slice(-count*3,-count*2);
    const near=new THREE.Vector3();for(const t of inside)near.add(t.p);near.multiplyScalar(1/Math.max(1,inside.length));
    const tangent=start.clone().sub(near);
    if(tangent.length()<.00001 || tangent.dot(outward)<.25*tangent.length())tangent.copy(outward);
    tangent.normalize();
    const box=new THREE.Box3().setFromObject(vessel);
    const originalLength=box.getSize(new THREE.Vector3()).length();
    const length=THREE.MathUtils.clamp(originalLength*.72,.033,.070);
    // Estimate cross-sectional radius from the outer-end vertex ring.
    let radial=0;
    for(const t of terminal){const rel=t.p.clone().sub(start);rel.addScaledVector(tangent,-rel.dot(tangent));radial+=rel.length();}
    radial/=terminal.length;
    const radius=THREE.MathUtils.clamp(radial*.75,.0027,.0075);
    const points=[start.clone().addScaledVector(tangent,-radius*1.8),
      start.clone().addScaledVector(tangent,length*.36),
      start.clone().addScaledVector(tangent,length*.74),
      start.clone().addScaledVector(tangent,length)];
    const curve=new THREE.CatmullRomCurve3(points);
    const geom=new THREE.TubeGeometry(curve,18,radius,8,false);
    const mat=mats.pulmVein.clone();mat.transparent=true;mat.opacity=.90;
    const extension=new THREE.Mesh(geom,mat);extension.name=vesselName+' (teaching continuation)';
    extension.renderOrder=7;extension.raycast=()=>{};
    veinContinuationRoot.add(extension);veinContinuations.push(extension);
  }
  window.__blood3dQA.pulmonaryVeinExtensions=veinContinuations.length;
}
function updateVeinContinuations(){
  // Keep accepted model untouched; only show diagrammatic continuation when viewing LA.
  veinContinuationRoot.visible=state.heart && state.heartMode==='chambers' &&
    state.chamberSelection.includes('LA') && state.studyOnlyConnected;
}

// Curated mid-tier lung trunks are native Z-Anatomy fine-tier meshes.
// Keep full & core unmodified; only medium gets these selectively.
const MEDIUM_LUNG_NAMES=new Set([
  'Superior lobar artery of right lung',
  'Middle lobar artery of right lung',
  'Inferior lobar artery of right lung',
  'Apical segmental artery of left lung',
  'Anterior segmental artery of left lung',
  'Superior segmental artery of left lung',
  'Superior lingular artery of left lung',
  'Apical vein of right lung',
  'Lateral vein of right lung',
  'Superior basal vein of right lung',
  'Apicoposterior vein of left lung',
  'Anterior vein of left lung',
  'Lingular vein of left lung',
  'Superior basal vein of left lung',
  // Measured distal route: deliberately keep this far branch in medium.
  'Lateral segmental artery of right lung',
  'Lateral vein of right lung'
]);
// Real Z-Anatomy meshes, surfaced in medium without creating anatomy not present in GLBs.
// Two kidneys, hepatic inflow/outflow, jejunal arterial inlet and portal venous return.
const MEDIUM_VISCERAL_NAMES=new Set([
  'Right renal artery','Left renal artery','Right renal vein','Left renal vein',
  'Intrarenal arteries of left kidney','Intrarenal arteries of right kidney',
  'Intrarenal veins of left kidney','Intrarenal veins of right kidney',
  'Anterior branch of renal artery.r','Anterior branch of renal artery.l',
  'Posterior branch of renal artery.r','Posterior branch of renal artery.l',
  'Coeliac trunk','Common hepatic artery','Proper hepatic artery','Hepatic veins',
  'Superior mesenteric artery','Superior mesenteric vein','Hepatic portal vein',
  'Gastroduodenal artery','Inferior pancreaticoduodenal artery',
  'Anterior inferior pancreaticoduodenal artery'
]);
// Core is the cardiovascular essentials only; remove selective organ vascular branches.
// Emphasize ONLY existing GLB surfaces in medium (especially short portal and hepatic
// venous segments). Never create artificial 3D liver/intestinal vessels here.
const MEDIUM_DIGESTIVE_FOCUS=new Set([
  'Superior mesenteric artery','Superior mesenteric vein',
  'Hepatic portal vein','Hepatic veins','Coeliac trunk',
  'Common hepatic artery','Proper hepatic artery'
]);
function visceralTeachingMaterial(mesh){
  if(!mesh.userData.visceralTeachingMaterial){
    const material=mesh.userData.baseMaterial.clone();
    const arterial=mesh.userData.kind==='arteries';
    material.color=new THREE.Color(arterial?0xe36976:0x619be1);
    material.emissive=new THREE.Color(arterial?0x7a2635:0x1a4b83);
    material.emissiveIntensity=.24;
    material.roughness=.32;
    // Actual original GLB surface: a classroom x-ray emphasis prevents the
    // tiny/deep portal and hepatic segments from disappearing behind the liver.
    // No centrelines, invented vessels or geometry are introduced.
    material.depthTest=false;
    material.depthWrite=false;
    material.transparent=true;
    material.opacity=.99;
    material.emissiveIntensity=.52;
    mesh.userData.visceralTeachingMaterial=material;
  }
  return mesh.userData.visceralTeachingMaterial;
}
const CORE_VISCERAL_HIDE=new Set([...MEDIUM_VISCERAL_NAMES,'Inferior mesenteric artery',
  'Inferior mesenteric vein','Splenic vein']);
// Remove the abdominal-wall, lumbar and minor abdominal organ branches in medium;
// keep midline aorta/IVC, iliac trunks needed to connect legs and main renal pairs.
const isMediumUnimportantVessel=name=>/(?:intercostal|epigastric|lumbar|iliolumbar|suprarenal|mesenteric|splenic|hepatic|coeliac|celiac|gastric|internal iliac|inferior thyroid)/i.test(name);
window.__blood3dQA.mediumLungNames=[...MEDIUM_LUNG_NAMES];
function selectedLinkedVessels(){
  const linked=new Set();
  for(const role of state.chamberSelection) for(const name of CHAMBER_VESSEL_LINKS[role])linked.add(name);
  return linked;
}
// Coronary surface vessels remain visible in ordinary simplified anatomy,
// but must not obscure the chambers whenever ANY heart chamber is translucent.
const CORONARY_MESH_NAMES=new Set([
  'Right coronary artery','Left coronary artery','Circumflex artery of heart',
  'Anterior interventricular artery','Right inferolateral branch of right coronary artery',
  'Septal branches of anterior interventricular artery',
  'Great cardiac vein','Small cardiac vein','Middle cardiac vein','Coronary sinus'
]);
function isHeartActuallyTranslucent(){
  if(!state.heart||!heartLoaded)return false;
  return state.heartMeshes.some(mesh=>mesh.visible &&
    ['RA','RV','LA','LV'].includes(mesh.userData.heartRole) &&
    mesh.material?.opacity<.85);
}

// Keep original GLBs intact. Only runtime mesh visibility changes by teaching mode.
function updateVesselVisibility(){
  const chamberStudy=state.heart && state.heartMode==='chambers' && state.studyOnlyConnected;
  const linked=selectedLinkedVessels();
  const midHidden=[];
  const hideCoronary=isHeartActuallyTranslucent();
  for(const mesh of state.models){
    const {tier,kind,canonicalName}=mesh.userData;
    const typeAllowed=state[kind];
    const tierAllowed=state.mode==='full'||(state.mode==='main'&&(tier!=='fine'||MEDIUM_LUNG_NAMES.has(canonicalName)||MEDIUM_VISCERAL_NAMES.has(canonicalName)))||(state.mode==='core'&&tier==='core');
    const skipMid=state.mode==='main'&&isMediumUnimportantVessel(canonicalName)&&!MEDIUM_VISCERAL_NAMES.has(canonicalName);
    const skipCoreVisceral=state.mode==='core'&&CORE_VISCERAL_HIDE.has(canonicalName);
    // While in chamber-study mode, show only linked vessels, regardless of ordinary
    // artery/vein category switches. This restores the four pulmonary veins etc.
    mesh.visible=chamberStudy?linked.has(canonicalName):(typeAllowed&&tierAllowed&&!skipMid&&!skipCoreVisceral);
    if(skipMid)midHidden.push(canonicalName);
    const emphasized=chamberStudy && mesh.visible;
    const onRoute=Boolean(flowState.route && flowState.meshNames.has(canonicalName));
    if(onRoute)mesh.visible=true; // required route segments visible even in simplified core
    if(hideCoronary && CORONARY_MESH_NAMES.has(canonicalName))mesh.visible=false;
    const intestineFocus=state.mode==='main' && MEDIUM_DIGESTIVE_FOCUS.has(canonicalName) && mesh.visible && !chamberStudy;
    mesh.material=onRoute?mats.flowYellow:(emphasized?mesh.userData.linkMaterial:(intestineFocus?visceralTeachingMaterial(mesh):mesh.userData.baseMaterial));
    mesh.renderOrder=onRoute?130:(intestineFocus?125:(emphasized?7:0));
    if(emphasized) mesh.material.opacity=1;
  }
  window.__blood3dQA.hideCoronary=hideCoronary;
  window.__blood3dQA.coronaryVesselsVisible=state.models.filter(m=>m.visible&&CORONARY_MESH_NAMES.has(m.userData.canonicalName)).map(m=>m.userData.canonicalName);
  window.__blood3dQA.linkedVessels=state.models.filter(m=>m.visible&&linked.has(m.userData.canonicalName)).map(m=>m.userData.canonicalName);
  window.__blood3dQA.midHiddenIntercostal=midHidden;
  window.__blood3dQA.visceralShown=state.models.filter(m=>m.visible&&MEDIUM_VISCERAL_NAMES.has(m.userData.canonicalName)).map(m=>m.userData.canonicalName);
  window.__blood3dQA.mediumDigestiveFocus=state.models.filter(m=>m.visible&&MEDIUM_DIGESTIVE_FOCUS.has(m.userData.canonicalName)).map(m=>m.userData.canonicalName);
  window.__blood3dQA.visceralXrayCount=state.models.filter(m=>m.visible&&m.material===m.userData.visceralTeachingMaterial).length;
  window.__blood3dQA.mediumLungShown=state.mode==='main'?state.models.filter(m=>m.visible&&MEDIUM_LUNG_NAMES.has(m.userData.canonicalName)).map(m=>m.userData.canonicalName):[];
  window.__blood3dQA.midAbdomenHidden=midHidden;
  const linkedStatus=$('linkedVesselStatus');
  if(linkedStatus){
    if(chamberStudy){
      const requested=[...linked];
      const actual=state.models.filter(m=>m.visible&&linked.has(m.userData.canonicalName));
      linkedStatus.textContent='目前連動 '+actual.length+' 條主要血管'+(requested.length!==actual.length?'（尚未載入 '+(requested.length-actual.length)+' 條）':'');
    } else linkedStatus.textContent='四腔室模式可選擇只顯示相連主血管';
  }
  updateVeinContinuations();updateCount();requestRender();
}
function materialFor(info){const type=(info?.type||'').toLowerCase(); if(type.includes('pulmonary')) return type.includes('artery')?mats.pulmArtery:mats.pulmVein; return info?.kind==='arteries'?mats.artery:mats.vein;}
function materialForHeart(name){
  const n=name.toLowerCase();
  if(n.includes('leaflet') || n.includes('valve')) return mats.valve;
  if(n.includes('papillary')) return n.includes('right')?mats.heartBlueDark:mats.heartRedDark;
  if(n.includes('right atrium')||n.includes('right ventricle')) return mats.heartBlue;
  if(n.includes('left atrium')||n.includes('left ventricle')) return mats.heartRed;
  return mats.heartRed;
}
// GLTFLoader makes 'Right_atrium' from the original 'Right atrium'.
// Use its preserved userData.name and normalize fallback names without changing vessel names.
function originalHeartName(obj){
  const raw=String(obj.userData?.zname || obj.userData?.name || obj.name || '');
  return raw.replace(/_\d+$/, '').replace(/_/g, ' ').replace(/\.\d{3}$/, '').trim();
}
function isHeartPart(name){
  const n=name.toLowerCase();
  return n.includes('atrium') || n.includes('ventricle') || n.includes('leaflet') || n.includes('valve') || n.includes('papillary muscle');
}
async function loadFile(file){ if(state.loaded[file.name]) return; const root=await gltf.loadAsync('./models/'+file.name); root.scene.traverse(obj=>{ if(!obj.isMesh)return; const name=obj.userData?.zname||cleanName(obj.name); const info=infoByName[name]; if(!info) return; obj.material=materialFor(info);
    const baseMat=obj.material;
    const linkMat=baseMat.clone();
    linkMat.emissive=new THREE.Color(info.kind==='arteries'?0x5e171c:0x15345b);
    linkMat.emissiveIntensity=.18;
    linkMat.depthWrite=true;
    obj.userData={...obj.userData,...info,canonicalName:name,tier:file.tier,elementType:'vessel',baseMaterial:baseMat,linkMaterial:linkMat};
    state.models.push(obj);}); vesselRoot.add(root.scene); state.loaded[file.name]=root.scene; }
async function ensureFine(){ if(state.loaded['arteries-fine-extra.glb']&&state.loaded['veins-fine-extra.glb']) return; load.hidden=false; $('loadTitle').textContent='正在載入細部血管'; setProgress(55,'完整模式額外載入 474 個細分支…'); await Promise.all(files.filter(x=>x.tier==='fine').map(loadFile)); setProgress(100,'完成'); load.hidden=true; applyMode();}
function updateCount(){ const vesselCount=state.models.filter(m=>m.visible).length; const heartCount=state.heart && heartLoaded ? '＋ '+state.heartMeshes.filter(m=>m.visible).length+' 個心臟構造' : ''; $('count').textContent='可見 '+vesselCount+' 條血管構造'+heartCount; }
function applyMode(){
  $('tierDesc').textContent=({full:'全部血管',main:'簡化血管',core:'超簡化血管'})[state.mode];
  for(const b of document.querySelectorAll('[data-mode]'))b.classList.toggle('active',b.dataset.mode===state.mode);
  $('arteries').classList.toggle('active',state.arteries);
  $('veins').classList.toggle('active',state.veins);
  updateVesselVisibility();
}
function applyShellState(){shellRoot.visible=state.shell;$('shell').checked=state.shell;requestRender();}
function applyHeartState(){
  heartRoot.visible=state.heart;
  $('heart').checked=state.heart;
  updateChamberLabels();
  updateVesselVisibility();
  requestRender();
}
function clearSelected(){ if(selectedObject){ selectedObject.material = selectedObject.userData.defaultMaterial; selectedObject=null; } $('selected').hidden=true; requestRender(); }
function selectionLabel(obj){ if(obj.userData.elementType==='heart'){ return '心臟構造'; } return obj.userData.kind==='arteries'?'動脈構造':'靜脈構造'; }
function selectMesh(m){ clearSelected(); if(!m)return; selectedObject=m; m.userData.defaultMaterial=m.material; m.material=mats.highlight; $('pickedName').textContent=m.userData.canonicalName; $('pickedType').textContent=selectionLabel(m); $('selected').hidden=false; requestRender(); }
async function loadSkin(){ try{ $('skinStatus').textContent='載入 Meshopt 解碼器…'; await prepareMeshopt(); const root=await gltf.loadAsync('./models/skin.glb'); shellMaterial=new THREE.MeshPhongMaterial({color:0x9ed2de,shininess:36,transparent:true,opacity:0.08,depthWrite:false,side:THREE.DoubleSide}); shellMaterial.forceSinglePass=true; root.scene.traverse(obj=>{ if(obj.isMesh){ if(!obj.geometry.getAttribute('normal')) obj.geometry.computeVertexNormals(); obj.material=shellMaterial; obj.renderOrder=-5; obj.raycast=()=>{}; } }); shellRoot.add(root.scene); $('skinStatus').textContent='載入成功'; $('skinStatus').dataset.status='ok'; $('shellHint').textContent='固定 8% 透明度'; $('shell').disabled=false; applyShellState(); } catch(err){ console.error(err); $('skinStatus').textContent='載入失敗：'+(err?.message||'請確認網路'); $('skinStatus').dataset.status='fail'; $('shellHint').textContent='解碼失敗'; $('shell').disabled=true; shellRoot.visible=false; } }
// Student-friendly small labels, placed on existing chambers. No 3D spheres.
const CHAMBER_COLORS={RA:0x80d4ff,RV:0x598dff,LA:0xffb4a0,LV:0xff6578};
const CHAMBER_LABELS={RA:'右心房',RV:'右心室',LA:'左心房',LV:'左心室'};
function makeChamberText(label,color){
  // Compact four-character label: reduced canvas, backdrop and sprite size.
  const c=document.createElement('canvas');c.width=216;c.height=64;
  const ctx=c.getContext('2d');
  ctx.fillStyle='rgba(10,26,38,.54)';
  ctx.beginPath();ctx.roundRect(12,7,192,50,11);ctx.fill();
  ctx.fillStyle='#'+new THREE.Color(color).getHexString();
  ctx.font='700 34px "Noto Sans TC","Microsoft JhengHei",sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,108,33);
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false}));
  sprite.scale.set(.047,.014,1);sprite.renderOrder=230;sprite.raycast=()=>{};
  return sprite;
}
function buildChamberLabels(){
  for(const sprite of chamberLabels.values()){
    sprite.material.map.dispose();sprite.material.dispose();
  }
  chamberLabelRoot.clear();chamberLabels.clear();
  for(const role of ['RA','RV','LA','LV']){
    const mesh=state.heartMeshes.find(m=>m.userData.heartRole===role);
    if(!mesh)continue;
    const box=new THREE.Box3().setFromObject(mesh);
    const size=box.getSize(new THREE.Vector3());
    const center=box.getCenter(new THREE.Vector3());
    // Slightly offset toward the anterior surface, but stay inside the original chamber footprint.
    center.z+=size.z*.35;
    center.y+=(role==='RA'||role==='LA'?size.y*.08:-size.y*.08);
    const label=makeChamberText(CHAMBER_LABELS[role],CHAMBER_COLORS[role]);
    label.position.copy(center);
    chamberLabelRoot.add(label);chamberLabels.set(role,label);
  }
  window.__blood3dQA.chamberLabels=chamberLabels.size;
  const qa=$('chamberQA');
  qa.textContent='已辨識四個腔室 · 構造名稱 '+chamberLabels.size+'/4';
  qa.dataset.status=chamberLabels.size===4?'ok':'fail';
}
function updateChamberLabels(){
  chamberLabelRoot.visible=state.heart && state.heartMode==='chambers';
  for(const [role,sprite] of chamberLabels){
    const selected=state.chamberSelection.includes(role);
    sprite.visible=selected; // Unselected chambers display no labels at all.
  }
}
function focusOnHeart(){
  if(!heartLoaded||!heartBox)return;
  const target=heartBox.getCenter(new THREE.Vector3());
  controls.target.copy(target);
  camera.position.copy(target.clone().add(new THREE.Vector3(.065,.022,.40)));
  controls.update();requestRender();
}
// 腔室顏色及剖切只作用於 organs.glb 的原始心臟網格；不創造新器官或血流路徑。
const CHAMBERS={RA:'右心房',RV:'右心室',LA:'左心房',LV:'左心室'};
function heartRole(name){
  const n=name.toLowerCase();
  if(n==='right atrium') return 'RA';
  if(n==='right ventricle') return 'RV';
  if(n==='left atrium') return 'LA';
  if(n==='left ventricle') return 'LV';
  if(n.includes('leaflet')||n.includes('valve')) return 'valve';
  if(n.includes('papillary')) return 'muscle';
  return 'other';
}
function applyChamberPreset(preset){
  const presetRoles={both:['RA','RV','LA','LV'],right:['RA','RV'],left:['LA','LV'],soft:[]};
  state.chamberSelection=[...presetRoles[preset]];
  state.selectionExplicit=preset!=='both';
  for(const role of ['RA','RV','LA','LV'])
    state.chamberOpacity[role]=state.chamberSelection.includes(role)?.96:(preset==='soft'?.14:.07);
  state.chamberPreset=preset;
  state.heartMode='chambers';
  applyHeartAppearance();
}
function toggleChamber(role){
  state.heartMode='chambers';
  if(role==='all'){
    state.chamberSelection=['RA','RV','LA','LV'];
    state.selectionExplicit=false;
  }else if(!state.selectionExplicit){
    // Start from 'all' view, first click selects that one; subsequent clicks add.
    state.chamberSelection=[role];
    state.selectionExplicit=true;
  }else{
    const set=new Set(state.chamberSelection);
    if(set.has(role))set.delete(role);else set.add(role);
    state.chamberSelection=['RA','RV','LA','LV'].filter(k=>set.has(k));
  }
  for(const r of ['RA','RV','LA','LV'])state.chamberOpacity[r]=state.chamberSelection.includes(r)?.96:.07;
  state.chamberPreset='';
  applyHeartAppearance();
}
function syncHeartControls(){
  for(const b of document.querySelectorAll('[data-heart-mode]')){
    const active=b.dataset.heartMode===state.heartMode;
    b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));
    b.disabled=!heartLoaded;
  }
  for(const b of document.querySelectorAll('[data-chamber]')){
    const role=b.dataset.chamber;
    const active=role==='all'?(!state.selectionExplicit || state.chamberSelection.length===4):state.chamberSelection.includes(role);
    b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));
    b.disabled=!heartLoaded;
  }
  for(const c of document.querySelectorAll('[data-chamber-opacity]')){
    const role=c.dataset.chamberOpacity;c.value=String(Math.round(state.chamberOpacity[role]*100));c.disabled=!heartLoaded;
  }
  for(const output of document.querySelectorAll('[data-chamber-opacity-label]')){
    const role=output.dataset.chamberOpacityLabel;
    const alpha=state.chamberOpacity[role];
    output.textContent=Number.isFinite(alpha)?Math.round(alpha*100)+'%':'—';
  }
  window.__blood3dQA.chamberOpacity={...state.chamberOpacity};
  window.__blood3dQA.selectedChambers=[...state.chamberSelection];
  window.__blood3dQA.actualMaterials=Object.fromEntries(['RA','RV','LA','LV'].map(role=>[role,state.heartMeshes.filter(m=>m.userData.heartRole===role).map(m=>Number(m.material.opacity.toFixed(3)))]));
  $('chamberSection').hidden=state.heartMode!=='chambers';scheduleDockFit();
    $('showHeartDetails').disabled=!heartLoaded;$('showHeartDetails').checked=state.heartDetails;
  $('chamberMessage').textContent=state.chamberSelection.length
    ? '已選 '+state.chamberSelection.map(r=>CHAMBERS[r]).join('、')
    : '請選腔室';
}
function applyHeartAppearance(){
  if(!heartLoaded)return;
  // Update vessel visibility independently: in chamber mode only attached major vessels remain.
  vesselRoot.visible=true;
  if(selectedObject&&selectedObject.userData.elementType==='heart')clearSelected();
  
  for(const mesh of state.heartMeshes){
    const role=mesh.userData.heartRole;
    const mat=mesh.userData.heartBaseMaterial;
    const details=role==='valve'||role==='muscle';
    // 輔助構造保留在 GLB 內，預設不顯示；老師需要時才開啟。
    mesh.visible=!details || state.heartDetails;
    let alpha=1;
    if(state.heartMode==='opaque') alpha=details?.30:.95;
    if(state.heartMode==='transparent') alpha=details?.18:.20;
    if(state.heartMode==='chambers'){
      alpha=details?.30:(state.chamberOpacity[role]??.07);
    }
      // Route-specific transparency, never force the unrelated half to fade.
    // The teacher's own opaque/transparent/chamber controls remain authoritative.
    if(flowState.route && !details){
      const selectedSides=new Set(flowState.route.edges.flatMap(e=>[e.from,e.to]));
      const needsRight=selectedSides.has('ra')||selectedSides.has('rv');
      const needsLeft=selectedSides.has('la')||selectedSides.has('lv');
      if((['RA','RV'].includes(role)&&needsRight)||(['LA','LV'].includes(role)&&needsLeft))
        alpha=Math.min(alpha,.19);
    }
    mat.transparent=alpha<1;
    mat.opacity=alpha;
    mat.depthWrite=alpha>=.90;
    // Only compile a new material program when transparency mode truly changes.
    // Recompiling on every chamber click / slider move caused unnecessary stutters.
    if(mat.userData.lastTransparent!==mat.transparent){mat.needsUpdate=true;mat.userData.lastTransparent=mat.transparent;}
    mesh.material=mat;
    mesh.renderOrder=details?8:(alpha>=.85?6:2);
  }
  window.__blood3dQA.heartAlphaByRole=Object.fromEntries(['RA','RV','LA','LV'].map(role=>[
    role, state.heartMeshes.filter(m=>m.userData.heartRole===role).map(m=>Number(m.material.opacity.toFixed(2)))
  ]));
  updateChamberLabels();
  updateVesselVisibility();
  syncHeartControls();requestRender();
}
function organCategory(name){
  const n=name.toLowerCase();
  if(/^kidney[. ](?:l|r)$/.test(n))return 'kidney';
  if(/^(superior|middle|inferior) lobe of (left|right) lung$/.test(n))return 'lung';
  if(n==='liver')return 'liver';
  if(n==='duodenum'||n==='jejunum')return 'intestine';
  return null;
}
function updateOrganVisibility(){
  for(const key of ORGAN_KEYS){
    for(const mesh of organMeshes[key])mesh.visible=state.organs[key] && (state.mode!=='core' || key==='lung');
    const b=document.querySelector('[data-organ="'+key+'"]');
    if(b){
      const selectable=state.mode!=='core'||key==='lung';
      b.classList.toggle('active',state.organs[key]&&selectable);
      b.setAttribute('aria-pressed',String(state.organs[key]&&selectable));
      b.disabled=organMeshes[key].length===0||!selectable;
    }
  }
  requestRender();
}
async function loadHeartModel(){
  try{
    $('heartStatus').textContent='擷取心臟構造…';
    await prepareMeshopt();
    const root=await gltf.loadAsync('./models/organs.glb');
    const organCandidates=[];
    root.scene.traverse(obj=>{
      if(!obj.isMesh)return;
      const organName=originalHeartName(obj);
      const organKey=organCategory(organName);
      if(organKey){
        const mat=new THREE.MeshPhongMaterial({color:ORGAN_COLORS[organKey],transparent:true,opacity:organKey==='lung'?.13:.19,depthWrite:false,side:THREE.DoubleSide,shininess:30}); mat.forceSinglePass=true;
        obj.material=mat;obj.renderOrder=-2;obj.raycast=()=>{};obj.visible=false;
        organCandidates.push({mesh:obj,key:organKey});
      }
    });
    root.scene.updateMatrixWorld(true);
    for(const {mesh,key} of organCandidates){organRoot.attach(mesh);organMeshes[key].push(mesh);}
    window.__blood3dQA.organCounts=Object.fromEntries(ORGAN_KEYS.map(k=>[k,organMeshes[k].length]));
    updateOrganVisibility();scheduleDockFit();
    root.scene.traverse(obj=>{
      if(!obj.isMesh) return;
      const name=originalHeartName(obj);
      if(!isHeartPart(name)) return;
      const nativeMaterial=materialForHeart(name).clone();
      obj.material=nativeMaterial;
      obj.userData={...obj.userData, canonicalName:name, elementType:'heart',heartRole:heartRole(name),heartBaseMaterial:nativeMaterial,defaultMaterial:nativeMaterial};
      state.heartMeshes.push(obj);
    });
    // Remove non-heart meshes from this scene branch.
    root.scene.traverse(obj=>{
      if(obj.isMesh && !state.heartMeshes.includes(obj)) obj.visible=false;
    });
    heartRoot.add(root.scene);
    // Bounding box must ignore the other 124 hidden organs.
    root.scene.updateMatrixWorld(true);
    heartBox=new THREE.Box3().makeEmpty();
    for(const m of state.heartMeshes) heartBox.union(new THREE.Box3().setFromObject(m));
    heartLoaded = state.heartMeshes.length > 0;
    if(!heartLoaded) throw Error('在 organs.glb 中找不到心臟構造');
    const roles=['RA','RV','LA','LV'];
    const roleCounts=Object.fromEntries(roles.map(role=>[role,state.heartMeshes.filter(m=>m.userData.heartRole===role).length]));
    window.__blood3dQA.roleCounts=roleCounts;
    const missing=roles.filter(role=>roleCounts[role]!==1);
    if(missing.length) throw Error('四腔室網格辨識異常：'+missing.map(role=>CHAMBER_LABELS[role]+'('+roleCounts[role]+')').join('、'));
    buildChamberLabels();buildPulmonaryVeinContinuations();window.__blood3dQA.heartLoaded=true;
    if(chamberLabels.size!==4)throw Error('中文標籤數量不正確：'+chamberLabels.size+'/4');
    $('heartStatus').textContent='載入成功｜四腔室 4/4';
    $('heartStatus').dataset.status='ok';
    $('heartHint').textContent='獨立多選＋血管連動';
    $('heart').disabled=false;
    $('heartFocus').disabled=false;
    applyHeartState();
    applyHeartAppearance();
  }catch(err){
    console.error(err);
    $('heartStatus').textContent='載入失敗：'+(err?.message||'未知錯誤');
    $('heartStatus').dataset.status='fail';
    $('heartHint').textContent='尚未成功';
    $('heart').disabled=true;
    $('heartFocus').disabled=true;
    heartRoot.visible=false;
    syncHeartControls();
  }
}

// v0.6.7: native vessel highlighting and thicker, anatomically anchored heart tube.
// No more fine golden centreline overlay on the real vessels.
const pointVec=p=>new THREE.Vector3(p[0],p[1],p[2]);
function addFlowTube(points,radius,material,order=82){
  if(points.length<2)return;
  const curve=new THREE.CatmullRomCurve3(points,false,'centripetal',.4);
  const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(12,points.length*2),radius,7,false),material);
  mesh.renderOrder=order;mesh.raycast=()=>{};routeLines.add(mesh);
}
// Teaching tube only for the real 3D chamber corridor. Radius expands smoothly
// toward the actual outflow vessel, preventing a thin-to-thick abrupt seam.
// The catheter-like tube is explicitly schematic, and does not edit the heart GLB.
function makeHeartFlowCurve(points){
  const start=points[0].clone();
  const end=points[points.length-1].clone();
  const nadir=points.reduce((lowest,p)=>p.y<lowest.y?p:lowest,points[0]).clone();
  return new THREE.CatmullRomCurve3([start,start.clone().lerp(nadir,.53),
    nadir,nadir.clone().lerp(end,.53),end],false,'centripetal',.55);
}
// v0.6.15: Use only a smooth circular 3D tube, not a wide flat ribbon.
// The original teaching data contain extra waypoints which can produce a
// tangled knot when an entire cross-section is drawn at this large scale.
// Retain the exact inlet, deepest ventricular point, and arterial outlet.
function addHeartFlowTube(points,heartSide){
  if(points.length<2)return;
  const centreline=makeHeartFlowCurve(points);
  const tubeSteps=128,around=20;
  const geometry=new THREE.TubeGeometry(centreline,tubeSteps,1,around,false);
  const verts=geometry.getAttribute('position');
  const center=new THREE.Vector3(),normal=new THREE.Vector3();
  for(let i=0;i<=tubeSteps;i++){
    const t=i/tubeSteps;
    const exit=Math.max(0,Math.min(1,(t-.72)/.28));
    const blend=exit*exit*(3-2*exit);
    const radius=.0100+.0031*blend;
    centreline.getPointAt(t,center);
    for(let j=0;j<=around;j++){
      const k=i*(around+1)+j;
      normal.fromBufferAttribute(verts,k).sub(center).normalize().multiplyScalar(radius);
      verts.setXYZ(k,center.x+normal.x,center.y+normal.y,center.z+normal.z);
    }
  }
  verts.needsUpdate=true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const tube=new THREE.Mesh(geometry,heartSide==='right'?heartRouteMaterials.right:heartRouteMaterials.left);
  tube.name=heartSide==='right'?'右心｜單根圓滑血流管':'左心｜單根圓滑血流管';
  tube.renderOrder=90;tube.raycast=()=>{};
  routeLines.add(tube);
  const qa=window.__blood3dQA;
  qa.smoothHeartTubes=(qa.smoothHeartTubes||0)+1;
}
function addMicrovessels(stage){
  const points=stage.points.map(pointVec);
  const start=points[0],end=points.at(-1),v=end.clone().sub(start).normalize();
  const other=new THREE.Vector3(0,0,1);
  if(Math.abs(v.dot(other))>.94)other.set(0,1,0);
  const side=new THREE.Vector3().crossVectors(v,other).normalize();
  const height=new THREE.Vector3().crossVectors(v,side).normalize();
  const extent=Math.min(.0058,Math.max(.0024,start.distanceTo(end)*.28));
  for(let j=-3;j<=3;j++){
    const p=points.map((position,i)=>{
      const t=i/(points.length-1),fade=Math.sin(Math.PI*t);
      return position.clone().addScaledVector(side,extent*(j/3)*fade)
        .addScaledVector(height,extent*.46*Math.sin(t*Math.PI*2+j*.4)*fade);
    });
    addFlowTube(p,.00054,capillaryMaterial,86);
  }
}
function clearFlowLines(){
  routeLines.traverse(obj=>{if(obj.isMesh)obj.geometry.dispose();});
  routeLines.clear();
  for(const dot of flowDots)dot.visible=false;
  flowState.samples=[];flowState.oxygen=[];flowState.cumulative=[];flowState.length=0;flowState.travel=0;
  requestRender();
}
function drawFlowRoute(route){
  window.__blood3dQA.smoothHeartTubes=0;
  clearFlowLines();
  if(!route)return;
  const all=[],oxygen=[];
  for(const edge of route.edges){
    // Blood colour is the property of the circulating point, never of a heart tube.
    // Crucial: keep oxygenation acquired at the distal lung *all the way* along
    // the returning pulmonary vein, atrium, ventricle and systemic arteries.
    let bright=edge.blood==='high';
    for(const stage of edge.stages){
      let points=stage.points.map(pointVec);
      if(stage.heartRoute){
        const side=(edge.from==='ra'||edge.from==='rv')?'right':'left';
        addHeartFlowTube(points,side);
        // Tracer and visible pipe MUST use the same V-shaped centreline.
        const pipeCurve=makeHeartFlowCurve(points);
        points=Array.from({length:129},(_,i)=>pipeCurve.getPointAt(i/128));
      }
      else if(stage.capillary)addMicrovessels(stage);
      for(let i=0;i<points.length;i++){
        if(edge.blood==='lowToHigh'&&stage.capillary&&i>=Math.floor(points.length*.5))bright=true;
        if(all.length && i===0 && all.at(-1).distanceTo(points[i])<.00001){
          if(oxygen.length)oxygen[oxygen.length-1]=bright;
          continue;
        }
        all.push(points[i]);oxygen.push(bright);
      }
    }
  }
  const cum=[0];
  for(let i=1;i<all.length;i++)cum.push(cum.at(-1)+all[i].distanceTo(all[i-1]));
  flowState.samples=all;flowState.oxygen=oxygen;flowState.cumulative=cum;
  flowState.length=cum.at(-1)||0;flowState.travel=0;
  for(const dot of flowDots)dot.visible=flowState.length>.001;
  animateFlow(0);
  window.__blood3dQA.flowVisual={drawnStages:route.stages.length,
    drawnHeartGuides:route.stages.filter(s=>s.heartRoute).length,
    drawnCapillaries:route.stages.filter(s=>s.capillary).length,
    coordinatesVisible:false,particles:flowDots.length,speed:flowState.speed,totalLength:Number(flowState.length.toFixed(4))};
  requestRender();
}
function animateFlow(dt){
  if(flowState.length<=0)return false;
  flowState.travel=(flowState.travel+dt*.11*flowState.speed)%flowState.length;
  window.__blood3dQA.flowTravel=Number(flowState.travel.toFixed(6));
  const cum=flowState.cumulative,points=flowState.samples;
  for(let n=0;n<flowDots.length;n++){
    const along=(flowState.travel+flowState.length*n/flowDots.length)%flowState.length;
    let low=0,high=cum.length-1;
    while(low+1<high){const m=(low+high)>>1;if(cum[m]<=along)low=m;else high=m;}
    const span=cum[high]-cum[low],f=span>0?(along-cum[low])/span:0;
    const dot=flowDots[n];dot.position.copy(points[low]).lerp(points[high],f);
    // Always visibly readable as a locator, not anatomically scaled RBC.
    // Set a camera-distance-dependent world radius corresponding to >= 13px on screen.
    const heightPx=Math.max(1,stage.clientHeight),perspective=2*Math.tan(THREE.MathUtils.degToRad(camera.fov)*.5);
    const radiusWorld=perspective*camera.position.distanceTo(dot.position)*(15/heightPx)*.5;
    const scale=THREE.MathUtils.clamp(radiusWorld/.0112,1,32);
    dot.scale.setScalar(scale);
    const isBright=(flowState.oxygen[f<.5?low:high]??true);
    const material=isBright?oxygenatedMaterial:deoxygenatedMaterial;
    if(dot.material!==material){dot.material=material;dot.userData.glow.material=isBright?glowHighMaterial:glowLowMaterial;}
  }
  return true;
}
let needsRender=true;
function requestRender(){needsRender=true;}
// v0.6.11: OrbitControls updates the camera *inside* its wheel handler,
// before our next animation frame. That next controls.update() can return false
// because the change was already consumed. Subscribe to the actual camera
// change event so every wheel/pinch/drag movement requests a redraw even when
// animation is otherwise idle; do not force always-on rendering.
controls.addEventListener('change',requestRender);
let lastFrame=performance.now();
function draw(){
  requestAnimationFrame(draw);
  const now=performance.now(),elapsed=Math.min(.1,(now-lastFrame)/1000);lastFrame=now;
  const moving=animateFlow(elapsed);
  const moved=controls.update();
  if(needsRender||moved||moving){
    const before=performance.now();
    renderer.render(scene,camera);
    const renderMs=performance.now()-before;
    const qa=window.__blood3dQA;
    qa.cameraDistance=Number(controls.getDistance().toFixed(6));
    qa.renderSamples=(qa.renderSamples||0)+1;
    qa.renderMsTotal=(qa.renderMsTotal||0)+renderMs;
    if(qa.renderSamples%30===0){
      qa.renderPerformance={avgRenderMs:Number((qa.renderMsTotal/qa.renderSamples).toFixed(2)),
        drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
        geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,
        pixelRatio:fixedRenderDpr,stage:[Math.round(stage.clientWidth),Math.round(stage.clientHeight)]};
    }
    needsRender=false;
  }
}draw();
let lastRenderWidth=0,lastRenderHeight=0;
function resize(){
  // Use CSS display dimensions, NEVER the canvas' pixel-backed width/height.
  const w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight);
  if(w===lastRenderWidth&&h===lastRenderHeight)return;
  lastRenderWidth=w;lastRenderHeight=h;
  camera.aspect=w/h;camera.updateProjectionMatrix();
  renderer.setSize(w,h,false);
  requestRender();
}
new ResizeObserver(resize).observe(stage);resize();
let fitOnOrientation=0;
window.addEventListener('orientationchange',()=>{
  clearTimeout(fitOnOrientation);
  fitOnOrientation=setTimeout(()=>{resize();if(state.ready)establishAnatomyCenter();},250);
});
// Entire teacher panel fits without an inner or page scrollbar.
// Zoom the panel content (never the WebGL canvas), retaining a full-width layout.
let dockFitScheduled=false;
function scheduleDockFit(){
  if(dockFitScheduled)return;dockFitScheduled=true;
  requestAnimationFrame(()=>{dockFitScheduled=false;fitDockToScreen();});
}
function fitDockToScreen(){
  const dock=$('teacherDock'),inner=$('dockInner');if(!dock||!inner)return;
  inner.style.zoom='1';inner.style.width='100%';
  const styles=getComputedStyle(dock);
  const availableH=dock.clientHeight-(parseFloat(styles.paddingTop)||0)-(parseFloat(styles.paddingBottom)||0)-2;
  const neededH=inner.scrollHeight;
  const zoom=THREE.MathUtils.clamp(Math.min(1,availableH/Math.max(1,neededH)),.38,1);
  inner.style.zoom=zoom.toFixed(4);inner.style.width='100%';
  window.__blood3dQA.dockFit={zoom:Number(zoom.toFixed(4)),availableH,rawContentH:neededH,
    hasScroll:document.documentElement.scrollHeight>innerHeight+1||dock.scrollHeight>dock.clientHeight+1};
}
window.addEventListener('resize',scheduleDockFit);
new ResizeObserver(scheduleDockFit).observe($('teacherDock'));
$('teacherDock').addEventListener('click',scheduleDockFit);
$('heartAdvanced').addEventListener('toggle',scheduleDockFit);

let defaultCameraDistance=3.8;
function establishAnatomyCenter(){
  // The original skin is a symmetrical, full-body mesh in world coordinates.
  // Ignore any hidden organ or temporary blood-flow overlays when fitting the person.
  shellRoot.updateWorldMatrix(true,true);
  const frame=new THREE.Box3().setFromObject(shellRoot,true);
  if(frame.isEmpty())frame.setFromObject(vesselRoot,true);
  if(frame.isEmpty())return;
  const bounds=frame.getSize(new THREE.Vector3());
  const visualCenter=frame.getCenter(new THREE.Vector3());
  center.copy(visualCenter);
  const tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov)*.5);
  const aspect=Math.max(.35,stage.clientWidth/Math.max(1,stage.clientHeight));
  const tanH=tanV*aspect;
  // Account for front-facing z protrusions, especially when fitting the near limbs.
  // 15% breathing room so head and feet aren't cropped by screen borders.
  const frontDepth=Math.max(0,frame.max.z-center.z);
  const fitHeight=(bounds.y*.5/Math.max(.01,tanV))*1.15+frontDepth;
  const fitWidth=(bounds.x*.5/Math.max(.01,tanH))*1.15+frontDepth;
  defaultCameraDistance=Math.max(2.8,fitHeight,fitWidth);
  // A normal overview must fit inside the existing orbit zoom limits.
  defaultCameraDistance=Math.min(defaultCameraDistance,controls.maxDistance-.3);
  window.__blood3dQA.anatomyCenter=center.toArray().map(n=>Number(n.toFixed(4)));
  window.__blood3dQA.anatomyBounds={min:frame.min.toArray(),max:frame.max.toArray()};
  window.__blood3dQA.defaultCameraDistance=Number(defaultCameraDistance.toFixed(3));
  resetCamera();
}
function resetCamera(){
  // Disable damping for ONE update to flush accumulated orbit and pan deltas.
  // Otherwise a recent pinch/pan can keep pushing the view after reset.
  const prevDamping=controls.enableDamping;
  controls.enableDamping=false;
  controls.reset(); // Clears any residual spherical/pan deltas from prior interaction.
  // Restore precisely to anatomical center rather than OrbitControls' creation target.
  controls.target.copy(center);
  camera.position.set(center.x,center.y,center.z+defaultCameraDistance);
  camera.up.set(0,1,0);
  camera.lookAt(center);
  controls.update();
  controls.enableDamping=prevDamping;
  // Save the newly established state as the canonical orbit reset state.
  controls.saveState();
  const projected=center.clone().project(camera);
  window.__blood3dQA.resetView={target:center.toArray(),position:camera.position.toArray(),projectedCenter:projected.toArray(),aspect:camera.aspect};
  requestRender();
}
renderer.domElement.addEventListener('pointerdown',e=>{ lastPointer={x:e.clientX,y:e.clientY}; });
renderer.domElement.addEventListener('pointerup',e=>{
  if(Math.hypot(e.clientX-lastPointer.x,e.clientY-lastPointer.y)>7)return;
  const r=renderer.domElement.getBoundingClientRect();
  pointer.set((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height*2-1));
  raycaster.setFromCamera(pointer,camera);
  const visibleMeshes=[...state.models.filter(m=>m.visible),...(state.heart?state.heartMeshes.filter(m=>m.visible):[])];
  const hits=raycaster.intersectObjects(visibleMeshes,false);
  if(hits.length){
    const hit=hits[0].object;
    if(state.heartMode==='chambers' && hit.userData.elementType==='heart' && ['RA','RV','LA','LV'].includes(hit.userData.heartRole)){
      toggleChamber(hit.userData.heartRole);return;
    }
    selectMesh(hit);
  }else clearSelected();
});

// Switching back to vessel-layer controls always exits blood-path mode,
// even when the teacher taps the already selected layer.
for(const b of document.querySelectorAll('[data-mode]'))b.addEventListener('click',async()=>{
  clearFlow('structure');
  const next=b.dataset.mode;
  if(state.mode===next)return;
  state.mode=next;if(next==='full')await ensureFine();applyMode();updateOrganVisibility();
});
$('arteries').addEventListener('click',()=>{clearFlow('structure');state.arteries=!state.arteries;applyMode();});
$('veins').addEventListener('click',()=>{clearFlow('structure');state.veins=!state.veins;applyMode();});
$('shell').addEventListener('change',e=>{state.shell=e.target.checked; applyShellState();}); $('heart').addEventListener('change',e=>{state.heart=e.target.checked; applyHeartState();});
for(const b of document.querySelectorAll('[data-heart-mode]'))b.addEventListener('click',()=>{
  const next=b.dataset.heartMode;
  const enteringChambers=next==='chambers'&&state.heartMode!=='chambers';
  if(enteringChambers){
    state.chamberSelection=['LV'];
    state.selectionExplicit=true;
    state.chamberOpacity={RA:.07,RV:.07,LA:.07,LV:.96};
  }
  state.heartMode=next;
  if(next==='opaque'&&!state.heart){state.heart=true;applyHeartState();}
  applyHeartAppearance();
  if(next==='opaque'||enteringChambers)focusOnHeart();
});
for(const b of document.querySelectorAll('[data-chamber]')) b.addEventListener('click',()=>{
  toggleChamber(b.dataset.chamber);
});
for(const slider of document.querySelectorAll('[data-chamber-opacity]')) slider.addEventListener('input',e=>{
  state.heartMode='chambers';state.chamberPreset='';state.selectionExplicit=true;
  const role=e.target.dataset.chamberOpacity;
  const opacity=Number(e.target.value)/100;
  state.chamberOpacity[role]=opacity;
  const set=new Set(state.chamberSelection);
  if(opacity>=.5)set.add(role);else set.delete(role);
  state.chamberSelection=['RA','RV','LA','LV'].filter(r=>set.has(r));
  applyHeartAppearance();
});
$('showHeartDetails').addEventListener('change',e=>{state.heartDetails=e.target.checked;applyHeartAppearance();});


// v0.6.5: 11 simple teaching choices, full directed internal network.
async function initializeFlow(){
  const from=$('flowFrom'),to=$('flowTo'),status=$('flowStatus');
  try{
    const loadJson=async(path)=>{
      const response=await fetch(path);if(!response.ok)throw Error('讀取路網失敗：'+path);
      return response.json();
    };
    const [cardiopulmonary,systemicArm,systemicLeg,extended]=await Promise.all([
      loadJson('./flow/cardiopulmonary-stages.json'),loadJson('./flow/systemic-left-arm-stages.json'),
      loadJson('./flow/systemic-left-leg-stages.json'),loadJson('./flow/extended-regions.json')
    ]);
    flowState.network=buildFlowNetwork({
      cardiopulmonary,systemicArm,systemicLeg,extended,
      meshNames:state.models.map(m=>m.userData.canonicalName)
    });
    for(const [key,label] of FLOW_PLACES){from.add(new Option(label,key));to.add(new Option(label,key));}
    from.value='rv';to.value='left_hand';from.disabled=to.disabled=false;
    $('showFlow').disabled=false;
    status.textContent='選好位置後顯示路徑';
    window.__blood3dQA.flowStatus='ready';
    window.__blood3dQA.flowNetworkStats=flowState.network.stats;
    window.__blood3dQA.flowPairAudit=flowState.network.pairAudit;
  }catch(error){
    console.error('血流路網未啟動（不影響其他 3D）',error);
    status.textContent='路網尚未準備好：'+(error?.message||'未知錯誤');
    window.__blood3dQA.flowStatus='error';
    window.__blood3dQA.flowError=String(error?.message||error);
  }
}
function clearFlow(reason='select'){
  flowState.route=null;flowState.meshNames.clear();clearFlowLines();
  $('flowStatus').textContent=reason==='structure'?'血管構造模式':'選好位置後顯示路徑';
  $('flowCaution').hidden=true;
  window.__blood3dQA.flowRoute=null;
  window.__blood3dQA.flowVisual=null;
  updateVesselVisibility();
  if(heartLoaded)applyHeartAppearance();
}
function showFlow(){
  const g=flowState.network;if(!g)return;
  const from=$('flowFrom').value,to=$('flowTo').value;
  const route=g.findRoute(from,to);
  clearSelected();
  flowState.route=route;
  flowState.meshNames=new Set(route?.meshList||[]);
  window.__blood3dQA.flowRoute=route?{
    from,to,edges:route.edges.map(e=>e.id),meshes:[...route.meshList],
    realCount:route.realCount,schematicCount:route.schematicCount,capillaryCount:route.capillaryCount
  }:null;
  $('flowStatus').textContent=route?'血流路徑顯示中':'尚未建立連通路徑';
  $('flowCaution').hidden=true;
  updateVesselVisibility();if(heartLoaded)applyHeartAppearance();drawFlowRoute(route);
}
// Teachers may change playback speed without resetting the selected path.
function setFlowSpeed(value){
  flowState.speed=value===2?2:1;
  for(const button of document.querySelectorAll('[data-flow-speed]')){
    const active=Number(button.dataset.flowSpeed)===flowState.speed;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  }
  window.__blood3dQA.flowSpeed=flowState.speed;
  requestRender();
}
for(const button of document.querySelectorAll('[data-flow-speed]'))
  button.addEventListener('click',()=>setFlowSpeed(Number(button.dataset.flowSpeed)));
setFlowSpeed(1);
$('showFlow').addEventListener('click',showFlow);
for(const id of ['flowFrom','flowTo'])$(id).addEventListener('change',()=>clearFlow('select'));

$('resetView').addEventListener('click',resetCamera);
for(const button of document.querySelectorAll('[data-organ]')){
  button.addEventListener('click',()=>{
    const key=button.dataset.organ;
    if(!organMeshes[key]?.length)return;
    state.organs[key]=!state.organs[key];
    updateOrganVisibility();
  });
}

try{
  $('heart').disabled=true; $('heartFocus').disabled=true; $('shell').disabled=true; syncHeartControls();
  setProgress(8,'讀取第一層：核心血管…'); await Promise.all(files.filter(x=>x.tier==='core').map(loadFile));
  setProgress(28,'讀取第二層：主要血管…'); await Promise.all(files.filter(x=>x.tier==='main').map(loadFile));
  setProgress(44,'讀取肺部主幹與完整血管資料…'); await Promise.all(files.filter(x=>x.tier==='fine').map(loadFile));
  setProgress(62,'讀取自然人體外殼…'); await loadSkin();
  setProgress(82,'讀取心臟與器官模型…'); await loadHeartModel();
  setProgress(100,'模型載入完成');
  applyMode();state.ready=true;load.hidden=true;
  resize();establishAnatomyCenter();scheduleDockFit();
  await initializeFlow();
  if('serviceWorker' in navigator && location.protocol==='https:') navigator.serviceWorker.register('./sw.js').catch(()=>{});
}catch(err){ console.error(err); showError(err?.message||String(err)); }
