/**
 * V0.55 | Original-GLB mesh-derived organ routes, verified-first directed network.
 * This module describes APPROVED blood-flow connections; it never infers a
 * vessel by linking whichever 3-D endpoints happen to be nearest.
 * Real parts retain the V0.52 decoded GLB-centreline samples. A missing part
 * must be declared explicitly as a schematic, never silently auto-bridged.
 * The heart selector is a region: artery departures begin at left heart and
 * pulmonary departures at right heart; arrivals retain physiological sidedness.
 */
import {makePulmonaryBridge} from './pulmonary-network.mjs';
import {buildAnatomicalOrganRoutes} from './anatomical-organ-routes.mjs';

export const REGION_CHOICES=Object.freeze([
 ['heart','心臟'],['lung','肺臟'],['head','頭部'],
 ['left_arm','左手臂'],['right_arm','右手臂'],
 ['left_leg','左下肢'],['right_leg','右下肢'],['kidney','腎臟']
]);
const LABEL=Object.fromEntries(REGION_CHOICES);
const EPS=.0035; // 3.5 mm maximum verified join; not permission to create a bridge
const OPEN_BODY=['head','left_arm','right_arm','left_leg','right_leg','kidney'];
const P={
 arch:[.00583,1.36022,.028574],
 rightHeart:[-.016618,1.340799,.017772],
 head:[-.001,1.657,.015],
 kidney:[-.091,1.096,-.028],
 right_leg:[-.116,.475,-.021]
};
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const first=s=>s.points[0],last=s=>s.points.at(-1);
export const polylineLength=pts=>pts.slice(1).reduce((sum,p,i)=>sum+distance(p,pts[i]),0);
const clone=pts=>pts.map(p=>p.map(Number));
function checkPoints(pts,label){
 if(!Array.isArray(pts)||pts.length<2||pts.some(p=>!Array.isArray(p)||p.length!==3||p.some(x=>!Number.isFinite(x))))
  throw Error('路網座標不完整：'+label);
 const length=polylineLength(pts);
 if(length<.00001)throw Error('路網路段長度為零：'+label);
 return length;
}
/** Explicitly approved schematic anatomical connector. */
function schematic(id,title,oxygen,system,points,props={}){
 const p=clone(points);checkPoints(p,id);
 return {kind:'schematic',networkId:id,title,oxygen,teachingSystem:system,
   points:p,source:'V0.53 明確核准的教學示意連接，非 GLB 中心線',
   educationalApproximation:true,radiusModelUnit:.0027,...props};
}
function exchange(id,name,from,to){
 const mid=from.map((x,i)=>(x+to[i])/2);
 return schematic(id,`${name}｜組織交換`,'high-to-low','tissue-exchange',[from,mid,to],{
  tissue:{center:mid,radius:.009}
 });
}
function real(verified,slug,title,oxygen){
 const s=verified?.routes?.[slug];if(!s?.points?.length)throw Error('缺少 GLB 中心線：'+slug);
 return {kind:'real',networkId:slug,title,oxygen,points:clone(s.points),
  meshes:(s.segments||[]).map(x=>x.name).filter(Boolean),
  source:'原始 GLB 解碼驗證中心線'};
}
function stageLength(s){return polylineLength(s.points)};
function normalizeEdgeStages(edgeId,stages){
 const ss=stages.flatMap(s=>Array.isArray(s)?s:[s]).map((s,i)=>{
  if(!s)throw Error(`缺少血管段：${edgeId}/${i}`);
  const out={...s,points:clone(s.points),networkEdge:edgeId};
  if(out.kind==='real'&&!out.source)out.source='V0.52 已驗證的 GLB 血管中心線';
  if(['schematic','simplified'].includes(out.kind)){
   out.educationalApproximation=true;
   if(!out.source)out.source='原有教學簡化或示意路段，非 GLB 解剖中心線';
  }
  out.provenance={
    kind:out.anatomicalMethod==='pca-tube-centroid'?'mesh-derived-centreline':out.kind==='real'?'decoded-centreline':'educational-schematic',
    description:out.anatomicalMethod==='pca-tube-centroid'?'由原始 GLB 血管表面取樣估算管腔中心線（未人工逐點核准）':
      out.kind==='real'?'原始 GLB 已驗證中心線':'非精確解剖：需明確標示的教學示意'};
  checkPoints(out.points,`${edgeId}/${i}`);
  return out;
 });
 if(!ss.length)throw Error('空的血管路網邊：'+edgeId);
 for(let i=1;i<ss.length;i++){
  const gap=distance(last(ss[i-1]),first(ss[i]));
  // No interpolation, no ad-hoc bridge creation here.
  if(gap>EPS)throw Error(`血管接點不連續：${edgeId} stage ${i-1}→${i}，相距 ${(gap*1000).toFixed(1)} mm`);
 }
 return ss;
}
export function assembleBloodNetwork(context){
 const cp=context?.cardiopulmonary?.stages,sys=context?.systemicArm?.stages,verified=context?.verifiedPaths;
 if(!cp||cp.length!==10||!sys||sys.length!==10||!verified?.routes)
  throw Error('心肺、體循環或解碼血管資料尚未準備好');
 const pulmonary=makePulmonaryBridge(cp,context.pulmonaryMeshCenterlines,context.meshCenterlines);
 const pulmonaryExchangeAt=pulmonary.findIndex(s=>s.teachingSystem==='lung-exchange');
 if(pulmonaryExchangeAt<0)throw Error('肺內血流資料缺少交換區');
 // Reject unexpectedly changed GLB data rather than stretch an approved
 // schematic bridge across a different vessel or a different body position.
 const anchorChecks=[
  ['aortic arch',last(cp[8]),P.arch],
  ['right arm artery start',first(verified.routes['right-arm-artery']||{points:[[]]}),[-.015,1.413,.016]],
  ['right arm vein end',last(verified.routes['right-arm-vein']||{points:[[]]}),[-.023,1.401,.019]],
  ['left leg artery start',first(verified.routes['left-leg-artery-proximal']||{points:[[]]}),[.009,1.208,-.010]],
  ['left leg vein end',last(verified.routes['left-leg-vein']||{points:[[]]}),[-.015,1.263,.022]]
 ];
 for(const [name,observed,expected] of anchorChecks){
  if(observed?.length!==3||distance(observed,expected)>.006)
   throw Error('已核准的接點與原始血管位置不符：'+name);
 }
 const edges=new Map(),adj=new Map();
 function add(id,from,to,stages){
  if(edges.has(id))throw Error('血流邊重複：'+id);
  const list=normalizeEdgeStages(id,stages);
  const item={id,from,to,stages:list,length:list.reduce((s,x)=>s+stageLength(x),0)};
  edges.set(id,item);if(!adj.has(from))adj.set(from,[]);adj.get(from).push(item);
 }
 // Right heart > pulmonary artery > ONE lung > pulmonary vein > left heart.
 add('right-heart-to-lung','right_heart','lung',[...cp.slice(1,5),...pulmonary.slice(0,pulmonaryExchangeAt+1)]);
 add('lung-to-left-heart','lung','left_heart',[...pulmonary.slice(pulmonaryExchangeAt+1),...cp.slice(6,8)]);
 add('left-heart-to-aorta','left_heart','aorta',[cp[8]]);
 // The left arm is the complete verified teaching reference circuit.
 add('aorta-to-left-arm','aorta','left_arm',[...sys.slice(1,5)]);
 add('left-arm-to-right-heart','left_arm','right_heart',[...sys.slice(5,9)]);
 // Other organs must have explicitly approved connections, not nearest-end auto-bridges.
 const rightA=real(verified,'right-arm-artery','右手臂動脈','high');
 const rightV=real(verified,'right-arm-vein','右手臂靜脈','low');
 add('aorta-to-right-arm','aorta','right_arm',[
  schematic('aorta-right-arm-junction','主動脈弓 → 右鎖骨下動脈（示意）','high','approved-junction',
   [last(cp[8]),[-.006,1.376,.025],[-.012,1.399,.017],first(rightA)]),
  rightA,exchange('right-arm-tissue','右手臂',last(rightA),first(rightV))
 ]);
 add('right-arm-to-right-heart','right_arm','right_heart',[
  rightV,
  schematic('right-arm-svc-junction','右頭臂靜脈接入上腔靜脈（示意）','low','approved-junction',
   [last(rightV),[-.019,1.392,.020],first(cp[0])]),
  cp[0]
 ]);
 const leftA=real(verified,'left-leg-artery-proximal','左下肢主要動脈','high');
 const leftV=real(verified,'left-leg-vein','左下肢主要靜脈','low');
 add('aorta-to-left-leg','aorta','left_leg',[
  schematic('aorta-left-leg-junction','降主動脈與髂動脈連接（示意）','high','approved-junction',
   [last(cp[8]),[.007,1.326,.012],[.009,1.263,-.002],first(leftA)]),
  leftA,
  // Actual proximal arterial and venous centrelines stop at different heights.
  // Do NOT draw a 20 cm 'capillary' straight between them. A documented
  // terminal arterial extension, short tissue exchange, then venous extension
  // keeps the conceptual down-and-back direction explicit.
  schematic('left-leg-distal-arterial','左下肢末端動脈延伸（示意）','high','approved-junction',
   [last(leftA),[.098,.340,-.049],[.105,.321,-.034]]),
  exchange('left-leg-tissue','左下肢',[.105,.321,-.034],[.092,.322,-.022])
 ]);
 add('left-leg-to-right-heart','left_leg','right_heart',[
  schematic('left-leg-distal-venous','左下肢末端靜脈回流（示意）','low','approved-junction',
   [[.092,.322,-.022],[.081,.431,-.020],first(leftV)]),
  leftV,
  schematic('ivc-left-leg-junction','下腔靜脈回右心房（示意）','low','approved-junction',
   [last(leftV),[-.016,1.304,.020],first(cp[1])])
 ]);
 // V0.54: Head, right leg and kidney now traverse specific decoded GLB
 // tube centre estimates wherever the actual vascular mesh exists. Missing
 // small-vessel/tissue connectors are named and bounded, not guessed.
 const anatomical=buildAnatomicalOrganRoutes(context.cardiopulmonary,context.meshCenterlines);
 for(const [id,r] of Object.entries(anatomical)){
  add('aorta-to-'+id,'aorta',id,r.arterial);
  add(id+'-to-right-heart',id,'right_heart',r.venous);
 }
 // Boundary checks: shared node coordinates must be identical (up to EPS).
 const entries=new Map(),exits=new Map();
 for(const edge of edges.values()){
  const a=first(edge.stages[0]),b=last(edge.stages.at(-1));
  if(entries.has(edge.from)&&distance(a,entries.get(edge.from))>EPS)throw Error('血流入口節點未對齊：'+edge.from+' / '+edge.id);
  if(exits.has(edge.to)&&distance(b,exits.get(edge.to))>EPS)throw Error('血流出口節點未對齊：'+edge.to+' / '+edge.id);
  entries.set(edge.from,a);exits.set(edge.to,b);
 }
 for(const node of entries.keys())if(exits.has(node)&&distance(entries.get(node),exits.get(node))>EPS)
  throw Error('有向路網節點入／出口不相連：'+node);
 return {edges,adj,regions:OPEN_BODY};
}
function findNodePath(graph,from,to){
 if(from===to)return [];
 const q=[from],prev=new Map([[from,null]]);
 for(let i=0;i<q.length;i++){
  const node=q[i];if(node===to)break;
  for(const edge of graph.adj.get(node)||[])if(!prev.has(edge.to)){
   prev.set(edge.to,edge);q.push(edge.to);
  }
 }
 if(!prev.has(to))throw Error('有向血流路網沒有可行連通：'+from+' → '+to);
 const steps=[];
 for(let node=to;node!==from;){const edge=prev.get(node);steps.push(edge);node=edge.from;}
 return steps.reverse();
}
function normalizePlaybackDurations(stages){
 // One visual-distance clock, not fixed arbitrary dwell per stage.
 // This is deliberately a TEACHING speed, not an actual blood-flow speed.
 const visualSpeed=.145; // model metres / second, all non-exchange segments
 return stages.map(s=>{
  const len=stageLength(s);
  const exchange=['lung-exchange','tissue-exchange','arm-exchange'].includes(s.teachingSystem);
  const durationMs=exchange?Math.max(750,Math.round(1000*len/.075)):
   Math.max(90,Math.round(1000*len/visualSpeed));
  return {...s,durationMs,networkLength:len};
 });
}
export function buildDirectedRegionRoute(from,to,context){
 if(!(from in LABEL)||!(to in LABEL))throw Error('未知的器官選項');
 const g=assembleBloodNetwork(context);
 // Sidedness of the heart is deliberately explicit inside the path engine.
 // A→A for each organ traverses both pulmonary and systemic circuits.
 let path=[];
 function push(a,b){path.push(...findNodePath(g,a,b));}
 if(from==='heart'&&to==='heart'){
  push('right_heart','lung');push('lung','left_heart');push('left_heart','left_arm');push('left_arm','right_heart');
 }else if(from==='lung'&&to==='lung'){
  push('lung','left_heart');push('left_heart','left_arm');push('left_arm','right_heart');push('right_heart','lung');
 }else if(from===to){
  push(from,'right_heart');push('right_heart','lung');push('lung','left_heart');push('left_heart',to);
 }else{
  const origin=from==='heart'?(to==='lung'?'right_heart':'left_heart'):from;
  const target=to==='heart'?(from==='lung'?'left_heart':'right_heart'):to;
  push(origin,target);
 }
 if(!path.length)throw Error('未找到符合生理方向的血流路徑');
 const raw=path.flatMap(e=>e.stages);
 const stages=normalizePlaybackDurations(raw);
 for(let i=1;i<stages.length;i++){
  const gap=distance(last(stages[i-1]),first(stages[i]));
  if(gap>EPS)throw Error('跨血管段接點不連續，拒絕播放：'+stages[i].networkEdge);
 }
 const length=stages.reduce((sum,s)=>sum+s.networkLength,0);
 const schematicLength=stages.filter(s=>s.educationalApproximation||s.kind==='simplified').reduce((sum,s)=>sum+s.networkLength,0);
 return {
  title:`${LABEL[from]} → ${LABEL[to]}`,from,to,stages,
  networkEdges:path.map(e=>e.id),networkVersion:'V0.55',isLoop:from===to,
  hasConceptual:schematicLength>0,schematicCount:stages.filter(s=>s.educationalApproximation).length,
  schematicDistance:schematicLength,realDistance:length-schematicLength,totalDistance:length,
  schematicFraction:schematicLength/length,maxGap:0,
  hasPulmonaryExchange:stages.some(s=>s.teachingSystem==='lung-exchange'),
  hasTissueExchange:stages.some(s=>['tissue-exchange','arm-exchange'].includes(s.teachingSystem))
 };
}
