/**
 * Blood3D v0.6.8 — simplified *choices*, complete internal directed circulation.
 * Source blood vessel geometry and original GLBs remain read-only.
 * Exact tissue microvessels and intracardiac routes are explicitly schematic.
 */
export const FLOW_PLACES=Object.freeze([
 ['ra','右心房'],['rv','右心室'],['la','左心房'],['lv','左心室'],
 ['pulmonary_artery','肺動脈'],['pulmonary_vein','肺靜脈'],
 ['head','頭部末端'],['left_hand','左手掌'],['right_hand','右手掌'],
 ['left_foot','左腳末端'],['right_foot','右腳末端']
]);
const LABELS=new Map([...FLOW_PLACES,...[['svc','上腔靜脈'],['pulmonary_trunk','肺動脈幹'],['arch','主動脈弓'],['descending','降主動脈'],['lower_aorta','腹主動脈'],['ivc','下腔靜脈']]]);
const MAX_POINT_SPACING=.025;
function distance(a,b){return Math.hypot(...a.map((n,i)=>n-b[i]));}
const seam=(a,b)=>distance(a.points.at(-1),b.points[0]);
const GLBnames=s=>s.mesh?[s.mesh]:(s.meshes||[]);
function fail(m){throw Error('血流路網檢核失敗：'+m);}
function bridge(a,b,title){
 const steps=Math.max(2,Math.ceil(distance(a,b)/.006));
 const points=Array.from({length:steps+1},(_,i)=>a.map((x,k)=>Number((x+(b[k]-x)*i/steps).toFixed(6))));
 return {kind:'simplified',title,points,source:'Marked schematic seam between known source anchors'};
}
export function buildFlowNetwork({cardiopulmonary,systemicArm,systemicLeg,extended,meshNames}){
 const cp=cardiopulmonary?.stages,s=systemicArm?.stages,l=systemicLeg?.stages,r=extended?.regions;
 if(cp?.length!==10||s?.length!==10||l?.length!==7||extended?.schemaVersion!==1||!r)fail('路網來源資料不足');
 const native=new Set(meshNames||[]);
 function validate(stage,id){
  if(!stage||!['real','simplified','schematic'].includes(stage.kind))fail(id+' 類型錯誤');
  if(!stage.points?.length||stage.points.length<2)fail(id+' 缺少中心線點');
  for(const p of stage.points)if(p.length!==3||p.some(v=>!Number.isFinite(v)))fail(id+' 座標錯誤');
  for(let k=1;k<stage.points.length;k++)if(distance(stage.points[k-1],stage.points[k])>MAX_POINT_SPACING)fail(id+' 座標跳接太長');
  for(const n of [...GLBnames(stage),...(stage.highlightMeshes||[])])if(!native.has(n))fail(id+' 找不到 GLB：'+n);
  if(stage.kind==='real'&&!GLBnames(stage).length)fail(id+' 真實血管未標註網格');
  if(stage.kind!=='real'&&GLBnames(stage).length)fail(id+' 示意段不可冒充原生血管');
 }
 const edges=[];
 const nodes=new Set(['ra','rv','la','lv','pulmonary_artery','pulmonary_vein','head','left_hand','right_hand','left_foot','right_foot',
   'svc','pulmonary_trunk','arch','descending','lower_aorta','ivc']);
 function add(id,from,to,blood,...groups){
  if(!nodes.has(from)||!nodes.has(to))fail(id+' 端點不存在');
  const input=groups.flat(Infinity).filter(Boolean),stages=[];
  if(!input.length)fail(id+' 缺少路段');
  for(const stage of input){
   validate(stage,id+'/'+stage.title);
   if(stages.length && seam(stages.at(-1),stage)>1e-5){
    const a=stages.at(-1).points.at(-1),b=stage.points[0];
    const link=bridge(a,b,id+'｜端點銜接（示意）');
    validate(link,id+'/bridge');
    stages.push(link);
   }
   stages.push(stage);
  }
  edges.push({id,from,to,blood,stages});
 }
 add('svc_ra','svc','ra','low',cp[0]);
 add('ra_rv','ra','rv','low',cp[1]);
 add('rv_pulmonary_trunk','rv','pulmonary_trunk','low',cp[2]);
 add('pulmonary_trunk_to_pa','pulmonary_trunk','pulmonary_artery','low',cp[3]);
 // Right pulmonary arterial supply, lung alveolar exchange, then venous return.
 // Far pulmonary capillary exchange: follow the pre-extracted distal right-lung
 // branch rather than jumping from the first few millimetres of the PA trunk.
 if(!Array.isArray(cardiopulmonary.pulmonaryArteryDistal)||!Array.isArray(cardiopulmonary.pulmonaryVeinDistal))fail('缺少遠端肺內路徑');
 add('pa_to_pv','pulmonary_artery','pulmonary_vein','lowToHigh',
   cp[4],cardiopulmonary.pulmonaryArteryDistal,cp[5],cardiopulmonary.pulmonaryVeinDistal);
 add('pv_la','pulmonary_vein','la','high',cp[6]);
 add('la_lv','la','lv','high',cp[7]);
 add('lv_arch','lv','arch','high',cp[8]);
 // Upper-body branches: each visible end point lies inside the exchange bed.
 add('arch_left_hand','arch','left_hand','high',r.common.leftArmIn,r.left_hand.artery,r.left_hand.arterialExchange);
 add('left_hand_svc','left_hand','svc','low',r.left_hand.venousExchange,r.left_hand.vein,r.common.leftArmOut);
 add('arch_right_hand','arch','right_hand','high',r.common.rightArmIn,r.right_hand.artery,r.right_hand.arterialExchange);
 add('right_hand_svc','right_hand','svc','low',r.right_hand.venousExchange,r.right_hand.vein,r.common.rightArmOut);
 add('arch_head','arch','head','high',r.common.headIn,r.head.artery,r.head.arterialExchange);
 add('head_svc','head','svc','low',r.head.venousExchange,r.head.vein,r.common.headOut);
 // Descending aorta and two distinctly directed leg routes to distal feet.
 add('arch_descending','arch','descending','high',cp[9]);
 add('descending_to_lower_aorta','descending','lower_aorta','high',r.common.descending,r.common.aortic);
 add('lower_aorta_left_foot','lower_aorta','left_foot','high',r.common.leftFootIn,r.left_foot.artery,r.left_foot.arterialExchange);
 add('left_foot_ivc','left_foot','ivc','low',r.left_foot.venousExchange,r.left_foot.vein,r.common.leftFootOut);
 add('lower_aorta_right_foot','lower_aorta','right_foot','high',r.common.rightFootIn,r.right_foot.artery,r.right_foot.arterialExchange);
 add('right_foot_ivc','right_foot','ivc','low',r.right_foot.venousExchange,r.right_foot.vein,r.common.rightFootOut);
 add('ivc_ra','ivc','ra','low',l[6]);
 const outgoing=new Map([...nodes].map(n=>[n,[]]));
 for(const edge of edges)outgoing.get(edge.from).push(edge);
 function shortest(from,to){
  const seen=new Map([[from,null]]),queue=[from];
  for(let i=0;i<queue.length;i++){
   let node=queue[i];if(node===to)break;
   for(const edge of outgoing.get(node))if(!seen.has(edge.to)){
    seen.set(edge.to,edge);queue.push(edge.to);
   }
  }
  if(!seen.has(to))return null;
  const path=[];
  for(let n=to;n!==from;){const e=seen.get(n);path.unshift(e);n=e.from;}
  return path;
 }
 function findRoute(from,to){
  if(!nodes.has(from)||!nodes.has(to))return null;
  let selected;
  if(from===to){
   const candidates=outgoing.get(from).map(e=>{const tail=shortest(e.to,from);return tail?[e,...tail]:null;}).filter(Boolean);
   candidates.sort((a,b)=>a.length-b.length);
   selected=candidates[0];
  }else selected=shortest(from,to);
  if(!selected?.length)return null;
  const stages=selected.flatMap(e=>e.stages);
  const used=new Set();
  for(const stage of stages){
   for(const n of GLBnames(stage))used.add(n);
   for(const n of stage.highlightMeshes||[])used.add(n);
  }
  return {from,to,edges:selected,stages,meshList:[...used],capillaryCount:stages.filter(s=>s.capillary).length,
   schematicCount:stages.filter(s=>s.kind!=='real').length,
   realCount:stages.filter(s=>s.kind==='real').length,
   text:selected.map(e=>LABELS.get(e.from)||e.from).concat(LABELS.get(to)||to).join(' → '),
   warnings:stages.filter(s=>s.kind!=='real').map(s=>s.title)};
 }
 // Full audit of only the deliberately small teaching controls (11 × 11).
 const pairAudit=[];
 for(const [from] of FLOW_PLACES)for(const [to] of FLOW_PLACES){
  const route=findRoute(from,to);
  pairAudit.push({from,to,exists:Boolean(route),edgeIds:route?.edges.map(e=>e.id)||[],
   capillaryCount:route?.capillaryCount||0,schematicCount:route?.schematicCount||0});
 }
 const unavailable=pairAudit.filter(p=>!p.exists);
 if(unavailable.length)fail('仍有 '+unavailable.length+' 組未連通');
 for(const edge of edges){
  for(let k=1;k<edge.stages.length;k++)if(seam(edge.stages[k-1],edge.stages[k])>.00001)fail(edge.id+' 內部斷開');
 }
 for(const a of edges)for(const b of outgoing.get(a.to)){
  if(seam(a.stages.at(-1),b.stages[0])>.00001)
   fail(a.to+' 從 '+a.id+' 接 '+b.id+' 時座標中斷，必須修補底層分叉');
 }
 return {places:FLOW_PLACES,edges,findRoute,pairAudit,
  stats:{visibleNodes:FLOW_PLACES.length,internalNodes:nodes.size,edges:edges.length,
   allPairs:pairAudit.length,unavailablePairs:unavailable.length,capillaryBeds:6,
   uniqueMeshCount:new Set(edges.flatMap(e=>e.stages.flatMap(s=>[...GLBnames(s),...(s.highlightMeshes||[])]))).size}};
}
