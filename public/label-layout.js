// Keep floating name cards inside the room viewport when several bots meet.
export function placeRoomLabels(labels,width,height,reserved=[]){
 const left=width>=1500?248:width>1000?224:width>700?196:160;
 const placed=[],gap=8,minBottom=142,maxBottom=height-78;
 const overlap=(a,b)=>Math.abs(a.x-b.x)<(a.width+b.width)/2+gap&&Math.abs(a.y-b.y)<58+gap;
 for(const label of labels){
  if(!label.visible)continue;
  label.width=Math.min(label.width||174,Math.max(100,width-left-24));
  const anchor={x:label.x,y:label.y},candidates=[];
  for(const dy of [0,-66,66,-132,132,-198,198])for(const dx of [0,-.85,.85,-1.7,1.7]){
   const x=Math.max(left+label.width/2,Math.min(width-16-label.width/2,anchor.x+dx*label.width));
   const y=Math.max(minBottom,Math.min(maxBottom,anchor.y+dy));
   const card={x,y,width:label.width};
   const monitorWidth=width>=1500?360:width>1000?330:width>700?290:220;
   const underMonitor=width>700&&x+label.width/2>width-24-monitorWidth&&y-58<198&&y>86;
   candidates.push({...card,cost:(x-anchor.x)**2+(y-anchor.y)**2,collisions:placed.filter(p=>overlap(card,p)).length+(underMonitor?2:0)+reserved.filter(r=>x+label.width/2>r.left&&x-label.width/2<r.right&&y>r.top&&y-58<r.bottom).length*3});
  }
  candidates.sort((a,b)=>a.collisions-b.collisions||a.cost-b.cost);
  const best=candidates[0];label.x=best.x;label.y=best.y;placed.push(best);
 }
 return labels;
}
