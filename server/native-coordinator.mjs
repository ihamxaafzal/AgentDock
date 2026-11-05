import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import {validateWriterResponse} from './writer-routing.mjs';

function decoded(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
}
function records(value) {
  value = decoded(value);
  return (Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : []).filter(item => item && typeof item === 'object' && !Array.isArray(item));
}
export function nativeProcessEnded(record,probe=pid=>process.kill(pid,0)){
 if(record.launchFailed||record.exited)return true;
 if(!Number.isInteger(record.pid)||record.pid<=0)return false;
 try{probe(record.pid);return false;}catch(error){return error.code==='ESRCH';}
}
export function recoverableObserverFailure(task) {
  if(['native-chief','native-coordinator'].includes(task.execution)&&task.status==='failed'&&task.taskType==='narration'&&/^(?:Narration is too short:|The narration worker did not return)/.test(task.error||'')){
    const worker=Object.values(task.workers||{}).find(w=>task.requiredProfiles?.includes(w.id)&&w.status==='completed'&&w.parentRunId===task.nativeRunId);
    if(worker&&!validateWriterResponse(worker.answer,task.minimumNarrationWords).error)return true;
  }
  return ['native-chief','native-coordinator'].includes(task.execution) && task.status === 'failed' && typeof task.error === 'string' && (/\.map is not a function$/.test(task.error)||task.taskType==='medical-scenes'&&task.error==='The scene-authoring worker did not return the complete saved scene pack. Inspect its result.');
}

export class CoordinatorProtocol {
  constructor(endpoints, update = () => {}) { this.endpoints = endpoints; this.update = update; this.calls = new Map(); this.answer = ''; this.terminal = null; this.artifactNames = new Set(); }
  artifacts(text) { for (const name of String(text || '').matchAll(/(?:(?:image|video)-prompts|medical-scenes)-\d{8}-\d{6}-[a-f0-9]{10}\.txt/g)) this.artifactNames.add(name[0]); }
  handle(event) {
    if (event.type === 'text') { this.answer += event.text || ''; this.update({ answer: this.answer, progressNote: 'The coordinator is preparing your response...' }); }
    if (event.type === 'tool_use' && event.name === 'delegate_task') {
      const input = decoded(event.input);
      const allowed=new Set(['profile','goal','context','toolsets','role','output_schema','images','group','index','acp_command','acp_args','provider','model','base_url','api_key','api_mode']);
      const targets = records(input?.tasks).map((task,index) => ({ task, index, endpoint: Object.keys(task).every(key=>allowed.has(key))&&!task.tasks&&(!task.toolsets||Array.isArray(task.toolsets))?this.endpoints.find(endpoint => endpoint.profile === task.profile):undefined }));
      this.calls.set(event.tool_call_id || '', targets);
      for (const { task, endpoint,index } of targets) if (endpoint) this.update({ progressNote: `Assigned work to ${endpoint.name}.`, worker: { id: endpoint.id, assignmentId:`${event.tool_call_id}:${index}`, assignmentDispatched:true, status: 'running', message: task.goal || 'Delegated task', progressNote: 'Working on a delegated assignment.' } });
    }
    if (event.type === 'tool_result' && event.name === 'delegate_task') {
      this.artifacts(typeof event.output === 'string' ? event.output : JSON.stringify(event.output));
      const payload = decoded(event.output);
      if(payload?.error){
        for(const target of this.calls.get(event.tool_call_id||'')||[])if(target.endpoint)this.update({worker:{id:target.endpoint.id,assignmentId:`${event.tool_call_id}:${target.index}`,status:'failed',assignmentDispatched:false,error:String(payload.error),message:target.task.goal||'Delegation rejected'}});
      }
      // Hermes bounds the JSON progress preview. A long single-worker brief can
      // be cut inside its summary after the authoritative status fields.
      if (!payload && typeof event.output === 'string') {
        const status = /^\s*\{\s*"results"\s*:\s*\[\s*\{\s*"task_index"\s*:\s*0\s*,\s*"status"\s*:\s*"(completed|failed|cancelled)"\s*,\s*"summary"\s*:/.exec(event.output);
        const targets = this.calls.get(event.tool_call_id || '') || [];
        if (status && targets.length === 1 && targets[0].endpoint) this.update({ worker: {
          id: targets[0].endpoint.id, assignmentId:`${event.tool_call_id}:0`, status: status[1] === 'completed' ? 'completed' : 'failed',
          message: targets[0].task.goal || 'Delegated task',
          answer: 'The worker returned a long brief. Open the coordinator for the full response.',
          error: status[1] === 'completed' ? '' : 'The specialist did not complete the research.',
          progressNote: 'Returned result to the coordinator.'
        } });
      }
      for (const result of records(payload?.results)) {
        if (typeof result.live_transcript === 'string' && process.env.HERMES_HOME) {
          const allowed = resolve(process.env.HERMES_HOME, 'profiles', this.profileName, 'cache', 'delegation', 'live') + sep;
          const transcript = resolve(result.live_transcript);
          if (transcript.startsWith(allowed) && existsSync(transcript)) {
            try { this.artifacts(readFileSync(transcript, 'utf8')); } catch { /* Optional progress transcript; the final result remains authoritative. */ }
          }
        }
        const target = this.calls.get(event.tool_call_id || '')?.[result.task_index || 0];
        if (!target?.endpoint) continue;
        const completed = result.status === 'completed' && !result.error;
        this.update({ progressNote: 'The coordinator is reviewing the worker result.', worker: { id: target.endpoint.id, assignmentId:`${event.tool_call_id}:${target.index}`, status: completed ? 'completed' : 'failed', message: target.task.goal || 'Delegated task', answer: result.summary || '', error: result.error || (completed ? '' : 'The worker did not report successful completion.'), progressNote: 'Returned result to the coordinator.' } });
      }
    }
    if (event.type === 'result') {
      this.terminal = { status: event.exit_code === 0 ? 'completed' : 'failed', answer: event.text || this.answer, sessionId: event.session_id || undefined, tokens: event.tokens?.total ?? null, artifactNames: [...this.artifactNames], ...(event.exit_code !== 0 ? { error: event.error || 'The coordinator stopped before completing the task. Inspect the saved session before retrying.' } : {}) };
    }
  }
}

export async function runNativeCoordinator({ endpoint, endpoints, message, runId, dataDir, onProgress = () => {}, resume = false, extraToolsets=[] }) {
  if (!/^aether-[a-zA-Z0-9-]+$/.test(runId)) throw new Error('Invalid coordinator task identity.');
  const dir = resolve(dataDir, 'runs'); mkdirSync(dir, { recursive: true });
  const log = resolve(dir, `${runId}.jsonl`), meta = resolve(dir, `${runId}.meta.json`);
  const parser = new CoordinatorProtocol(endpoints, onProgress);
  parser.profileName=endpoint.profile||endpoint.id;
  if (!resume) {
    const python = process.env.HERMES_NATIVE_PYTHON, cwd = process.env.HERMES_SOURCE_DIR, home = process.env.HERMES_HOME;
    if (!python || !existsSync(python) || !cwd || !existsSync(cwd) || !home) throw new Error('Configure HERMES_NATIVE_PYTHON, HERMES_SOURCE_DIR and HERMES_HOME to run native coordination.');
    writeFileSync(log, '');
    const out = openSync(log, 'a'), err = openSync(resolve(dir, `${runId}.stderr.log`), 'a');
    const toolsets=[...new Set(['delegation','aether_documents','aether_video_documents','aether_scenes','web',...extraToolsets])].join(',');
    const args = ['-m', 'hermes_cli.main', '-p', endpoint.profile||endpoint.id, 'chat', '--oneshot', '--format', 'stream-json', '--toolsets', toolsets, '--continue', runId, '--create-if-missing', '--query-file', '-'];
    let child;
    try {
      child = spawn(python, args, { cwd, env: { ...process.env, HERMES_HOME: home, PYTHONUTF8: '1', NO_COLOR: '1' }, stdio: ['pipe', out, err], detached: true, windowsHide: true });
    } finally { closeSync(out); closeSync(err); }
    const record = { runId, profile: endpoint.profile||endpoint.id, pid: child.pid, startedAt: Date.now() };
    writeFileSync(meta, JSON.stringify(record));
    child.on('error', () => writeFileSync(meta, JSON.stringify({ ...record, launchFailed: true })));
    child.on('exit', code => writeFileSync(meta, JSON.stringify({ ...record, exited: true, code })));
    child.stdin.on('error', () => {}); child.stdin.end(message); child.unref();
    onProgress({ execution: 'native-coordinator', nativeRunId: runId, progressNote: 'The coordinator is reading your request...' });
  } else if (!existsSync(log)) throw new Error('The coordinator task log is missing. Inspect Hermes before resending the task.');
  let offset = 0, pending = '', decoder = new TextDecoder(), exitObserved = false;
  const deadline = Date.now() + (extraToolsets.includes('aether_flow')?4*60:30) * 60 * 1000;
  while (Date.now() < deadline) {
    const bytes = readFileSync(log); pending += decoder.decode(bytes.subarray(offset), { stream: true }); offset = bytes.length;
    let newline;
    while ((newline = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, newline).trim(); pending = pending.slice(newline + 1);
      if (line.startsWith('{')) { try { parser.handle(JSON.parse(line)); } catch (error) { if (!(error instanceof SyntaxError)) throw error; } }
    }
    if (parser.terminal) {
      // Stream previews are capped at 5K characters. Recover the exact call
      // results for this session so every parallel child retains its own state.
      if(parser.calls.size&&process.env.HERMES_NATIVE_PYTHON&&process.env.HERMES_HOME){
        try{
          const database=resolve(process.env.HERMES_HOME,'profiles',endpoint.profile||endpoint.id,'state.db');
          const output=await new Promise((done,reject)=>execFile(process.env.HERMES_NATIVE_PYTHON,[fileURLToPath(new URL('./read-delegation-results.py',import.meta.url)),database,parser.terminal.sessionId,JSON.stringify([...parser.calls.keys()])],{windowsHide:true,encoding:'utf8',maxBuffer:32*1024*1024},(error,stdout)=>error?reject(error):done(stdout)));
          for(const result of JSON.parse(output))parser.handle({type:'tool_result',name:'delegate_task',...result});
          parser.terminal.artifactNames=[...parser.artifactNames];
        }catch{/* The observed terminal result remains authoritative; incomplete children fail validation. */}
      }
      return parser.terminal;
    }
    const record = existsSync(meta) ? JSON.parse(readFileSync(meta, 'utf8')) : {};
    const ended=nativeProcessEnded(record);
    if (record.launchFailed || (ended && exitObserved)) throw new Error('Coordinator process ended without a final response. Inspect its saved session before retrying.');
    exitObserved = ended;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('The coordinator is taking longer than expected. Its run may still be active; inspect Hermes before sending the same task again.');
}
