import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {buildFlowNetwork,FLOW_PLACES} from '../flow-network.mjs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const levels=read('../models/mesh-levels.json');
const meshNames=[...levels.arteries,...levels.veins].map(a=>a.name);
const g=buildFlowNetwork({cardiopulmonary:read('../flow/cardiopulmonary-stages.json'),systemicArm:read('../flow/systemic-left-arm-stages.json'),
 systemicLeg:read('../flow/systemic-left-leg-stages.json'),extended:read('../flow/extended-regions.json'),meshNames});
assert.equal(g.stats.visibleNodes,11);assert.equal(g.stats.allPairs,121);assert.equal(g.stats.unavailablePairs,0);
const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
for(const [a] of FLOW_PLACES)for(const [b] of FLOW_PLACES){
 const route=g.findRoute(a,b);assert(route?.stages.length);
 assert.equal(route.edges[0].from,a);assert.equal(route.edges.at(-1).to,b);
 for(let k=1;k<route.stages.length;k++)assert(distance(route.stages[k-1].points.at(-1),route.stages[k].points[0])<1e-5,a+' to '+b+' broken stage seam '+k);
 if(a===b){assert(route.capillaryCount>=3,a+' full loop lacks body+lung microvessels');}
}
for(const body of ['left_hand','right_hand','left_foot','right_foot','head']){
 const rv=g.findRoute(body,body);
 assert(rv.edges.some(e=>e.id==='pa_to_pv'),body+' must circulate via lungs');
 const reverse=g.findRoute(body,'lv');
 assert(reverse.edges.some(e=>e.id==='ra_rv'),body+' cannot flow upstream into left ventricle');
}
const pulmonaryEdge=g.edges.find(e=>e.id==='pa_to_pv');
assert(pulmonaryEdge.stages.some(s=>s.mesh==='Lateral segmental artery of right lung'));
assert(pulmonaryEdge.stages.some(s=>s.mesh==='Lateral vein of right lung'));
assert(pulmonaryEdge.stages.some(s=>(s.highlightMeshes||[]).includes('Middle lobar artery of right lung')));
const returnToAtrium=g.edges.find(e=>e.id==='pv_la');
assert(returnToAtrium.stages.some(s=>(s.highlightMeshes||[]).includes('Right superior pulmonary vein')));
const mainPulmonary=g.edges.find(e=>e.id==='pulmonary_trunk_to_pa');
assert(mainPulmonary.stages.some(s=>(s.highlightMeshes||[]).includes('Bifurcation of pulmonary trunk')));
const completePulmonary=g.findRoute('rv','la');
for(const required of ['Pulmonary trunk','Bifurcation of pulmonary trunk','Right pulmonary artery',
 'Middle lobar artery of right lung','Lateral segmental artery of right lung','Lateral vein of right lung',
 'Right superior pulmonary vein'])assert(completePulmonary.meshList.includes(required),'unhighlighted native segment: '+required);
const capIdx=pulmonaryEdge.stages.findIndex(s=>s.capillary && s.exchange==='pulmonary');
assert(capIdx>0 && capIdx<pulmonaryEdge.stages.length-1,'exchange must be distal, between real lung vessels');
const sourceStage=pulmonaryEdge.stages.find(s=>s.mesh==='Lateral segmental artery of right lung');
assert(sourceStage.points.some(p=>p[0]<-.100),'arterial branch must reach distal right lung');
const returnStage=pulmonaryEdge.stages.find(s=>s.mesh==='Lateral vein of right lung');
assert(returnStage.points.some(p=>p[0]<-.09),'venous branch must return from distal right lung');
for(const body of ['left_hand','right_hand','left_foot','right_foot','head']){
 const route=g.findRoute('rv',body);
 assert(route.edges.some(e=>e.id==='pa_to_pv'));
 assert(route.edges.some(e=>e.blood==='high'),'oxygenated blood should reach systemic branch');
}
const names=Object.fromEntries(FLOW_PLACES);
writeFileSync(new URL('../flow/all-pairs-audit.json',import.meta.url),JSON.stringify({version:'0.6.7',nodes:11,pairs:121,
 notes:'區域與微血管為教學示意，原生血管坐標另行驗證；A=B 完整閉環',places:names,
 pairsList:g.pairAudit.map(p=>({...p,fromLabel:names[p.from],toLabel:names[p.to],path:g.findRoute(p.from,p.to).text}))},null,2));
console.log('PASS all original pulmonary junction meshes + source capillaries; '+g.stats.allPairs+'／121 combinations, '+g.stats.internalNodes+' internal nodes, '+g.stats.edges+' edges');
