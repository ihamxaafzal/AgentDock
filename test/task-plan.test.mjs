import test from 'node:test';
import assert from 'node:assert/strict';
import {planTasks,createTaskBatch,materializeTask,batchStatus} from '../server/task-plan.mjs';
import {MissionScheduler} from '../server/missions.mjs';
import {prepareChiefDirection} from '../server/documents.mjs';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {testProfiles} from './fixtures.mjs';

export const exactBrief=`Task 1: Research new surprising animal-science topics with sources.
Task 2: Write a narration on this topic: A single wrong DNA letter can become a permanent mutation. But cells have a backup system.
Tasks 3: After Task 2 completes, create scenes from the narration in Task 2 with 10 scenes and 3 callouts total.`;
const tick=()=>new Promise(r=>setImmediate(r));

test('scene authoring waits for the current narration and does not reuse unrelated research',async()=>{
 const plan=planTasks('Task 1: Research surprising animal facts.\nTask 2: Write a narration with a good hook about cramps.\nTask 3: After Task 2 completes, create scenes using the narration from Task 2.');
 assert.deepEqual(plan.map(t=>t.targetRole),['topic-research','narration-writing','scene-authoring']);
 assert.deepEqual(plan.map(t=>t.dependsOnNumbers),[[],[],[2]]);
 const batch=createTaskBatch(plan,{agentId:'coordinator',nativeCoordinator:true}),missions=new Map(batch.map(t=>[t.id,t]));
 batch[0].answer='Unrelated animal research';batch[0].status='completed';
 batch[1].scriptNarration='Only this completed current narration. '.repeat(35).trim();batch[1].status='completed';
 const direction=materializeTask(batch[2],missions);
 assert(direction.message.endsWith(batch[1].scriptNarration));assert(!direction.message.includes(batch[0].answer));
 const dir=await mkdtemp(join(tmpdir(),'aether-scene-handoff-'));
 try{const routed=await prepareChiefDirection(direction.message,dir,[],testProfiles);assert.equal(routed.taskType,'medical-scenes');assert.equal(JSON.parse(await readFile(routed.inputDocument.path)).script,batch[1].scriptNarration);}finally{await rm(dir,{recursive:true,force:true});}
});

test('the exact user brief becomes three tasks with only the scene task waiting for Writer',()=>{
 const plan=planTasks(exactBrief);assert.equal(plan.length,3);
 assert.deepEqual(plan.map(t=>t.targetRole),['topic-research','narration-writing','scene-authoring']);
 assert.deepEqual(plan.map(t=>t.dependsOnNumbers),[[],[],[2]]);
});
test('Writer can unlock scenes while an independent Scout is still running',async()=>{
 const batch=createTaskBatch(planTasks(exactBrief),{agentId:'coordinator',nativeCoordinator:true});
 const missions=new Map(batch.map(m=>[m.id,m])),release=new Map(),started=[];
 const scheduler=new MissionScheduler({missions,concurrency:5,execute:async m=>{started.push(m.taskNumber);await new Promise(r=>release.set(m.taskNumber,r));if(m.taskNumber===2)m.scriptNarration='Actual current Writer narration.';m.status='completed';}});
 scheduler.pump();await tick();assert.deepEqual(started,[1,2]);assert.equal(batch[2].status,'waiting');
 release.get(2)();await tick();await tick();assert.deepEqual(started,[1,2,3]);assert.equal(batch[0].status,'running');
 assert(materializeTask(batch[2],missions).message.endsWith('Script:\nActual current Writer narration.'));
 release.get(1)();release.get(3)();await tick();assert.equal(batchStatus(missions)[0].status,'completed');
});
test('a failed prerequisite blocks its child without launching it; a successful retry unlocks it',async()=>{
 const batch=createTaskBatch(planTasks('Task 1: Write a narration.\nTasks 2: After Task 1, create 10 scenes from its narration.'),{agentId:'coordinator'});
 batch[0].status='failed';const missions=new Map(batch.map(m=>[m.id,m]));let started=0;
 const scheduler=new MissionScheduler({missions,execute:async m=>{started++;m.status='completed';}});
 scheduler.pump();await tick();assert.equal(batch[1].status,'blocked');assert.equal(started,0);assert.equal(batchStatus(missions)[0].status,'needs-attention');
 batch[0].status='completed';batch[0].scriptNarration='Current retry result.';scheduler.pump();await tick();assert.equal(started,1);assert.equal(batch[1].status,'completed');
});
test('the exact completed narration supplies all ten scene voices with three total callouts',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'aether-linked-scene-'));
 try{
  const batch=createTaskBatch(planTasks(exactBrief),{agentId:'coordinator'}),missions=new Map(batch.map(m=>[m.id,m]));
  const narration='A current narration sentence explains a careful process without changing any of the original spoken words. '.repeat(12).trim();
  Object.assign(batch[1],{status:'completed',scriptNarration:narration,nativeRunId:'actual-writer-run'});
  const ready=materializeTask(batch[2],missions);const prepared=await prepareChiefDirection(ready.message,dir,[],testProfiles);
  const plan=JSON.parse(await readFile(prepared.inputDocument.path));
  assert.equal(prepared.taskType,'medical-scenes');assert.equal(plan.scenes.length,10);assert.equal(plan.script,narration);
  assert.equal(plan.scenes.map(s=>s.voice).join(' '),narration);assert.equal(plan.scenes.reduce((n,s)=>n+s.calloutCount,0),3);
  assert.equal(ready.dependencyInputs[0].missionId,batch[1].id);
  assert(!ready.message.includes('Production note:'));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('references are scoped to this batch and invalid dependency graphs fail before any work starts',()=>{
 assert.throws(()=>planTasks('Task 1: Write using Task 9.'),/missing Task 9/);
 assert.throws(()=>planTasks('Task 1: Write after Task 2.\nTask 2: Write after Task 1.'),/cycle/);
 assert.throws(()=>planTasks('Task 1: First\nTasks 1: Duplicate'),/unique/);
 assert.throws(()=>planTasks('Task 1: Create 10 scenes from the narration writer result.'),/source in this batch/);
});
test('large task lists are accepted and preserve every task',()=>{
 const text=Array.from({length:100},(_,i)=>`Tasks ${i+1}: Research one animal topic.`).join('\n');
 assert.equal(planTasks(text).length,100);assert.equal(createTaskBatch(planTasks(text),{agentId:'chief'}).length,100);
});

test('forward dependency chains propagate a failure without leaving descendants waiting forever',()=>{
 const list=createTaskBatch(planTasks('Task 1: Write after Task 2.\nTasks 2: Write after Task 3.\nTask 3: Write a narration.'),{agentId:'coordinator'});
 list[2].status='failed';const missions=new Map(list.map(m=>[m.id,m]));
 const scheduler=new MissionScheduler({missions,execute:()=>{throw Error('Must not start');}});scheduler.pump();
 assert.equal(list[0].status,'blocked');assert.equal(list[1].status,'blocked');
});
