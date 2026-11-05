import {FIXTURES,nearestFloor,floorRoute,clearFloor} from './reference-navigation.js';
import {routeSample} from './delegation-motion.js';
export const REFERENCE={width:1672,height:941};
export function projectFloor([x,z]){return [940+28*x-19*z,520+10.3*x+10.7*z];}
export function unprojectFloor([u,v]){const a=u-940,b=v-520,det=28*10.7+19*10.3;return [(10.7*a+19*b)/det,(-10.3*a+28*b)/det];}
export const DESK_SEATS=[[766,322],[494,531],[622,578],[748,622],[1200,562],[1338,612],[543,339]];
export const GAME_SEATS=[[1090,741],[1310,737]];
const ports=[[766,322],[497,595],[624,650],[750,708],[1200,625],[1338,678],[554,410]];
export const HOME_PIXELS=ports.map(nearestFloor);
export const HOMES=HOME_PIXELS.map(unprojectFloor);
export const COFFEE_PORTS=[[554,410],[620,409],[690,421]].map(nearestFloor);
export const GAME_PORTS=[[1030,770],[1380,720]].map(nearestFloor);
const coffee=COFFEE_PORTS[0],gaming=GAME_PORTS[0];
export const ZONES={coffee:unprojectFloor(coffee),gaming:unprojectFloor(gaming),chat:unprojectFloor(nearestFloor([995,650])),board:unprojectFloor(nearestFloor([1065,403]))};
export const OBSTACLES=FIXTURES.map(f=>{const ps=f.polygon.map(unprojectFloor),xs=ps.map(p=>p[0]),zs=ps.map(p=>p[1]);return {minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)};});
export const referenceRoute=(start,end)=>floorRoute(projectFloor(start),projectFloor(end)).map(unprojectFloor);
const routePixels=new WeakMap();
export function sampleReferenceRoute(route,distance){let pixels=routePixels.get(route);if(!pixels){pixels=route.map(projectFloor);routePixels.set(route,pixels);}const p=routeSample(pixels,distance),[x,z]=unprojectFloor([p.x,p.z]),dx=Math.sin(p.angle),dy=Math.cos(p.angle);return {x,z,done:p.done,angle:Math.atan2(10.7*dx+19*dy,-10.3*dx+28*dy)};}
export function routePixelLength(route){const p=route.map(projectFloor);return p.slice(1).reduce((n,b,i)=>n+Math.hypot(b[0]-p[i][0],b[1]-p[i][1]),0);}
export function briefingPoint(worker,chief){const p=projectFloor(worker),c=projectFloor(chief);const options=Array.from({length:16},(_,i)=>[p[0]+Math.cos(i*Math.PI/8)*60,p[1]+Math.sin(i*Math.PI/8)*50]).filter(p=>clearFloor(p));options.sort((a,b)=>Math.hypot(a[0]-c[0],a[1]-c[1])-Math.hypot(b[0]-c[0],b[1]-c[1]));return unprojectFloor(nearestFloor(options[0]||p));}
export function spriteFrame({mode='desk',chief=false,yaw=0,frame=0}={}){
 if(mode==='walking'){const away=Math.sin(yaw)+Math.cos(yaw)<0;return [away?2+frame%2:frame%2,1];}
 if(mode==='coffee')return [0,3];if(mode==='gaming')return [1,3];if(mode==='pinning')return [2,3];if(mode==='chat'||mode==='waiting')return [3,3];
 if(!chief&&['working','desk'].includes(mode))return [frame%2,2];return [0,0];
}
export function spriteBudget({quality='fps20',hidden=false,paused=false,occluded=false,focused=true,moving=false,working=false,reduced=false}={}){
 if(hidden||paused)return 0;if(occluded)return 1;if(!focused)return 2;if(reduced)return 2;const cap=quality==='fps30'||quality==='high'?30:quality==='eco'?12:20;return moving?cap:working?Math.min(cap,12):3;
}
export function referenceBreakTarget(mode,actor,target,actors=new Map()){
 if(mode==='roam')return unprojectFloor(nearestFloor(actor.index%2?[755,415]:[1110,440]));
 if(mode==='gaming'||mode==='coffee'){
  const slots=mode==='gaming'?GAME_PORTS:COFFEE_PORTS,preferred=actor.index%slots.length;
  const used=new Set([...actors.values()].filter(a=>a!==actor&&(a.mode===mode||a.route&&a.arrival===mode)).map(a=>a.breakSlot));
  let slot=Array.from({length:slots.length},(_,i)=>(preferred+i)%slots.length).find(i=>!used.has(i));
  if(slot===undefined)return {mode:'chat',target:unprojectFloor(nearestFloor([[975,650],[1135,660],[960,725]][actor.index%3]))};
  actor.breakSlot=slot;return unprojectFloor(slots[slot]);
 }
 if(mode==='chat')return unprojectFloor(nearestFloor([[975,650],[1135,660],[960,725]][actor.index%3]));
 return target;
}
export function poseAnchor(actor,index,mode){
 if(['desk','working'].includes(mode)&&Math.hypot(actor.pos[0]-actor.home[0],actor.pos[1]-actor.home[1])<.1)return DESK_SEATS[index]||projectFloor(actor.pos);
 if(mode==='gaming')return GAME_SEATS[actor.breakSlot??index%2];
 if(mode==='coffee')return [[543,339],[615,352],[685,376]][actor.breakSlot??(index===6?0:index%3)];
 return projectFloor(actor.pos);
}
// Labels remain attached to the exact displayed sprite anchor; no per-frame collision reordering.
export function attachedLabel([x,y],scale,width=128){return {x,y:y-99*scale,width};}

export function pacedFrame(last,now,fps){
 const interval=1000/fps;if(last!==null&&now-last<interval)return {draw:false,time:last};
 return {draw:true,time:last===null?now:now-((now-last)%interval)};
}
