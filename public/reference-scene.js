import {OfficeLife,activityLabel} from './office-life.js';
import {DEFAULT_BREAK_SETTINGS,normalizeBreakSettings} from './team-breaks.js';
import {DelegationSignals} from './delegation-motion.js';
import {REFERENCE,HOMES,ZONES,OBSTACLES,projectFloor,referenceRoute,referenceBreakTarget,spriteFrame,spriteBudget,sampleReferenceRoute,routePixelLength,briefingPoint,poseAnchor,attachedLabel,pacedFrame} from './reference-layout.js';
const ASSET='/assets/reference-robots-v1.png';
const colorHue=color=>{const c=String(color).replace('#',''),r=parseInt(c.slice(0,2),16)/255,g=parseInt(c.slice(2,4),16)/255,b=parseInt(c.slice(4,6),16)/255,max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;if(!d)return 0;return (60*(max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4)+360)%360;};
export class Observatory{
 constructor(container,callbacks={}){
  Object.assign(this,callbacks);this.container=container;this.signals=new DelegationSignals();this.characters=[];this.motionQueue=[];this.motion=null;this.breakSettings=this.breakSettings||DEFAULT_BREAK_SETTINGS;this.life=new OfficeLife({zones:ZONES,route:referenceRoute,targetFor:referenceBreakTarget,sample:sampleReferenceRoute,speed:88,breakPolicy:this.breakSettings});this.selected=null;this.paused=false;this.reducedMotion=false;this.occluded=false;this.zoomLevel=1;this.boardCards=[];this.lastDraw=null;this.frames=0;this.lastMeasure=performance.now();this.atlases=new Map();this.spriteImage=new Image();this.spriteImage.src=ASSET;
  document.body.classList.add('reference-mode');container.replaceChildren();container.setAttribute('aria-label','Live isometric agent room. Click a robot to inspect; scroll to zoom.');
  this.stage=document.createElement('div');this.stage.className='reference-stage';container.append(this.stage);
  const room=document.createElement('img');room.src='/assets/reference-room-v1.png';room.className='reference-room';room.alt='Purple isometric command room with two shared desk islands, coffee bar, windows and a neon brain';room.draggable=false;this.stage.append(room);
  this.pin=document.createElement('button');this.pin.className='reference-pin';this.pin.type='button';this.pin.title='Live task board';this.pin.setAttribute('aria-label','Live task board: no new assignments');this.pin.onclick=()=>this.onSelect?.(this.boardCards.at(-1)?.worker);this.stage.append(this.pin);
  this.packet=document.createElement('span');this.packet.className='reference-task-paper';this.packet.hidden=true;this.packet.textContent='▤';this.stage.append(this.packet);
  this.dotRoutes=HOMES.slice(1).map(home=>{const route=referenceRoute([0,3.4],home);return {route,length:routePixelLength(route)};});
  this.dots=Array.from({length:6},()=>{const dot=document.createElement('i');dot.className='reference-floor-dot';this.stage.append(dot);return dot;});
  this.addOccluders();this.addMap();this.animate=this.animate.bind(this);this.resize();
  this.onResize=()=>this.resize();this.onVisibility=()=>this.invalidate();addEventListener('resize',this.onResize);document.addEventListener('visibilitychange',this.onVisibility);addEventListener('focus',this.onVisibility);addEventListener('blur',this.onVisibility);
  container.addEventListener('wheel',e=>{e.preventDefault();this.zoom(e.deltaY*.003);},{passive:false});
  Promise.all([room.decode(),this.spriteImage.decode()]).then(()=>{for(const d of this.characters){this.tintRobot(d);d.portraitHue=null;this.paintPortrait(d,colorHue(d.agent.color)-184);}this.onReady?.();this.invalidate();}).catch(()=>this.onError?.('Room artwork could not load. Refresh the local app.'));
 }
 addOccluders(){
  // Reuse precisely matching artwork fragments to put chair backs and the podium in front of seated robots.
  const clips=[{depth:370,points:[[830,304],[950,321],[949,371],[833,353]]},
   {depth:560,points:[[437,478],[474,491],[493,527],[485,552],[453,540],[443,515]]},
   {depth:609,points:[[568,532],[604,544],[621,578],[610,606],[583,594],[572,570]]},
   {depth:653,points:[[695,580],[730,592],[747,628],[738,648],[707,638],[698,612]]},
   {depth:592,points:[[1139,509],[1175,521],[1196,558],[1185,584],[1157,573],[1144,543]]},
   {depth:644,points:[[1297,566],[1334,578],[1354,613],[1343,638],[1314,627],[1303,596]]}];
  this.occluders=[];for(const [index,clip] of clips.entries()){const layer=document.createElement('div');layer.className='reference-occluder';layer.style.clipPath='polygon('+clip.points.map(([x,y])=>`${x/REFERENCE.width*100}% ${y/REFERENCE.height*100}%`).join(',')+')';layer.style.zIndex=String(clip.depth);this.stage.append(layer);this.occluders.push({layer,index});}
 }
 project(point){return this.map?[836+22*point[0],470+15*point[1]]:projectFloor(point);}
 addMap(){
  const map=document.createElement('div');map.className='reference-map-panel';const box=r=>`<rect x="${836+22*r.minX}" y="${470+15*r.minZ}" width="${22*(r.maxX-r.minX)}" height="${15*(r.maxZ-r.minZ)}" rx="9"/>`;
  map.innerHTML=`<svg viewBox="0 0 1672 941" aria-label="Top-down task and room map"><rect class="map-floor" x="290" y="130" width="1250" height="700" rx="30"/><g class="map-furniture">${OBSTACLES.map(box).join('')}</g>${Object.entries(ZONES).map(([name,p])=>`<text x="${836+22*p[0]}" y="${470+15*p[1]-45}">${name.toUpperCase()}</text>`).join('')}<text class="map-title" x="350" y="200">ROOM MAP · LIVE AGENT POSITIONS</text></svg>`;this.stage.append(map);
 }
 resize(){const width=innerWidth,height=innerHeight;this.scale=Math.min(width/REFERENCE.width,height/REFERENCE.height);this.offset=[(width-REFERENCE.width*this.scale)/2,(height-REFERENCE.height*this.scale)/2];document.documentElement.style.setProperty('--reference-scale',this.scale);this.stage.style.transform=`translate(${this.offset[0]+this.scale*REFERENCE.width/2*(1-this.zoomLevel)}px,${this.offset[1]+this.scale*REFERENCE.height/2*(1-this.zoomLevel)}px) scale(${this.scale*this.zoomLevel})`;this.stage.style.transformOrigin='0 0';this.invalidate();}
 setAgents(agents,assignments=agents){
  const changed=this.characters.map(d=>d.agent.id).join('|')!==agents.map(a=>a.id).join('|');
  if(changed){this.characters.forEach(d=>d.element.remove());this.motion=null;this.motionQueue=[];this.signals=new DelegationSignals();this.breakSettings=this.breakSettings||DEFAULT_BREAK_SETTINGS;this.life=new OfficeLife({zones:ZONES,route:referenceRoute,targetFor:referenceBreakTarget,sample:sampleReferenceRoute,speed:88,breakPolicy:this.breakSettings});this.characters=agents.map((agent,index)=>{const element=document.createElement('button');element.type='button';element.className='reference-actor';element.setAttribute('aria-label',`Inspect ${agent.name}`);element.onclick=()=>this.onSelect?.(agent.id);const art=document.createElement('span');art.className='reference-robot';element.append(art);const shadow=document.createElement('i');shadow.className='reference-contact';element.prepend(shadow);this.stage.append(element);return {agent,index,element,art,life:this.life.add(agent.id,HOMES[index]||HOMES.at(-1),index,performance.now(),{stationary:index===0||!!agent.nativeCoordinator}),lastFrame:''};});}
  this.characters.forEach((d,i)=>{d.agent=agents[i];const hue=colorHue(d.agent.color)-184;this.tintRobot(d);this.life.setBusy(d.agent.id,d.agent.status==='working',performance.now());this.paintPortrait(d,hue);});
  for(const event of this.signals.observe(assignments))this.enqueueHandoff(event);this.invalidate();
 }
 atlas(hue){
  if(this.atlases.has(hue))return this.atlases.get(hue);if(!this.spriteImage.complete||!this.spriteImage.naturalWidth)return null;
  // CPU-backed Canvas2D is used once per identity color. No per-frame filters or WebGL.
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=768;const context=canvas.getContext('2d',{willReadFrequently:true});context.filter=`hue-rotate(${hue}deg)`;context.drawImage(this.spriteImage,0,0,768,768);const url=canvas.toDataURL('image/png');this.atlases.set(hue,url);canvas.width=canvas.height=1;return url;
 }
 tintRobot(d){const hue=colorHue(d.agent.color)-184,url=this.atlas(hue);d.art.style.backgroundImage=url?`url("${url}")`:'';d.art.style.filter=url?'':`hue-rotate(${hue}deg)`;}
 paintPortrait(d,hue){const icon=document.querySelector(`[data-agent="${CSS.escape(d.agent.id)}"] .avatar-icon`);if(icon){if(d.portraitHue===hue&&icon.querySelector('.reference-portrait-art'))return;d.portraitHue=hue;icon.classList.add('reference-portrait');icon.classList.remove('has-portrait');icon.replaceChildren();const sprite=document.createElement('span');sprite.className='reference-portrait-art';const url=this.atlas(hue);sprite.style.filter=url?'':`hue-rotate(${hue}deg)`;if(url)sprite.style.backgroundImage=`url("${url}")`;icon.append(sprite);}}
 select(id){this.selected=id;for(const d of this.characters)d.element.classList.toggle('selected',d.agent.id===id);}
 setQuality(mode){this.quality=mode;this.invalidate();}
 setBreakSettings(value){this.breakSettings=normalizeBreakSettings(value);this.life.configureBreaks(this.breakSettings,performance.now());this.invalidate();}
 setHardware(){}
 setPaused(value){const now=performance.now();if(value&&!this.paused)this.pauseStarted=now;if(!value&&this.paused){const elapsed=now-this.pauseStarted;for(const a of this.life.actors.values()){a.departed+=elapsed;a.until+=elapsed;}if(this.motion)this.motion.started+=elapsed;this.life.breaks?.shiftTime(elapsed);for(const d of this.characters)if(d.blendStarted)d.blendStarted+=elapsed;}this.paused=value;this.invalidate();}
 setOccluded(value){this.occluded=value;this.invalidate();}
 zoom(delta){this.zoomLevel=Math.max(.8,Math.min(1.35,this.zoomLevel-delta*.06));this.resize();}
 cameraView(view){this.zoomLevel=1;this.map=view==='top';this.stage.classList.toggle('reference-map',this.map);this.resize();}
 invalidate(){if(!this.timer&&!this.frameHandle)this.frameHandle=requestAnimationFrame(this.animate);}
 previewHandoff(chief,worker){this.enqueueHandoff({chief,worker,preview:true});}
 enqueueHandoff(event){if(!this.characters.some(d=>d.agent.id===event.chief)||!this.characters.some(d=>d.agent.id===event.worker))return;this.motionQueue.push(event);this.life.hold(event.worker);this.invalidate();}
 startWalk(chief,target,phase,event,now){this.life.hold(chief.agent.id);this.motion={chief,target,phase,event,route:referenceRoute(chief.life.pos,target),started:now};const worker=this.characters.find(d=>d.agent.id===event.worker);this.onHandoff?.({chief:chief.agent.name,worker:worker.agent.name,phase:phase==='return'?'Returning to command':'Walking to teammate',preview:event.preview});}
 tickHandoff(now){
  if(this.reducedMotion){
   const events=[...(this.motion?[this.motion.event]:[]),...this.motionQueue];for(const event of events){const worker=this.characters.find(d=>d.agent.id===event.worker);if(!event.preview)this.life.pins.push({worker:event.worker,workerName:worker?.agent.name,runId:event.runId,task:event.task||worker?.agent.task,status:worker?.agent.taskStatus});}
   for(const d of this.characters){d.life.held=false;d.life.route=null;d.life.pos=[...d.life.home];d.life.mode=d.life.busy?'working':'desk';}
   this.motion=null;this.motionQueue=[];this.packet.hidden=true;this.onHandoff?.(null);return null;
  }
  if(!this.motion&&this.motionQueue.length){const event=this.motionQueue.shift(),chief=this.characters.find(d=>d.agent.id===event.chief),worker=this.characters.find(d=>d.agent.id===event.worker);this.life.hold(worker.agent.id);this.startWalk(chief,briefingPoint(worker.life.pos,chief.life.pos),'outbound',event,now);}
  const m=this.motion;if(!m)return null;const chief=m.chief,worker=this.characters.find(d=>d.agent.id===m.event.worker);
  if(m.phase==='talk'){
   const a=this.project(chief.life.pos),b=this.project(worker.life.pos),t=Math.min((now-m.started)/900,1);this.packet.hidden=false;this.packet.style.left=`${a[0]+(b[0]-a[0])*t}px`;this.packet.style.top=`${a[1]+(b[1]-a[1])*t-55-Math.sin(t*Math.PI)*20}px`;
   if(now-m.started>=1150){this.packet.hidden=true;this.life.receive(worker.agent.id,now,{worker:worker.agent.id,workerName:worker.agent.name,runId:m.event.runId,task:m.event.task||worker.agent.task,status:worker.agent.taskStatus,preview:m.event.preview});if(this.motionQueue.length)this.motion=null;else this.startWalk(chief,chief.life.home,'return',m.event,now);}
   return {chief:chief.agent.id,worker:worker.agent.id,talking:true};
  }
  const p=sampleReferenceRoute(m.route,(now-m.started)/1000*106);chief.life.pos=[p.x,p.z];chief.life.yaw=p.angle;
  if(p.done){if(m.phase==='return'){this.life.releaseChief(chief.agent.id,now);this.motion=null;this.onHandoff?.(null);}else{m.phase='talk';m.started=now;this.onHandoff?.({chief:chief.agent.name,worker:worker.agent.name,phase:'Briefing & passing the task',preview:m.event.preview});}}
  return {chief:chief.agent.id,worker:worker.agent.id,talking:false};
 }
 animate(){
  this.timer=null;this.frameHandle=null;const now=performance.now(),hidden=document.hidden;
  const moving=!!this.motion||!!this.motionQueue.length||[...this.life.actors.values()].some(a=>a.route||a.mode==='pinning');
  const budget=spriteBudget({quality:this.quality,hidden,paused:this.paused,occluded:this.occluded,focused:document.hasFocus(),moving,working:this.characters.some(d=>d.agent.status==='working'),reduced:this.reducedMotion});
  if(hidden)return;
  if(budget>=12){const clock=pacedFrame(this.lastDraw,now,budget);if(!clock.draw){this.frameHandle=requestAnimationFrame(this.animate);return;}this.lastDraw=clock.time;}
  if(!this.paused&&!this.reducedMotion)this.life.tick(now);const motion=this.paused?null:this.tickHandoff(now);
  while(this.life.pins.length){const note=this.life.pins.shift();if(note.preview)continue;this.boardCards.push(note);this.boardCards=this.boardCards.slice(-8);this.pin.classList.add('has-notes');this.pin.setAttribute('aria-label',`Live task board: ${this.boardCards.length} recent assignments`);this.pin.title=this.boardCards.map(n=>`${n.workerName}: ${n.task}`).join('\n');}
  const labels=[];
  for(const d of this.characters){const a=d.life,chief=d.index===0,atHome=Math.hypot(a.pos[0]-a.home[0],a.pos[1]-a.home[1])<.1;let mode=a.mode;if(motion?.chief===d.agent.id)mode=motion.talking?'waiting':'walking';
   d.art.style.transform=mode==='walking'&&28*Math.sin(a.yaw)-19*Math.cos(a.yaw)<0?'scaleX(-1)':'';
   const frame=this.paused?(d.drawFrame||0):this.reducedMotion?0:Math.floor(now/(mode==='walking'?180:mode==='working'?340:1000));d.drawFrame=frame;const [column,row]=spriteFrame({mode,chief:chief||d.index===6&&mode==='desk',yaw:a.yaw,frame});const key=column+':'+row;if(key!==d.lastFrame){d.art.style.backgroundPosition=`${column/3*100}% ${row/3*100}%`;d.lastFrame=key;}
   const floor=this.project(a.pos),target=this.map?floor:poseAnchor(a,d.index,mode);
   // Blend only entry/exit from a seat; route movement and its label share one displayed position.
   if(d.previousMode!==mode){d.blendFrom=d.displayPoint?[d.displayPoint[0]-target[0],d.displayPoint[1]-target[1]]:[0,0];d.blendStarted=now;d.previousMode=mode;}
   const blend=this.reducedMotion?1:Math.min(1,((this.paused?this.pauseStarted:now)-d.blendStarted)/320),ease=blend*blend*(3-2*blend),x=target[0]+d.blendFrom[0]*(1-ease),y=target[1]+d.blendFrom[1]*(1-ease);d.displayPoint=[x,y];
   d.element.style.transform=`translate(${x}px,${y}px) translate(-50%,-88%)`;d.element.style.zIndex=String(mode==='walking'||mode==='waiting'?800:Math.round(floor[1]));d.element.dataset.pose=mode;d.element.classList.toggle('chief',chief);
   const label=attachedLabel(this.toScreen(x,y),this.scale*this.zoomLevel,Math.max(112,(d.agent.displayName||d.agent.name).length*6.2+34));labels.push({id:d.agent.id,...label,activity:motion?.chief===d.agent.id?(motion.talking?'Giving task':'Walking'):motion?.talking&&motion.worker===d.agent.id?'Receiving brief':activityLabel(mode),visible:true});
  }
  for(const {layer,index} of this.occluders){const d=this.characters[index];layer.hidden=index===0||!d||!['desk','working'].includes(d.life.mode)||Math.hypot(d.life.pos[0]-d.life.home[0],d.life.pos[1]-d.life.home[1])>.1;if(d&&index===0)layer.style.zIndex=String(Math.round(this.project(d.life.pos)[1])+1);}

  if(!this.paused&&!this.reducedMotion&&!this.occluded){this.dots.forEach((dot,i)=>{const {route,length}=this.dotRoutes[i],p=sampleReferenceRoute(route,((now/14000+i/6)%1)*length),[x,y]=this.project([p.x,p.z]);dot.style.transform=`translate(${x}px,${y}px)`;});}
  this.frames++;let measured;if(now-this.lastMeasure>1000){measured=Math.round(this.frames*1000/(now-this.lastMeasure));this.frames=0;this.lastMeasure=now;}
  this.onFrame?.(labels,measured,measured?{calls:0,triangles:0,geometries:0,textures:2,heapMiB:performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):null}:null);
  if(budget>=12)this.frameHandle=requestAnimationFrame(this.animate);else if(budget)this.timer=setTimeout(()=>{this.timer=null;this.frameHandle=requestAnimationFrame(this.animate);},Math.max(0,1000/budget-(performance.now()-now)));
 }
 toScreen(x,y){const zoom=this.zoomLevel;return [this.offset[0]+this.scale*(REFERENCE.width/2+(x-REFERENCE.width/2)*zoom),this.offset[1]+this.scale*(REFERENCE.height/2+(y-REFERENCE.height/2)*zoom)];}
}
