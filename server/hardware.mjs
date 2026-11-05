import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
const number=value=>{const n=Number(value);return String(value).trim()!==''&&Number.isFinite(n)&&n>=0?n:null;};
export function parseGpuMetrics(csv){
 return String(csv).trim().split(/\r?\n/).filter(Boolean).flatMap(line=>{
  const values=line.split(',').map(s=>s.trim());if(values.length<5)return [];
  const name=values.slice(0,-4).join(', '),[totalMiB,usedMiB,usagePercent,temperatureC]=values.slice(-4).map(number);
  return [{name,totalMiB,usedMiB,usagePercent:usagePercent===null?null:Math.min(100,usagePercent),temperatureC}];
 });
}
export function createHardwareSampler({ttl=5000,clock=Date.now,memory=()=>({totalBytes:os.totalmem(),freeBytes:os.freemem()}),gpu=async()=>{
 const {stdout}=await run('nvidia-smi',['--query-gpu=name,memory.total,memory.used,utilization.gpu,temperature.gpu','--format=csv,noheader,nounits'],{windowsHide:true,timeout:2500,maxBuffer:16384});return parseGpuMetrics(stdout);
}}={}){
 let cached=null,pending=null;
 return async()=>{
  if(cached&&clock()-cached.sampledAt<ttl)return cached;
  if(pending)return pending;
  pending=(async()=>{const {totalBytes,freeBytes}=memory();let gpus=[];try{gpus=await gpu();}catch{}
   const usedBytes=Math.max(0,totalBytes-freeBytes);
   return cached={sampledAt:clock(),ram:{totalBytes,usedBytes,usagePercent:totalBytes?usedBytes/totalBytes*100:null},gpus,gpuStatus:gpus.length?'available':'unavailable'};
  })();try{return await pending;}finally{pending=null;}
 };
}
