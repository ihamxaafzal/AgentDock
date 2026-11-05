import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {promisify} from 'node:util';
const run=promisify(execFile);
export function extractionWorkersReady(task){
 const assignments=task.requiredAssignments;
 if(Array.isArray(assignments)&&assignments.length){
  const workers=Object.values(task.workers||{});
  return assignments.every(({kind,profileId})=>workers.some(worker=>worker.id===profileId&&worker.parentRunId===task.nativeRunId&&worker.status==='completed'&&new RegExp(`^Extract only ${kind} prompt bodies\\b`,'i').test(worker.message||'')));
 }
 const required=task.requiredProfiles||[];
 const workers=Object.values(task.workers||{});
 return required.every(id=>workers.some(w=>w.id===id&&w.parentRunId===task.nativeRunId&&w.status==='completed'));
}
export async function extractionSummary(task,artifacts){
 if(!extractionWorkersReady(task))throw Error('The requested extractor did not complete this mission. Check the worker result.');
 const paths=task.extractionInputs||[task.inputDocument?.path,...(task.documentPaths||[])].filter(Boolean);
 if(!paths.length)throw Error('The current source for this extraction is missing.');
 const kinds=task.promptKind==='both'?['image','video']:[task.promptKind];
 const results=[];
 for(const kind of kinds){
  const artifact=artifacts.find(a=>a.name.startsWith(kind+'-prompts-'));
  if(!artifact)throw Error('The requested '+kind+' TXT file was not created.');
  const {stdout}=await run(process.env.HERMES_NATIVE_PYTHON,[fileURLToPath(new URL('./verify-extraction.py',import.meta.url)),JSON.stringify(paths),kind,resolve(process.env.HERMES_EXTRACTION_DIR,artifact.name)],{windowsHide:true,encoding:'utf8',env:{...process.env,PYTHONUTF8:'1'},maxBuffer:1024*1024});
  results.push({kind,...JSON.parse(stdout)});
 }
 const lines=results.map(r=>`${r.count} ${r.kind} prompts were extracted.`);
 if(results.some(r=>r.warnings.length))lines.push('Source warnings: '+results.flatMap(r=>r.warnings.map(w=>w.message)).join(' '));
 lines.push('Download the Notepad TXT file below. Original wording and order are preserved.');
 return {answer:lines.join('\n\n'),extractionCounts:Object.fromEntries(results.map(r=>[r.kind,r.count]))};
}
