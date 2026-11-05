import {walkingRoute,routeSample} from './delegation-motion.js';
import {TeamBreaks} from './team-breaks.js';

import {OFFICE_ZONES} from './command-layout.js';
export {OFFICE_ZONES} from './command-layout.js';
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
// Cosmetic choreography only. This module never dispatches, delays or completes real tasks.
export class OfficeLife {
 constructor({zones=OFFICE_ZONES,route=walkingRoute,targetFor=null,sample=routeSample,speed=3.8,breakPolicy=null,random=Math.random}={}){this.actors=new Map();this.pins=[];this.zones=zones;this.route=route;this.targetFor=targetFor;this.sample=sample;this.speed=speed;this.breaks=breakPolicy?new TeamBreaks(breakPolicy,random):null;}
 add(id,home,index,now=0,{stationary=false}={}){const actor={id,index,stationary,home:[...home],pos:[...home],yaw:stationary?0:Math.PI,mode:'desk',busy:false,held:false,route:null,until:now+700+index*900,cycle:0,pose:'desk',noteQueue:[]};this.actors.set(id,actor);return actor;}
 travel(actor,target,arrival,now){actor.route=this.route(actor.pos,target);actor.departed=now;actor.arrival=arrival;actor.mode='walking';}
 hold(id){const a=this.actors.get(id);if(!a)return;a.held=true;a.route=null;if(a.mode==='walking')a.mode='waiting';}
 receive(id,now,note){const a=this.actors.get(id);if(!a)return;a.held=false;if(a.note&&!a.pinEmitted)a.noteQueue.push(note);else{a.noteQueue.push(note);a.note=a.noteQueue.shift();a.pinEmitted=false;}this.travel(a,[this.zones.board[0]+(a.index%3)*.55,this.zones.board[1]],'pinning',now);}
 setBusy(id,busy,now){const a=this.actors.get(id);if(!a)return;a.busy=busy;
  if(busy&&!a.held&&!['pinning','to-work'].includes(a.mode)&&a.arrival!=='pinning'&&a.arrival!=='to-work'&&distance(a.pos,a.home)>.05)this.travel(a,a.home,'to-work',now);
  if(!busy&&a.mode==='working'){a.mode='desk';a.until=now+1800;}
 }
 releaseChief(id,now){const a=this.actors.get(id);if(!a)return;a.held=false;a.pos=[...a.home];a.route=null;a.mode=a.busy?'working':'desk';a.yaw=a.stationary?0:Math.PI;a.until=now+3000;}
 configureBreaks(settings,now){this.breaks?.configure(settings,now,this.actors);}
 tick(now){
  this.breaks?.update(now,this.actors);
  for(const a of this.actors.values()){
   if(a.held)continue;
   if(a.route){const p=this.sample(a.route,(now-a.departed)/1000*this.speed);a.pos=[p.x,p.z];a.yaw=p.angle;
    if(!p.done)continue;a.route=null;a.mode=a.arrival==='to-work'?(a.busy?'working':'desk'):a.arrival;a.until=now+(a.mode==='pinning'?1700:this.breaks&&a.onBreak?this.breaks.settings.durationSeconds*1000:12000+(a.index%3)*2500);a.yaw=a.mode==='coffee'?-Math.PI/2:a.mode==='pinning'?Math.PI:a.mode==='gaming'?Math.PI:a.mode==='chat'?(a.index%2?Math.PI/2:-Math.PI/2):Math.PI;
   }
   if(a.mode==='pinning'){
    if(!a.pinEmitted&&now>a.until-850){a.pinEmitted=true;this.pins.push({id:a.id,...a.note});}
    if(now>=a.until){if(a.noteQueue.length){a.note=a.noteQueue.shift();a.pinEmitted=false;a.until=now+1400;}else this.travel(a,a.home,'to-work',now);}continue;
   }
   if(a.busy){if(distance(a.pos,a.home)<.05){a.mode='working';a.yaw=a.stationary?0:Math.PI;}continue;}
   // Only handoff choreography moves the coordinator away from its station.
   if(a.stationary){a.mode='desk';a.yaw=0;continue;}
   if(this.breaks){
    if(a.onBreak){if(now>=a.until){a.onBreak=false;a.breakReturning=true;this.travel(a,a.home,'to-work',now);}continue;}
    if(!a.breakGranted)continue;
   }
   if(now<a.until)continue;
   const modes=this.breaks?['coffee','gaming','chat','roam']:['coffee','gaming','chat','roam','desk'],cycle=a.cycle++;let mode=cycle===0?['coffee','gaming','chat','chat','gaming','coffee'][a.index%6]:modes[(a.index+cycle)%modes.length];
   let target=mode==='desk'?a.home:mode==='roam'?[a.index%2?5.1:-5.1,a.index%3?7.2:-8.2]:[...this.zones[mode]];
   if(mode==='coffee'){target[0]+=(a.index%2)*.6;target[1]+=1.1*(a.index%2);}
   if(mode==='gaming')target[0]+=(a.index%2)*2;
   if(mode==='chat')target[0]+=(a.index%2)*1.35;
   if(this.targetFor){const resolved=this.targetFor(mode,a,target,this.actors);if(Array.isArray(resolved))target=resolved;else{target=resolved.target;mode=resolved.mode;}}
   if(this.breaks){a.breakGranted=false;a.onBreak=true;}
   this.travel(a,target,mode,now);
  }
 }
}
export const activityLabel=mode=>({walking:'Walking',coffee:'Coffee break',gaming:'Gaming break',chat:'Team chat',pinning:'Pinning task',working:'Typing',waiting:'Receiving brief',desk:'At desk',roam:'Stretch break'}[mode]||'At desk');
