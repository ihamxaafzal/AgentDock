import test from 'node:test';
import assert from 'node:assert/strict';
import {placeRoomLabels} from '../public/label-layout.js';
test('seven clustered bot labels stay below the navigation and inside the room viewport',()=>{
 const labels=placeRoomLabels(Array.from({length:7},(_,i)=>({id:i,x:700,y:200,width:174,visible:true})),1280,720);
 for(const label of labels){assert(label.y>=142);assert(label.y<=642);assert(label.x-label.width/2>=252);assert(label.x+label.width/2<=1264);}
 for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++)assert(Math.abs(labels[i].x-labels[j].x)>=(labels[i].width+labels[j].width)/2+8||Math.abs(labels[i].y-labels[j].y)>=66);
});
test('phone labels stay on screen and invisible labels are left unchanged',()=>{
 const labels=placeRoomLabels([{x:2,y:60,width:180,visible:true},{x:-500,y:10,visible:false}],390,844);
 assert(labels[0].x>=100);assert(labels[0].y>=142);assert.equal(labels[1].x,-500);
});
