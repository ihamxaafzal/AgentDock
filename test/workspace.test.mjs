import test from 'node:test';
import assert from 'node:assert/strict';
import {DelegationSignals,walkingRoute,routeSample,renderCadence} from '../public/delegation-motion.js';
import {formatResponse} from '../public/response-format.js';
import {Observatory} from '../public/scene.js';
import * as THREE from 'three';
const worker=(startedAt,status='running')=>({id:'scout',reportsTo:'chief',task:'Find topics',startedAt,taskStatus:status});

test('late-arriving completed history after an empty roster does not replay old handoffs',()=>{
 const signals=new DelegationSignals();signals.observe([]);signals.observe([{id:'chief'}]);
 assert.deepEqual(signals.observe([worker(1,'completed')]),[]);
 assert.equal(signals.observe([worker(2,'running')]).length,1);
});
test('walking follows new real assignments once, without replaying old completed tasks or completion polls',()=>{
 const s=new DelegationSignals();assert.deepEqual(s.observe([worker(1,'completed')]),[]);
 assert.equal(s.observe([worker(2)]).length,1);assert.deepEqual(s.observe([worker(2)]),[]);assert.deepEqual(s.observe([worker(2,'completed')]),[]);
 assert.equal(s.observe([worker(3,'completed')]).length,1);
 assert.equal(new DelegationSignals().observe([worker(4)]).length,1);
});
test('handoff routes avoid the central brain on outbound, return and multi-worker trips',()=>{
 for(const [start,end] of [[[0,-8.35],[-6.2,-3.1]],[[-6.2,-3.1],[0,-8.35]],[[0,-8.35],[-6.2,5.6]],[[-6.2,5.6],[0,-8.35]],[[0,-8.35],[-1.8,9.8]],[[-6.2,5.6],[6.2,5.6]]]){
  const path=walkingRoute(start,end);assert.deepEqual(routeSample(path,1e6),{x:end[0],z:end[1],angle:0,done:true});
  for(let distance=0;distance<90;distance+=.15){const p=routeSample(path,distance);assert(Number.isFinite(p.x+p.z));assert(!(Math.abs(p.x)<2&&Math.abs(p.z)<2),'route crosses the brain');}
 }
});

test('assignment identity drives walking even if a worker fails between polls',()=>{
 const s=new DelegationSignals();
 const assigned={...worker(1,'failed'),parentRunId:'aether-first'};
 assert.deepEqual(s.observe([assigned]),[]);
 assert.equal(s.observe([{...assigned,parentRunId:'aether-new'}]).length,1);
 assert.deepEqual(s.observe([{...assigned,parentRunId:'aether-new',task:'Updated brief'}]),[]);
});

test('concurrent assignments to the same physical worker each produce one handoff',()=>{
 const signals=new DelegationSignals();signals.observe([]);
 const a={...worker(1),parentRunId:'first',assignmentId:'call:0'},b={...worker(2),parentRunId:'second',assignmentId:'call:0'};
 assert.equal(signals.observe([a,b]).length,2);assert.deepEqual(signals.observe([a,b]),[]);
});

test('a live assignment moves Chief to the worker, passes the task and returns',()=>{
 const room=Object.create(Observatory.prototype),phases=[];
 const character=(id,x,z)=>{
  const group=new THREE.Group(),robot=new THREE.Group();group.position.set(x,0,z);robot.position.set(0,.28,.35);group.add(robot);
  return {agent:{id,name:id},group,robot,legs:[],arms:[]};
 };
 const chief=character('chief',0,-8.7),worker=character('medical',0,8.3);
 Object.assign(room,{characters:[chief,worker],motionQueue:[],motion:null,reducedMotion:false,packet:new THREE.Object3D(),motionRing:new THREE.Object3D(),walkTrail:new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial()),onHandoff:state=>phases.push(state)});
 room.enqueueHandoff({chief:'chief',worker:'medical',preview:false});
 room.tickHandoff(0);room.tickHandoff(900);
 assert(Math.abs(chief.robot.position.x)+Math.abs(chief.robot.position.z-.35)>1);
 room.tickHandoff(10000);assert.equal(room.motion.phase,'talk');
 room.tickHandoff(10600);assert(room.packet.visible);
 room.tickHandoff(11200);assert.equal(room.motion.phase,'return');
 room.tickHandoff(30000);assert.equal(room.motion,null);
 assert.deepEqual(chief.robot.position.toArray(),[0,.1,.35]);
 assert(phases.some(s=>s?.phase==='Briefing & passing the task'&&!s.preview));
});
test('adaptive rendering preserves active frame rate and rests while idle, hidden, paused or covered',()=>{
 assert.equal(renderCadence({busy:true}),30);assert.equal(renderCadence({moving:true}),30);assert.equal(renderCadence({}),8);
 assert.equal(renderCadence({hidden:true,busy:true}),0);assert.equal(renderCadence({paused:true}),0);assert.equal(renderCadence({focused:false,busy:true}),5);assert.equal(renderCadence({occluded:true,busy:true}),1);
});
test('response typography keeps headings, list items, links and incomplete code without executing agent HTML',()=>{
 const html=formatResponse('# Topics\n**Fact**\n- One\n- Two\n[Evidence](https://example.org/paper)\n<script>alert(1)</script>\n```\nunfinished');
 assert(html.includes('<h3>Topics</h3>'));assert(html.includes('<strong>Fact</strong>'));assert.equal((html.match(/<li>/g)||[]).length,2);assert(html.includes('rel="noopener noreferrer"'));assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));assert(html.includes('<pre>unfinished</pre>'));
 const table=formatResponse('| Name | Result |\n|---|---|\n| Chief | **Done** |');assert(table.includes('<table>'));assert.equal((table.match(/<tr>/g)||[]).length,2);assert(table.includes('<strong>Done</strong>'));
 assert(!formatResponse('[bad](javascript:alert(1))').includes('<a '));
 assert(!formatResponse('https://example.org/\"><img src=x onerror=alert(1)>').includes('<img'));
});
