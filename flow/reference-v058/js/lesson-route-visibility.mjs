/**
 * V0.56 — keep the verified vessel currently being traced visible even when
 * the teacher is demonstrating in the simplified / core-only anatomy tier.
 * Pure data logic: no Three.js dependency, no geometry or source modification.
 */
const namedVessels=stage=>stage?.kind==='real'
  ? (Array.isArray(stage.meshes)?stage.meshes:stage.mesh?[stage.mesh]:[]).filter(Boolean) : [];
export function lessonVesselFocus(stages,index){
 const active=new Set(),context=new Set();
 if(!Array.isArray(stages)||index<0||index>=stages.length)
   return {active,context,required:new Set()};
 for(const name of namedVessels(stages[index]))active.add(name);
 for(const dir of [-1,1]){
   for(let j=index+dir;j>=0&&j<stages.length;j+=dir){
     const names=namedVessels(stages[j]);
     if(names.length){for(const name of names)if(!active.has(name))context.add(name);break;}
   }
 }
 return {active,context,required:new Set([...active,...context])};
}
export function lessonVesselVisible({name,kind,displayLevel,filterType='all',level=0,replacedMesh=null,focus=null}){
 if(replacedMesh&&name===replacedMesh)return false;
 const normal=(filterType==='all'||kind===filterType)&&displayLevel>=level;
 // During a route, continuity takes priority over the exploratory tier.
 // Manual filtering continues to affect every NON-route vessel.
 return normal||Boolean(focus?.required?.has(name));
}
