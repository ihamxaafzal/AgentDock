import test from 'node:test';
import assert from 'node:assert/strict';
import {MissionScheduler,missionWorker,projectMissions,splitMissionBrief,copyMissionInputs} from '../server/missions.mjs';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('missions start concurrently, queue overflow and continue after one failure',async()=>{
 const missions=new Map([1,2,3].map(n=>[String(n),{id:String(n),status:'queued'}]));
 const release=new Map(),started=[];
 const scheduler=new MissionScheduler({missions,concurrency:2,execute:async m=>{started.push(m.id);await new Promise((resolve,reject)=>release.set(m.id,{resolve,reject}));m.status='completed';}});
 scheduler.pump();await tick();assert.deepEqual(started,['1','2']);assert.equal(missions.get('3').status,'queued');
 release.get('1').reject(Error('One mission failed'));await tick();await tick();assert.equal(missions.get('1').status,'failed');assert.deepEqual(started,['1','2','3']);
 release.get('2').resolve();release.get('3').resolve();await tick();assert.equal(missions.get('2').status,'completed');assert.equal(missions.get('3').status,'completed');
});
test('restart resumes active runs without resubmitting and holds queued work until a slot opens',async()=>{
 const missions=new Map([['active',{id:'active',status:'running'}],['queued',{id:'queued',status:'queued'}]]),calls=[],release=[];
 const scheduler=new MissionScheduler({missions,concurrency:1,execute:async(m,resume)=>{calls.push([m.id,resume]);await new Promise(r=>release.push(r));m.status='completed';}});
 scheduler.restore();await tick();assert.deepEqual(calls,[['active',true]]);release.shift()();await tick();await tick();assert.deepEqual(calls,[['active',true],['queued',false]]);release.shift()();await tick();
});
test('same worker in different missions retains separate responses and active counts',()=>{
 const first={agentId:'chief',status:'running',workers:{a:{id:'writer',status:'running',answer:'First only'}}};
 const second={agentId:'chief',status:'running',workers:{b:{id:'writer',status:'completed',answer:'Second only'}}};
 assert.equal(missionWorker(first,'writer').answer,'First only');assert.equal(missionWorker(second,'writer').answer,'Second only');
 const view=projectMissions(new Map([['first',first],['second',second]]),[{id:'chief'},{id:'writer',reportsTo:'chief'}]);
 assert.equal(view.get('chief').activeCount,2);assert.equal(view.get('writer').answer,'First only');
});
test('explicit task batches split without treating scene or narration labels as missions',()=>{
 assert.deepEqual(splitMissionBrief('Task 1: Extract images\nTask 2: Find animal topics'),['Extract images','Find animal topics']);
 for(const text of ['Scene 1: Example\nScene 2: Example','Script: The narrator mentions\nTask 1: a task\nTask 2: another'])assert.deepEqual(splitMissionBrief(text),[text]);
});
test('shared uploads get independent mission copies so prompt-kind flags cannot conflict',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'aether-inputs-'));
 try{
  const source=join(dir,'source.txt');await writeFile(source,'Original current source');
  const [a,b]=await Promise.all([copyMissionInputs([source],dir,'aether-1111'),copyMissionInputs([source],dir,'aether-2222')]);
  assert.notEqual(a[0],b[0]);await writeFile(a[0],'Changed only in first mission');
  assert.equal(await readFile(b[0],'utf8'),'Original current source');assert.equal(await readFile(source,'utf8'),'Original current source');
 }finally{await rm(dir,{recursive:true,force:true});}
});
