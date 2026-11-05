// Ground footprints in the approved artwork. Walking uses these, not sprite bounding boxes.
const ellipse=(x,y,rx,ry)=>Array.from({length:16},(_,i)=>[x+rx*Math.cos(i*Math.PI/8),y+ry*Math.sin(i*Math.PI/8)]);
export const FLOOR=[[746,260],[1649,582],[1149,892],[805,820],[265,483]];
export const FIXTURES=[
 {id:'left-desks-and-chairs',polygon:[[455,404],[809,533],[875,633],[814,692],[363,529],[363,476]]},
 {id:'right-desks-and-chairs',polygon:[[1138,424],[1428,539],[1503,630],[1455,690],[1050,543],[1050,492]]},
 {id:'chief-podium',polygon:[[808,353],[921,395],[982,356],[868,318]]},
 {id:'coffee-counter',polygon:[[309,397],[491,362],[479,339],[302,374]]},
 {id:'coffee-stool-left',polygon:ellipse(533,363,18,14)},
 {id:'coffee-table',polygon:ellipse(598,346,24,17)},
 {id:'coffee-stool-right',polygon:ellipse(638,350,17,14)},
 {id:'brain-base',polygon:ellipse(931,528,64,45)},
 {id:'lounge-left-seat',polygon:ellipse(1090,758,43,27)},
 {id:'lounge-right-seat',polygon:ellipse(1315,752,43,28)},
 {id:'lounge-table',polygon:ellipse(1191,751,49,34)},
 {id:'plant-podium',polygon:ellipse(1019,340,22,17)},
 {id:'plant-back',polygon:ellipse(1125,383,22,18)},
 {id:'plant-window',polygon:ellipse(1257,403,24,18)},
 {id:'plant-front',polygon:ellipse(1444,752,31,24)}
];
const CELL=10,CLEARANCE=12,COLS=168,ROWS=95;
export function inPolygon([x,y],polygon){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
const segmentDistance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dy*t);};
export function edgeDistance(point,polygon){let min=Infinity;for(let i=0;i<polygon.length;i++)min=Math.min(min,segmentDistance(point,polygon[i],polygon[(i+1)%polygon.length]));return min;}
export function clearFloor(point,clearance=CLEARANCE){return inPolygon(point,FLOOR)&&edgeDistance(point,FLOOR)>=clearance&&FIXTURES.every(f=>!inPolygon(point,f.polygon)&&edgeDistance(point,f.polygon)>=clearance);}
const walkable=new Uint8Array(COLS*ROWS),point=id=>[(id%COLS)*CELL,Math.floor(id/COLS)*CELL];
for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++)walkable[y*COLS+x]=+clearFloor([x*CELL,y*CELL],CLEARANCE+7.2);
// Discard isolated slivers between furniture. A destination must be reachable from the main aisle.
const visited=new Uint8Array(walkable.length);let largest=[];
for(let root=0;root<walkable.length;root++)if(walkable[root]&&!visited[root]){const component=[root];visited[root]=1;for(let at=0;at<component.length;at++){const id=component[at],x=id%COLS,y=Math.floor(id/COLS);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const nx=x+dx,ny=y+dy,n=ny*COLS+nx;if(nx<0||nx>=COLS||ny<0||ny>=ROWS||!walkable[n]||visited[n]||dx&&dy&&!clearFloor([(x+dx*.5)*CELL,(y+dy*.5)*CELL]))continue;visited[n]=1;component.push(n);}}if(component.length>largest.length)largest=component;}
walkable.fill(0);for(const id of largest)walkable[id]=1;
const cell=([x,y])=>Math.max(0,Math.min(ROWS-1,Math.round(y/CELL)))*COLS+Math.max(0,Math.min(COLS-1,Math.round(x/CELL)));
const gridClear=p=>!!walkable[cell(p)];
function lineClear(a,b){const steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/4);for(let i=0;i<=steps;i++){const t=steps?i/steps:0;if(!gridClear([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]))return false;}return true;}
export function nearestFloor(point){if(clearFloor(point)&&gridClear(point))return [...point];let best=null,cost=Infinity;for(let id=0;id<walkable.length;id++)if(walkable[id]){const p=pointFor(id),d=(p[0]-point[0])**2+(p[1]-point[1])**2;if(d<cost){best=p;cost=d;}}if(!best)throw Error('No clear room floor.');return best;}
const pointFor=id=>point(id);
class Heap{constructor(){this.items=[];}push(id,score){const n={id,score},a=this.items;a.push(n);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p].score<=score)break;a[i]=a[p];i=p;}a[i]=n;}pop(){const a=this.items,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1].score<a[c].score)c++;if(a[c].score>=last.score)break;a[i]=a[c];i=c;}a[i]=last;}return first;}get length(){return this.items.length;}}
export function floorRoute(start,end){
 const a=nearestFloor(start),b=nearestFloor(end);if(lineClear(a,b))return [a,b];
 const first=cell(a),last=cell(b),costs=new Float64Array(walkable.length).fill(Infinity),previous=new Int32Array(walkable.length).fill(-1),closed=new Uint8Array(walkable.length),open=new Heap();costs[first]=0;open.push(first,0);
 while(open.length){const {id}=open.pop();if(closed[id])continue;if(id===last)break;closed[id]=1;const x=id%COLS,y=Math.floor(id/COLS);
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const nx=x+dx,ny=y+dy;if(nx<0||nx>=COLS||ny<0||ny>=ROWS)continue;const next=ny*COLS+nx;if(!walkable[next]||closed[next]||dx&&dy&&!clearFloor([(x+dx*.5)*CELL,(y+dy*.5)*CELL]))continue;const cost=costs[id]+(dx&&dy?Math.SQRT2:1);if(cost<costs[next]){costs[next]=cost;previous[next]=id;open.push(next,cost+Math.hypot(nx-last%COLS,ny-Math.floor(last/COLS)));}}
 }
 if(!Number.isFinite(costs[last]))throw Error('No furniture-safe aisle connects these positions.');
 const raw=[];for(let id=last;id!==-1;id=previous[id])raw.unshift(point(id));raw[0]=a;raw[raw.length-1]=b;
 const route=[raw[0]];let current=0;while(current<raw.length-1){let next=raw.length-1;while(next>current+1&&!lineClear(raw[current],raw[next]))next--;route.push(raw[next]);current=next;}return route;
}
