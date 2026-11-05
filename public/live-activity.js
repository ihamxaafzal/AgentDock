const active=new Set(['running','queued','waiting','blocked']);
export const taskStatusLabel=status=>({running:'Working',queued:'Queued',waiting:'Waiting for prerequisite',blocked:'Blocked',completed:'Completed',failed:'Failed'}[status]||'Unobserved');
const fallbackKey=a=>JSON.stringify(['profile',a.id,a.lastSeen||0,a.task||'']);
function activityRecords(agent,missions){return missions.flatMap(m=>[...(m.agentId===agent.id?[{...m,activityKey:JSON.stringify([m.id,'chief',m.completedAt||0,m.message||''])}]:[]),...Object.entries(m.workers||{}).filter(([,w])=>w.id===agent.id).map(([key,w])=>({...w,activityKey:JSON.stringify([m.id,key,w.completedAt||0,w.message||''])}))]);}
export function completedActivityKeys(agents,missions){return [...new Set(agents.flatMap(a=>[...activityRecords(a,missions).filter(r=>r.status==='completed').map(r=>r.activityKey),...(a.taskStatus==='completed'?[fallbackKey(a)]:[])]))];}
export function agentTaskActivity(agent,missions=[],demo=false,cleared=[]){
 if(demo)return {status:agent.status==='working'?'Working':agent.status==='attention'?'Needs you':'Standing by',tasks:agent.task?[{text:agent.task,status:agent.status==='working'?'Working':'Demo activity',note:''}]:[],historical:false};
 const hidden=new Set(cleared),all=activityRecords(agent,missions),records=all.filter(r=>r.status!=='completed'||!hidden.has(r.activityKey));
 const current=records.filter(r=>active.has(r.status));
 if(current.length)return {status:current.some(r=>r.status==='running')?'Working':taskStatusLabel(current[0].status),historical:false,tasks:current.map(r=>({text:r.message||'Assigned task',status:taskStatusLabel(r.status),note:r.progressNote||''}))};
 const latest=all.slice().sort((a,b)=>(b.completedAt||b.startedAt||b.createdAt||0)-(a.completedAt||a.startedAt||a.createdAt||0))[0];
 if(latest?.status==='completed'&&hidden.has(latest.activityKey))return {status:'Standing by',tasks:[],historical:false,cleared:true};
 if(latest)return {status:taskStatusLabel(latest.status),historical:true,tasks:[{text:latest.message||'Recorded task',status:taskStatusLabel(latest.status),note:latest.status==='failed'?(latest.error||''):''}]};
 if((all.length&&all.every(r=>r.status==='completed'&&hidden.has(r.activityKey)))||(agent.taskStatus==='completed'&&hidden.has(fallbackKey(agent))))return {status:'Standing by',tasks:[],historical:false,cleared:true};
 return {status:agent.taskStatus?taskStatusLabel(agent.taskStatus):agent.status==='working'?'Working':agent.status==='idle'?'Standing by':'Unobserved',historical:agent.taskStatus==='completed'||agent.taskStatus==='failed',tasks:agent.task?[{text:agent.task,status:agent.taskStatus?taskStatusLabel(agent.taskStatus):'Reported task',note:agent.progressNote||''}]:[]};
}
