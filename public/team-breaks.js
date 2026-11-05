export const DEFAULT_BREAK_SETTINGS=Object.freeze({durationSeconds:30,intervalSeconds:90,groupSize:'random'});
export function normalizeBreakSettings(value={}){value=value&&typeof value==='object'?value:{};const number=(x,f,min,max)=>Number.isFinite(Number(x))?Math.max(min,Math.min(max,Math.round(Number(x)))):f;return {durationSeconds:number(value.durationSeconds,30,5,600),intervalSeconds:number(value.intervalSeconds,90,10,3600),groupSize:['random','2','3'].includes(String(value.groupSize))?String(value.groupSize):'random'};}
// Controls cosmetic breaks only. It never delays or dispatches a real agent task.
export class TeamBreaks{
 constructor(settings={},random=Math.random){this.settings=normalizeBreakSettings(settings);this.random=random;this.active=new Set();this.started=false;this.nextWaveAt=Infinity;this.waveSizes=[];}
 configure(settings,now,actors){const next=normalizeBreakSettings(settings);if(JSON.stringify(next)===JSON.stringify(this.settings))return;const durationChanged=next.durationSeconds!==this.settings.durationSeconds;this.settings=next;
  if(!this.active.size&&this.started)this.nextWaveAt=now+next.intervalSeconds*1000;
  for(const id of this.active){const a=actors.get(id);if(a?.onBreak&&!a.route&&durationChanged)a.until=now+next.durationSeconds*1000;}
 }
 revoke(actor){actor.breakGranted=false;actor.onBreak=false;actor.breakReturning=false;}
 update(now,actors){
  if(!this.started){this.started=true;this.nextWaveAt=now+Math.min(10000,this.settings.intervalSeconds*1000);}
  let finished=false;
  for(const id of [...this.active]){const a=actors.get(id);if(!a||a.busy||a.held||a.mode==='pinning'){if(a)this.revoke(a);this.active.delete(id);finished=true;continue;}
   const home=Math.hypot(a.pos[0]-a.home[0],a.pos[1]-a.home[1])<.05;
   if(!a.breakGranted&&!a.onBreak&&!a.route&&home){a.breakReturning=false;a.lastBreakEnded=now;this.active.delete(id);finished=true;}
  }
  if(finished&&!this.active.size)this.nextWaveAt=now+this.settings.intervalSeconds*1000;
  if(this.active.size||now<this.nextWaveAt)return;
  const eligible=[...actors.values()].filter(a=>!a.stationary&&!a.busy&&!a.held&&!a.route&&a.mode==='desk'&&Math.hypot(a.pos[0]-a.home[0],a.pos[1]-a.home[1])<.05);
  if(!eligible.length){this.nextWaveAt=now+1000;return;}
  const desired=this.settings.groupSize==='random'?(this.random()<.5?2:3):Number(this.settings.groupSize);
  const ranked=eligible.map(a=>({a,count:a.breakCount||0,tie:this.random()})).sort((a,b)=>a.count-b.count||a.tie-b.tie);
  const selected=ranked.slice(0,desired);for(const {a} of selected){a.breakCount=(a.breakCount||0)+1;a.breakGranted=true;a.until=now;this.active.add(a.id);}
  this.waveSizes.push(selected.length);if(this.waveSizes.length>32)this.waveSizes.shift();
 }
 shiftTime(delta){if(Number.isFinite(this.nextWaveAt))this.nextWaveAt+=delta;}
}
