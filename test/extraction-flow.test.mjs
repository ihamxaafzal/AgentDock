import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareChiefDirection} from '../server/documents.mjs';
import {extractionWorkersReady} from '../server/extraction-result.mjs';
import {CoordinatorProtocol} from '../server/native-coordinator.mjs';
import {DelegationSignals} from '../public/delegation-motion.js';
import {splitMissionBrief} from '../server/missions.mjs';
import {testProfiles} from './fixtures.mjs';

test('every extraction task gets explicit attachment paths and its own correct specialist',async()=>{
 const root=await mkdtemp(join(tmpdir(),'aether-attachments-'));
 try{
  const path=join(root,'current.txt');await writeFile(path,'Scene 01\nImage Prompt: Current image.\nVideo Prompt: Current motion.');
  for(const [brief,kind] of [['Extract Images Prompt.','image'],['Extract Video Prompts.','video']]){
   const prepared=await prepareChiefDirection(brief,root,[path],testProfiles);
   assert.equal(prepared.promptKind,kind);assert.deepEqual(prepared.extractionInputs,[path]);
   const args=JSON.parse(prepared.message.slice(prepared.message.indexOf('\n')+1));
   assert(args.tasks[0].context.includes(path));assert.equal(args.tasks[0].profile,kind==='image'?'test-images':'test-video');
   assert.match(prepared.message,/Respond in concise U\.S\. English/);
  }
  await assert.rejects(prepareChiefDirection('Extract Images Prompt.',root,[],testProfiles),/Attach the current text or document/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('wrong worker, old result and missing delegation cannot pass extraction completion',()=>{
 const task={promptKind:'image',requiredProfiles:['images'],nativeRunId:'current',workers:{a:{id:'video',parentRunId:'current',status:'completed'}}};
 assert(!extractionWorkersReady(task));task.workers.a.id='images';task.workers.a.parentRunId='old';assert(!extractionWorkersReady(task));
 task.workers.a.parentRunId='current';assert(extractionWorkersReady(task));
});
test('one profile with both extraction capabilities must complete both delegated assignments',()=>{
 const task={promptKind:'both',requiredAssignments:[{kind:'image',profileId:'combined'},{kind:'video',profileId:'combined'}],nativeRunId:'current',workers:{image:{id:'combined',parentRunId:'current',status:'completed',message:'Extract only image prompt bodies from the current inputs.'}}};
 assert(!extractionWorkersReady(task));task.workers.video={id:'combined',parentRunId:'current',status:'completed',message:'Extract only video prompt bodies from the current inputs.'};assert(extractionWorkersReady(task));
});
test('a rejected nested task does not trigger a fake handoff, and a corrected call does',()=>{
 const updates=[],p=new CoordinatorProtocol([{id:'video',profile:'test-video',name:'Video'}],u=>updates.push(u));
 p.handle({type:'tool_use',name:'delegate_task',tool_call_id:'bad',input:{tasks:[{profile:'test-video',goal:'Extract',tasks:[{}],toolsets:['aether_video_documents']}]}});
 p.handle({type:'tool_result',name:'delegate_task',tool_call_id:'bad',output:{error:'Task not started'}});assert.equal(updates.length,0);
 p.handle({type:'tool_use',name:'delegate_task',tool_call_id:'good',input:{tasks:[{profile:'test-video',goal:'Extract',toolsets:['aether_video_documents']}]}});
 assert.equal(updates.length,1);assert.equal(updates[0].worker.assignmentDispatched,true);
});
test('argument retries visit a physical worker only once within the same mission',()=>{
 const s=new DelegationSignals();s.observe([]);
 const a={id:'video',reportsTo:'chief',parentRunId:'one',assignmentId:'first:0',taskStatus:'running'};
 assert.equal(s.observe([a]).length,1);assert.deepEqual(s.observe([a,{...a,assignmentId:'retry:0'}]),[]);
 assert.equal(s.observe([{...a,parentRunId:'two'}]).length,1);
});
test('one inline source at the end of a current extraction batch is shared by both briefs',()=>{
 const source='Scene 01\nImage Prompt: Fresh image.\nImage-to-Video Prompt: Fresh motion.';
 const briefs=splitMissionBrief('Task 1: Extract image prompts.\nTask 2: Extract video prompts.\n'+source);
 assert.equal(briefs.length,2);assert(briefs.every(b=>b.includes(source)));
});
