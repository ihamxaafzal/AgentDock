import test from 'node:test';
import assert from 'node:assert/strict';
import {createHardwareSampler,parseGpuMetrics} from '../server/hardware.mjs';
import {hardwareDisplay} from '../public/hardware-display.js';
test('driver metrics preserve real values and unsupported sensors remain unavailable',()=>{
 const gpus=parseGpuMetrics('NVIDIA GeForce RTX 4060, 8188, 1287, 24, 57.58\nOther GPU, N/A, N/A, [Not Supported], N/A');
 assert.equal(gpus[0].temperatureC,57.58);assert.equal(gpus[0].usedMiB,1287);assert.equal(gpus[1].usagePercent,null);
 assert(hardwareDisplay({gpus:[gpus[1]]}).metrics.some(m=>m.value==='Unavailable'));
});
test('concurrent hardware reads share one bounded sample and refresh after the cache expires',async()=>{
 let now=0,calls=0,release;const wait=new Promise(r=>release=r);
 const sample=createHardwareSampler({clock:()=>now,memory:()=>({totalBytes:1000,freeBytes:400}),gpu:async()=>{calls++;await wait;return [];}});
 const a=sample(),b=sample();release();const [first,second]=await Promise.all([a,b]);assert.equal(calls,1);assert.equal(first,second);assert.equal(first.ram.usagePercent,60);
 await sample();assert.equal(calls,1);now=6000;await sample();assert.equal(calls,2);
 const unavailable=await createHardwareSampler({gpu:async()=>{throw Error('No driver');}})();assert.equal(unavailable.gpuStatus,'unavailable');assert.deepEqual(unavailable.gpus,[]);
});
