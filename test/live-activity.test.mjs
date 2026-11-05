import test from 'node:test';
import assert from 'node:assert/strict';
import {agentTaskActivity} from '../public/live-activity.js';
test('live activity keeps concurrent tasks for the same worker and exposes dependency waits',()=>{
 const missions=[{agentId:'chief',status:'running',message:'Coordinate batch',workers:{a:{id:'writer',status:'running',message:'First script',progressNote:'Writing narration'}}},{agentId:'chief',status:'running',message:'Second batch',workers:{b:{id:'writer',status:'queued',message:'Second script'},c:{id:'scene',status:'waiting',message:'Scenes after script'}}}];
 const writer=agentTaskActivity({id:'writer'},missions);assert.equal(writer.status,'Working');assert.equal(writer.historical,false);assert.deepEqual(writer.tasks.map(t=>t.text),['First script','Second script']);assert.equal(writer.tasks[0].note,'Writing narration');
 assert.equal(agentTaskActivity({id:'scene'},missions).tasks[0].status,'Waiting for prerequisite');assert.equal(agentTaskActivity({id:'chief'},missions).tasks.length,2);
});
test('completed history is labeled as history and an unobserved profile is never called idle',()=>{
 const result=agentTaskActivity({id:'writer'},[{agentId:'chief',workers:{old:{id:'writer',status:'completed',message:'Older',completedAt:100},recent:{id:'writer',status:'completed',message:'Latest',completedAt:200}}}]);
 assert.equal(result.historical,true);assert.equal(result.status,'Completed');assert.equal(result.tasks[0].text,'Latest');
 const unknown=agentTaskActivity({id:'new',status:'unknown'});assert.equal(unknown.status,'Unobserved');assert.deepEqual(unknown.tasks,[]);
});

test('clearing completed activity preserves running work and saved records; new completions still appear',async()=>{
 const {completedActivityKeys}=await import('../public/live-activity.js');
 const agents=[{id:'chief',taskStatus:'completed',task:'Old chief task'},{id:'writer',taskStatus:'completed',task:'Old script'}];
 const missions=[{id:'old',agentId:'chief',status:'completed',message:'Old chief task',completedAt:10,workers:{writer:{id:'writer',status:'completed',message:'Old script',completedAt:10}}}];
 const before=JSON.stringify(missions),cleared=completedActivityKeys(agents,missions);
 assert.equal(agentTaskActivity(agents[1],missions,false,cleared).status,'Standing by');assert.deepEqual(agentTaskActivity(agents[1],missions,false,cleared).tasks,[]);assert.equal(JSON.stringify(missions),before);
 const running={id:'new',agentId:'chief',status:'running',message:'New mission',workers:{writer:{id:'writer',status:'running',message:'New script'}}};
 assert.equal(agentTaskActivity(agents[1],[...missions,running],false,cleared).tasks[0].text,'New script');
 running.workers.writer.status='completed';running.workers.writer.completedAt=30;
 assert.equal(agentTaskActivity(agents[1],[...missions,running],false,cleared).tasks[0].text,'New script');
 assert.equal(agentTaskActivity(agents[1],missions,false,[]).status,'Completed');
});

test('clearing the newest completed result does not resurface an obsolete failure',async()=>{
 const {completedActivityKeys}=await import('../public/live-activity.js');
 const agent={id:'writer'},missions=[{id:'old',workers:{writer:{id:'writer',status:'failed',message:'Rejected old attempt',completedAt:10}}},{id:'new',workers:{writer:{id:'writer',status:'completed',message:'Successful retry',completedAt:20}}}];
 const cleared=completedActivityKeys([agent],missions),result=agentTaskActivity(agent,missions,false,cleared);
 assert.equal(result.status,'Standing by');assert.deepEqual(result.tasks,[]);
 missions.push({id:'latest',workers:{writer:{id:'writer',status:'failed',message:'New failure',completedAt:30}}});
 assert.equal(agentTaskActivity(agent,missions,false,cleared).status,'Failed');
});
