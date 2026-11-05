import test from 'node:test';
import assert from 'node:assert/strict';
import {STATIONS,ISLANDS,OFFICE_ZONES,ROOM_OBSTACLES,planOfficeRoute} from '../public/command-layout.js';
import {routeSample} from '../public/delegation-motion.js';
import {placeRoomLabels} from '../public/label-layout.js';
const inside=(p,r)=>p[0]>r.minX+1e-6&&p[0]<r.maxX-1e-6&&p[1]>r.minZ+1e-6&&p[1]<r.maxZ-1e-6;
test('six specialist seats share two islands and every home sits in an open aisle',()=>{
 assert.equal(STATIONS.length,7);assert.equal(ISLANDS.length,2);
 for(const [i,desk] of ISLANDS.entries())for(const [x,z] of STATIONS.slice(1+i*3,4+i*3)){assert(Math.abs(x-desk.x)<desk.width/2);assert(z>desk.z+desk.depth/2);}
 for(const [x,z] of STATIONS)assert(!ROOM_OBSTACLES.some(r=>inside([x,z+.35],r)));
});
test('all station, coffee, gaming, chat and board trips avoid the shared desks, brain and podium',()=>{
 const homes=STATIONS.map(([x,z])=>[x,z+.35]);
 for(const home of homes)for(const zone of Object.values(OFFICE_ZONES))for(const [start,end] of [[home,zone],[zone,home]]){
  const path=planOfficeRoute(start,end);assert.deepEqual(path[0],start);assert.deepEqual(path.at(-1),end);
  for(let d=0;d<90;d+=.18){const p=routeSample(path,d);assert(!ROOM_OBSTACLES.some(r=>inside([p.x,p.z],r)),`route crosses furniture from ${start} to ${end}`);}
 }
});
test('floating labels leave the central brain art unobstructed',()=>{
 const reserved={left:640,right:760,top:270,bottom:420};
 const [label]=placeRoomLabels([{id:'worker',x:700,y:350,width:160,visible:true}],1280,720,[reserved]);
 assert(label.x+80<=reserved.left||label.x-80>=reserved.right||label.y<=reserved.top||label.y-58>=reserved.bottom);
});
