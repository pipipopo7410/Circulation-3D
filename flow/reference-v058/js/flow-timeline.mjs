/* V0.39 – one-dimensional teaching path timeline.
 * Independent of Three.js. Uses the existing, audited centerline geometry only;
 * no inferred vessels, anatomical positions or new connections are created.
 */
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);

export function prepareTeachingTimeline(stages){
 if(!Array.isArray(stages)||!stages.length)throw Error('Missing teaching stages');
 return stages.map((stage,i)=>{
  const points=stage.points;
  if(!Array.isArray(points)||points.length<2||!Number.isFinite(stage.durationMs)||stage.durationMs<=0)
   throw Error('Invalid teaching stage geometry or time: '+i);
  const cumulative=[0];
  for(let j=1;j<points.length;j++){
   if(!points[j].every(Number.isFinite)||!points[j-1].every(Number.isFinite))throw Error('Invalid stage point: '+i);
   cumulative.push(cumulative.at(-1)+distance(points[j-1],points[j]));
  }
  const total=cumulative.at(-1);
  if(!(total>0))throw Error('Zero-length teaching stage: '+i);
  return {points,cumulative,total,durationMs:stage.durationMs};
 });
}

export function positionOnStage(prepared,ms){
 const fraction=clamp(ms/prepared.durationMs,0,1);
 const target=prepared.total*fraction;
 let low=1,high=prepared.cumulative.length-1;
 while(low<high){const mid=(low+high)>>>1;if(prepared.cumulative[mid]<target)low=mid+1;else high=mid;}
 const j=low,previous=prepared.cumulative[j-1],next=prepared.cumulative[j];
 const t=next>previous?clamp((target-previous)/(next-previous),0,1):0;
 return prepared.points[j-1].map((n,k)=>n+(prepared.points[j][k]-n)*t);
}

export function advanceTeachingTimeline(prepared,index,ms,deltaMs){
 if(!prepared.length)throw Error('Missing timeline');
 let i=clamp(Math.trunc(index),0,prepared.length-1);
 let elapsed=clamp(ms,0,prepared[i].durationMs);
 let remaining=Math.max(0,Number.isFinite(deltaMs)?deltaMs:0);
 if(i===prepared.length-1 && elapsed>=prepared[i].durationMs)
  return {index:i,ms:elapsed,ended:true};
 // Carry the remaining frame time across a stage boundary; previously it was lost.
 while(remaining>0){
  const needed=prepared[i].durationMs-elapsed;
  if(remaining<needed){elapsed+=remaining;break;}
  remaining-=needed;
  if(i===prepared.length-1){elapsed=prepared[i].durationMs;return {index:i,ms:elapsed,ended:true};}
  i++;elapsed=0;
  if(remaining===0)break;
 }
 return {index:i,ms:elapsed,ended:false};
}
