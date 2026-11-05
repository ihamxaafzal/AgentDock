import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {isSceneRequest,prepareSceneDirection,splitNarration,calloutPlan,cleanNarration,completedSceneArtifact,resumeSceneDirection} from '../server/scene-routing.mjs';
import {prepareChiefDirection} from '../server/documents.mjs';
import {testProfiles} from './fixtures.mjs';

test('scene retry preserves its current plan and asks the real specialist for pending scenes only',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'aether-resume-scenes-'));
 try{
  const task=await prepareChiefDirection('Create 3 medical scenes and 1 callout total. Script: First sentence. Second sentence. Third sentence.',dir,[],testProfiles);
  const path=task.inputDocument.path;await writeFile(join(path,'../scene-drafts.json'),JSON.stringify({'1':{scene:1}}));
  const result=await resumeSceneDirection(task,testProfiles);
  assert.equal(result.inputDocument.path,path);assert.equal(result.sceneOutputName,task.sceneOutputName);
  assert.match(result.message,/ONLY pending scenes 2, 3/);assert.match(result.message,/profile.*test-scenes/);
  await assert.rejects(resumeSceneDirection({...task,sceneOutputName:'unrelated.txt'},testProfiles),/does not match/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('compact scene brief uses current narration and a total callout budget',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'aether-compact-'));
 try {
  const source='What if a parasite lived inside you? This current narration has enough words for twelve separate scene assignments without importing any previous script or rewriting a single word.';
  const result=await prepareChiefDirection('12 scenes with 3 callouts must inside prompts: '+source,dir,[],testProfiles);
  assert.equal(result.taskType,'medical-scenes');assert.equal(result.sceneCount,12);
  const plan=JSON.parse(await readFile(result.inputDocument.path));
  assert.equal(plan.script,source);assert.equal(plan.scenes.map(s=>s.voice).join(' '),source);
  assert.equal(plan.scenes.reduce((sum,s)=>sum+s.calloutCount,0),3);
  assert.match(result.message,/"profile":"test-scenes","toolsets":\["aether_scenes"\]/);
  assert(!isSceneRequest('Extract image prompts from 12 scenes with 3 callouts: source text'));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('scene authoring routes before script writing and prompt extraction stays separate',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'aether-scenes-'));
 try{for(const message of ['Create 3 scenes and 2 callouts total. Script: First sentence. Second sentence. Third sentence.','Turn this script into 3 medical scenes. Script: First sentence. Second sentence. Third sentence.','Create 3 scenes from this script. Script: First sentence. Second sentence. Third sentence.']){assert(isSceneRequest(message));const p=await prepareChiefDirection(message,dir,[],testProfiles);assert.equal(p.taskType,'medical-scenes');assert.equal(p.sceneCount,3);assert(!p.promptKind);const plan=JSON.parse(await readFile(p.inputDocument.path));assert.equal(plan.scenes.map(s=>s.voice).join(' '),plan.script);assert(p.message.includes('aether_scenes'));}
 for(const m of ['Extract image prompts from these medical scenes.','Write a shocking medical script about acid.','Find medical video topics.'])assert(!isSceneRequest(m));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('narration is partitioned without rewriting, dropping, duplicating or reordering source words',()=>{
 const text='First, a virus attaches. Then it enters—without changing shape. Finally, new particles emerge!';for(const n of [1,3,8])assert.equal(splitNarration(text,n).join(' ').replace(/\s+/g,' '),text);
 assert.throws(()=>splitNarration('Only two.',4));
});
test('callout budgets distinguish exact total versus each scene and honor explicit labels',()=>{
 const total=calloutPlan('6 callouts total',10);assert.equal(total.reduce((n,s)=>n+s.calloutCount,0),6);assert.equal(total.filter(s=>s.calloutCount===2).length,3);
 assert.deepEqual(calloutPlan('2 callouts per scene',3).map(s=>s.calloutCount),[2,2,2]);assert.equal(calloutPlan('callouts: 1',3)[0].calloutCount,1);assert(calloutPlan('No callouts',4).every(s=>s.calloutCount===0));
 assert.deepEqual(calloutPlan('2 callouts total\nCallout labels: Cell, DNA',4).flatMap(s=>s.labels),['Cell','DNA']);
 assert.throws(()=>calloutPlan('3 callouts total\nCallout labels: Cell, DNA',4));
});

test('Narration wrappers and production notes are not spoken scene narration',()=>{
 assert.equal(cleanNarration('## Voiceover\n\nExact spoken words.\n\n---\nProduction note: 180 words.\nSources: example'),'Exact spoken words.');
 assert.equal(cleanNarration('[VOICEOVER]Exact spoken words.[/VOICEOVER]\nSources: example'),'Exact spoken words.');
 assert.equal(cleanNarration('This story mentions a production note inside speech.'),'This story mentions a production note inside speech.');
});

test('scene output recovery requires the actual completed worker for the same run',async()=>{
 const task={taskType:'medical-scenes',nativeRunId:'current',sceneOutputName:'medical-scenes-20261102-000000-0123456789.txt',inputDocument:{source:'scene-plan',path:'unused'}};
 for(const worker of [null,{status:'running',delegatedFrom:'chief',parentRunId:'current'},{status:'completed',delegatedFrom:'chief',parentRunId:'old'}])assert.equal(await completedSceneArtifact(task,worker,'unused'),null);
});
