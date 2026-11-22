/**
 * V0.55 — named GLB pulmonary arterial/venous branches, verified-first.
 * Yellow particle visits ONE right-lung middle-lobe segment, not both lungs.
 * All missing branchpoint and alveolar connections are short, explicitly
 * approved pedagogic bridges, NEVER guessed by proximity at playback time.
 * Main GLB pulmonary artery and pulmonary vein remain unchanged in CP stages.
 */
const clone=p=>p.map(Number);
const d=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const median=(a,b)=>a.map((n,i)=>(n+b[i])/2);
const verified=(data,name,flow,oxygen,title)=>{
 const s=data?.routes?.[name];if(!s?.points?.length||s.points.length<10)throw Error('缺少肺內具名血管模型：'+name);
 if(s.quality.maxStepM>.025||s.quality.p95NearestSurfaceM>.012)throw Error('肺內血管抽樣超出品質限制：'+name);
 let pts=s.points.map(clone);if(flow==='reverse')pts.reverse();
 else if(flow!=='forward')throw Error('肺循環血管方向未設定：'+name);
 for(let i=1;i<pts.length;i++)if(d(pts[i],pts[i-1])>.025)throw Error('肺內血管抽樣跳接：'+name);
 return {kind:'real',title,oxygen,points:pts,meshes:[name],originalMesh:name,
  sourceFile:s.sourceFile,anatomicalMethod:'pca-tube-centroid',meshSampleQuality:s.quality,
  radiusModelUnit:.0024,source:'原始 GLB 具名肺血管表面自動估計中心線（非專家逐點核准）'};
};
const approved=(id,title,oxygen,a,b,max,via=[])=>{
 const gap=d(a,b);if(gap>max)throw Error(`${id} 肺部核准接點偏離：${(gap*1000).toFixed(1)} mm，門檻 ${(max*1000).toFixed(1)} mm`);
 if(gap<1e-6) return null;
 return {kind:'schematic',networkId:id,title,oxygen,teachingSystem:'approved-junction',
   points:[clone(a),...via.map(clone),clone(b)],radiusModelUnit:.0022,educationalApproximation:true,
   approvedJunction:id,maximumApprovedGapM:max,actualAnchorGapM:gap,
   source:'具名血管在原始 GLB 中未融合的短接點，明示教學示意（非精確解剖連接）'};
};
const put=(arr,st)=>{if(st)arr.push(st)};
const fst=s=>s.points[0],lst=s=>s.points.at(-1);
export function makePulmonaryBridge(cp,pulmonaryMesh,mainMesh){
 if(!Array.isArray(cp)||cp.length<8)throw Error('缺少原始肺循環主要血管');
 if(pulmonaryMesh?.schemaVersion!=='V0.55'||mainMesh?.schemaVersion!=='V0.54')
  throw Error('尚未取得 V0.55 肺內中心線及 V0.54 核心血管中心線');
 const MA=verified(pulmonaryMesh,'Middle lobar artery of right lung','reverse','low','右肺中葉動脈（原始模型估計中心線）');
 const SA=verified(pulmonaryMesh,'Lateral segmental artery of right lung','reverse','low','右肺外側肺段動脈（原始模型估計中心線）');
 const SV=verified(pulmonaryMesh,'Lateral vein of right lung','reverse','high','右肺外側肺段靜脈（原始模型估計中心線）');
 const PV=verified(mainMesh,'Right superior pulmonary vein','forward','high','右上肺靜脈（原始模型估計中心線）');
 // Important: The lateral segmental artery and lateral lung vein serve the
 // same middle-lobe region, avoiding the old false central 3cm loop.
 const stages=[];
 put(stages,approved('pa-middle-lobe','右肺動脈到中葉動脈（示意接點）','low',lst(cp[4]),fst(MA),.006));
 stages.push(MA);
 put(stages,approved('middle-lateral-artery','中葉動脈到外側肺段動脈（示意接點）','low',lst(MA),fst(SA),.012));
 stages.push(SA);
 const exFrom=lst(SA),exTo=fst(SV);
 if(d(exFrom,exTo)>.023||d(exFrom,exTo)<.004)throw Error('右肺動靜脈交換區距離不合理');
 const capillary={kind:'schematic',networkId:'right-middle-lobe-exchange',title:'右肺中葉微血管氣體交換（教學示意）',
  oxygen:'transition',teachingSystem:'lung-exchange',points:[clone(exFrom),median(exFrom,exTo),clone(exTo)],
  radiusModelUnit:.0026,educationalApproximation:true,
  alveolus:{center:median(exFrom,exTo),radius:.008},
  source:'肺泡微血管不存在於本模型，動靜脈之間以短距離教學示意表示'};
 stages.push(capillary,SV);
 put(stages,approved('lateral-superior-pv','右肺外側靜脈匯入上肺靜脈（示意接點）','high',lst(SV),fst(PV),.011));
 stages.push(PV);
 put(stages,approved('pulmonary-vein-root','上肺靜脈接左心方向（示意接點）','high',lst(PV),fst(cp[6]),.005));
 for(let i=1;i<stages.length;i++)if(d(lst(stages[i-1]),fst(stages[i]))>.000001)
  throw Error('肺循環接點不連續：'+stages[i-1].title+' → '+stages[i].title);
 return stages;
}
export function expandedPulmonaryRoute(cp,assets,{part='all'}={}){
 const b=makePulmonaryBridge(cp,assets?.pulmonaryMeshCenterlines,assets?.meshCenterlines),i=b.findIndex(s=>s.teachingSystem==='lung-exchange');
 if(part==='to-lung')return [...cp.slice(1,5),...b.slice(0,i+1)];
 if(part==='from-lung')return [...b.slice(i+1),...cp.slice(6,8)];
 if(part==='all')return [...cp.slice(1,5),...b,...cp.slice(6,8)];
 throw Error('未知肺循環路徑區段');
}
/** Right lung is based on three original mesh branches; left is a clearly
 * distinct conceptual parallel guide, NOT traversed by the moving particle. */
export function pulmonaryGuideData(pulmonaryMesh){
 const out=[];
 for(const [name,oxygen] of [['Middle lobar artery of right lung','low'],['Lateral segmental artery of right lung','low'],['Lateral vein of right lung','high']]){
  const src=pulmonaryMesh?.routes?.[name];if(src)out.push({name:name+'（原始 GLB 抽樣）',oxygen,side:'right',points:src.points.map(clone),meshDerived:true});
 }
 // Left parallel branches are visual educational references only. Do not
 // claim left pulmonary microvessels are anatomically captured by this route.
 const schematics=[
  ['左肺動脈路徑（示意）','low',[[.029,1.345,.030],[.066,1.362,-.015],[.099,1.359,-.023],[.124,1.346,-.024]]],
  ['左肺微血管交換（示意）','transition',[[.124,1.346,-.024],[.141,1.324,-.027],[.143,1.302,-.032],[.106,1.290,-.016]]],
  ['左肺靜脈路徑（示意）','high',[[.106,1.290,-.016],[.056,1.326,.017],[.026,1.334,.026]]]
 ];
 for(const [name,oxygen,points] of schematics)out.push({name,oxygen,side:'left',points:points.map(clone),educationalApproximation:true});
 return out;
}
