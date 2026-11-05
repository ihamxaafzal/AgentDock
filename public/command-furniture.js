import * as THREE from 'three';
import {RoundedBoxGeometry} from './rounded-box.js';
import {ISLANDS,STATIONS} from './command-layout.js';
import {batchStaticObjects} from './batching.js';

function pill(r,w,h,d,material,parent,pos){
 return r.mesh(new RoundedBoxGeometry(w,h,d,3,Math.min(.2,w/4,h/3,d/4)),material,parent,pos);
}
function pillOutline(r,w,d,y,parent,color='#b77cff'){
 const points=[],radius=Math.min(.36,d/3,w/3),corners=[[w/2-radius,-d/2+radius,-Math.PI/2],[w/2-radius,d/2-radius,0],[-w/2+radius,d/2-radius,Math.PI/2],[-w/2+radius,-d/2+radius,Math.PI]];
 for(const [x,z,start] of corners)for(let i=0;i<=6;i++){const a=start+i*Math.PI/12;points.push([x+Math.cos(a)*radius,y,z+Math.sin(a)*radius]);}
 points.push(points[0]);r.line(points,color,.85,parent);
}
export function buildCommandFurniture(r,{texture,text,rounded}){
 const black=r.material('#17111e',{roughness:.38,metalness:.35}),surface=r.material('#49364f',{roughness:.25,metalness:.28}),cabinet=r.material('#31213e',{roughness:.44,metalness:.28}),metal=r.material('#50445c',{roughness:.28,metalness:.6});
 const box=(w,h,d,m,p,parent=r.world)=>r.box(w,h,d,m,parent,p);
 const cylinder=(rad,h,m,p,parent=r.world)=>r.mesh(new THREE.CylinderGeometry(rad,rad,h,16),m,parent,p);
 const contactMaterial=new THREE.MeshBasicMaterial({map:r.glow,color:'#000000',transparent:true,opacity:.42,depthWrite:false,toneMapped:false});contactMaterial.userData.shared=true;
 const contact=(w,d,x,z)=>{const mesh=r.mesh(new THREE.PlaneGeometry(w,d),contactMaterial,r.world,[x,-.045,z]);mesh.rotation.x=-Math.PI/2;};
 for(const d of ISLANDS)contact(d.width+2,5,d.x,d.z);
 for(const [x,z] of STATIONS.slice(1))contact(2.5,2.3,x,z+.5);
 contact(6,4,-6,-9);contact(7,3,-16.5,-4);contact(7,7,13.5,10);
 // Thin continuous worktops replace six separate desks and floor platforms.
 for(const desk of ISLANDS){const g=new THREE.Group();g.position.set(desk.x,0,desk.z);r.world.add(g);
  pill(r,desk.width,.23,desk.depth,surface,g,[0,1.18,0]);pillOutline(r,desk.width-.1,desk.depth-.1,1.09,g);
  box(desk.width-.8,.035,.035,r.basic('#ae75e8'),[0,1.08,desk.depth/2-.03],g);
  pill(r,desk.width-.35,.3,desk.depth-.25,black,g,[0,.96,0]);
  for(const x of [-desk.width/2+.8,desk.width/2-.8]){
   pill(r,1.25,.94,desk.depth-.4,cabinet,g,[x,.51,0]);
   for(const y of [.3,.57,.83]){pill(r,1.09,.22,.06,black,g,[x,y,desk.depth/2-.17]);box(.34,.025,.045,metal,[x,y+.03,desk.depth/2-.125],g);}
  }

  for(const x of []){pill(r,1.1,.86,1.65,cabinet,g,[x,.56,0]);box(1.2,.08,1.55,metal,[x,.14,0],g);for(const y of [.42,.7,.92]){box(.72,.012,.02,metal,[x,y,.738],g);box(.18,.025,.04,metal,[x,y+.065,.76],g);}}
  const glow=r.mesh(new THREE.PlaneGeometry(desk.width+1,3.8),new THREE.MeshBasicMaterial({map:r.glow,color:'#9347ff',transparent:true,opacity:.12,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}),g,[0,-.035,0]);glow.rotation.x=-Math.PI/2;
 }
 // Rear command podium; the coordinator faces the open room.
 const podium=new THREE.Group();podium.position.set(-6,0,-9);r.world.add(podium);
 pill(r,4.1,1.14,2.05,cabinet,podium,[0,.72,0]);pill(r,4.25,.14,2.2,surface,podium,[0,1.34,0]);pillOutline(r,4.13,2.08,.18,podium,'#c392ff');
 box(3.25,.045,.035,r.basic('#c094ff'),[0,.24,1.045],podium);
 const logo=texture((c,w,h)=>{c.clearRect(0,0,w,h);c.translate(w/2,h/2);c.strokeStyle='#dfbdff';c.shadowColor='#9e42ff';c.shadowBlur=22;c.lineWidth=5;for(let i=0;i<8;i++){const a=i*Math.PI/4;c.beginPath();c.moveTo(Math.cos(a)*12,Math.sin(a)*12);c.lineTo(Math.cos(a)*62,Math.sin(a)*62);c.stroke();}},192,192);
 r.mesh(new THREE.PlaneGeometry(.9,.9),new THREE.MeshBasicMaterial({map:logo,transparent:true,depthWrite:false,toneMapped:false}),podium,[0,.78,1.035]);
 // Paneled shell with a low, warm architectural light rather than wall galleries.
 const panels=r.material('#2b1f31',{roughness:.62,metalness:.2}),trim=r.material('#46334d',{roughness:.5,metalness:.4});
 for(let i=0;i<12;i++){const x=-16.5+i*3;box(2.9,4.65,.09,panels,[x,2.42,-15.28]);box(.06,4.8,.13,trim,[x-1.47,2.45,-15.18]);}
 for(let i=0;i<10;i++){const z=-14+i*3;box(.09,4.65,2.9,panels,[-17.78,2.42,z]);box(.13,4.8,.055,trim,[-17.68,2.45,z-1.47]);}
 box(35.2,.045,.055,r.basic('#ce986e'),[0,.34,-15.13]);box(.055,.045,30,r.basic('#ce986e'),[-17.61,.34,0]);
 box(35.2,.08,.13,trim,[0,4.91,-15.11]);box(.13,.08,30,trim,[-17.6,4.91,0]);
 for(const x of [-14,-9,-3,5]){box(.055,3.6,.045,r.basic('#efbe9a'),[x,2.5,-15.1]);const wash=r.mesh(new THREE.PlaneGeometry(.8,4.5),new THREE.MeshBasicMaterial({map:r.glow,color:'#c17765',transparent:true,opacity:.16,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}),r.world,[x,2.4,-15.02]);}
 // Dark window panes, entirely opaque: no costly refraction or screen-space effects.
 for(const x of [9.7,12.4,15.1]){box(2.55,3.15,.12,black,[x,2.55,-15.08]);box(2.35,2.95,.02,r.material('#111426',{roughness:.18,metalness:.55}),[x,2.55,-14.999]);box(.065,3.15,.03,trim,[x,2.55,-14.97]);box(2.55,.065,.03,trim,[x,1.8,-14.97]);r.line([[x-1,3.9,-14.95],[x+.75,2.2,-14.95]],'#a08ec0',.12);}
 // Coffee bar sits flush against the left wall, leaving the aisle open.
 const coffee=new THREE.Group();coffee.position.set(-16.7,0,-4.0);coffee.rotation.y=Math.PI/2;r.world.add(coffee);
 pill(r,6.1,1.02,1.1,cabinet,coffee,[0,.57,0]);pill(r,6.3,.12,1.35,surface,coffee,[0,1.14,0]);
 for(const x of [-2.1,-.7,.7,2.1]){box(1.32,.72,.035,black,[x,.62,.565],coffee);box(.4,.025,.035,metal,[x,.81,.59],coffee);}
 pill(r,1.35,1.02,.85,black,coffee,[-1.5,1.72,0]);box(1.04,.22,.03,r.basic('#c4a0eb'),[-1.5,1.94,.44],coffee);box(1.2,.08,.95,metal,[-1.5,1.25,.08],coffee);
 for(const x of [-1.7,-1.3]){box(.06,.2,.06,metal,[x,1.52,.47],coffee);cylinder(.13,.2,r.material('#e0cad1',{roughness:.7}),[x,1.32,.38],coffee);}
 box(5.8,.1,.65,surface,[0,2.65,-.2],coffee);
 for(let i=0;i<8;i++){const x=-2.4+i*.65;cylinder(.13,.25,r.material(i%2?'#cabdcd':'#a78ab7',{roughness:.7}),[x,2.83,-.18],coffee);if(i<4)cylinder(.12,.2,r.material('#dcc5bb',{roughness:.6}),[x+.25,1.31,.16],coffee);}
 const coffeeSign=texture((c,w,h)=>{c.clearRect(0,0,w,h);c.strokeStyle='#c09aff';c.lineWidth=6;c.shadowBlur=20;c.shadowColor='#9544ff';c.beginPath();c.roundRect(40,65,110,80,12);c.stroke();c.beginPath();c.arc(157,100,25,-Math.PI/2,Math.PI/2);c.stroke();for(const x of [70,105,140]){c.beginPath();c.moveTo(x,45);c.bezierCurveTo(x-20,25,x+20,20,x,4);c.stroke();}},216,170);
 r.mesh(new THREE.PlaneGeometry(1.2,1),new THREE.MeshBasicMaterial({map:coffeeSign,transparent:true,depthWrite:false,toneMapped:false}),coffee,[0,3.7,-.53]);
 // Books only on the shared desks: a couple of restrained props, no extra furniture.
 for(const d of ISLANDS)for(let i=0;i<3;i++)box(.1,.36+i*.06,.32,r.material(['#a68865','#6a7898','#9b7da9'][i],{roughness:.8}),[d.x-4.65+i*.13,1.45,d.z-.2]);
 // Two comfortable lounge seats share the gaming console and conversation table.
 const weave=texture((c,w,h)=>{c.fillStyle='#655367';c.fillRect(0,0,w,h);for(let i=0;i<w;i+=5){c.fillStyle=i%10?'#ffffff05':'#00000009';c.fillRect(i,0,1,h);c.fillRect(0,i,w,1);}},512,512);
 const rug=r.mesh(new THREE.PlaneGeometry(7.2,6.5),r.material('#b5a2bc',{roughness:1,metalness:0,map:weave}),r.world,[12.8,-.048,10.1]);rug.rotation.x=-Math.PI/2;
 for(const x of [12.5,14.5])buildLoungeChair(r,x,10.3,Math.PI);
 const table=new THREE.Group();table.position.set(11.4,0,10.6);r.world.add(table);cylinder(.75,.12,surface,[0,.79,0],table);cylinder(.12,.76,metal,[0,.37,0],table);
 cylinder(.2,.035,metal,[0,.9,0],table);r.mesh(new THREE.SphereGeometry(.22,12,10),r.material('#ffe2ad',{emissive:'#ffc97e',emissiveIntensity:1.8,roughness:.4}),table,[0,1.13,0]);
 box(4.4,.82,.7,cabinet,[13.5,.5,7.45]);box(.25,.66,.5,r.material('#beb0c9'),[15,1.23,7.6]);
 const game=texture((c,w,h)=>{c.fillStyle='#141027';c.fillRect(0,0,w,h);text(c,'AFTER HOURS',24,39,20,'#d5b4fd',600);c.strokeStyle='#7f4dbc';c.lineWidth=2;for(let i=0;i<8;i++){c.beginPath();c.moveTo(w/2,h*.4);c.lineTo(i*w/7,h);c.stroke();}for(let i=0;i<5;i++){const y=h*.4+i*i*10;c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}c.fillStyle='#ecb588';c.beginPath();c.arc(w*.7,h*.29,30,0,Math.PI*2);c.fill();text(c,'CO-OP / LOUNGE',25,h-22,17,'#c3b4dc');},640,384);
 r.panel(game,4.0,2.25,[13.5,2.45,7.4]);
 // Small planters with inexpensive low-poly leaves.
 for(const [x,z,scale] of [[-16.6,1.2,1.1],[-15.9,9.1,.9],[16.4,-13.7,1.1],[16.2,5.6,.9],[10.5,13.4,1]]){cylinder(.4*scale,.7*scale,cabinet,[x,.38*scale,z]);for(let i=0;i<7;i++){const leaf=r.mesh(new THREE.SphereGeometry(1,7,5),r.material('#476b4f',{roughness:.9,metalness:0}),r.world,[x+Math.cos(i*2.4)*.33*scale,1.0*scale+i*.17*scale,z+Math.sin(i*2.4)*.33*scale]);leaf.scale.set(.21*scale,.65*scale,.14*scale);leaf.rotation.z=Math.sin(i*2.4)*.65;}}
 // Low front glass partitions read as a premium office edge without blocking sightlines.
 for(const [x,z,w] of [[-13,14.4,5.5],[14.3,14.4,5.2]]){box(w,.1,.12,metal,[x,.1,z]);box(w,.9,.045,r.material('#423052',{transparent:true,opacity:.23,roughness:.25,metalness:.3}),[x,.65,z]);for(const dx of [-w/2,0,w/2])box(.065,1.18,.065,metal,[x+dx,.6,z]);}
}
export function buildWorkChair(r,parent){
 const seat=r.material('#392640',{roughness:.8,metalness:.05}),frame=r.material('#716279',{roughness:.3,metalness:.65});
 pill(r,1.15,.16,.95,seat,parent,[0,.53,.55]);
 const back=new THREE.Group();back.position.set(0,1.03,1.02);back.rotation.x=Math.PI/2-.13;parent.add(back);pill(r,1.12,.16,.91,seat,back,[0,0,0]);
 for(const x of [-.61,.61]){r.box(.08,.35,.08,frame,parent,[x,.63,.61]);r.box(.12,.08,.68,seat,parent,[x,.82,.5]);}
 r.mesh(new THREE.CylinderGeometry(.07,.09,.44,10),frame,parent,[0,.25,.57]);
 for(let i=0;i<5;i++){const a=i*Math.PI*2/5,g=new THREE.Group();g.position.set(0,.09,.57);g.rotation.y=a;parent.add(g);r.box(.075,.055,.48,frame,g,[0,0,.22]);r.mesh(new THREE.SphereGeometry(.07,7,5),frame,g,[0,-.03,.44]);}
}
function buildLoungeChair(r,x,z,yaw){
 const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=yaw;r.world.add(g);const fabric=r.material('#584062',{roughness:.9,metalness:0}),frame=r.material('#31223d',{roughness:.4,metalness:.3});
 pill(r,1.8,.35,1.45,fabric,g,[0,.5,0]);const back=new THREE.Group();back.position.set(0,1.04,-.63);back.rotation.x=Math.PI/2+.15;g.add(back);pill(r,1.6,.28,1.15,fabric,back,[0,0,0]);
 for(const side of [-1,1])pill(r,.32,.6,1.5,fabric,g,[side*.86,.75,0]);
 for(const side of [-1,1])for(const front of [-1,1])r.box(.09,.29,.09,frame,g,[side*.62,.18,front*.43]);
}
export function buildNeonBrain(r){
 const brain=new THREE.Group();r.core.add(brain);brain.position.set(0,3.0,0);
 const fallback=new THREE.Group();brain.add(fallback);
 const white=new THREE.MeshBasicMaterial({color:'#f4dcff',toneMapped:false}),glow=new THREE.MeshBasicMaterial({color:'#a64bff',transparent:true,opacity:.24,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
 const tube=points=>{const curve=new THREE.CatmullRomCurve3(points.map(([x,y,z=0])=>new THREE.Vector3(x,y,z)));r.mesh(new THREE.TubeGeometry(curve,48,.027,5,false),white,fallback);r.mesh(new THREE.TubeGeometry(curve,48,.085,5,false),glow,fallback);};
 const outline=[[.04,1.02,.02],[.35,1.26,.02],[.76,1.12,.03],[.85,.79,.04],[1.2,.69,.03],[1.34,.27,.1],[1.18,.02,.14],[1.36,-.25,.07],[1.11,-.63,.05],[.86,-.65,0],[.74,-.99,0],[.33,-1.1,0],[.04,-.85,0]];
 for(const side of [-1,1]){tube(outline.map(([x,y,z])=>[x*side,y,z]));tube([[.06*side,1.0,.12],[.08*side,.42,.3],[.04*side,-.3,.3],[.04*side,-.85,.12]]);tube([[1.21*side,.34,.15],[.72*side,.42,.42],[.56*side,.85,.23]]);tube([[1.14*side,-.18,.2],[.64*side,-.1,.55],[.47*side,.22,.55],[.07*side,.22,.32]]);tube([[.84*side,-.72,.15],[.52*side,-.52,.4],[.1*side,-.67,.3]]);}
 r.coreGlow=r.sprite('#a45cff',7,[0,2.6,0],r.core,.48);
 for(let i=0;i<4;i++)r.ring(.62+i*.5,.035,'#a868ff',r.core,.7-i*.1);
 for(let i=0;i<3;i++)r.ring(.35+i*.18,.3+i*.32,'#b782ff',r.core,.65-i*.12);
 for(const x of [-.35,.35])r.line([[x,.12,0],[0,1.75,.05]],'#c78cff',.35,r.core);
 const pool=r.mesh(new THREE.PlaneGeometry(9,9),new THREE.MeshBasicMaterial({map:r.glow,color:'#9f3dff',transparent:true,opacity:.5,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}),r.core,[0,-.035,0]);pool.rotation.x=-Math.PI/2;
 batchStaticObjects([...fallback.children],fallback);
 new THREE.TextureLoader().load('/assets/command-brain.png',map=>{map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;r.mesh(new THREE.PlaneGeometry(4.2,4.2),new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,toneMapped:false,alphaTest:.003}),brain,[0,0,.2]);brain.remove(fallback);fallback.traverse(o=>{o.geometry?.dispose();});white.dispose();glow.dispose();r.invalidate(1500);});
 return brain;
}
