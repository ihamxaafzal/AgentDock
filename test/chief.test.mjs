import test from 'node:test';
import assert from 'node:assert/strict';
import {CoordinatorProtocol,recoverableObserverFailure} from '../server/native-coordinator.mjs';
import {readEndpoints} from '../server/adapter.mjs';

test('parallel worker assignments keep independent call identities and failures',()=>{
 const updates=[],p=new CoordinatorProtocol([{id:'writing',name:'Writing Worker',profile:'worker-writing'},{id:'research',name:'Research Worker',profile:'worker-research'}],u=>updates.push(u));
 p.handle({type:'tool_use',name:'delegate_task',tool_call_id:'batch',input:{tasks:[{profile:'worker-writing'},{profile:'worker-research'},{profile:'worker-writing'}]}});
 assert.equal(new Set(updates.map(u=>u.worker.assignmentId)).size,3);
 p.handle({type:'tool_result',name:'delegate_task',tool_call_id:'batch',output:{results:[{task_index:0,status:'completed',summary:'First script'},{task_index:1,status:'failed',error:'Research unavailable'},{task_index:2,status:'completed',summary:'Second script'}]}});
 assert.equal(updates.at(-3).worker.answer,'First script');assert.equal(updates.at(-2).worker.status,'failed');assert.equal(updates.at(-1).worker.answer,'Second script');
 assert.equal(updates.at(-1).worker.assignmentId,'batch:2');
});

test('real profile URLs and hierarchy metadata are preserved',()=>{
 const result=readEndpoints({HERMES_AGENTS:JSON.stringify([{id:'coordinator',name:'My Coordinator',profile:'my-coordinator',url:'http://127.0.0.1:8642/p/my-coordinator',key:'test',nativeCoordinator:true},{id:'worker-images',profile:'my-image-worker',url:'http://localhost:8642/p/my-image-worker/v1/',key:'other',reportsTo:'coordinator',capabilities:['image-extraction'] }])});
 assert.equal(result[0].url,'http://127.0.0.1:8642/p/my-coordinator/v1');assert.equal(result[0].nativeCoordinator,true);assert.equal(result[1].reportsTo,'coordinator');assert.deepEqual(result[1].capabilities,['image-extraction']);
});
test('The coordinator tracks native delegation and waits for a terminal result',()=>{
 const updates=[],protocol=new CoordinatorProtocol([{id:'worker-images',name:'Image Worker',profile:'worker-images'}],update=>updates.push(update));
 protocol.handle({type:'tool_use',name:'delegate_task',tool_call_id:'call1',input:{tasks:[{profile:'worker-images',goal:'Extract selected documents'}]}});
 assert.equal(updates[0].worker.status,'running');assert.equal(protocol.terminal,null);
 protocol.handle({type:'tool_result',name:'delegate_task',tool_call_id:'call1',output:JSON.stringify({results:[{task_index:0,status:'completed',summary:'Extracted 3'}]})});
 assert.equal(updates[1].worker.status,'completed');assert.equal(protocol.terminal,null);
 protocol.handle({type:'text',text:'Final reply'});assert.equal(protocol.terminal,null);
 protocol.handle({type:'result',exit_code:0,text:'Verified final',session_id:'local-test',tokens:{total:10}});
 assert.equal(protocol.terminal.status,'completed');assert.equal(protocol.terminal.answer,'Verified final');
});
test('failed delegated work is not shown as successful',()=>{
 const updates=[],protocol=new CoordinatorProtocol([{id:'worker-images',name:'Worker',profile:'worker-images'}],update=>updates.push(update));
 protocol.handle({type:'tool_use',name:'delegate_task',tool_call_id:'x',input:{tasks:[{profile:'worker-images'}]}});
 protocol.handle({type:'tool_result',name:'delegate_task',tool_call_id:'x',output:JSON.stringify({results:[{status:'error',error:'Unreadable document'}]})});
 assert.equal(updates[1].worker.status,'failed');
 protocol.handle({type:'result',exit_code:1,text:'Partial reply',error:'Stopped'});assert.equal(protocol.terminal.status,'failed');
});

test('an assistant mentioning an old output cannot register it as a new result',()=>{
 const protocol=new CoordinatorProtocol([]);
 protocol.handle({type:'result',exit_code:0,text:'Previous file image-prompts-20261101-000000-0123456789.txt'});
 assert.deepEqual(protocol.terminal.artifactNames,[]);
});

test('a bounded progress preview does not leave a completed Scout running',()=>{
 const updates=[],p=new CoordinatorProtocol([{id:'worker-research',name:'Research Worker',profile:'worker-research'}],u=>updates.push(u));
 p.handle({type:'tool_use',name:'delegate_task',tool_call_id:'research1',input:{tasks:[{profile:'worker-research',goal:'Research topics'}]}});
 const preview=JSON.stringify({results:[{task_index:0,status:'completed',summary:'Research '.repeat(1500)}]}).slice(0,5000);
 p.handle({type:'tool_result',name:'delegate_task',tool_call_id:'research1',output:preview});assert.equal(updates.at(-1).worker.status,'completed');assert.equal(p.terminal,null);
 p.handle({type:'result',exit_code:0,text:'Full researched brief with sources'});assert.equal(p.terminal.answer,'Full researched brief with sources');
});

test('real video delegation registers its Notepad result',()=>{
 const updates=[],p=new CoordinatorProtocol([{id:'worker-video',name:'Video Worker',profile:'worker-video'}],u=>updates.push(u));
 p.handle({type:'tool_use',name:'delegate_task',tool_call_id:'video1',input:{tasks:[{profile:'worker-video',goal:'Video only'}]}});
 p.handle({type:'tool_result',name:'delegate_task',tool_call_id:'video1',output:JSON.stringify({results:[{task_index:0,status:'completed',summary:'video-prompts-20261101-000000-0123456789.txt'}]})});
 p.handle({type:'result',exit_code:0,text:'Done'});assert.equal(updates[0].worker.id,'worker-video');assert.deepEqual(p.terminal.artifactNames,['video-prompts-20261101-000000-0123456789.txt']);
});

test('malformed and string-encoded delegation events cannot abort observation of a corrected run',()=>{
 const updates=[],protocol=new CoordinatorProtocol([{id:'worker-images',name:'Worker',profile:'worker-images'}],update=>updates.push(update));
 for(const tasks of ['[{"profile":"worker-images"}]}',false,7,null]) assert.doesNotThrow(()=>protocol.handle({type:'tool_use',name:'delegate_task',input:{tasks}}));
 assert.equal(updates.length,0);assert.equal(protocol.terminal,null);
 const task={profile:'worker-images',goal:'Use only the new source'};
 protocol.handle({type:'tool_use',name:'delegate_task',tool_call_id:'corrected',input:{tasks:JSON.stringify([task])}});
 assert.equal(updates.at(-1).worker.status,'running');
 assert.doesNotThrow(()=>protocol.handle({type:'tool_result',name:'delegate_task',output:{results:'not valid JSON'}}));
 protocol.handle({type:'tool_result',name:'delegate_task',tool_call_id:'corrected',output:{results:JSON.stringify([{task_index:0,status:'completed',summary:'image-prompts-20261101-000000-0123456789.txt'}])}});
 assert.equal(updates.at(-1).worker.status,'completed');assert.equal(protocol.terminal,null);
 protocol.handle({type:'result',exit_code:0,text:'Recovered existing result'});
 assert.equal(protocol.terminal.status,'completed');
 assert.equal(protocol.terminal.artifactNames.length,1);
 assert(recoverableObserverFailure({execution:'native-coordinator',status:'failed',error:'((intermediate value) || []).map is not a function'}));
 assert(!recoverableObserverFailure({execution:'native-coordinator',status:'failed',error:'Document not found'}));
});
