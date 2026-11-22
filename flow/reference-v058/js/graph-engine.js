/* 血流循環推理引擎 V0.11 — Original code. Directional *teaching* graph,
   NOT an individual patient's vascular map or a medical simulation. */
(function(root){
 'use strict';
 const pairs=[];
 function chain(...arr){for(let i=0;i<arr.length-1;i++)pairs.push([arr[i],arr[i+1]])}
 // Heart and two separate pulmonary branches; flow is one-way.
 chain('ra','rv','pulmonary_trunk');
 chain('pulmonary_trunk','right_pulmonary_a','right_lung','right_pv1','la');
 chain('pulmonary_trunk','left_pulmonary_a','left_lung','left_pv1','la');
 chain('la','lv','aortic_root','aortic_arch','thoracic_aorta','abdominal_aorta');
 chain('aortic_arch','left_subclavian_a','left_axillary_a','left_brachial_a','left_radial_a','left_forearm_cap','left_forearm_v','left_brachial_v','left_axillary_v','left_subclavian_v','left_brachio_v','svc','ra');
 chain('aortic_arch','brachiocephalic_a','right_subclavian_a','right_axillary_a','right_brachial_a','right_radial_a','right_forearm_cap','right_forearm_v','right_brachial_v','right_axillary_v','right_subclavian_v','right_brachio_v','svc');
 chain('aortic_arch','brachiocephalic_a','right_carotid','right_brain_cap','right_jugular_v','right_brachio_v');
 chain('aortic_arch','left_carotid','left_brain_cap','left_jugular_v','left_brachio_v');
 chain('abdominal_aorta','left_iliac_a','left_external_iliac_a','left_femoral_a','left_popliteal_a','left_tibial_a','left_leg_cap','left_tibial_v','left_popliteal_v','left_femoral_v','left_external_iliac_v','left_iliac_v','ivc','ivc_thoracic','ra');
 chain('abdominal_aorta','right_iliac_a','right_external_iliac_a','right_femoral_a','right_popliteal_a','right_tibial_a','right_leg_cap','right_tibial_v','right_popliteal_v','right_femoral_v','right_external_iliac_v','right_iliac_v','ivc');
 chain('abdominal_aorta','right_renal_a','right_kidney','right_renal_v','ivc');
 chain('abdominal_aorta','left_renal_a','left_kidney','left_renal_v','ivc');
 // Postprandial glucose: intestinal capillaries -> portal vein -> liver -> hepatic veins.
 chain('abdominal_aorta','intestinal_a','small_intestine','mesenteric_v','portal_v','liver','hepatic_v','ivc_thoracic');
 chain('abdominal_aorta','celiac_a','stomach','gastric_v','portal_v');
 // The common hepatic artery branches from the coeliac trunk, not the aorta directly.
 chain('celiac_a','hepatic_a','liver');
 const extra={
   left_forearm_cap:'左前臂組織微血管（簡化）',right_forearm_cap:'右前臂組織微血管（簡化）',
   left_leg_cap:'左小腿組織微血管（簡化）',right_leg_cap:'右小腿組織微血管（簡化）',
   right_brain_cap:'右側腦部組織微血管（概念節點）',left_brain_cap:'左側腦部組織微血管（概念節點）',
   ivc_thoracic:'下腔靜脈（胸部段）',
   intestinal_a:'小腸供血動脈（簡化）',small_intestine:'小腸微血管（餐後情境）',
   mesenteric_v:'腸系膜靜脈（簡化）',portal_v:'肝門靜脈',
   gastric_v:'胃靜脈（簡化）',stomach:'胃部微血管（簡化）',
   liver:'肝臟血竇交換區（簡化）',right_kidney:'右腎微血管（簡化）',left_kidney:'左腎微血管（簡化）',
   right_lung:'右肺氣體交換區',left_lung:'左肺氣體交換區'
 };
 const adj=new Map();for(const [a,b] of pairs){if(!adj.has(a))adj.set(a,[]);if(!adj.get(a).includes(b))adj.get(a).push(b);if(!adj.has(b))adj.set(b,[])}
 function findPath(from,to){if(!adj.has(from)||!adj.has(to))return null;
  const queue=[from],prev=new Map([[from,null]]);
  for(let pos=0;pos<queue.length;pos++){
   const a=queue[pos];if(a===to)break;
   for(const b of adj.get(a)||[])if(!prev.has(b)){prev.set(b,a);queue.push(b)}
  }
  if(!prev.has(to))return null;
  const route=[];for(let p=to;p!==null;p=prev.get(p))route.push(p);
  return route.reverse();
 }
 const isVenous=(id)=>id.endsWith('_v')||['svc','ivc','ivc_thoracic','ra','rv','pulmonary_trunk','right_pulmonary_a','left_pulmonary_a','right_jugular_v','left_jugular_v','portal_v','gastric_v','mesenteric_v','hepatic_v','left_brachio_v','right_brachio_v'].includes(id);
 const tissue=new Set(['left_brain_cap','right_brain_cap','left_forearm_cap','right_forearm_cap','left_leg_cap','right_leg_cap','stomach','small_intestine','liver','right_kidney','left_kidney']);
 const lungs=new Set(['left_lung','right_lung']);
 const kidneys=new Set(['right_kidney','left_kidney']);
 function initialState(start){return {oxygen:isVenous(start)?'較少':'較多',co2:isVenous(start)?'較多':'較少',glucose:'一般',urea:'一般'}}
 function atStage(route,idx,fed){
  const s=initialState(route[0]);let change='主要血管運輸：此站不設定物質濃度的突變。';let highlight='';
  for(let i=0;i<=idx;i++){
   const node=route[i];change='主要血管運輸：此站不設定物質濃度的突變。';highlight='';
   if(lungs.has(node)){s.oxygen='較多';s.co2='較少';change='氣體交換：氧氣進入血液，二氧化碳離開血液。';highlight='氧氣 ↑　　二氧化碳 ↓'}
   else if(tissue.has(node)){
    s.oxygen='較少';s.co2='較多';change='組織交換：氧氣被細胞利用，產生的二氧化碳進入血液。';highlight='氧氣 ↓　　二氧化碳 ↑';
    if(node==='small_intestine'&&fed){s.glucose='較多';change+=' 餐後，消化吸收的葡萄糖可進入小腸血液。';highlight+='　葡萄糖 ↑'}
    if(node==='liver'&&fed&&s.glucose==='較多'){s.glucose='受肝調節';change+=' 餐後肝臟可攝取並儲存部分葡萄糖；實際變化因生理狀態而異。';highlight+='　葡萄糖：受調節'}
    if(kidneys.has(node)){s.urea='相對減少';change+=' 腎臟可將部分尿素自血液濾出並排泄；不是全部瞬間清除。';highlight+='　尿素 ↓'}
   }
  }
  return {state:s,change,highlight};
 }
 function scenario(from,to,fed,labels){
  const route=findPath(from,to);if(!route)return null;
  const steps=route.map((id,i)=>{
    const p=atStage(route,i,!!fed);
    const label=extra[id]||labels?.[id]||id.replaceAll('_',' ');
    return {id,label,oxygen:p.state.oxygen==='較多'?'rich':'poor',note:p.change,physiology:p,logicId:id};
  });
  return {id:'dynamic_'+from+'_'+to+'_'+(fed?'meal':'rest'),title:(extra[from]||labels?.[from]||from)+' → '+(extra[to]||labels?.[to]||to),question:'按血流方向追蹤一條代表性路徑，並觀察器官前後的定性變化。',steps,hasVirtual:steps.some(s=>!labels?.[s.id])};
 }
 function sameRoute(route,expected){return Array.isArray(route)&&route.length===expected.length&&expected.every((id,i)=>route[i]===id)}
 function suggestVisualization(from,to){
  const route=findPath(from,to);if(!route)return null;
  if(sameRoute(route,['lv','aortic_root','aortic_arch','left_subclavian_a','left_axillary_a','left_brachial_a','left_radial_a','left_forearm_cap']))
    return {kind:'lesson',lesson:'left-arm-systemic-return',range:[0,4],label:'播放升主動脈 → 前臂組織（左心室為概念起點）',note:'左心室未包含在這段真實 GLB 中；動畫從升主動脈開始。',route};
  if(sameRoute(route,['left_forearm_v','left_brachial_v','left_axillary_v','left_subclavian_v','left_brachio_v','svc','ra']))
    return {kind:'lesson',lesson:'left-arm-systemic-return',range:[5,9],label:'播放前臂靜脈 → 右心房（右心房為教學示意）',note:'右心房為概念示意，不是原始模型的心腔。',route};
  if(sameRoute(route,['right_subclavian_a','right_axillary_a','right_brachial_a','right_radial_a','right_forearm_cap']))
    return {kind:'verified',slug:'right-arm-artery',label:'播放右臂動脈主要血管段（交換區另以逐站判讀）',note:'真實中心線只涵蓋右手臂主要動脈，不包含末端微血管交換區。',route};
  if(sameRoute(route,['right_forearm_v','right_brachial_v','right_axillary_v','right_subclavian_v','right_brachio_v','svc','ra']))
    return {kind:'verified',slug:'right-arm-vein',label:'播放右臂靜脈主要血管段（回右心仍需逐站判讀）',note:'真實中心線只涵蓋右手臂主要靜脈，沒有延伸到右心房。',route};
  return null;
 }
 const api={pairs,adj,labels:extra,findPath,initialState,atStage,scenario,suggestVisualization,nodes:[...adj.keys()]};
 root.CirculationEngine=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
