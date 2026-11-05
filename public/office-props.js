import * as THREE from 'three';
import {buildCommandFurniture} from './command-furniture.js';
export function buildOfficeProps(r,{texture,text,rounded}){
 buildCommandFurniture(r,{texture,text,rounded});
 const board=new THREE.Group();board.position.set(4.8,0,-15.02);r.world.add(board);
 r.boardCanvas=document.createElement('canvas');r.boardCanvas.width=1024;r.boardCanvas.height=640;
 r.boardTexture=new THREE.CanvasTexture(r.boardCanvas);r.boardTexture.colorSpace=THREE.SRGBColorSpace;
 r.panel(r.boardTexture,5.3,3.25,[0,2.45,0],board);r.boardCards=[];
 r.paintTaskBoard=()=>{const c=r.boardCanvas.getContext('2d');c.fillStyle='#191124';c.fillRect(0,0,1024,640);text(c,'THE WORK BOARD',40,64,32,'#e7d8fa',700);text(c,'IDEAS BECOME ACTION.',42,95,15,'#a78cbd',600);c.fillStyle='#503361';c.fillRect(40,115,944,2);
  if(!r.boardCards.length){text(c,'A little room for the next big thing.',64,315,27,'#ad94c2');text(c,'New assignments are pinned here.',64,352,18,'#ad94c2');}
  for(const [i,note] of r.boardCards.slice(-6).entries()){const x=40+(i%3)*318,y=145+Math.floor(i/3)*224;c.fillStyle=note.status==='completed'?'#c9b581':'#d5b577';rounded(c,x,y,292,195,3);c.fill();c.fillStyle='#a95d65';c.beginPath();c.arc(x+146,y+14,7,0,Math.PI*2);c.fill();text(c,note.workerName.slice(0,22).toUpperCase(),x+18,y+52,16,'#4b3a4d',700);const words=(note.task||'Current assignment').split(/\s+/);let line='',row=0;for(const word of words){if((line+' '+word).length>29){text(c,line,x+18,y+83+row++*25,18,'#5d4f5d');line='';if(row===3)break;}line+=(line?' ':'')+word;}if(row<3)text(c,line,x+18,y+83+row*25,18,'#5d4f5d');text(c,(note.status||'assigned').toUpperCase(),x+18,y+177,13,'#786b72',600);}
  r.boardTexture.needsUpdate=true;
 };r.paintTaskBoard();
}

export function addAgentProps(r,d,{texture}){
 const cup=new THREE.Group();d.arms[0].add(cup);cup.position.set(0,-.36,.10);cup.rotation.x=-.15;
 r.mesh(new THREE.CylinderGeometry(.105,.085,.19,10),r.material('#dbc9b1',{roughness:.7,metalness:0}),cup);
 const coffee=r.mesh(new THREE.CircleGeometry(.087,10),r.basic('#493025'),cup,[0,.098,0]);coffee.rotation.x=-Math.PI/2;
 r.mesh(new THREE.TorusGeometry(.07,.018,4,10),r.material('#dbc9b1',{roughness:.7,metalness:0}),cup,[-.10,0,0]);cup.visible=false;
 const controller=r.box(.33,.12,.19,r.material('#ded7e6',{roughness:.5}),d.robot,[0,.52,.35]);controller.visible=false;
 for(const x of [-.1,.1])r.mesh(new THREE.SphereGeometry(.025,6,5),r.basic('#53446b'),controller,[x,.07,0]);
 const paper=r.box(.35,.43,.012,r.material('#eddaa4',{roughness:1,metalness:0}),d.arms[1],[0,-.32,.07]);paper.visible=false;
 const bubbleMap=r.chatTexture??=texture((c,w,h)=>{c.clearRect(0,0,w,h);c.fillStyle='#e2d8f1';c.beginPath();c.roundRect(5,5,w-10,h-18,24);c.fill();c.beginPath();c.moveTo(32,h-22);c.lineTo(38,h-2);c.lineTo(57,h-23);c.fill();c.fillStyle='#705989';for(let i=0;i<3;i++){c.beginPath();c.arc(42+i*32,41,6,0,Math.PI*2);c.fill();}},160,100);
 const bubble=new THREE.Sprite(new THREE.SpriteMaterial({map:bubbleMap,transparent:true,depthWrite:false,toneMapped:false}));bubble.scale.set(.8,.5,1);bubble.position.set(.45,1.95,0);d.robot.add(bubble);bubble.visible=false;
 Object.assign(d,{cup,controller,paper,bubble});
}
