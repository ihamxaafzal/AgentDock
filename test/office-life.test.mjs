import test from 'node:test';
import assert from 'node:assert/strict';
import {OfficeLife,OFFICE_ZONES} from '../public/office-life.js';
import {Observatory} from '../public/scene.js';
import * as THREE from 'three';

test('a coffee break is interrupted by a real briefing, then the worker pins the task and returns to its desk',()=>{
 const office=new OfficeLife(),actor=office.add('worker',[-8,4.45],0);
 office.tick(1000);office.tick(20000);assert.equal(actor.mode,'coffee');assert.deepEqual(actor.pos,OFFICE_ZONES.coffee);
 office.hold('worker');office.setBusy('worker',true,21000);office.tick(25000);assert.equal(actor.mode,'coffee');
 office.receive('worker',26000,{worker:'worker',runId:'real-mission'});assert.equal(actor.arrival,'pinning');
 office.tick(60000);assert.equal(actor.mode,'pinning');office.tick(61000);assert.equal(office.pins.length,1);
 office.tick(62000);office.tick(100000);assert.equal(actor.mode,'working');assert.deepEqual(actor.pos,actor.home);
});
test('working agents do not start leisure, and ordinary new work interrupts a gaming break',()=>{
 const office=new OfficeLife(),actor=office.add('worker',[8,4.45],1);
 office.setBusy('worker',true,0);office.tick(20000);assert.equal(actor.mode,'working');assert.equal(actor.route,null);
 office.setBusy('worker',false,21000);office.tick(24000);office.tick(60000);assert.equal(actor.mode,'gaming');
 office.setBusy('worker',true,61000);office.tick(100000);assert.equal(actor.mode,'working');assert.deepEqual(actor.pos,actor.home);
});
test('several assignments to the same agent retain every task-board note through interruptions',()=>{
 const office=new OfficeLife(),actor=office.add('worker',[8,4.45],1);office.setBusy('worker',true,0);
 office.receive('worker',0,{runId:'first'});office.tick(100);office.hold('worker');office.receive('worker',200,{runId:'second'});
 office.tick(20000);office.tick(21000);office.tick(22000);office.tick(23000);office.tick(24000);office.tick(60000);
 assert.deepEqual(office.pins.map(p=>p.runId),['first','second']);assert.equal(actor.mode,'working');
});
test('Chief walks to a worker’s current coffee location rather than its empty desk',()=>{
 const room=Object.create(Observatory.prototype),office=new OfficeLife();
 const make=(id,x,z,index)=>{const group=new THREE.Group(),robot=new THREE.Group();group.position.set(x,0,z);robot.position.set(0,.28,.35);group.add(robot);return {agent:{id,name:id},group,robot,legs:[],arms:[],life:office.add(id,[x,z+.35],index)};};
 const chief=make('chief',0,-8.7,0),worker=make('worker',8,4.1,1);worker.life.pos=[...OFFICE_ZONES.coffee];worker.life.mode='coffee';
 Object.assign(room,{life:office,characters:[chief,worker],motionQueue:[],motion:null,reducedMotion:false,packet:new THREE.Object3D(),motionRing:new THREE.Object3D(),walkTrail:new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial())});
 room.enqueueHandoff({chief:'chief',worker:'worker',runId:'real',preview:false});room.tickHandoff(0);
 assert(worker.life.held);assert(Math.abs(room.motion.target[0]-(OFFICE_ZONES.coffee[0]+1.3))<.01);assert(Math.abs(room.motion.target[1]-(OFFICE_ZONES.coffee[1]+.8))<.01);
});

test('Chief stays at its station between briefings while other idle agents keep their breaks',()=>{
 const office=new OfficeLife(),chief=office.add('chief',[0,-8.35],0,0,{stationary:true}),worker=office.add('worker',[8,4.45],1);
 for(let now=0;now<180000;now+=1000){office.tick(now);assert.deepEqual(chief.pos,chief.home);assert.equal(chief.route,null);assert.equal(chief.mode,'desk');}
 assert(worker.cycle>1);
 office.setBusy('chief',true,180000);office.tick(181000);assert.equal(chief.mode,'working');
 office.hold('chief');chief.pos=[...OFFICE_ZONES.coffee];office.tick(182000);assert.deepEqual(chief.pos,OFFICE_ZONES.coffee);
 office.releaseChief('chief',190000);office.setBusy('chief',false,190000);office.tick(250000);
 assert.deepEqual(chief.pos,chief.home);assert.equal(chief.route,null);assert.equal(chief.mode,'desk');
});
