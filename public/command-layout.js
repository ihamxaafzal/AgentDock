export const ROOM={width:36,depth:31};
export const ISLANDS=[{x:-9.5,z:4.1,width:12,depth:2.4},{x:9.5,z:-3.3,width:12,depth:2.4}];
export const STATIONS=[[-6,-10.8],[-12.8,5.55],[-9.5,5.55],[-6.2,5.55],[6.2,-1.85],[9.5,-1.85],[12.8,-1.85]];
export const OFFICE_ZONES={coffee:[-15.2,-4.2],gaming:[12.5,10.3],chat:[9.2,11.8],board:[4.8,-13.3]};
export const ROOM_OBSTACLES=[
 {minX:-2.65,maxX:2.65,minZ:-2.65,maxZ:2.65},
 ...ISLANDS.map(d=>({minX:d.x-d.width/2-.25,maxX:d.x+d.width/2+.25,minZ:d.z-d.depth/2-.25,maxZ:d.z+d.depth/2+.25})),
 {minX:-8.25,maxX:-3.75,minZ:-10.25,maxZ:-7.75}
];
const inside=(p,r)=>p[0]>r.minX+.001&&p[0]<r.maxX-.001&&p[1]>r.minZ+.001&&p[1]<r.maxZ-.001;
// Shortest orthogonal aisle route. Endpoints inside furniture are tolerated for
// legacy saved positions; new stations and break areas sit outside every desk.
export function planOfficeRoute(start,end,rectangles=ROOM_OBSTACLES){
 const obstacles=rectangles.filter(r=>!inside(start,r)&&!inside(end,r));
 const xs=[...new Set([start[0],end[0],...obstacles.flatMap(r=>[r.minX,r.maxX])])].sort((a,b)=>a-b);
 const zs=[...new Set([start[1],end[1],...obstacles.flatMap(r=>[r.minZ,r.maxZ])])].sort((a,b)=>a-b);
 const nodes=new Map();for(let x=0;x<xs.length;x++)for(let z=0;z<zs.length;z++){const p=[xs[x],zs[z]];if(!obstacles.some(r=>inside(p,r)))nodes.set(x+':'+z,{p,x,z,cost:Infinity,previous:null});}
 const key=p=>xs.indexOf(p[0])+':'+zs.indexOf(p[1]),first=nodes.get(key(start)),last=nodes.get(key(end));
 if(!first||!last)return [start,end];first.cost=0;const open=[first],closed=new Set();
 while(open.length){open.sort((a,b)=>a.cost-b.cost);const current=open.shift();if(closed.has(current))continue;if(current===last)break;closed.add(current);
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const next=nodes.get((current.x+dx)+':'+(current.z+dz));if(!next||closed.has(next))continue;const middle=[(current.p[0]+next.p[0])/2,(current.p[1]+next.p[1])/2];if(obstacles.some(r=>inside(middle,r)))continue;const cost=current.cost+Math.abs(next.p[0]-current.p[0])+Math.abs(next.p[1]-current.p[1]);if(cost<next.cost){next.cost=cost;next.previous=current;open.push(next);}}
 }
 if(!Number.isFinite(last.cost))throw Error('No open aisle connects these positions.');
 const route=[];for(let n=last;n;n=n.previous)route.unshift(n.p);
 return route.filter((p,i)=>i===0||i===route.length-1||!((route[i-1][0]===p[0]&&p[0]===route[i+1][0])||(route[i-1][1]===p[1]&&p[1]===route[i+1][1])));
}
