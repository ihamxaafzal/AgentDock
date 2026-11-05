import {mkdir,copyFile} from 'node:fs/promises';
import {resolve,basename} from 'node:path';

export function splitMissionBrief(message){
 const text=String(message).trim();
 const markers=[...text.matchAll(/^(?:Tasks?|Missions?)\s*\d+\s*:\s*/gim)];
 if(markers.length<2||markers[0].index!==0)return [text];
 const briefs=markers.map((m,i)=>text.slice(m.index+m[0].length,markers[i+1]?.index??text.length).trim()).filter(Boolean);
 const sources=briefs.map(brief=>({brief,match:/\b(?:scene\s*\d+|(?:image|video|image-to-video)\s+prompt\s*:)/i.exec(brief)})).filter(item=>item.match);
 if(sources.length===1){
  const source=sources[0].brief.slice(sources[0].match.index);
  return briefs.map(brief=>brief===sources[0].brief||!/\bextract\b/i.test(brief)||!/\b(?:images?|video)\s+prompts?\b/i.test(brief)?brief:brief+'\n\n'+source);
 }
 return briefs;
}
export async function copyMissionInputs(paths,directory,id){
 if(!/^aether-[a-f0-9-]+$/.test(id))throw Error('Invalid mission identity.');
 const result=[];
 for(const [i,path] of [...new Set(paths)].entries()){
  const folder=resolve(directory,id,String(i));await mkdir(folder,{recursive:true});
  const target=resolve(folder,basename(path));await copyFile(path,target);result.push(target);
 }
 return result;
}
export function missionWorker(mission,id){
 const matches=Object.values(mission.workers||{}).filter(w=>w.id===id);
 return matches.filter(w=>w.status==='running').at(-1)||matches.at(-1);
}
export function projectMissions(missions,endpoints){
 const result=new Map();
 for(const endpoint of endpoints){
  const candidates=[...missions.values()].flatMap(m=>endpoint.reportsTo?Object.values(m.workers||{}).filter(w=>w.id===endpoint.id):m.agentId===endpoint.id?[m]:[]);
  const active=candidates.filter(t=>t.status==='running');
  const queued=candidates.filter(t=>t.status==='queued');
  const selected=active.at(-1)||queued.at(-1)||candidates.at(-1);
  if(selected)result.set(endpoint.id,{...selected,activeCount:active.length,queuedCount:queued.length});
 }
 return result;
}
export class MissionScheduler{
 constructor({missions,concurrency=5,execute,onChange=()=>{}}){Object.assign(this,{missions,execute,onChange});this.concurrency=validateConcurrency(concurrency);this.active=new Set();}
 setConcurrency(value){this.concurrency=validateConcurrency(value);this.onChange();this.pump();}
 restore(){
  for(const mission of this.missions.values())if(mission.status==='running')this.start(mission,true);
  this.pump();
 }
 pump(){
  let changed=false;
  for(let pass=0;pass<=this.missions.size;pass++){
  let passChanged=false;
  for(const mission of this.missions.values()){
   if(!['queued','waiting','blocked'].includes(mission.status))continue;
   const parents=(mission.dependsOn||[]).map(id=>this.missions.get(id));
   if(parents.some(p=>!p||['failed','blocked','cancelled'].includes(p.status))){
    if(mission.status!=='blocked'){mission.status='blocked';mission.progressNote='A required task needs attention. Retry that task to continue this workflow.';changed=true;passChanged=true;}
    continue;
   }
   if(parents.some(p=>p.status!=='completed')){
    if(mission.status!=='waiting'){mission.status='waiting';mission.progressNote='Waiting for '+parents.filter(p=>p.status!=='completed').map(p=>'Task '+(p.taskNumber||p.id)).join(', ')+'.';changed=true;passChanged=true;}
    continue;
   }
   if(mission.status!=='queued'){mission.status='queued';mission.progressNote='Prerequisite results are ready; waiting for a processing slot.';changed=true;passChanged=true;}
   const imageBrowserBusy=mission.targetRole==='image-generation'&&[...this.active].some(id=>this.missions.get(id)?.targetRole==='image-generation');
   if(imageBrowserBusy){mission.progressNote='Waiting for the current image-generation batch to finish.';continue;}
   if(this.active.size<this.concurrency)this.start(mission,false);
  }
  if(!passChanged)break;
  }
  if(changed)this.onChange();
 }
 start(mission,resume){
  if(this.active.has(mission.id))return;
  this.active.add(mission.id);mission.status='running';mission.startedAt??=Date.now();this.onChange();
  Promise.resolve().then(()=>this.execute(mission,resume)).catch(error=>Object.assign(mission,{status:'failed',error:error.message,completedAt:Date.now()})).finally(()=>{this.active.delete(mission.id);this.onChange();this.pump();});
 }
}
export function validateConcurrency(value){
 const number=Number(value);
 if(!Number.isSafeInteger(number)||number<1||number>256)throw Error('Choose a whole number of concurrent missions between 1 and 256.');
 return number;
}
