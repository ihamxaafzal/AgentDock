import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {flowOutput,flowSettings,parseImagePrompts,isImageGenerationRequest,prepareImageGenerationDirection} from '../server/image-generation-routing.mjs';
import {visibleTasks,taskTitle} from '../public/task-cards.js';
import {MissionScheduler} from '../server/missions.mjs';
import {testProfiles} from './fixtures.mjs';
test('image generation routes separately from extraction and blood-flow script writing',()=>{
 assert(isImageGenerationRequest('Generate images: use this prompt list'));
 assert(isImageGenerationRequest('Create images with Google Flow using this prompt list'));
 assert(!isImageGenerationRequest('Write a script about blood flow in the brain'));
 assert(!isImageGenerationRequest('Extract image prompts from this file'));
});
test('Google Flow settings use environment overrides and portable output defaults',()=>{
 const keys=['AETHER_IMAGE_OUTPUT_DIR','AETHER_FLOW_CHROME_PROFILE','AETHER_FLOW_CHROME_EXECUTABLE'];
 const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 try{
  process.env.AETHER_IMAGE_OUTPUT_DIR=join(tmpdir(),'agentdock-custom-images');
  process.env.AETHER_FLOW_CHROME_PROFILE='Profile 7';
  process.env.AETHER_FLOW_CHROME_EXECUTABLE='C:/Custom/Chrome/chrome.exe';
  assert.equal(flowOutput(),join(tmpdir(),'agentdock-custom-images'));
  assert.equal(flowSettings().chromeProfile,'Profile 7');
  assert.equal(flowSettings().chromeExecutable,'C:/Custom/Chrome/chrome.exe');
 }finally{for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
});
test('prompt parsing preserves source order and excludes video prompts from labelled scene lists',()=>{
 const a='First full image prompt with precise medical details.',b='Second full image prompt with a different precise composition.';
 assert.deepEqual(parseImagePrompts(a+'\n\n'+b),[a,b]);
 assert.deepEqual(parseImagePrompts('Scene 1:\nImage Prompt: '+a+'\nImage-to-Video Prompt: Move camera\nScene 2:\nImage Prompt: '+b),[a,b]);
});
test('image generation plans persist exact settings and resume the same job instead of regenerating saved work',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'aether-flow-test-'));
 const first=await prepareImageGenerationDirection('Generate images. Prompts: A detailed image of a medical cell in its natural environment.',dir,[],undefined,testProfiles);
 const job=JSON.parse(await readFile(first.flowJobPath,'utf8'));
 assert.equal(job.settings.chromeProfile,'Default');assert.equal(job.settings.aspectRatio,'9:16');assert.equal(job.settings.model,'Nano Banana 2.1');assert.equal(job.settings.outputs,1);
 const resumed=await prepareImageGenerationDirection('Retry',dir,[],first.flowJobPath,testProfiles);assert.equal(resumed.flowJobPath,first.flowJobPath);assert.equal(resumed.imageCount,1);
});
test('clearing finished cards retains active work and retried cards become visible again',()=>{
 const missions=[{id:'old',status:'completed',message:'Done'},{id:'failed',status:'failed',message:'Old failure'},{id:'new',status:'running',message:'Current script'}];
 assert.deepEqual(visibleTasks(missions,{archived:['old','failed','new']}).map(m=>m.id),['new']);
 missions[0].status='running';assert(visibleTasks(missions,{archived:['old']}).some(m=>m.id==='old'));
 assert(taskTitle({message:'Short task\n\n'+'long source '.repeat(200)}).length<110);
});
test('Image generation batches serialize without blocking independent worker tasks',async()=>{
 const missions=new Map([['one',{id:'one',targetRole:'image-generation',status:'queued'}],['two',{id:'two',targetRole:'image-generation',status:'queued'}],['research',{id:'research',targetRole:'topic-research',status:'queued'}]]),started=[],release={};
 const scheduler=new MissionScheduler({missions,concurrency:3,execute:async m=>{started.push(m.id);await new Promise(r=>release[m.id]=r);m.status='completed';}});
 scheduler.pump();await new Promise(setImmediate);assert.deepEqual(started,['one','research']);assert.equal(missions.get('two').status,'queued');
 release.one();await new Promise(setImmediate);await new Promise(setImmediate);assert(started.includes('two'));release.two();release.research();await new Promise(setImmediate);
});
