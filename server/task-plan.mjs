import {randomUUID,createHash} from 'node:crypto';
import {splitMissionBrief} from './missions.mjs';
import {isImageGenerationRequest} from './image-generation-routing.mjs';

export function inferTaskRole(brief){
 if(isImageGenerationRequest(brief))return 'image-generation';
 const head=brief.split(/\b(?:script|narration|voiceover)\s*:/i)[0];
 if(/\bextract\b/i.test(head)&&/\b(?:images?|video)\b/i.test(head))return /\bvideo\b/i.test(head)?'video-extraction':'image-extraction';
 if(/\b(?:medical[ -]?)?scene[ -]?(?:write|writer|author(?:ing)?)\b|\b(?:create|make|write|author|build|turn|convert)\b[\s\S]{0,50}\b(?:medical\s+)?scenes?\b|\b\d+\s+(?:medical\s+)?scenes?\b/i.test(head))return 'scene-authoring';
 if(/\b(?:write|writes|writing|draft|compose)\b[\s\S]{0,80}\b(?:script|narration|voiceover)\b/i.test(head))return 'narration-writing';
 if(/\b(?:find|suggest|research)\b[\s\S]{0,80}\b(?:topics?|titles?|facts?|ideas?)\b/i.test(head))return 'topic-research';
 return null;
}
export function planTasks(input){
 let briefs=Array.isArray(input)?input:splitMissionBrief(input);
 if(!briefs.length||briefs.some(b=>typeof b!=='string'||!b.trim()))throw Error('Enter a non-empty task.');
 const markers=typeof input==='string'?[...input.trim().matchAll(/^(?:Tasks?|Missions?)\s*(\d+)\s*:\s*/gim)]:[];
 if(markers.length===1&&markers[0].index===0&&briefs.length===1)briefs=[input.trim().slice(markers[0][0].length).trim()];
 if(briefs.some(b=>!b.trim()))throw Error('Every labelled task needs a brief.');
 const labelled=markers.length===briefs.length&&markers[0]?.index===0;
 const tasks=briefs.map((message,i)=>({message:message.trim(),taskNumber:labelled?Number(markers[i][1]):i+1,targetRole:inferTaskRole(message),dependsOnNumbers:[]}));
 const byNumber=new Map(tasks.map(t=>[t.taskNumber,t]));
 if(byNumber.size!==tasks.length)throw Error('Task numbers must be unique within a batch.');
 for(const [index,task] of tasks.entries()){
  const head=task.message.split(/\b(?:script|narration|voiceover)\s*:/i)[0];
  const cue=/\b(?:after|once|when|using|based on|from|written by|was written|completes?|finished|result|output)\b/i.test(head);
  if(cue)task.dependsOnNumbers=[...new Set([...head.matchAll(/\b(?:tasks?|missions?)\s*#?\s*(\d+)\b/gi)].map(m=>Number(m[1])))];
  if(cue&&!task.dependsOnNumbers.length){
   const roles=[];
   if(task.targetRole!=='narration-writing'&&/\b(?:narration|script|voiceover)\s+(?:writer|writing|output)\b/i.test(head))roles.push('narration-writing');
   if(task.targetRole!=='topic-research'&&/\b(?:research|topic|source)\s+(?:result|output|from)\b/i.test(head))roles.push('topic-research');
   for(const role of roles){
    const earlier=tasks.slice(0,index).filter(t=>t.targetRole===role);
    const candidates=earlier.length?[earlier.at(-1)]:tasks.filter(t=>t!==task&&t.targetRole===role);
    if(candidates.length!==1)throw Error('Task '+task.taskNumber+' needs a clear '+role+' source in this batch. Refer to its task number.');
    task.dependsOnNumbers.push(candidates[0].taskNumber);
   }
  }
  for(const number of task.dependsOnNumbers)if(!byNumber.has(number))throw Error('Task '+task.taskNumber+' refers to missing Task '+number+'.');
 }
 const visited=new Set(),visiting=new Set();
 function visit(number){if(visiting.has(number))throw Error('Task dependencies contain a cycle.');if(visited.has(number))return;visiting.add(number);for(const parent of byNumber.get(number).dependsOnNumbers)visit(parent);visiting.delete(number);visited.add(number);}
 tasks.forEach(t=>visit(t.taskNumber));return tasks;
}
export function createTaskBatch(plan,{agentId,documents=[],nativeCoordinator=false,batchId=randomUUID()}){
 const ids=new Map(plan.map(t=>[t.taskNumber,'aether-'+randomUUID()]));
 return plan.map(part=>{
  const id=ids.get(part.taskNumber),dependsOn=part.dependsOnNumbers.map(n=>ids.get(n));
  return {...part,id,batchId,agentId,dependsOn,documentPaths:[...documents],originalDocumentPaths:[...documents],sessionId:id,status:dependsOn.length?'waiting':'queued',submittedAt:Date.now(),answer:'',workers:{},...(nativeCoordinator?{execution:'native-coordinator',nativeRunId:id}:{}),progressNote:dependsOn.length?'Waiting for prerequisite task results.':'Mission accepted; waiting for a processing slot.'};
 });
}
export function materializeTask(task,missions){
 const parents=(task.dependsOn||[]).map(id=>missions.get(id));
 if(parents.some(p=>!p||p.status!=='completed'))throw Error('Prerequisite tasks are not complete.');
 if(!parents.length)return {message:task.message,dependencyInputs:[]};
 const dependencyInputs=parents.map(p=>({missionId:p.id,nativeRunId:p.nativeRunId,taskNumber:p.taskNumber,sha256:createHash('sha256').update(p.scriptNarration||p.answer||'').digest('hex')}));
 if(task.targetRole==='scene-authoring'){
  const writers=parents.filter(p=>p.targetRole==='narration-writing'||p.taskType==='narration');
  if(writers.length!==1||!writers[0].scriptNarration)throw Error('This scene task needs one completed narration task.');
  const instruction=task.message.replace(/\b(?:script|narration|voiceover)\s*:/gi,'narration from dependency ');
  return {message:'Scene task. Task '+writers[0].taskNumber+' is complete. The narration below is its exact completed result. Use it now without rewriting.\n'+instruction+'\n\nScript:\n'+writers[0].scriptNarration,dependencyInputs,narrationOnly:true};
 }
 return {message:task.message+'\n\nCURRENT EXPLICITLY REQUESTED DEPENDENCY RESULTS:\n'+parents.map(p=>'Task '+p.taskNumber+':\n'+(p.scriptNarration||p.answer)).join('\n\n'),dependencyInputs};
}
export function batchStatus(missions){
 const groups=new Map();for(const mission of missions.values())if(mission.batchId){const group=groups.get(mission.batchId)||[];group.push(mission);groups.set(mission.batchId,group);}
 return [...groups].map(([id,tasks])=>({id,total:tasks.length,completed:tasks.filter(t=>t.status==='completed').length,status:tasks.every(t=>t.status==='completed')?'completed':tasks.some(t=>['failed','blocked'].includes(t.status))?'needs-attention':'in-progress'}));
}
