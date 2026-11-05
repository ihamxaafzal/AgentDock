import http from 'node:http';
import { validateWriterResponse } from './writer-routing.mjs';
import { completedSceneArtifact, resumeSceneDirection } from './scene-routing.mjs';
import { extractionSummary } from './extraction-result.mjs';
import {createHardwareSampler} from './hardware.mjs';
import {prepareImageGenerationDirection,verifyImageGenerationResult} from './image-generation-routing.mjs';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { readRoster, sendTask, recoverTask, readEndpoints } from './adapter.mjs';
import { runNativeCoordinator, recoverableObserverFailure } from './native-coordinator.mjs';
import { MissionScheduler, projectMissions, missionWorker, copyMissionInputs, validateConcurrency } from './missions.mjs';
import {planTasks,createTaskBatch,materializeTask,batchStatus} from './task-plan.mjs';
import { receiveDocuments, collectArtifacts, artifactFile, prepareChiefDirection, scopeUploadedDocuments, missingPromptKinds, exportArtifacts } from './documents.mjs';
import { CAPABILITIES } from './profile-capabilities.mjs';

// Load project-local settings without overriding shell environment variables.
const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const root = resolve(fileURLToPath(new URL('../public', import.meta.url)));
const vendor = resolve(fileURLToPath(new URL('../node_modules/three/build', import.meta.url)));
const port = Number(process.env.PORT || 4317);
const token = randomBytes(24).toString('hex');
const hardwareSample=createHardwareSampler();
const dataDir = process.env.AETHER_DATA_DIR ? resolve(process.env.AETHER_DATA_DIR) : fileURLToPath(new URL('../data/', import.meta.url));
const taskFile = resolve(dataDir, `tasks-${port}.json`);
let tasks = new Map();
try { if (existsSync(taskFile)) tasks = new Map(Object.entries(JSON.parse(readFileSync(taskFile, 'utf8')))); }
catch { console.warn('Could not read saved AgentDock tasks. Inspect Hermes before resending previous work.'); }
const missionFile=resolve(dataDir, `missions-${port}.json`);
let missions=new Map();
try {
 if(existsSync(missionFile))missions=new Map(Object.entries(JSON.parse(readFileSync(missionFile,'utf8'))));
 else for(const [agentId,previous] of tasks)if(!previous.delegatedFrom){
  let known=false;try{known=readEndpoints().some(e=>e.id===agentId);}catch{}
  if(!known)continue;
  const id=previous.nativeRunId||previous.sessionId||`legacy-${agentId}`;
  const workers=Object.fromEntries([...tasks].filter(([,w])=>w.parentRunId===previous.nativeRunId&&w.delegatedFrom));
  missions.set(id,{...previous,id,agentId,workers,submittedAt:previous.startedAt});
 }
}catch{throw Error('Cannot read mission history. Inspect saved state before restarting.');}
let saveRetryTimer=null,saveRetryCount=0;
function saveTasks(){
 if(saveRetryTimer){clearTimeout(saveRetryTimer);saveRetryTimer=null;}
 let configured=[];try{configured=readEndpoints();}catch{}
 tasks=projectMissions(missions,configured);
 try{
  mkdirSync(dataDir,{recursive:true});
  for(const [file,value] of [[missionFile,Object.fromEntries(missions)],[taskFile,Object.fromEntries(tasks)]]){writeFileSync(file+'.tmp',JSON.stringify(value));renameSync(file+'.tmp',file);}
  saveRetryCount=0;
 }
 catch(error){
  if(['EPERM','EBUSY','EACCES'].includes(error.code)&&saveRetryCount++<5){saveRetryTimer=setTimeout(saveTasks,100);saveRetryTimer.unref();}
  else console.error('Could not save mission history:',error.message);
 }
}
for (const task of missions.values()) if (task.artifacts?.length) {
  const legacy = task.artifacts.some(file => !file.name.endsWith('.txt'));
  task.artifacts = await collectArtifacts(task.artifacts.map(file => file.name));
  if (legacy && task.artifacts.length && task.status === 'completed') task.answer = 'Image prompts are ready in a Notepad (.txt) file. Original wording and source arrangement are preserved.\n\nUse Download prompts · Notepad (.txt) below.';
}
saveTasks();
function updateTask(agentId, task, update) {
  const { worker, ...progress } = update;
  if(task.taskType==='extraction'&&task.promptKind)delete progress.answer;
  Object.assign(task, progress);
  saveTasks();
  if (worker && readEndpoints().some(endpoint => endpoint.id === worker.id && endpoint.reportsTo === agentId)) {
    const key=worker.assignmentId||worker.id;
    task.workers??={};const previous=task.workers[key];
    task.workers[key]={...previous,...worker,delegatedFrom:agentId,parentRunId:task.nativeRunId,startedAt:previous?.startedAt??Date.now(),...(worker.status!=='running'?{completedAt:Date.now()}:{}),statusSource:'Native Hermes delegation'};
    saveTasks();
  }
}
async function finishTask(task, result) {
  // Keep the published mission running until every file/worker validation and
  // export finishes. A temporary "completed" state must never escape to polls.
  const destination=task;
  task={...task,workers:structuredClone(task.workers||{})};
  const names = result.artifactNames?.filter(name => !task.promptKind || task.promptKind === 'both' || name.startsWith(task.promptKind + '-prompts-')) || [];
  if(result.status==='completed'){
    const verified=await completedSceneArtifact(task,missionWorker(task,task.requiredProfiles?.[0]),process.env.HERMES_EXTRACTION_DIR);
    if(verified&&!names.includes(verified))names.push(verified);
  }
  let artifacts = await collectArtifacts(names);
  Object.assign(task, result, { artifacts, completedAt: Date.now() });
  if(task.taskType==='image-creation'){
    try{Object.assign(task,await verifyImageGenerationResult(task),{status:'completed',error:''});}
    catch(error){Object.assign(task,{status:'failed',error:error.message});}
  }
  if(result.status==='completed'&&['image','video','both'].includes(task.promptKind)){
    try{Object.assign(task,await extractionSummary(task,artifacts));}
    catch(error){artifacts=[];Object.assign(task,{status:'failed',artifacts,error:error.message,answer:'The extraction did not complete. Check this mission\'s source and assigned worker.'});}
  }
  if (result.status === 'completed' && task.taskType === 'narration') {
    const writer=missionWorker(task,task.requiredProfiles?.[0]);
    const delegated=writer?.parentRunId===task.nativeRunId&&writer.delegatedFrom&&writer.status==='completed';
    let checked=delegated?validateWriterResponse(writer.answer,task.minimumNarrationWords):{error:'The coordinator did not receive a completed narration assignment.'};
    if(delegated&&checked.error)checked=validateWriterResponse(result.answer,task.minimumNarrationWords);
    if(checked.error)Object.assign(task,{status:'failed',error:checked.error});
    else Object.assign(task,{answer:checked.answer,scriptNarration:checked.narration,scriptWordCount:checked.wordCount,estimatedScriptSeconds:checked.estimatedSeconds});
  }
  if(result.status==='completed' && task.taskType==='medical-scenes'){
    const worker=missionWorker(task,task.requiredProfiles?.[0]);
    const file=artifacts.find(a=>a.name===task.sceneOutputName);
    if(!file || worker?.parentRunId!==task.nativeRunId || worker.status!=='completed')Object.assign(task,{status:'failed',error:'The scene-authoring worker did not return the complete saved scene pack. Inspect its result.'});
    else {const saved=await artifactFile(file.name,new Map([['current',task]]));task.answer=saved.bytes.toString('utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');}
  }
  if(result.status==='completed'&&task.requiredProfiles?.length&&task.status!=='failed'){
    const incomplete=task.requiredProfiles.filter(id=>!Object.values(task.workers||{}).some(w=>w.id===id&&w.parentRunId===task.nativeRunId&&w.status==='completed'));
    if(incomplete.length)Object.assign(task,{status:'failed',error:'Required specialist did not complete: '+incomplete.join(', ')});
  }
  if (result.status === 'completed' && task.inputDocument) {
    const missing = missingPromptKinds(task.promptKind, artifacts);
    if (missing.length) Object.assign(task, { status: 'failed', error: `No ${missing.join(' or ')} TXT output was produced. Inspect the specialist result before retrying.` });
  }
  try {
    await exportArtifacts(artifacts, task.outputDirectory);
    if (task.outputDirectory && artifacts.length) task.answer = (task.answer || '') + '\n\nSaved on your PC:\n' + artifacts.map(file => file.savedPath).join('\n');
  } catch (error) { Object.assign(task, { status: 'failed', error: 'Extraction output is available, but saving to your requested folder failed: ' + error.message }); }
  if (task.nativeRunId) for (const child of Object.values(task.workers||{})) if (child.parentRunId === task.nativeRunId) {
    const id=child.id, endpoint=readEndpoints().find(item=>item.id===id);
    const assignment=task.requiredAssignments?.find(item=>item.profileId===id&&new RegExp(`^Extract only ${item.kind} prompt bodies\\b`,'i').test(child.message||''));
    const type = assignment?.kind || (endpoint?.capabilities?.includes(CAPABILITIES.images) ? 'image' : endpoint?.capabilities?.includes(CAPABILITIES.video) ? 'video' : null);
    if(task.requiredProfiles?.includes(id) && task.taskType==='narration' && task.status==='completed' && child.status==='completed') Object.assign(child,{answer:task.answer,scriptWordCount:task.scriptWordCount,estimatedScriptSeconds:task.estimatedScriptSeconds});
    if(task.requiredProfiles?.includes(id) && task.taskType==='medical-scenes' && task.status==='completed')child.answer=task.answer;
    child.artifacts = type ? artifacts.filter(file => file.name.startsWith(type + '-prompts-')) : artifacts;
    if (task.inputDocument && type && child.status === 'completed' && !child.artifacts.length) Object.assign(child, { status: 'failed', error: `The specialist did not produce its ${type} TXT file.` });
    if (child.status === 'running') Object.assign(child, { status: 'unknown', progressNote: 'The coordinator finished; the worker’s final status was not reported.' });
  }
  Object.assign(destination,task);
}
async function executeMission(task,resume=false){
 const endpoint=readEndpoints().find(e=>e.id===task.agentId);
 if(!endpoint)throw Error('Mission agent is no longer configured.');
 try{
  let result;
  if(resume){
   if(['native-chief','native-coordinator'].includes(task.execution)&&!existsSync(resolve(dataDir,'runs',task.nativeRunId+'.jsonl'))&&!existsSync(resolve(dataDir,'runs',task.nativeRunId+'.meta.json')))return executeMission(task,false);
   result=['native-chief','native-coordinator'].includes(task.execution)
    ?await runNativeCoordinator({endpoint,endpoints:readEndpoints(),extraToolsets:task.taskType==='image-creation'?['aether_flow','computer_use','terminal']:[],runId:task.nativeRunId,dataDir,resume:true,onProgress:update=>updateTask(task.agentId,task,update)})
    :await recoverTask(task.agentId,task.sessionId,update=>updateTask(task.agentId,task,update));
  }else if(endpoint.nativeCoordinator){
   const materialized=materializeTask(task,missions);
   const original=materialized.narrationOnly?[]:[...new Set(task.originalDocumentPaths||task.documentPaths||[])];
   const documents=await copyMissionInputs(original,resolve(dataDir,'documents'),task.id);
   let message=materialized.message;task.dependencyInputs=materialized.dependencyInputs;
   const attachmentAt=message.indexOf('\n\nAttached local documents,');
   if(attachmentAt>=0){let suffix=message.slice(attachmentAt);original.forEach((path,i)=>{suffix=suffix.replaceAll(path,documents[i]);});message=message.slice(0,attachmentAt)+suffix;}
   task.documentPaths=documents;
   const endpoints=readEndpoints();
   const prepared=task.flowJobPath?await prepareImageGenerationDirection(message,resolve(dataDir,'documents'),documents,task.flowJobPath,endpoints):task.resumeScenePlan?await resumeSceneDirection(task,endpoints):await prepareChiefDirection(message,resolve(dataDir,'documents'),documents,endpoints);
   Object.assign(task,{promptKind:prepared.promptKind,taskType:prepared.taskType||'extraction',outputDirectory:prepared.outputDirectory});
   for(const key of ['sceneOutputName','sceneCount','minimumNarrationWords','inputDocument','extractionInputs','requiredProfiles','requiredAssignments','flowJobPath','imageCount'])if(prepared[key]!==undefined)task[key]=prepared[key];
   await scopeUploadedDocuments(documents,prepared.promptKind,resolve(dataDir,'documents'));saveTasks();
   result=await runNativeCoordinator({endpoint,endpoints:readEndpoints(),extraToolsets:task.taskType==='image-creation'?['aether_flow','computer_use','terminal']:[],message:prepared.message,runId:task.nativeRunId||task.id,dataDir,onProgress:update=>updateTask(task.agentId,task,update)});
   // A local model can acknowledge an assignment without actually calling the
   // tool. Correct that once only when no real worker has been launched.
   if(prepared.requiredProfiles?.length&&result.status==='completed'&&!Object.values(task.workers||{}).some(w=>w.assignmentDispatched!==false)){
    task.priorAttempts??=[];task.priorAttempts.push({nativeRunId:task.nativeRunId,sessionId:result.sessionId,answer:result.answer,reason:'The coordinator returned without dispatching a worker.'});
    task.nativeRunId=`aether-${randomUUID()}`;task.sessionId=task.nativeRunId;task.workers={};
    task.progressNote='The coordinator is correcting a missing delegation. No completed worker assignment is being repeated.';saveTasks();
    result=await runNativeCoordinator({endpoint,endpoints:readEndpoints(),extraToolsets:task.taskType==='image-creation'?['aether_flow','computer_use','terminal']:[],message:'The previous response only claimed to wait. No worker has been launched. Call delegate_task now with the exact assignments below. A normal text reply is not completion.\n'+prepared.message,runId:task.nativeRunId,dataDir,onProgress:update=>updateTask(task.agentId,task,update)});
   }
  }else result=await sendTask(task.agentId,task.message,task.sessionId,update=>updateTask(task.agentId,task,update));
  await finishTask(task,result);
 }catch(error){await finishTask(task,{status:'failed',error:error.message});}
 saveTasks();
}
for(const task of missions.values())if(recoverableObserverFailure(task))Object.assign(task,{status:'running',error:'',progressNote:'Recovering the existing Hermes run; no new task is being submitted.'});
const settingsFile=resolve(dataDir,'mission-settings.json');
let missionConcurrency=process.env.AETHER_CONCURRENT_MISSIONS||5;
try{if(existsSync(settingsFile))missionConcurrency=JSON.parse(readFileSync(settingsFile,'utf8')).concurrency;}catch{throw Error('Cannot read saved mission settings.');}
const scheduler=new MissionScheduler({missions,concurrency:missionConcurrency,execute:executeMission,onChange:saveTasks});
scheduler.restore();
let cache = { agents: [], connected: false, error: null, updatedAt: null };
let syncing;
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
async function refresh() {
  if (syncing) return syncing;
  syncing = (async () => {
    try { cache = { agents: await readRoster(tasks), connected: true, updatedAt: Date.now(), error: null }; }
    catch (e) { cache = { ...cache, connected: false, error: e.message, checkedAt: Date.now() }; }
    finally { syncing = null; }
    return cache;
  })();
  return syncing;
}
function json(res, code, data) { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
async function body(req) {
  const chunks = [];
  for await (const part of req) chunks.push(part);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
function sameOrigin(req) {
  const host = req.headers.host;
  if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(host)) return false;
  return !req.headers.origin || [`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(req.headers.origin);
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'");
  if (!sameOrigin(req)) return json(res, 403, { error: 'Local same-origin requests only' });
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  try {
    if (url.pathname === '/api/bootstrap' && req.method === 'GET') return json(res, 200, { token, version: '2.0.0', bridge: true, backend: 'hermes' });
    if (url.pathname.startsWith('/api/')) {
      if (req.headers['x-aether-token'] !== token) return json(res, 403, { error: 'Reload AgentDock to authorize this local session.' });
      if (url.pathname === '/api/status' && req.method === 'GET') return json(res, 200, await refresh());
      if (url.pathname === '/api/hardware' && req.method === 'GET') return json(res,200,await hardwareSample());
      if (url.pathname === '/api/tasks' && req.method === 'GET') return json(res, 200, { tasks: Object.fromEntries(tasks), missions: [...missions.values()], batches:batchStatus(missions), concurrency: scheduler.concurrency });
      if(url.pathname==='/api/settings'&&req.method==='POST'){
        const request=await body(req);if(request.approved!==true)return json(res,400,{error:'Explicit settings approval required.'});
        let value;try{value=validateConcurrency(request.concurrency);}catch(error){return json(res,400,{error:error.message});}
        writeFileSync(settingsFile+'.tmp',JSON.stringify({concurrency:value}));renameSync(settingsFile+'.tmp',settingsFile);
        scheduler.setConcurrency(value);return json(res,200,{concurrency:value});
      }
      const retry=/^\/api\/missions\/(aether-[a-f0-9-]+)\/retry$/.exec(url.pathname);
      if(retry&&req.method==='POST'){
        const request=await body(req);if(request.approved!==true)return json(res,400,{error:'Explicit retry approval required.'});
        const task=missions.get(retry[1]);if(!task)return json(res,404,{error:'Unknown task.'});
        if(task.status!=='failed')return json(res,409,{error:'Only a failed task can be retried. Completed tasks are preserved.'});
        task.priorAttempts??=[];task.priorAttempts.push({nativeRunId:task.nativeRunId,status:task.status,error:task.error,answer:task.answer});
        Object.assign(task,{nativeRunId:'aether-'+randomUUID(),status:task.dependsOn?.length?'waiting':'queued',workers:{},answer:'',error:'',artifacts:[],documentPaths:task.originalDocumentPaths||[],progressNote:'Retry requested.'});
        task.sessionId=task.nativeRunId;
        task.resumeScenePlan=task.taskType==='medical-scenes'&&task.inputDocument?.source==='scene-plan';
        for(const key of ['completedAt','startedAt','scriptNarration','scriptWordCount','extractionCounts',...task.resumeScenePlan?[]:['inputDocument','sceneOutputName']])delete task[key];
        saveTasks();scheduler.pump();return json(res,202,{id:task.id,status:task.status});
      }
      if (url.pathname === '/api/documents' && req.method === 'POST') {
        try { return json(res, 200, { documents: await receiveDocuments(req, resolve(dataDir, 'documents')) }); }
        catch (error) { return json(res, 400, { error: error.message }); }
      }
      if (url.pathname.startsWith('/api/artifacts/') && req.method === 'GET') {
        const name = decodeURIComponent(url.pathname.slice('/api/artifacts/'.length));
        const file = await artifactFile(name, missions);
        if (!file) return json(res, 404, { error: 'Unknown extraction file.' });
        res.writeHead(200, { 'Content-Type': file.type, 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' });
        return res.end(file.bytes);
      }
      if (url.pathname === '/api/tasks' && req.method === 'POST') {
        const { agentId, message, messages, approved, documents = [] } = await body(req);
        if (approved !== true) return json(res, 400, { error: 'Explicit send approval required.' });
        let plan;try{plan=planTasks(Array.isArray(messages)?messages:typeof message==='string'?message:[]);}catch(error){return json(res,400,{error:error.message});}
        const roster = await refresh();
        if (!roster.connected || !roster.agents.some(a => a.id === agentId)) return json(res, 400, { error: 'Select a verified, connected Hermes profile.' });
        const endpoints = readEndpoints(), endpoint = endpoints.find(entry => entry.id === agentId);
        if (endpoint.reportsTo) return json(res, 400, { error: 'Send your task to the configured coordinator. Workers receive delegated assignments.' });
        const accepted=createTaskBatch(plan,{agentId,documents:Array.isArray(documents)?documents.filter(p=>typeof p==='string'):[],nativeCoordinator:endpoint.nativeCoordinator});
        for(const task of accepted)missions.set(task.id,task);
        saveTasks();scheduler.pump();
        return json(res,202,{sessionId:accepted[0].id,batchId:accepted[0].batchId,status:accepted[0].status,missions:accepted.map(t=>({id:t.id,taskNumber:t.taskNumber,status:t.status,dependsOn:t.dependsOn})),concurrency:scheduler.concurrency});
      }
      return json(res, 404, { error: 'Unknown API route' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed' });
    const pathname = decodeURIComponent(url.pathname);
    const isVendor = pathname.startsWith('/vendor/');
    if (isVendor && !['/vendor/three.module.js', '/vendor/three.core.js'].includes(pathname)) return json(res, 404, { error: 'Not found' });
    const base = isVendor ? vendor : root;
    const relative = isVendor ? pathname.slice('/vendor/'.length) : pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = resolve(base, relative);
    if (!file.startsWith(base + sep)) return json(res, 403, { error: 'Forbidden' });
    if (!(await stat(file)).isFile()) throw new Error('Not found');
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : await readFile(file));
  } catch (e) { json(res, e instanceof SyntaxError ? 400 : 404, { error: e instanceof SyntaxError ? 'Invalid JSON' : 'Not found' }); }
});
server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(`AgentDock for Hermes · ${url}\nLocal-only bridge. Demo is the default. Hermes is contacted only after Connect.`);
  if (process.argv.includes('--open')) {
    const [command, args] = process.platform === 'win32' ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    const opener = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    opener.on('error', () => console.log(`Open ${url} in your browser.`)); opener.unref();
  }
});
server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Port ${port} is in use. Open the existing room or choose PORT.` : e.message); process.exitCode = 1; });
