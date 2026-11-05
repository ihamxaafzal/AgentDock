import {visibleTasks,taskTitle,taskOutcome,finishedTask} from './task-cards.js';
import { formatResponse } from './response-format.js';
import {agentTaskActivity,completedActivityKeys} from './live-activity.js';
import {hardwareDisplay} from './hardware-display.js';
import {normalizeBreakSettings} from './team-breaks.js';
const $ = id => document.getElementById(id);
const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const save = (key, data) => { try { localStorage.setItem(key, JSON.stringify(data)); } catch { toast('Browser storage unavailable; changes last for this visit.'); } };
const statusNames = { working: 'Working', idle: 'Standing by', attention: 'Needs you', unknown: 'Unobserved' };
function agentStatus(a) { return mode==='live'&&a.taskStatus?({completed:'Task complete',running:'Working',queued:'Queued',waiting:'Waiting for prerequisite',blocked:'Blocked',failed:'Needs attention'}[a.taskStatus]||statusNames[a.status]||'Unobserved'):statusNames[a.status]||'Unobserved'; }
let mode = 'demo', modeVersion = 0, selected = 'atlas', token = null, bridgeAvailable = false, room, polling = false, liveTimer, selectedTab = 'task';
let identities = load('aether-identities', {}), settings = load('aether-settings', { quality: 'studio', intensity: .85, autoOrbit: false, paused: false, motion: matchMedia('(prefers-reduced-motion: reduce)').matches });
if (load('aether-render-version', 0) < 3) {
  settings.quality = 'studio'; settings.autoOrbit = false; settings.paused = false;
  save('aether-settings', settings); save('aether-render-version', 3);
}
if(load('aether-reference-version',0)<1){settings.autoOrbit=false;save('aether-settings',settings);save('aether-reference-version',1);}
if(!['fps20','fps30','eco'].includes(settings.quality)){settings.quality='fps20';save('aether-settings',settings);}
settings.breaks=normalizeBreakSettings(settings.breaks);
let attachedDocuments = [], taskSubmitting = false;
let archivedTasks=load('aether-archived-tasks',[]);
let liveMissions=[],selectedMission='',liveAssignments=[],liveBatches=[];
let hardwareSample=null,hardwarePolling=false;
const drafts = new Map();
const portraits=new Map();
function applyPortraits(){for(const card of $('roster').querySelectorAll('[data-agent]')){const url=portraits.get(card.dataset.agent);if(url){const icon=card.querySelector('.avatar-icon');if(!icon.querySelector('img')){const image=document.createElement('img');image.src=url;image.alt='';icon.append(image);icon.classList.add('has-portrait');}}}}
let responseSize = Math.max(14, Math.min(22, load('aether-response-size', 16)));
document.documentElement.style.setProperty('--response-size', responseSize + 'px');
let events = [], liveAgents = [], rosterKey = '', labelKey = '', activityVisible = false, taskRefreshTimer;
let labelElements = new Map(),rosterStates=new Map();
let clearedActivity=load('aether-cleared-activity',[]);
let liveActivityKey='';
let liveActivityElements=new Map();
let renderedEventsKey = '';
const now = Date.now();
const demoAgents = [
  { id: 'atlas', name: 'Chief', role: 'Team coordination', color: '#c49aff', status: 'working', task: 'Bringing six perspectives together into one clear plan.', progress: 68, tokens: 12840, sessions: 4 },
  { id: 'ember', name: 'Analyst', role: 'Research & insights', color: '#a878ec', status: 'working', task: 'Building the next chapter. Reviewing components and refining the interface.', progress: 42, tokens: 9320, sessions: 3 },
  { id: 'nova', name: 'Strategist', role: 'Planning & strategy', color: '#bda3ff', status: 'idle', task: 'Research brief complete. Standing by for the next question.', progress: 100, tokens: 18200, sessions: 7 },
  { id: 'sage', name: 'Copywriter', role: 'Scripts & writing', color: '#ad75e6', status: 'working', task: 'Connecting notes, finding patterns, and organizing the knowledge library.', progress: 81, tokens: 6450, sessions: 2 },
  { id: 'lyra', name: 'Art Director', role: 'Visual direction', color: '#d28cf3', status: 'attention', task: 'Two visual directions are ready. Waiting for your creative feedback.', progress: 93, tokens: 11100, sessions: 5 },
  { id: 'sol', name: 'Publisher', role: 'Publishing & review', color: '#9576df', status: 'idle', task: 'Review queue is clear. Ready to check the next deliverable.', progress: 100, tokens: 4830, sessions: 2 }
].map(a => ({ ...a, model: 'Demo · simulated', lastSeen: now, statusSource: 'Simulated for demonstration', answer: '' }));
const neonColors = ['#e589eb', '#43c9f5', '#ff8884', '#a8db5d', '#f5c963', '#b17aff', '#66d8d4'];
// Upgrade old monochrome identities once; keep names and roles intact.
if(load('aether-color-version',0)<1){for(const identity of Object.values(identities))delete identity.color;save('aether-identities',identities);save('aether-color-version',1);}
function agents(){return (mode==='live'?liveAgents:demoAgents).map((a,index)=>{const value={...a,color:neonColors[index%neonColors.length],...identities[a.id]};return {...value,displayName:identities[a.id]?.name||value.name};});}
function roomActivity(id,activity){const profile=agents().find(a=>a.id===id);if(activity==='Typing')return profile?.nativeCoordinator?'Coordinating':'Working';return profile?.nativeCoordinator&&activity==='At desk'?'At command':activity==='At desk'?'Standing by':activity;}
if(load('aether-command-layout-version',0)<1){save('aether-live-activity-collapsed',true);save('aether-command-layout-version',1);}
function current() {
 const agent=agents().find(a=>a.id===selected);
 const mission=liveMissions.find(m=>m.id===selectedMission);
 if(mode!=='live'||!agent||!mission)return agent;
 const task=mission.agentId===agent.id?mission:Object.values(mission.workers||{}).filter(w=>w.id===agent.id).at(-1);
 return task?{...agent,...taskView(task)}:agent;
}
function taskView(task){return {taskStatus:task.status,task:task.message,status:task.status==='running'?'working':['failed','blocked'].includes(task.status)?'attention':'unknown',answer:task.answer||'',error:task.error||'',tokens:task.tokens??null,lastSeen:task.completedAt??task.startedAt,startedAt:task.startedAt,parentRunId:task.parentRunId,progressNote:task.progressNote||'',artifacts:task.artifacts||[],sessionId:task.sessionId};}
function consumeMissions(data,notify=false){
 const old=new Map(liveMissions.map(m=>[m.id,m.status]));liveMissions=data.missions||[];liveBatches=data.batches||[];
 const limit=$('mission-concurrency');if(limit&&document.activeElement!==limit&&data.concurrency)limit.value=data.concurrency;
 liveAssignments=liveMissions.flatMap(m=>Object.values(m.workers||{}).map(w=>({...w,reportsTo:w.delegatedFrom,taskStatus:w.status,task:w.message})));
 if(notify)for(const m of liveMissions)if(['completed','failed'].includes(m.status)&&old.has(m.id)&&old.get(m.id)!==m.status){addEvent(liveAgents.find(a=>a.id===m.agentId),m.status==='completed'?'completed a mission. Open Tasks & results.':'has a mission that needs attention.','live');toast(m.status==='completed'?'A mission is ready. Open Tasks & results.':'A mission needs attention. Other missions continue.');}
}
function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').classList.remove('visible'), 5000); }
function compactNumber(value) { return value == null ? '—' : Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value); }
function addEvent(agent, text, source = mode) {
  events.unshift({ id: crypto.randomUUID(), time: Date.now(), agentId: agent?.id, name: agent?.name || 'AgentDock', color: agent?.color || '#8bd6e3', text, source });
  events = events.slice(0, 100); renderEvents();
}
function eventMarkup(e) {
  return `<div class="event" style="--event-color:${safe(e.color)}"><time>${new Date(e.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</time><i></i><div><p><strong>${safe(e.name)}</strong> ${safe(e.text)}</p><small>${e.source === 'demo' ? 'SIMULATED ACTIVITY' : 'LOCAL BRIDGE EVENT'}</small></div></div>`;
}
function renderEvents() {
  const key = `${selected}:${events.length}:${events[0]?.id || ''}`;
  if (key === renderedEventsKey) return;
  renderedEventsKey = key;
  $('event-count').textContent = events.length;
  $('activity-list').innerHTML = events.length ? events.map(eventMarkup).join('') : '<p class="source-note">No events in this visit yet.</p>';
  const local = events.filter(e => e.agentId === selected);
  $('agent-log').innerHTML = local.length ? local.map(eventMarkup).join('') : '<p class="source-note">No recorded events for this agent in this visit.</p>';
}
function render() {
  const list = agents(); if (!list.find(a => a.id === selected)) selected = list[0]?.id || null;
  $('agent-count').textContent = String(list.length).padStart(2, '0');
  $('hierarchy-note').hidden = mode !== 'live' || !list.some(a => a.reportsTo);
  const coordinator=list.find(a=>a.nativeCoordinator)||list.find(a=>!a.reportsTo);
  $('hierarchy-note').textContent = (coordinator?.name||'Coordinator')+'\n' + list.filter(a => a.reportsTo).map((a,i,children) => (i === children.length - 1 ? '└─ ' : '├─ ') + a.name).join('\n');
  $('team-subtitle').textContent = mode === 'demo' ? 'Six roles. One shared mission.' : `${list.length} real agent${list.length === 1 ? '' : 's'}, one shared workspace.`;
  $('working-count').textContent = list.filter(a => a.status === 'working').length;
  $('idle-count').textContent = list.filter(a => a.status === 'idle').length;
  $('attention-count').textContent = list.filter(a => a.status === 'attention').length;
  const key = list.map(a => [a.id, a.name, a.role, a.color, a.status, a.taskStatus, selected === a.id].join(':')).join('|');
  if (key !== rosterKey) {
    rosterKey = key;
    $('roster').innerHTML = list.length ? list.map(a => `<button class="agent-card ${selected === a.id ? 'selected' : ''}" style="--card-color:${safe(a.color)}" data-agent="${safe(a.id)}" ${a.reportsTo ? `data-parent="${safe(a.reportsTo)}"` : ''} aria-label="Inspect ${safe(a.name)}, ${agentStatus(a)}"><span class="avatar-icon"><svg viewBox="0 0 30 34" aria-hidden="true"><rect x="8" y="19" width="14" height="12" rx="5"/><rect x="2" y="4" width="26" height="18" rx="9" fill="#e8d7ff" stroke="none"/><rect x="5" y="7" width="20" height="12" rx="6" fill="#1c0c2d" stroke="none"/><circle cx="11" cy="13" r="2"/><circle cx="19" cy="13" r="2"/><path d="M15 3V0m-10 23v6m20-6v6" stroke="#c49aff"/></svg></span><span class="card-info"><strong>${safe(a.displayName)}</strong><small class="roster-live-state">${safe(agentStatus(a))}</small></span><i class="card-state ${a.status}"></i></button>`).join('') : '<p class="source-note">No agents were reported by Hermes Agent.</p>';
    applyPortraits();
    $('roster').querySelectorAll('[data-agent]').forEach(b => b.addEventListener('click', () => select(b.dataset.agent)));rosterStates=new Map([...$('roster').children].filter(el=>el.dataset.agent).map(el=>[el.dataset.agent,el.querySelector('.roster-live-state')]));
  }
  const lk = list.map(a => [a.id, a.name, a.color, a.status, a.taskStatus, selected === a.id].join(':')).join('|');
  if (lk !== labelKey) {
    labelKey = lk;
    $('labels').innerHTML=list.map(a=>`<button class="agent-label ${selected===a.id?'selected':''}" style="--label-color:${safe(a.color)}" data-label="${safe(a.id)}"><span class="agent-name-line"><i class="agent-identity-dot"></i><strong>${safe(a.displayName)}</strong></span><em class="activity-tag">${safe(agentStatus(a))}</em></button>`).join('');
    $('labels').querySelectorAll('[data-label]').forEach(b => b.addEventListener('click', () => select(b.dataset.label)));
    labelElements = new Map([...$('labels').children].map(el => [el.dataset.label, el]));
  }
  renderLiveActivity(list); room?.setAgents(list,mode==='live'?liveAssignments:list); room?.select(selected); renderDetail(); renderDashboard();
}
function renderLiveActivity(list){
 $('live-activity-mode').textContent=mode==='live'?'LIVE':'DEMO';
 const entries=list.map(a=>({agent:a,...agentTaskActivity(a,liveMissions,mode==='demo',clearedActivity)}));
 const pending=mode==='live'?completedActivityKeys(list,liveMissions).filter(k=>!clearedActivity.includes(k)):[];
 $('clear-completed-activity').disabled=!pending.length;$('restore-completed-activity').hidden=!clearedActivity.length;
 const key=JSON.stringify(entries);if(key===liveActivityKey)return;liveActivityKey=key;
 $('live-agent-activity').innerHTML=entries.map(e=>`<button type="button" class="live-agent-row" style="--row-color:${safe(e.agent.color)}" data-live-agent="${safe(e.agent.id)}"><span class="live-agent-heading"><strong>${safe(e.agent.name)}</strong><small class="${e.status==='Working'?'running':''}">${safe(e.status)}</small></span><span class="live-agent-motion">In the room</span>${e.tasks.length?`<span class="live-task-label">${e.historical?'LAST TASK':e.tasks.length>1?e.tasks.length+' CURRENT TASKS':'CURRENT TASK'}</span>`+e.tasks.map(t=>`<span class="live-task"><span>${safe(t.text)}</span>${!e.historical?`<small>${safe(t.status)}</small>`:''}${t.note?`<em>${safe(t.note)}</em>`:''}</span>`).join(''):'<span class="live-task live-task-empty">'+(e.cleared?'Ready for the next task.':'No task reported by Hermes.')+'</span>'}</button>`).join('');
 liveActivityElements=new Map([...$('live-agent-activity').children].map(el=>[el.dataset.liveAgent,el.querySelector('.live-agent-motion')]));
 $('live-agent-activity').querySelectorAll('[data-live-agent]').forEach(b=>b.onclick=()=>select(b.dataset.liveAgent));
}
$('clear-completed-activity').onclick=()=>{clearedActivity=[...new Set([...clearedActivity,...completedActivityKeys(agents(),liveMissions)])];save('aether-cleared-activity',clearedActivity);liveActivityKey='';renderLiveActivity(agents());toast('Completed entries cleared from Live Activity. Saved results are retained.');};
$('restore-completed-activity').onclick=()=>{clearedActivity=[];save('aether-cleared-activity',clearedActivity);liveActivityKey='';renderLiveActivity(agents());};
function setLiveActivityCollapsed(collapsed){
 $('live-activity-content').hidden=collapsed;$('live-activity').classList.toggle('collapsed',collapsed);
 $('live-activity-toggle').setAttribute('aria-expanded',String(!collapsed));
 $('live-activity-toggle').setAttribute('aria-label',collapsed?'Show live activity':'Hide live activity');
 $('live-activity-toggle').querySelector('b').textContent=collapsed?'+':'−';
}
setLiveActivityCollapsed(load('aether-live-activity-collapsed',false));
$('live-activity-toggle').onclick=()=>{const collapsed=!$('live-activity-content').hidden;setLiveActivityCollapsed(collapsed);save('aether-live-activity-collapsed',collapsed);};
function renderDetail() {
  const a = current(); $('task-form').hidden = !a; if (!a) return;
  const picker=$('mission-picker');picker.hidden=mode!=='live';
  const options='<option value="">Latest activity</option>'+liveMissions.slice().reverse().map((m,i)=>'<option value="'+safe(m.id)+'">'+safe((m.taskNumber?'Task '+m.taskNumber+' · ':'')+m.status.toUpperCase()+' · '+m.message.slice(0,70))+'</option>').join('');
  if(picker.dataset.options!==options){picker.innerHTML=options;picker.dataset.options=options;}picker.value=selectedMission;
  document.documentElement.style.setProperty('--agent', a.color);
  $('detail-role').textContent = a.role.toUpperCase(); $('detail-name').textContent = a.name;
  $('portrait-code').textContent = `${mode === 'demo' ? 'DEMO' : 'LIVE'} — ${a.id.slice(0, 18).toUpperCase()}`;
  $('detail-status').textContent = mode === 'live' && a.taskStatus === 'waiting' ? 'Waiting for prerequisite' : mode === 'live' && a.taskStatus === 'blocked' ? 'Blocked by prerequisite' : mode === 'live' && a.taskStatus === 'queued' ? 'Queued' : mode === 'live' && a.taskStatus === 'completed' ? 'Task complete' : statusNames[a.status]; $('detail-status').className = `status-pill ${a.status}`;
  $('detail-model').textContent = a.model;
  $('detail-task').textContent = a.task;
  $('progress-wrap').hidden = mode !== 'demo'; $('progress-text').textContent = `${Math.round(a.progress || 0)}%`; $('progress-bar').style.width = `${a.progress || 0}%`;
  $('detail-tokens').textContent = compactNumber(a.tokens); $('detail-sessions').textContent = compactNumber(a.sessions);
  $('status-source').textContent = `${a.statusSource}.${mode === 'live' && a.lastSeen ? ' Last recorded activity: ' + new Date(a.lastSeen).toLocaleString() + '.' : ''}${mode === 'live' && a.contextLimit ? ' Context limit: ' + compactNumber(a.contextLimit) + '. Reported tokens are usage metadata, not a context-fullness meter.' : ''}${mode === 'live' && a.status === 'unknown' ? ' Unobserved does not mean idle or offline.' : ''}`;
  const waiting = mode === 'live' && ['running','queued','waiting'].includes(a.taskStatus)
    ? `${a.progressNote || 'Hermes is working. Waiting for a response…'}${a.startedAt ? ' Elapsed: ' + Math.floor((Date.now() - a.startedAt) / 1000) + 's.' : ''}` : '';
  const response = [waiting, a.error, a.answer].filter(Boolean).join('\n\n');
  $('answer').hidden = !response; $('response-empty').hidden = !!response;
  if ($('answer').dataset.raw !== response) { $('answer').innerHTML = formatResponse(response); $('answer').dataset.raw = response; }
  $('copy-answer').disabled = !response;
  $('character-count').textContent = Intl.NumberFormat().format($('task-input').value.length) + ' characters · no limit';
  const isWorker = mode === 'live' && !!a.reportsTo;
  const allowed = !isWorker && (mode === 'demo' || $('enable-tasks').checked);
  $('direction-label').textContent = isWorker ? 'Assigned by coordinator' : a.nativeCoordinator ? 'Give your coordinator a direction' : 'Give this agent a direction';
  $('task-input').disabled = isWorker;
  $('task-input').placeholder = isWorker ? 'Your coordinator assigns work to this agent.' : 'Describe the task you want done.';
  $('attach-documents').disabled = mode !== 'live' || isWorker;
  renderAttachments();
  $('artifact-links').hidden = !a.artifacts?.length;
  $('artifact-links').innerHTML = (a.artifacts || []).map(file => `<button type="button" data-artifact="${safe(file.name)}">↓ ${safe(file.label)}</button>`).join('');
  $('artifact-links').querySelectorAll('[data-artifact]').forEach(button => button.onclick = () => downloadArtifact(button.dataset.artifact));
  $('send-task').disabled = taskSubmitting || !allowed;
  $('send-task').innerHTML = taskSubmitting ? 'Sending…' : 'Send direction <span>↗</span>';
  $('send-note').textContent = mode === 'demo' ? 'SIMULATED TASK' : isWorker ? 'REPORTS TO COORDINATOR' : allowed ? 'COORDINATOR CAN DELEGATE' : 'READ-ONLY MODE';
  renderEvents();
}
function select(id) {
  showDashboard(false);
  if (selected !== id) { drafts.set(selected, $('task-input').value); $('task-input').value = drafts.get(id) || ''; }
  selected = id; $('inspector').classList.remove('closed'); room?.setOccluded($('inspector').classList.contains('expanded')); render();
  if (innerWidth < 700) $('gesture-hint').hidden = true;
}
function modeUi() {
  $('connection-label').textContent = mode === 'demo' ? 'Demo universe' : 'Hermes Agent · local';
  $('connect-open').classList.toggle('live', mode === 'live');
  $('source-heading').textContent = mode === 'demo' ? 'Preview workforce' : 'Your connected workforce';
  $('source-caption').textContent = mode === 'demo' ? 'Demo agents · simulated activity' : 'Local API · verified profiles';
  $('bottom-status').textContent = mode === 'demo' ? 'DEMO SIGNAL ACTIVE' : 'HERMES BRIDGE CONNECTED';
  $('sync-status').textContent = mode === 'demo' ? 'Local visualization' : 'Refreshing local metadata';
}
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', 'X-Aether-Token': token || '', ...options.headers } });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || `Bridge returned ${response.status}`); return data;
}
async function initBridge() {
  try {
    const response = await fetch('/api/bootstrap'); if (!response.ok) throw new Error();
    const data = await response.json(); if (!data.bridge) throw new Error(); token = data.token; bridgeAvailable = true;void refreshHardware();
    $('bridge-status').textContent = 'Local bridge ready · Hermes connection available';
    if (load('aether-connection-mode', 'demo') === 'live') await connectLive();
  } catch {
    $('bridge-status').textContent = 'Static demo · run npm start for local connection';
    $('connect-live').disabled = true;
  }
}
async function refreshHardware(){
 if(!bridgeAvailable||document.hidden||hardwarePolling)return;hardwarePolling=true;
 try{hardwareSample=await api('/api/hardware');const view=hardwareDisplay(hardwareSample);$('hardware-state').textContent=view.sampledAt?'LIVE':'UNAVAILABLE';$('hardware-gpu').textContent=view.name;
  const compactMetrics=[{...view.metrics[1],label:'RAM',detail:'of '+view.metrics[0].value},...view.metrics.slice(2).map(m=>m.label==='VRAM IN USE'&&m.value.includes(' / ')?{...m,label:'VRAM',value:m.value.split(' / ')[0]+' GB',detail:'of '+m.value.split(' / ')[1]}:{...m,label:m.label==='VRAM IN USE'?'VRAM':m.label})];$('hardware-metrics').innerHTML=compactMetrics.map(m=>`<div><span>${safe(m.label)}</span><strong>${safe(m.value)}${m.detail?'<small>'+safe(m.detail)+'</small>':''}</strong></div>`).join('');room?.setHardware(hardwareSample);
 }catch{$('hardware-state').textContent='OFFLINE';}finally{hardwarePolling=false;}
}
setInterval(refreshHardware,5000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshHardware();});
$('hardware-toggle').onclick=()=>{const collapsed=$('hardware-hud').classList.toggle('collapsed');$('hardware-toggle').textContent=collapsed?'+':'−';$('hardware-toggle').setAttribute('aria-expanded',String(!collapsed));$('hardware-toggle').setAttribute('aria-label',collapsed?'Expand hardware monitor':'Collapse hardware monitor');};
async function refreshLive() {
  if (polling || mode !== 'live') return;
  polling = true;
  const generation = modeVersion;
  try {
    const data = await api('/api/status');
    if (mode !== 'live' || generation !== modeVersion) return;
    if (!data.connected) throw new Error(data.error || 'Hermes Agent unavailable');
    const previous = new Map(liveAgents.map(a => [a.id, a]));
    liveAgents = data.agents;
    for (const a of liveAgents) {
      if (a.taskStatus === 'completed' && previous.get(a.id)?.taskStatus !== 'completed') addEvent(a, 'completed an AgentDock task. Open the agent to read the result.', 'live');
      if (a.taskStatus === 'failed' && previous.get(a.id)?.taskStatus !== 'failed') addEvent(a, 'needs attention. Check the task result before retrying.', 'live');
    }
    $('sync-status').textContent = 'Synced ' + new Date(data.updatedAt).toLocaleTimeString([], { hour12: false });
    $('connection-label').textContent = 'Hermes · local'; $('connect-open').classList.add('live'); $('bottom-status').textContent = 'HERMES BRIDGE CONNECTED'; render();
    if(liveAgents.some(a=>a.taskStatus==='running')||liveMissions.some(m=>['running','queued','waiting'].includes(m.status)))startTaskPolling();
  } catch (e) {
    if (mode !== 'live' || generation !== modeVersion) return;
    $('bottom-status').textContent = 'BRIDGE DISCONNECTED · LAST DATA'; $('sync-status').textContent = 'Open connection settings for details';
    $('connect-error').textContent = e.message;
    $('connection-label').textContent = 'Connection lost'; $('connect-open').classList.remove('live');
    // A disconnected bridge cannot claim a task is still actively working.
    liveAgents = liveAgents.map(a => ({ ...a, status: 'unknown', statusSource: 'Connection lost; retained metadata' })); render();
  } finally { polling = false; }
}
async function connectLive() {
  if (!bridgeAvailable) return;
  $('connect-live').disabled = true; $('connect-live').textContent = 'Discovering agents…'; $('connect-error').textContent = '';
  const generation = modeVersion;
  try {
    const data = await api('/api/status'); if (generation !== modeVersion) return; if (!data.connected) throw new Error(data.error || 'Hermes Agent unavailable');
    save('aether-connection-mode', 'live'); mode = 'live'; modeVersion++; liveAgents = data.agents; selected = liveAgents[0]?.id; events = []; consumeMissions(await api('/api/tasks')); modeUi(); render();
    addEvent(null, `connected to ${liveAgents.length} real Hermes Agent agent${liveAgents.length === 1 ? '' : 's'}.`, 'live');
    $('connection-dialog').close(); clearInterval(liveTimer); liveTimer = setInterval(refreshLive, 20000);
    if(liveAgents.some(a=>a.taskStatus==='running'))startTaskPolling();
    toast('Connected locally. No demo agents are mixed into live mode.');
  } catch (e) { $('connect-error').textContent = e.message; }
  finally { $('connect-live').disabled = false; $('connect-live').textContent = 'Connect locally ↗'; }
}
function useDemo() { save('aether-connection-mode', 'demo'); mode = 'demo'; modeVersion++; selected = demoAgents[0].id; clearInterval(liveTimer); clearInterval(taskRefreshTimer); taskRefreshTimer=null; events = []; modeUi(); render(); addEvent(demoAgents[0], 'is coordinating the room. All activity here is simulated.'); $('connection-dialog').close(); }
function startTaskPolling() {
  if(taskRefreshTimer)return;
  const generation=modeVersion;let refreshing=false;
    taskRefreshTimer = setInterval(async () => {
      if (mode !== 'live' || refreshing) return;
      refreshing=true;
      try {
        const data = await api('/api/tasks'); let finished = true;
        if (mode !== 'live' || generation !== modeVersion) return;
        consumeMissions(data,true);
        finished=!liveMissions.some(m=>['running','queued','waiting'].includes(m.status));
        for (const [id, task] of Object.entries(data.tasks)) {
          const a = liveAgents.find(x => x.id === id); if (!a) continue;


          Object.assign(a,taskView(task));
          if (['running','queued','waiting'].includes(task.status)) finished = false;
        }
        render(); if (finished) { clearInterval(taskRefreshTimer); taskRefreshTimer=null; }
      } catch { /* full metadata polling surfaces bridge loss */ } finally { refreshing=false; }
    }, 1500);
}
async function sendLive() {
  if (taskSubmitting) return;
  const a = current(), message = composeDirection($('task-input').value); if (!a || !message.trim()) return;
  taskSubmitting = true; renderDetail();
  const generation = modeVersion;
  try {
    const accepted=await api('/api/tasks', { method: 'POST', body: JSON.stringify({ agentId: a.id, message, documents: attachedDocuments.map(file => file.path), approved: true }) });
    if (mode !== 'live' || generation !== modeVersion) return;
    selectedMission=accepted.sessionId;consumeMissions(await api('/api/tasks'));
    addEvent(a, 'received your direction.', 'live'); $('inspector').classList.add('closed'); room?.setOccluded(false); toast((accepted.missions?.length||1)+' mission(s) accepted. You can send more while your coordinator delegates.'); drafts.delete(a.id); $('task-input').value = ''; attachedDocuments = []; render();
    startTaskPolling();
  } catch (e) { toast(e.message); }
  finally { taskSubmitting = false; renderDetail(); }
}
function sendDemo(message) {
  const a = demoAgents.find(a => a.id === selected); if (!a) return;
  a.task = message; a.status = 'working'; a.progress = 3; a.answer = '';
  addEvent(current(), 'started your simulated direction.'); $('task-input').value = ''; render();
  const id = a.id;
  setTimeout(() => {
    a.progress = 100; a.status = 'idle'; a.answer = `Demo complete. Your direction was: “${message}”\n\nNo real work or external action was performed. Connect local Hermes Agent to run actual tasks.`;
    if (mode === 'demo') { addEvent(agents().find(x => x.id === id), 'finished the simulated task.'); render(); }
  }, 12000);
}
function applySettings() {
  document.body.dataset.quality = settings.quality;
  if (room) { room.setQuality(settings.quality); room.setBreakSettings(settings.breaks); room.hologramIntensity = settings.intensity; room.autoOrbit = settings.autoOrbit; room.reducedMotion = settings.motion; room.setPaused(!!settings.paused); }
  $('break-duration').value=settings.breaks.durationSeconds;$('break-interval').value=settings.breaks.intervalSeconds;$('break-group-size').value=settings.breaks.groupSize;
  $('quality').value = settings.quality; $('intensity').value = settings.intensity; $('auto-orbit').checked = settings.autoOrbit; $('motion').checked = settings.motion; $('pause-scene').checked = !!settings.paused;
}
$('roster').addEventListener('keydown', e => {
  if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) return;
  const list = agents(), index = list.findIndex(a => a.id === selected); e.preventDefault();
  select(list[(index + (e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 1) + list.length) % list.length].id);
  $('roster').querySelector('.selected')?.focus();
});
$('connect-open').onclick = () => $('connection-dialog').showModal();
$('connect-live').onclick = connectLive; $('use-demo').onclick = useDemo;
$('enable-tasks').checked = load('aether-enable-tasks', true);
$('enable-tasks').onchange = () => { save('aether-enable-tasks', $('enable-tasks').checked); renderDetail(); };
$('settings-open').onclick = () => $('settings-dialog').showModal();
$('inspector-close').onclick = () => $('inspector').classList.add('closed');
$('edit-agent').onclick = () => { const a = current(); if (!a) return; $('edit-name').value = a.name; $('edit-role').value = a.role; $('edit-color').value = a.color; $('identity-dialog').showModal(); };
$('identity-form').onsubmit = e => { e.preventDefault(); identities[selected] = { name: $('edit-name').value.trim() || current().name, role: $('edit-role').value.trim(), color: $('edit-color').value }; save('aether-identities', identities); render(); $('identity-dialog').close(); toast('Visual identity saved in this browser.'); };
$('reset-layout').onclick = () => { identities = {}; save('aether-identities', identities); render(); toast('Visual identities reset. Hermes Agent configuration was not changed.'); };
function saveBreakControls(){settings.breaks=normalizeBreakSettings({durationSeconds:$('break-duration').value,intervalSeconds:$('break-interval').value,groupSize:$('break-group-size').value});save('aether-settings',settings);room?.setBreakSettings(settings.breaks);}
for(const [id,key] of [['break-duration','durationSeconds'],['break-interval','intervalSeconds']]){$(id).addEventListener('input',saveBreakControls);$(id).addEventListener('change',()=>{saveBreakControls();$(id).value=settings.breaks[key];});}
$('break-group-size').addEventListener('change',saveBreakControls);
for (const [id, property] of [['quality', 'quality'], ['intensity', 'intensity'], ['auto-orbit', 'autoOrbit'], ['motion', 'motion'], ['pause-scene', 'paused']]) $(id).addEventListener('input', () => { settings[property] = id === 'intensity' ? Number($(id).value) : $(id).type === 'checkbox' ? $(id).checked : $(id).value; save('aether-settings', settings); applySettings(); });
$('task-form').onsubmit = e => { e.preventDefault(); const text = composeDirection($('task-input').value); if (!text.trim()) return toast('Enter a direction first.'); if (mode === 'demo') return sendDemo(text); if (!$('enable-tasks').checked) return toast('Enable task sending in connection settings first.'); sendLive(); };
document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { selectedTab = b.dataset.tab; document.querySelectorAll('[data-tab]').forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-selected', String(x === b)); }); $('task-panel').hidden = selectedTab !== 'task'; $('log-panel').hidden = selectedTab !== 'log'; });
function toggleActivity(show) { if (show) showDashboard(false); activityVisible = show; $('activity-panel').hidden = !show; $('activity-view').classList.toggle('active', show); $('office-view').classList.toggle('active', !show); }
$('activity-view').onclick = () => toggleActivity(!activityVisible); $('activity-close').onclick = () => toggleActivity(false); $('office-view').onclick = () => { toggleActivity(false); showDashboard(false); };
$('export-activity').onclick = () => { const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), mode, events }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'agentdock-activity.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
$('crew-toggle').onclick = () => { $('roster').hidden = !$('roster').hidden; $('crew-toggle').textContent = $('roster').hidden ? '+' : '−'; };
document.querySelectorAll('[data-camera]').forEach(b => b.onclick = () => { room?.cameraView(b.dataset.camera); document.querySelectorAll('[data-camera]').forEach(x => x.classList.toggle('active', x === b)); });
$('zoom-in').onclick = () => room?.zoom(-2); $('zoom-out').onclick = () => room?.zoom(2); $('camera-reset').onclick = () => { room?.cameraView('orbit'); document.querySelectorAll('[data-camera]').forEach(x => x.classList.toggle('active', x.dataset.camera === 'orbit')); };
function clock() { $('clock').textContent = new Date().toLocaleTimeString([], { hour12: false }); }
clock(); setInterval(clock, 1000);
setInterval(() => {
  if (mode !== 'demo') return;
  demoAgents.forEach(a => { if (a.status === 'working') { a.progress = Math.min(98, a.progress + .8); a.tokens += 16; } }); renderDetail();
}, 3000);
let demoEvent = 0;
const demoNarrative = [['ember', 'is refining a component.'], ['sage', 'found a useful connection in the knowledge library.'], ['atlas', 'is aligning the next steps.'], ['lyra', 'is waiting for a creative decision.']];
setInterval(() => { if (mode !== 'demo' || document.hidden) return; const [id, text] = demoNarrative[demoEvent++ % demoNarrative.length]; addEvent(agents().find(a => a.id === id), text); }, 18000);
if (innerWidth < 700) $('inspector').classList.add('closed');
modeUi(); render(); initBridge(); addEvent(demoAgents[0], 'welcomed the crew. This room is in demo mode.');
const failureTimer = setTimeout(() => { $('loading-text').textContent = 'The scene is taking longer than expected.'; $('loading-dismiss').hidden = false; }, 15000);
$('loading-dismiss').onclick = () => $('loading').classList.add('done');
try {
  const { Observatory } = await import('./reference-scene.js');
  room = new Observatory($('scene'), {
    onSelect: select,
    onPortrait:(id,url)=>{portraits.set(id,url);applyPortraits();},
    onHandoff: state => { $('handoff-status').hidden = !state; if(state) $('handoff-status').innerHTML = `<strong>${safe(state.chief)} → ${safe(state.worker)}</strong><small>${state.preview ? 'ANIMATION PREVIEW · NO TASK SENT' : 'LIVE ASSIGNMENT · VISUAL HANDOFF'} · ${safe(state.phase)}</small>`; },
    onReady: () => { clearTimeout(failureTimer); $('loading').classList.add('done'); $('loading').setAttribute('aria-hidden', 'true'); },
    onError: toast,
    onFrame: (labels, fps, metrics) => {
      const inspectorEdge=$('inspector').classList.contains('closed')?Infinity:$('inspector').getBoundingClientRect().left;
      for (const p of labels) { p.activity=roomActivity(p.id,p.activity);const row=rosterStates.get(p.id);if(row&&row.textContent!==p.activity){row.textContent=p.activity;row.closest('.agent-card').dataset.activity=p.activity.toLowerCase().replaceAll(' ','-');} const motion=liveActivityElements.get(p.id);if(motion&&motion.textContent!==p.activity)motion.textContent=p.activity; const el = labelElements.get(p.id); if (el) { el.style.transform = `translate3d(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px,0) translate(-50%,-100%)`; const underSidebar = innerWidth > 650 && p.x < (innerWidth > 900 ? 218 : 193); const underInspector = p.x > inspectorEdge; el.style.opacity = p.visible && !underSidebar && !underInspector ? '1' : '0'; el.style.pointerEvents = p.visible && !underSidebar && !underInspector ? 'auto' : 'none';const activity=el.querySelector('.activity-tag');if(activity&&activity.textContent!==p.activity){activity.textContent=p.activity;el.dataset.activity=p.activity.toLowerCase().replaceAll(' ','-');} } }
      if (settings.paused) $('fps').textContent = 'ANIMATION PAUSED';
      else if (fps) $('fps').textContent = `${fps} UPDATES/S`;
      if (metrics) $('render-metrics').textContent = `Pre-rendered room · no WebGL rendering · ${metrics.calls} draw calls · ${compactNumber(metrics.triangles)} triangles · ${metrics.geometries} geometries · ${metrics.textures} textures${metrics.heapMiB ? ' · ' + metrics.heapMiB + ' MB JS heap' : ''}. JS heap is not total Chrome RAM.`;
    }
  });
  applySettings(); render();if(hardwareSample)room.setHardware(hardwareSample);
} catch (e) { clearTimeout(failureTimer); $('loading-text').textContent = '3D unavailable: ' + e.message; $('loading-dismiss').hidden = false; console.error(e); }


function showDashboard(show) {
 $('dashboard-panel').hidden=!show;
 $('dashboard-view').classList.toggle('active',show);
 room?.setOccluded(show||$('inspector').classList.contains('expanded'));
 if(show){toggleActivity(false);$('office-view').classList.remove('active');renderDashboard();}
 else $('office-view').classList.toggle('active',!activityVisible);
}
function renderDashboard(){
 const list=agents(),live=mode==='live';
 const all=live?liveMissions:list.map(a=>({id:a.id,agentId:a.id,message:a.task,status:a.status==='working'?'running':a.status==='attention'?'failed':'completed',answer:a.answer,workers:{}}));
 const visible=visibleTasks(all,{archived:archivedTasks}),cards=visibleTasks(all,{archived:archivedTasks,filter:$('task-filter').value,search:$('task-search').value});
 $('dashboard-intro').textContent=live?'Your tasks at a glance. Open a card to read the full result.':'Demo tasks · simulated activity';
 $('clear-task-history').disabled=!live||!all.some(m=>finishedTask(m)&&!archivedTasks.includes(m.id));$('restore-task-history').hidden=!archivedTasks.length;
 const stats=[['Working',visible.filter(m=>m.status==='running').length],['Waiting',visible.filter(m=>['waiting','queued'].includes(m.status)).length],['Ready',visible.filter(m=>m.status==='completed').length],['Needs attention',visible.filter(m=>['failed','blocked'].includes(m.status)).length]];
 $('dashboard-stats').innerHTML=stats.map(([name,n])=>'<div class="stat-card"><strong>'+n+'</strong><span>'+name+'</span></div>').join('');
 $('task-count-caption').textContent=cards.length+' task'+(cards.length===1?'':'s')+' shown';
 const names={running:'Working',completed:'Completed',failed:'Needs attention',blocked:'Blocked',queued:'Queued',waiting:'Waiting',cancelled:'Canceled'};
 $('task-board').innerHTML=cards.length?cards.map(m=>{const workers=Object.values(m.workers||{}),owner=list.find(a=>a.id===(workers.at(-1)?.id||m.agentId)),color=owner?.color||'#b68cff';return `<article class="mission-card task-result-card" style="--task-color:${safe(color)}"><header><span class="task-status-badge ${safe(m.status)}">${safe(names[m.status]||m.status)}</span><time>${m.createdAt?new Date(m.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric'}):'Task '+(m.taskNumber||'')}</time></header><h3>${safe(taskTitle(m))}</h3><p class="task-owner"><i></i>${safe(owner?.name||'Coordinator')}${workers.length>1?' · '+workers.length+' assignments':''}</p><p class="task-outcome">${safe(taskOutcome(m))}</p><footer><button class="task-open" data-mission="${safe(m.id)}">${m.status==='completed'?'Read result ↗':'View task ↗'}</button>${m.artifacts?.length?`<button data-task-file="${safe(m.artifacts[0].name)}">Download TXT ↓</button>`:''}${m.status==='failed'?`<button data-retry="${safe(m.id)}">Retry</button>`:''}</footer></article>`;}).join(''):'<div class="task-empty"><span>✧</span><h3>No tasks in this view</h3><p>Start a new mission or change the filter.</p></div>';
 $('task-board').querySelectorAll('[data-mission]').forEach(b=>b.onclick=()=>{if(!live)return select(b.dataset.mission);selectedMission=b.dataset.mission;select(liveMissions.find(m=>m.id===selectedMission).agentId);});
 $('task-board').querySelectorAll('[data-task-file]').forEach(b=>b.onclick=()=>downloadArtifact(b.dataset.taskFile));
 $('task-board').querySelectorAll('[data-retry]').forEach(b=>b.onclick=async()=>{try{await api('/api/missions/'+b.dataset.retry+'/retry',{method:'POST',body:JSON.stringify({approved:true})});consumeMissions(await api('/api/tasks'));startTaskPolling();render();}catch(error){toast(error.message);}});
}
$('task-filter').onchange=renderDashboard;$('task-search').oninput=renderDashboard;
$('clear-task-history').onclick=()=>{archivedTasks=[...new Set([...archivedTasks,...liveMissions.filter(finishedTask).map(m=>m.id)])];save('aether-archived-tasks',archivedTasks);renderDashboard();toast('Finished task statuses cleared. Saved results are retained.');};
$('restore-task-history').onclick=()=>{archivedTasks=[];save('aether-archived-tasks',archivedTasks);renderDashboard();};
$('dashboard-view').onclick=()=>showDashboard(true);
$('dashboard-close').onclick=()=>showDashboard(false);


function composeDirection(text) {
 if (!attachedDocuments.length) return text;
 return (text || 'Extract only the image prompts from these documents, preserving exact source order, grouping and wording.')+'\n\nAttached local documents, in required document order:\n'+attachedDocuments.map(file=>file.path).join('\n');
}
function renderAttachments(){
 $('attached-documents').hidden=!attachedDocuments.length;
 $('attached-documents').innerHTML=attachedDocuments.map((file,index)=>'<div><span>'+safe(file.name)+'</span><button type="button" data-remove-document="'+index+'" aria-label="Remove '+safe(file.name)+'">×</button></div>').join('');
 $('attached-documents').querySelectorAll('[data-remove-document]').forEach(button=>button.onclick=()=>{attachedDocuments.splice(Number(button.dataset.removeDocument),1);renderAttachments();});
}
$('attach-documents').onclick=()=> $('document-files').click();
$('document-files').onchange=async()=>{
 const files=[...$('document-files').files];if(!files.length)return;
 const form=new FormData();for(const file of files)form.append('documents',file);
 $('attach-documents').disabled=true;
 try{const response=await fetch('/api/documents',{method:'POST',headers:{'X-Aether-Token':token},body:form});const data=await response.json();if(!response.ok)throw new Error(data.error||'Document upload failed.');attachedDocuments.push(...data.documents);renderAttachments();toast('Documents attached. Describe the task you need done.');}
 catch(error){toast(error.message);}finally{$('document-files').value='';renderDetail();}
};
async function downloadArtifact(name){
 try{const response=await fetch('/api/artifacts/'+encodeURIComponent(name),{headers:{'X-Aether-Token':token}});if(!response.ok)throw new Error('Could not download this extraction file.');const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){toast(error.message);}
}

$('mission-picker').onchange=e=>{selectedMission=e.target.value;renderDetail();};
$('new-mission').onclick = () => { selectedMission=''; const coordinator = agents().find(a => a.nativeCoordinator) || agents().find(a => !a.reportsTo); if (!coordinator) return; $('inspector').classList.remove('expanded'); $('workspace-expand').setAttribute('aria-label','Expand workspace'); $('workspace-expand').textContent='⤢'; select(coordinator.id); $('task-input').focus(); };
$('workspace-expand').onclick = () => { const expanded=$('inspector').classList.toggle('expanded'); $('workspace-expand').setAttribute('aria-label', expanded?'Restore workspace':'Expand workspace'); $('workspace-expand').textContent=expanded?'⤡':'⤢'; room?.setOccluded(expanded); };
$('inspector-close').onclick = () => { $('inspector').classList.add('closed'); room?.setOccluded(false); };
$('task-input').addEventListener('input', () => { drafts.set(selected,$('task-input').value); $('character-count').textContent=Intl.NumberFormat().format($('task-input').value.length)+' characters · no limit'; });
$('copy-answer').onclick = async () => { try { await navigator.clipboard.writeText($('answer').dataset.raw || ''); toast('Response copied.'); } catch { toast('Select the response text and copy it with Ctrl+C.'); } };
for(const [id,delta] of [['text-smaller',-1],['text-larger',1]]) $(id).onclick=()=>{ responseSize=Math.max(14,Math.min(22,responseSize+delta)); document.documentElement.style.setProperty('--response-size',responseSize+'px'); save('aether-response-size',responseSize); };
$('preview-handoff').onclick = () => { const list=agents(),coordinator=list.find(a=>a.nativeCoordinator)||list.find(a=>!a.reportsTo),workers=list.filter(a=>a.reportsTo===coordinator?.id || mode==='demo'&&a.id!==coordinator?.id); if(!coordinator||!workers.length)return toast('Connect a coordinator and at least one worker to preview a handoff.'); const worker=workers.find(a=>a.id===selected)||workers.at(-1); room?.previewHandoff(coordinator.id,worker.id); toast('Animation preview only. No task was sent.'); };

$('write-direction').onclick = () => { $('workspace-expand').click(); $('task-input').focus(); };



$('save-mission-concurrency').onclick=async()=>{try{const response=await api('/api/settings',{method:'POST',body:JSON.stringify({approved:true,concurrency:Number($('mission-concurrency').value)})});toast('Up to '+response.concurrency+' independent tasks can run together. Dependent tasks wait for their inputs.');startTaskPolling();}catch(error){toast(error.message);}};
