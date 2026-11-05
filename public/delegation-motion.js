import {planOfficeRoute} from './command-layout.js';
// Visual state only. Never delays, dispatches or changes a Hermes task.
export class DelegationSignals {
 constructor(){this.seen=new Map();this.ready=false;}
 observe(agents){
  const events=[];
  for(const a of agents.filter(a=>a.reportsTo)){
   if(a.assignmentDispatched===false)continue;
   const key=a.parentRunId || (a.startedAt ? `${a.startedAt}:${a.task || ''}` : a.task || '');
   // One physical briefing per worker in each mission; argument retries are
   // not additional trips. Different missions still get separate handoffs.
   const identity=a.parentRunId?`${a.parentRunId}:${a.id}`:a.id;
   const old=this.seen.get(identity);
   const assigned=a.taskStatus==='running'||a.taskStatus==='completed'||a.parentRunId&&['failed','unknown','cancelled'].includes(a.taskStatus);
   if(key && assigned && (this.ready ? old?.key!==key : a.taskStatus==='running')) events.push({chief:a.reportsTo,worker:a.id,preview:false,runId:a.parentRunId||key,task:a.task});
   this.seen.set(identity,{key,status:a.taskStatus});
  }
  this.ready=this.ready||agents.some(a=>a.reportsTo&&a.assignmentDispatched!==false);return events;
 }
}
export function walkingRoute(start,end){return planOfficeRoute(start,end);}
export function routeSample(points,distance){
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  if(distance<=length){const t=length?Math.max(0,distance)/length:1;return {x:a[0]+(b[0]-a[0])*t,z:a[1]+(b[1]-a[1])*t,angle:Math.atan2(b[0]-a[0],b[1]-a[1]),done:false};}distance-=length;
 }
 const p=points.at(-1);return {x:p[0],z:p[1],angle:0,done:true};
}
export function renderCadence({mode='studio',busy=false,moving=false,focused=true,hidden=false,paused=false,settling=false,occluded=false}){
 if(hidden||paused&&!settling)return 0;
 if(occluded&&!settling)return 1;
 const cap=mode==='high'?60:mode==='eco'?15:mode==='low'?20:30;
 if(!focused)return Math.min(cap,5);
 return busy||moving||settling?cap:Math.min(cap,mode==='eco'?3:8);
}
