import * as THREE from 'three';
import {RoomEnvironment} from './room-environment.js';
import {RoundedBoxGeometry} from './rounded-box.js';
import { batchStaticObjects,batchRigidPart } from './batching.js';
import { DelegationSignals, walkingRoute, routeSample, renderCadence } from './delegation-motion.js';
import {OfficeLife,activityLabel} from './office-life.js';
import {buildOfficeProps,addAgentProps} from './office-props.js';
import {ROOM,STATIONS,planOfficeRoute} from './command-layout.js';
import {buildWorkChair,buildNeonBrain} from './command-furniture.js';
import {placeRoomLabels} from './label-layout.js';

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const PURPLE = '#a477ff';
function rng(seed=42) { return () => {seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}; }
function texture(draw,w=768,h=448) {
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  draw(canvas.getContext('2d'),w,h);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
  return map;
}
function rounded(c,x,y,w,h,r=12) {c.beginPath();c.roundRect(x,y,w,h,r);}
function text(c,value,x,y,size=22,color='#f0e9ff',weight=500) {c.font=`${weight} ${size}px Segoe UI, Arial`;c.fillStyle=color;c.fillText(value,x,y);}
function neonTexture() {return texture((c,w,h)=>{const g=c.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);g.addColorStop(0,'#e7ccff');g.addColorStop(.15,'#b178ff90');g.addColorStop(.5,'#8132ff20');g.addColorStop(1,'#8132ff00');c.fillStyle=g;c.fillRect(0,0,w,h);},128,128);}

export class Observatory {
  constructor(container,{onSelect,onFrame,onReady,onError,onHandoff,onPortrait}) {
    Object.assign(this,{container,onSelect,onFrame,onError,onHandoff,onPortrait});
    this.signals=new DelegationSignals();this.motionQueue=[];this.motion=null;this.occluded=false;this.life=new OfficeLife();
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#08060f');
    this.scene.fog=new THREE.FogExp2('#08060f',.011);
    this.camera=new THREE.OrthographicCamera(-20,20,14,-14,.1,180);
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power'});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
    container.append(this.renderer.domElement);
    const environment=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(this.renderer);
    this.environmentTarget=pmrem.fromScene(environment,.04);this.scene.environment=this.environmentTarget.texture;this.scene.environmentIntensity=.22;environment.dispose();pmrem.dispose();
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.shadowMap.autoUpdate=false;

    this.scene.add(new THREE.HemisphereLight('#ddcdec','#130d1b',.85));
    const key=new THREE.DirectionalLight('#f6e6da',2.5);key.position.set(-8,20,12);this.scene.add(key);
    const edge=new THREE.DirectionalLight('#8c52ff',3.2);edge.position.set(10,8,-12);this.scene.add(edge);
    // Original neon light rig: the central lamp creates the purple pool on the floor.
    const coreLight=new THREE.PointLight('#b35cff',65,18,2);coreLight.position.set(0,3.2,0);this.scene.add(coreLight);
    key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-28,right:28,top:28,bottom:-28,near:1,far:65});key.shadow.bias=-.0005;key.shadow.normalBias=.035;key.shadow.radius=3;
    this.keyLight=key;
    this.materials=new Map();this.characters=[];this.pickables=[];this.pulses=[];this.glow=neonTexture();this.glow.userData.shared=true;
    this.azimuth=this.targetAzimuth=.5;this.elevation=this.targetElevation=.56;this.distance=this.targetDistance=34;
    this.selected=null;this.autoOrbit=false;this.hologramIntensity=.85;this.reducedMotion=false;this.paused=false;this.wakeUntil=0;this.fpsLimit=30;
    this.lastDraw=0;this.lastFps=performance.now();this.frameCount=0;
    this.world=new THREE.Group();this.scene.add(this.world);this.buildingStatic=true;this.buildRoom();this.buildingStatic=false;
    this.packet=this.box(.46,.32,.06,this.basic('#e4c8ff'),this.world,[0,1.5,0]);this.packet.visible=false;
    this.motionRing=this.ring(.75,.09,'#cf9dff',this.world,.85);this.motionRing.visible=false;
    this.animate=this.animate.bind(this);this.bindEvents();this.resize();
    this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();onError?.('The 3D room paused. Reload to reconnect the graphics.');});
    this.renderer.compileAsync(this.scene,this.camera).then(()=>onReady?.()).catch(()=>onReady?.());
  }
  material(color,options={}) {
    const key=JSON.stringify([color,options]);
    if(!this.materials.has(key)){const m=new THREE.MeshStandardMaterial({color,roughness:.42,metalness:.38,...options});m.userData.shared=true;this.materials.set(key,m);}
    return this.materials.get(key);
  }
  basic(color,opacity=1) {const key='basic:'+color;if(opacity===1&&this.materials.has(key))return this.materials.get(key);const m=new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,toneMapped:false,depthWrite:opacity===1});if(opacity===1){m.userData.shared=true;this.materials.set(key,m);}return m;}
  mesh(geometry,material,parent=this.world,pos=[0,0,0]) {const m=new THREE.Mesh(geometry,material);m.position.set(...pos);parent.add(m);return m;}
  box(w,h,d,material,parent,pos) {return this.mesh(new THREE.BoxGeometry(w,h,d),material,parent,pos);}
  line(points,color=PURPLE,opacity=.6,parent=this.world) {
    const g=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p)));
    const key='static-line:'+color+':'+opacity;
    let m=this.buildingStatic?this.materials.get(key):null;
    if(!m){m=new THREE.LineBasicMaterial({color,transparent:true,opacity,toneMapped:false});if(this.buildingStatic){m.userData.shared=true;this.materials.set(key,m);}}
    const l=new THREE.Line(g,m);parent.add(l);return l;
  }
  rect(w,d,y,color,parent=this.world,opacity=.6) {return this.line([[-w/2,y,-d/2],[w/2,y,-d/2],[w/2,y,d/2],[-w/2,y,d/2],[-w/2,y,-d/2]],color,opacity,parent);}
  ring(r,y,color=PURPLE,parent=this.world,opacity=.5) {
    const o=this.mesh(new THREE.TorusGeometry(r,.014,5,80),this.basic(color,opacity),parent,[0,y,0]);o.rotation.x=-Math.PI/2;return o;
  }
  sprite(color,size,pos,parent=this.world,opacity=.35) {
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glow,color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
    s.position.set(...pos);s.scale.set(size,size,1);parent.add(s);return s;
  }
  panel(map,w,h,pos,parent=this.world) {
    const frame=this.box(w+.08,h+.08,.075,this.material('#37214f',{emissive:'#381a68',emissiveIntensity:.7}),parent,pos);
    const face=this.mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map,toneMapped:false,side:THREE.DoubleSide}),frame,[0,0,.045]);
    return {frame,face};
  }
  floorText(value,w,d,pos,parent=this.world,color='#9869d5') {
    const map=texture((c,cw,ch)=>{c.clearRect(0,0,cw,ch);c.textAlign='center';text(c,value,cw/2,ch*.67,45,color,600);},1024,128);
    const p=this.mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,toneMapped:false}),parent,pos);p.rotation.x=-Math.PI/2;return p;
  }
  mediaTexture(index) {
    const r=rng(index+12);
    return texture((c,w,h)=>{
      c.fillStyle='#100b1b';c.fillRect(0,0,w,h);c.strokeStyle='#4c2d73';c.strokeRect(2,2,w-4,h-4);
      c.fillStyle='#a275ed';c.fillRect(20,20,7,7);text(c,['CREATIVE LIBRARY','STORY FRAMES','VISUAL DIRECTION','CAMPAIGN NOTES'][index%4],39,29,15,'#c7b6dd');
      for(let i=0;i<3;i++) {
        const x=20+i*244,y=54;const g=c.createLinearGradient(x,y,x+215,y+280);
        g.addColorStop(0,['#7f43c2','#3e5a7b','#c07c70','#7e80c8'][index%4]);g.addColorStop(1,'#130e27');c.fillStyle=g;rounded(c,x,y,222,286,9);c.fill();
        // Original miniature editorial artwork, drawn locally.
        const sunX=x+50+r()*125;c.fillStyle='#edd1ff88';c.beginPath();c.arc(sunX,118,24+r()*16,0,TAU);c.fill();
        for(let k=0;k<5;k++){c.fillStyle=['#1c173f','#312653','#45305f'][k%3];c.beginPath();c.moveTo(x,300);for(let t=0;t<6;t++)c.lineTo(x+t*45,170+r()*105+k*12);c.lineTo(x+222,340);c.lineTo(x,340);c.fill();}
        c.fillStyle='#ead8ff88';c.fillRect(x+13,315,36,3);text(c,'0'+(index*3+i+1),x+13,80,14,'#ffffffb0');
        text(c,['A new perspective','Built for the story','The next chapter'][i],x+4,369,17,'#c1b0d8');text(c,'ORIGINAL / CONCEPT',x+4,398,12,'#735f8d');
      }
    });
  }
  buildRoom() {
    const ground=this.box(90,.15,90,this.material('#08060f',{roughness:1}),this.world,[0,-.65,0]);
    this.box(ROOM.width,.5,ROOM.depth,this.material('#302237',{roughness:.35,metalness:.4}),this.world,[0,-.33,0]);
    this.rect(ROOM.width,ROOM.depth,-.05,'#70449c',this.world,.7);
    for(let x=-17;x<=17;x+=1.4)this.line([[x,-.06,-15],[x,-.06,15]],'#7847a2',.16);
    for(let z=-15;z<=15;z+=1.4)this.line([[-18,-.06,z],[18,-.06,z]],'#7847a2',.16);
    this.box(36,5.2,.23,this.material('#171023',{metalness:.2}),this.world,[0,2.5,-15.4]);
    this.box(.23,5.2,31,this.material('#171020',{metalness:.2}),this.world,[-18,2.5,0]);
    buildOfficeProps(this,{texture,text,rounded});
    this.core=new THREE.Group();this.world.add(this.core);this.brain=buildNeonBrain(this);
    this.pulses=[];
    for(const [i,station] of STATIONS.entries()){
      const end=i===0?[station[0],station[1]+3.4]:[station[0],station[1]+.9],route=planOfficeRoute([0,2.95],end);
      this.line(route.map(([x,z])=>[x,-.02,z]),'#8d4acb',.28);
      const length=route.reduce((sum,p,i)=>sum+(i?Math.hypot(p[0]-route[i-1][0],p[1]-route[i-1][1]):0),0);
      for(let k=0;k<3;k++)this.pulses.push({route,length,phase:(i/7+k/3)%1});
    }
    this.pulseInstances=new THREE.InstancedMesh(new THREE.SphereGeometry(.045,6,5),this.basic('#d7acff'),this.pulses.length);this.pulseInstances.frustumCulled=false;this.world.add(this.pulseInstances);this.pulseMatrix=new THREE.Matrix4();
    const fixed=[];this.world.traverse(o=>{let parent=o;while(parent&&parent!==this.core)parent=parent.parent;if(!parent&&o!==ground&&!o.isInstancedMesh&&o.geometry)fixed.push(o);});
    for(const object of fixed)this.world.attach(object);batchStaticObjects(fixed,this.world,{world:true});
    this.world.traverse(o=>{if(o.isMesh&&!o.material.transparent){o.castShadow=true;o.receiveShadow=true;}});this.renderer.shadowMap.needsUpdate=true;
  }
  stationPosition(index,total) {
    if(index<STATIONS.length)return STATIONS[index];
    const side=index%2?1:-1,row=Math.floor((index-7)/2);return [side*(6.2+row*3.3),8];
  }
  buildCharacter(agent,index,total) {
    const [x,z]=this.stationPosition(index,total),group=new THREE.Group();group.position.set(x,.08,z);this.world.add(group);
    const color=new THREE.Color(agent.color||PURPLE);
    const halo=this.rect(1.45,1.25,.035,agent.color||PURPLE,group,.45);halo.position.z=.35;
    const stationGlow=this.sprite(agent.color||PURPLE,2.6,[0,.16,.35],group,.16);
    const robot=new THREE.Group();robot.position.set(0,index===0?.1:.38,.35);robot.rotation.y=index===0?0:Math.PI;robot.scale.setScalar(index===0?1.7:1.6);group.add(robot);
    const shell=new THREE.MeshStandardMaterial({color:new THREE.Color(agent.color||PURPLE).multiplyScalar(.9),emissive:agent.color||PURPLE,emissiveIntensity:.18,metalness:.22,roughness:.32});
    const white=this.material(new THREE.Color(agent.color||PURPLE).lerp(new THREE.Color('#ffffff'),.12).getStyle(),{emissive:agent.color||PURPLE,emissiveIntensity:.22,roughness:.2});
    const face=this.material('#11091f',{emissive:'#11091f',roughness:.16,metalness:.35});
    const body=this.mesh(new THREE.CapsuleGeometry(.26,.38,5,12),shell,robot,[0,.46,0]);
    this.box(.12,.08,.025,this.basic('#e6cfff'),robot,[0,.45,.26]);
    const head=new THREE.Group();head.position.set(0,1.12,0);robot.add(head);
    const outer=this.mesh(new RoundedBoxGeometry(.94,.7,.64,4,.26),white,head);
    const visor=this.mesh(new RoundedBoxGeometry(.8,.51,.18,4,.088),face,head,[0,0,.29]);
    for(const ex of [-.13,.13]){const eye=this.mesh(new THREE.SphereGeometry(.063,10,8),this.basic('#f6edff'),head,[ex,.015,.396]);eye.scale.y=1.3;}
    this.mesh(new THREE.CylinderGeometry(.015,.015,.19,6),white,head,[0,.4,0]);this.mesh(new THREE.SphereGeometry(.052,8,8),this.basic('#d4afff'),head,[0,.52,0]);
    const arms=[],legs=[];
    for(const side of [-1,1]){
      const arm=new THREE.Group();arm.position.set(side*.35,.7,0);robot.add(arm);arms.push(arm);
      this.mesh(new THREE.CapsuleGeometry(.085,.25,4,8),shell,arm,[0,-.16,0]);
      this.mesh(new THREE.SphereGeometry(.09,8,8),white,arm,[0,-.38,.025]);arm.rotation.z=side*.13;
      const leg=new THREE.Group();leg.position.set(side*.15,.22,0);robot.add(leg);legs.push(leg);
      this.mesh(new THREE.CapsuleGeometry(.065,.14,3,8),shell,leg,[0,-.09,0]);
      this.box(.16,.12,.28,white,leg,[0,-.21,.08]);
    }
    if(!this.shadowMaterial){this.shadowMaterial=new THREE.MeshBasicMaterial({map:this.glow,color:'#000000',transparent:true,opacity:.22,depthWrite:false,toneMapped:false});this.shadowMaterial.userData.shared=true;}
    const shadow=this.mesh(new THREE.PlaneGeometry(1.4,1.05),this.shadowMaterial,robot,[0,-.06,0]);shadow.rotation.x=-Math.PI/2;
    if(index===0){const crown=this.ring(.37,1.9,'#c69aff',robot,.8);crown.rotation.z=.15;}
    const screenCanvas=document.createElement('canvas');screenCanvas.width=768;screenCanvas.height=448;
    const screenTexture=new THREE.CanvasTexture(screenCanvas);screenTexture.colorSpace=THREE.SRGBColorSpace;
    const chief=index===0,screen=this.panel(screenTexture,chief?1.35:2.35,chief?.72:1.42,chief?[0,1.48,1.05]:[0,2,-1.27],group);screen.frame.rotation.x=-.12;
    if(chief){screen.frame.rotation.y=Math.PI;screen.frame.rotation.x=-.4;}else buildWorkChair(this,group);
    const steel=this.material('#59445f',{roughness:.35,metalness:.5});
    this.box(chief?1.0:1.35,.035,.4,this.material('#61506c',{emissive:agent.color||PURPLE,emissiveIntensity:.2}),group,chief?[0,1.43,.9]:[0,1.29,-.25]);
    const keyPoints=[];for(let k=0;k<4;k++)keyPoints.push(new THREE.Vector3(-.55,chief?1.455:1.315,(chief?.75:-.42)+k*.09),new THREE.Vector3(.55,chief?1.455:1.315,(chief?.75:-.42)+k*.09));
    if(!this.keyLines){this.keyLines=new THREE.LineBasicMaterial({color:'#c9b7da',transparent:true,opacity:.4});this.keyLines.userData.shared=true;}group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(keyPoints),this.keyLines));
    if(!chief)this.box(.16,.035,.25,steel,group,[1.0,1.3,-.25]);
    const hit=this.mesh(new THREE.BoxGeometry(2.8,3.5,2.4),new THREE.MeshBasicMaterial({visible:false}),group,[0,1.8,0]);hit.userData.agentId=agent.id;this.pickables.push(hit);
    const movingHit=this.mesh(new THREE.BoxGeometry(1.6,2.2,1.3),new THREE.MeshBasicMaterial({visible:false}),robot,[0,.9,0]);movingHit.userData.agentId=agent.id;this.pickables.push(movingHit);
    const datum={agent,index,group,robot,head,arms,legs,halo,stationGlow,shadow,shell,screenCanvas,screenTexture,color,labelPosition:new THREE.Vector3(),life:this.life.add(agent.id,[x,z+.35],index,performance.now(),{stationary:!!agent.nativeCoordinator||index===0})};
    this.makePortrait(datum);
    addAgentProps(this,datum,{texture});
    this.partMaterials??={};datum.coloredParts=[head,...arms,...legs,datum.controller].flatMap(part=>batchRigidPart(part,shell,this.partMaterials));
    const station=[];group.traverse(o=>{let p=o;while(p&&p!==robot)p=p.parent;if(!p&&o.geometry&&o!==hit)station.push(o);});
    for(const object of station)group.attach(object);batchStaticObjects(station,group);
    group.traverse(o=>{let parent=o;while(parent&&parent!==robot)parent=parent.parent;if(!parent&&o.isMesh&&!o.material.transparent&&o.material.visible!==false){o.castShadow=true;o.receiveShadow=true;}});this.renderer.shadowMap.needsUpdate=true;
    this.paintScreen(datum);return datum;
  }
  makePortrait(d){
    if(!this.onPortrait)return;
    const scene=new THREE.Scene();scene.environment=this.scene.environment;scene.environmentIntensity=.7;
    scene.add(new THREE.HemisphereLight('#f6ebff','#39233f',2));
    const key=new THREE.DirectionalLight('#fff0df',3);key.position.set(-3,4,5);scene.add(key);
    const model=d.robot.clone(true);model.position.set(0,0,0);model.rotation.set(0,-.12,0);model.scale.setScalar(1);scene.add(model);
    model.traverse(o=>{if(o.isMesh&&(o.material.visible===false||o.material===this.shadowMaterial))o.visible=false;});
    const camera=new THREE.OrthographicCamera(-.72,.72,1,-1,.1,10);camera.position.set(0,1.2,5);camera.lookAt(0,.87,0);
    const target=new THREE.WebGLRenderTarget(96,128),oldTarget=this.renderer.getRenderTarget(),oldColor=this.renderer.getClearColor(new THREE.Color()),oldAlpha=this.renderer.getClearAlpha(),shadowEnabled=this.renderer.shadowMap.enabled;
    this.renderer.shadowMap.enabled=false;this.renderer.setRenderTarget(target);this.renderer.setClearColor(0,0);this.renderer.render(scene,camera);
    const pixels=new Uint8Array(96*128*4);this.renderer.readRenderTargetPixels(target,0,0,96,128,pixels);
    this.renderer.setRenderTarget(oldTarget);this.renderer.setClearColor(oldColor,oldAlpha);this.renderer.shadowMap.enabled=shadowEnabled;target.dispose();
    const canvas=document.createElement('canvas');canvas.width=96;canvas.height=128;const context=canvas.getContext('2d'),image=context.createImageData(96,128);
    for(let y=0;y<128;y++)image.data.set(pixels.subarray((127-y)*384,(128-y)*384),y*384);context.putImageData(image,0,0);this.onPortrait(d.agent.id,canvas.toDataURL());
  }
  paintScreen(d) {
    const c=d.screenCanvas.getContext('2d'),w=768,h=448; c.fillStyle='#10091d';c.fillRect(0,0,w,h);
    const g=c.createLinearGradient(0,0,w,h);g.addColorStop(0,'#37175f');g.addColorStop(1,'#130c24');c.fillStyle=g;rounded(c,3,3,w-6,h-6,12);c.fill();
    c.strokeStyle='#9461c7';c.lineWidth=2;rounded(c,2,2,w-4,h-4,12);c.stroke();
    text(c,d.agent.name.toUpperCase().slice(0,30),28,43,22,'#f5eaff',600);text(c,'AGENT / '+String(d.index+1).padStart(2,'0'),560,42,15,'#af86da');
    c.strokeStyle='#654485';c.beginPath();c.moveTo(26,65);c.lineTo(741,65);c.stroke();text(c,d.agent.role.toUpperCase().slice(0,44),28,95,15,'#b594cf');
    const type=d.index%5;
    if(type===0){
      for(let i=0;i<3;i++){c.fillStyle='#a078d412';rounded(c,30+i*238,120,221,90,8);c.fill();text(c,['MISSION','STATUS','ENGINE'][i],45+i*238,147,13,'#a486bc');text(c,[d.agent.taskStatus==='completed'?'DONE':d.agent.status==='working'?'ACTIVE':'READY',d.agent.status.toUpperCase(),'HERMES'][i],45+i*238,183,22,'#ead7ff');}
      for(let i=0;i<4;i++){c.fillStyle='#a279cf20';rounded(c,30,230+i*34,690-i*72,13,4);c.fill();}
    }else if(type===1){
      c.strokeStyle='#593574';for(let y=145;y<325;y+=45){c.beginPath();c.moveTo(35,y);c.lineTo(730,y);c.stroke();}
      const r=rng(d.index+43);c.strokeStyle='#bc80ff';c.lineWidth=4;c.beginPath();for(let x=0;x<22;x++){const y=290-x*5-r()*60;x?c.lineTo(40+x*31,y):c.moveTo(40+x*31,y);}c.stroke();
      text(c,'SIGNAL ANALYSIS',35,352,14,'#a987c7');
    }else if(type===2){
      for(let col=0;col<3;col++){text(c,['QUEUED','IN PROGRESS','REVIEW'][col],30+col*242,133,13,'#c3a4dc');for(let row=0;row<3;row++){c.fillStyle=row===col?'#7340a8':'#2a183f';rounded(c,30+col*242,150+row*58,217,45,6);c.fill();c.fillStyle='#c29be6';c.fillRect(45+col*242,166+row*58,125-row*20,4);c.fillStyle='#6f4d8e';c.fillRect(45+col*242,177+row*58,75,3);}}
    }else if(type===3){
      text(c,'THE NEXT STORY STARTS HERE',35,140,21,'#e7d1ff');for(let i=0;i<7;i++){c.fillStyle=i===2?'#a67bd1':'#70508c';c.fillRect(35,165+i*23,650-(i%3)*95,5);}
      c.strokeStyle='#b57cff';c.beginPath();for(let i=0;i<80;i++){const x=35+i*8,y=352+Math.sin(i*.9)*12*Math.sin(i*.11);i?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();
    }else{
      for(let i=0;i<3;i++){const x=35+i*240;c.fillStyle=['#5c3485','#714d99','#3b386c'][i];rounded(c,x,125,212,187,7);c.fill();c.fillStyle='#d2b8eb66';c.beginPath();c.arc(x+135,177,25,0,TAU);c.fill();c.fillStyle='#231936';c.beginPath();c.moveTo(x,310);c.lineTo(x+90,204);c.lineTo(x+150,265);c.lineTo(x+210,230);c.lineTo(x+212,312);c.fill();text(c,'CONCEPT 0'+(i+1),x,339,13,'#b89acd');}
    }
    c.fillStyle='#0c0713';c.fillRect(14,383,740,50);text(c,(d.agent.progressNote||d.agent.task||'Awaiting direction').slice(0,84),28,413,14,'#aa8dbf');
    d.screenTexture.needsUpdate=true;
  }
  setAgents(agents,assignments=agents) {
    const changedIds=this.characters.map(d=>d.agent.id).join('|')!==agents.map(a=>a.id).join('|');
    if(changedIds){if(this.walkTrail)this.walkTrail.visible=false;this.motion=null;this.motionQueue=[];this.signals=new DelegationSignals();this.life=new OfficeLife();this.packet.visible=false;this.motionRing.visible=false;this.onHandoff?.(null);}
    const signals=this.signals.observe(assignments);
    if(this.characters.map(d=>d.agent.id).join('|')!==agents.map(a=>a.id).join('|')){
      for(const d of this.characters){this.world.remove(d.group);d.group.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])if(!m.userData.shared){if(m.map&&!m.map.userData.shared)m.map.dispose();m.dispose();}}});}
      this.pickables=[];this.characters=agents.map((a,i)=>this.buildCharacter(a,i,agents.length));this.invalidate();
    }else this.characters.forEach((d,i)=>{const a=agents[i];if(['name','role','status','task','progressNote','taskStatus','color'].some(k=>d.agent[k]!==a[k])){const tintChanged=d.agent.color!==a.color;d.agent=a;d.color.set(a.color);d.shell.color.set(a.color).multiplyScalar(.9);d.shell.emissive.set(a.color);d.halo.material.color.set(a.color);d.stationGlow.material.color.set(a.color);if(tintChanged)for(const part of d.coloredParts){const colors=part.geometry.attributes.color;for(const [start,count] of part.userData.shellRanges||[])for(let j=start;j<start+count;j++)colors.setXYZ(j,d.shell.color.r,d.shell.color.g,d.shell.color.b);colors.needsUpdate=true;}this.paintScreen(d);this.invalidate();}else d.agent=a;});
    for(const signal of signals)this.enqueueHandoff(signal);
    for(const d of this.characters)this.life.setBusy(d.agent.id,d.agent.status==='working',performance.now());
    if(!this.boardCards.length)this.boardCards=assignments.filter(a=>a.reportsTo&&a.parentRunId).slice(-6).map(a=>({worker:a.id,workerName:agents.find(d=>d.id===a.id)?.name||a.id,runId:a.parentRunId,task:a.task,status:a.taskStatus}));
    for(const card of this.boardCards){const a=assignments.find(a=>a.id===card.worker&&a.parentRunId===card.runId);if(a)card.status=a.taskStatus;}
    this.paintTaskBoard();
  }
  setOccluded(value){this.occluded=value;this.invalidate();}
  previewHandoff(chief,worker){this.enqueueHandoff({chief,worker,preview:true});}
  enqueueHandoff(event){
    if(this.motionQueue.length>100)return;
    if(!this.characters.some(d=>d.agent.id===event.chief)||!this.characters.some(d=>d.agent.id===event.worker))return;
    this.motionQueue.push(event);this.life?.hold(event.worker);this.invalidate();
  }
  startWalk(chief,target,phase,event,now){
    const start=[chief.group.position.x+chief.robot.position.x,chief.group.position.z+chief.robot.position.z];
    this.motion={chief,target,phase,event,route:walkingRoute(start,target),started:now};this.life?.hold(chief.agent.id);
    if(this.walkTrail){this.walkTrail.geometry.dispose();this.walkTrail.geometry=new THREE.BufferGeometry().setFromPoints(this.motion.route.map(([x,z])=>new THREE.Vector3(x,.09,z)));}else this.walkTrail=this.line(this.motion.route.map(([x,z])=>[x,.09,z]),'#b988ff',.65);
    this.walkTrail.visible=true;
    if(event){const worker=this.characters.find(d=>d.agent.id===event.worker);this.onHandoff?.({chief:chief.agent.name,worker:worker.agent.name,phase:phase==='return'?'Returning to command':'Walking to teammate',preview:event.preview});}
  }
  tickHandoff(now){
    if(this.reducedMotion){if(this.walkTrail)this.walkTrail.visible=false;for(const d of this.characters){d.legs.forEach(l=>l.rotation.x=0);d.arms.forEach(a=>a.rotation.x=0);d.robot.rotation.y=d.index===0?0:Math.PI;if(d.life){d.life.pos=[...d.life.home];d.life.route=null;d.life.held=false;d.life.mode=d.life.busy?'working':'desk';d.robot.position.set(0,d.index===0?.1:.38,.35);}}this.motionQueue=[];this.motion=null;this.packet.visible=false;this.motionRing.visible=false;this.onHandoff?.(null);return null;}
    if(!this.motion && this.motionQueue.length){const event=this.motionQueue.shift(),chief=this.characters.find(d=>d.agent.id===event.chief),worker=this.characters.find(d=>d.agent.id===event.worker);if(chief&&worker){this.life?.hold(worker.agent.id);const x=worker.life?.pos[0]??worker.group.position.x,z=worker.life?.pos[1]??worker.group.position.z+.35;this.startWalk(chief,[x+(x<0?1.3:-1.3),z+.8],'outbound',event,now);}}
    const m=this.motion;if(!m)return null;
    const chief=m.chief,worker=this.characters.find(d=>d.agent.id===m.event?.worker);
    if(m.phase==='talk'){
      const wx=worker.life?.pos[0]??worker.group.position.x,wz=worker.life?.pos[1]??worker.group.position.z+.35;
      chief.robot.rotation.y=Math.atan2(wx-chief.group.position.x-chief.robot.position.x,wz-chief.group.position.z-chief.robot.position.z);
      this.motionRing.position.set(wx,.10,wz);this.motionRing.visible=true;
      const chiefWorld=chief.robot.getWorldPosition(new THREE.Vector3()),workerWorld=worker.robot.getWorldPosition(new THREE.Vector3());worker.robot.rotation.y=Math.atan2(chiefWorld.x-workerWorld.x,chiefWorld.z-workerWorld.z);const f=Math.min((now-m.started)/900,1);
      this.packet.position.lerpVectors(chiefWorld,workerWorld,f);this.packet.position.y=1.55+Math.sin(f*Math.PI)*.65;this.packet.rotation.y=now/650;this.packet.visible=true;
      if(now-m.started>=1150){
        this.packet.visible=false;this.motionRing.visible=false;worker.robot.rotation.y=Math.PI;
        this.life?.receive(worker.agent.id,now,{worker:worker.agent.id,workerName:worker.agent.name,runId:m.event.runId,task:m.event.task||worker.agent.task,status:worker.agent.taskStatus,preview:m.event.preview});
        if(this.motionQueue.length){this.motion=null;}else this.startWalk(chief,[chief.group.position.x,chief.group.position.z+.35],'return',m.event,now);
      }
      return {chief:chief.agent.id,worker:worker.agent.id,talking:true};
    }
    const p=routeSample(m.route,(now-m.started)/1000*5.5);chief.robot.position.set(p.x-chief.group.position.x,.1+Math.abs(Math.sin(now/85))*.055,p.z-chief.group.position.z);chief.robot.rotation.y=p.angle;if(chief.life)chief.life.pos=[p.x,p.z];
    if(p.done){if(m.phase==='return'){chief.robot.position.set(0,.1,.35);chief.robot.rotation.y=0;this.life?.releaseChief(chief.agent.id,now);this.motion=null;if(this.walkTrail)this.walkTrail.visible=false;this.onHandoff?.(null);}else{m.phase='talk';m.started=now;this.onHandoff?.({chief:chief.agent.name,worker:worker.agent.name,phase:'Briefing & passing the task',preview:m.event.preview});}}
    return {chief:chief.agent.id,worker:worker?.agent.id,talking:false};
  }
  select(id){if(this.selected!==id)this.invalidate();this.selected=id;}
  invalidate(duration=1000){this.wakeUntil=performance.now()+duration;if(this.frameTimer){clearTimeout(this.frameTimer);this.frameTimer=null;}if(!this.frameHandle&&typeof requestAnimationFrame==='function')this.frameHandle=requestAnimationFrame(this.animate);}
  setHardware(data){/* Hardware readings are displayed in the top-right HUD only. */}
  setPaused(value){this.paused=value;this.invalidate();}
  setQuality(mode){this.quality=mode;this.fpsLimit=mode==='high'?60:mode==='eco'?15:mode==='low'?20:30;this.renderer.setPixelRatio(Math.min(devicePixelRatio,mode==='high'?1.5:mode==='eco'?.75:mode==='low'?.85:1.25));this.coreGlow.visible=mode!=='eco';this.resize();}
  zoom(delta){this.targetDistance=clamp(this.targetDistance+delta,22,62);this.invalidate();}
  cameraView(view){this.targetAzimuth=view==='top'?0:.5;this.targetElevation=view==='top'?1.47:.56;this.targetDistance=view==='top'?36:34;this.invalidate();}
  resize(){this.renderer.setSize(innerWidth,innerHeight);this.invalidate();}
  bindEvents(){
    const canvas=this.renderer.domElement;let drag;
    canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY};canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(!drag)return;this.targetAzimuth-=(e.clientX-drag.x)*.004;this.targetElevation=clamp(this.targetElevation+(e.clientY-drag.y)*.004,.3,1.48);drag.x=e.clientX;drag.y=e.clientY;this.invalidate();});
    canvas.addEventListener('pointerup',e=>{if(!drag)return;if(Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy)<6){const r=new THREE.Raycaster();r.setFromCamera(new THREE.Vector2(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1),this.camera);const hit=r.intersectObjects(this.pickables)[0];if(hit)this.onSelect?.(hit.object.userData.agentId);}drag=null;});
    canvas.addEventListener('pointercancel',()=>{drag=null;});canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom(e.deltaY*.012);},{passive:false});addEventListener('resize',()=>this.resize());
    document.addEventListener('visibilitychange',()=>this.invalidate());addEventListener('focus',()=>this.invalidate());addEventListener('blur',()=>this.invalidate());
  }
  animate(now){
    this.frameHandle=null;const fps=renderCadence({mode:this.quality,busy:this.characters.some(d=>d.agent.status==='working'),moving:!!this.motion||!!this.motionQueue.length||this.autoOrbit||[...this.life.actors.values()].some(a=>a.route||a.mode==='pinning'),focused:document.hasFocus(),hidden:document.hidden,paused:this.paused,settling:now<this.wakeUntil,occluded:this.occluded});
    if(!fps)return;
    const schedule=delay=>{this.frameTimer=setTimeout(()=>{this.frameTimer=null;this.frameHandle=requestAnimationFrame(this.animate);},Math.max(4,delay));};
    if(now-this.lastDraw<1000/fps){schedule(1000/fps-(now-this.lastDraw));return;}
    const dt=Math.min((now-this.lastDraw)/1000,.1);this.lastDraw=now;this.frameCount++;const t=now/1000;
    if(this.autoOrbit&&!this.reducedMotion&&!this.paused)this.targetAzimuth+=dt*.025;
    this.azimuth+=(this.targetAzimuth-this.azimuth)*.12;this.elevation+=(this.targetElevation-this.elevation)*.12;this.distance+=(this.targetDistance-this.distance)*.12;
    const aspect=innerWidth/innerHeight,span=Math.max(35,51/(aspect*(innerWidth>900?.86:.96)))*this.distance/34;this.camera.left=-span*aspect/2;this.camera.right=span*aspect/2;this.camera.top=span/2;this.camera.bottom=-span/2;this.camera.updateProjectionMatrix();
    const horizontal=Math.cos(this.elevation)*48;this.camera.position.set(Math.sin(this.azimuth)*horizontal,Math.sin(this.elevation)*48,Math.cos(this.azimuth)*horizontal);this.camera.lookAt(0,1.5,0);
    // Compose the world to the right of the slim team rail.
    if(innerWidth>900)this.camera.setViewOffset(innerWidth,innerHeight,-70,-innerHeight*.015,innerWidth,innerHeight);else this.camera.clearViewOffset();
    this.brain.quaternion.copy(this.camera.quaternion);this.coreGlow.material.opacity=.22+this.hologramIntensity*.18;
    if(!this.paused&&!this.reducedMotion){this.brain.position.y=3+Math.sin(t*1.2)*.08;this.pulses.forEach((p,i)=>{const n=(t*.1+p.phase)%1,s=routeSample(p.route,n*p.length);this.pulseMatrix.makeTranslation(s.x,.015,s.z);this.pulseInstances.setMatrixAt(i,this.pulseMatrix);});this.pulseInstances.instanceMatrix.needsUpdate=true;this.pulseInstances.visible=this.quality!=='eco';}
    if(!this.paused&&!this.reducedMotion)this.life.tick(now);
    for(const d of this.characters){const a=d.life;d.robot.position.set(a.pos[0]-d.group.position.x,a.mode==='gaming'||d.index!==0&&['desk','working'].includes(a.mode)?.38:.1,a.pos[1]-d.group.position.z);if(this.motion?.chief!==d)d.robot.rotation.y=a.yaw;}
    while(this.life.pins.length){const note=this.life.pins.shift();if(note.preview)continue;this.boardCards=this.boardCards.filter(c=>c.worker!==note.worker||c.runId!==note.runId);this.boardCards.push(note);this.boardCards=this.boardCards.slice(-6);this.paintTaskBoard();}
    const motion=this.paused?null:this.tickHandoff(now);
    const labels=[];
    for(const d of this.characters){const busy=d.agent.status==='working';d.halo.material.opacity=d.agent.id===this.selected ? .95 : .32;
      const mode=d.life.mode,walking=motion?.chief===d.agent.id&&!motion.talking||mode==='walking',talking=motion?.talking&&(motion.chief===d.agent.id||motion.worker===d.agent.id)||mode==='chat';
      d.cup.visible=mode==='coffee'&&!walking;d.controller.visible=mode==='gaming'&&!walking;d.paper.visible=mode==='pinning';d.bubble.visible=!!talking&&!walking;
      if(!this.paused&&!this.reducedMotion){
        if(motion?.chief!==d.agent.id)d.robot.position.y=(mode==='gaming'||d.index!==0&&['desk','working'].includes(mode)?.38:.1)+(walking?Math.abs(Math.sin(t*10+d.index))*.045:Math.sin(t*1.6+d.index)*.012);
        d.head.rotation.y=talking?Math.sin(t*4)*.12:Math.sin(t*.7+d.index)*.035;d.head.rotation.x=mode==='working'?.09:0;
        d.arms.forEach((arm,i)=>{arm.rotation.x=walking?Math.sin(t*10+i*Math.PI)*.65:talking?-.6+Math.sin(t*4+i)*.2:mode==='working'?-1.55+Math.sin(t*13+i*2)*.095:mode==='coffee'?(i===0?-1.9+Math.sin(t*.8)*.25:0):mode==='gaming'?-1.05+Math.sin(t*5+i)*.06:mode==='pinning'?(i===1?-2.3+Math.sin(t*4)*.16:0):0;});
        d.legs.forEach((leg,i)=>{leg.rotation.x=walking?Math.sin(t*10+i*Math.PI)*.6:mode==='gaming'||d.index!==0&&['desk','working'].includes(mode)?-1.05:0;});}
      if(d.shadow)d.shadow.position.y=(-.035-d.group.position.y-d.robot.position.y)/d.robot.scale.y;
      d.group.updateMatrixWorld();const p=d.labelPosition.set(0,1.95,-.1).applyMatrix4(d.robot.matrixWorld).project(this.camera);
      labels.push({id:d.agent.id,width:Math.min(220,Math.max(128,(d.agent.displayName||d.agent.name).length*5.8+42)),activity:motion?.chief===d.agent.id?(motion.talking?'Giving task':'Walking'):motion?.talking&&motion.worker===d.agent.id?'Receiving brief':activityLabel(mode),x:(p.x*.5+.5)*innerWidth,y:(-p.y*.5+.5)*innerHeight,visible:p.z<1&&Math.abs(p.x)<1&&Math.abs(p.y)<1});
    }
    const brainAnchor=this.brain.getWorldPosition(new THREE.Vector3()).project(this.camera),bx=(brainAnchor.x*.5+.5)*innerWidth,by=(-brainAnchor.y*.5+.5)*innerHeight;
    placeRoomLabels(labels,innerWidth,innerHeight,[{left:bx-58,right:bx+58,top:by-64,bottom:by+64}]);
    this.renderer.render(this.scene,this.camera);let measured;
    if(now-this.lastFps>1000){measured=Math.round(this.frameCount*1000/(now-this.lastFps));this.frameCount=0;this.lastFps=now;}
    this.onFrame?.(labels,measured,measured?{calls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures,heapMiB:performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):null}:null);
    schedule(1000/fps-(performance.now()-now));
  }
}
