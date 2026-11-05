export function isWriterRequest(message) {
 const intro=String(message).split(/\b(?:scene|shot)\s*\d+|\b(?:image|video|image-to-video)\s+prompt\s*:/i)[0];
 if(/\bextract\b[\s\S]{0,100}\b(?:images?|video|voice|narration)\s*(?:prompts?|text)?\b/i.test(intro))return false;
 if(/\bscript[ -]?writer\b/i.test(intro))return true;
 const noun=/\b(?:scripts?|voice[ -]?overs?|narration)\b/i.test(intro);
 const writing=/\b(?:write|writing|create|make|draft|rewrite|compose)\b/i.test(intro);
 const discovery=/\b(?:topics?|ideas?|titles?)\b/i.test(intro)&&/\b(?:find|suggest|give|research|viral|trending)\b/i.test(intro);
 return noun&&(writing||!discovery&&!/\bscript[ -]?scout\b/i.test(intro)&&!/\b(?:explain|what is|meaning|define)\b/i.test(intro));
}
export function writerMinimumSeconds(message){
 const seconds=/\b(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)\b/i.exec(message),minutes=/\b(\d+(?:\.\d+)?)\s*(?:minutes?|mins?)\b/i.exec(message);
 return Math.max(50,seconds?Number(seconds[1]):minutes?Number(minutes[1])*60:50);
}
export function prepareWriterDirection(message,endpoints){
 const minimumSeconds=writerMinimumSeconds(message),minimumNarrationWords=Math.ceil(minimumSeconds*3);
 const endpoint=resolveCapability(endpoints,CAPABILITIES.narration);
 const task=delegatedTask(endpoint,CAPABILITIES.narration,'Write and verify the complete requested narration.','The current user brief and minimum word count are below.');
 return {taskType:'narration',requiredProfiles:[endpoint.id],minimumSeconds,minimumNarrationWords,message:`VOICE NARRATION REQUEST — Verify supplied factual claims with credible sources. Write concise, natural U.S. English narration with a truthful opening, 2–3 supported ideas, and a clear payoff. Target ${minimumNarrationWords+20}–${minimumNarrationWords+50} spoken words; at least ${minimumNarrationWords} words (${minimumSeconds} seconds estimated at 150–180 WPM). Return the complete narration between [VOICEOVER] and [/VOICEOVER], with sources after the closing tag. If the user also requests research or topic selection, use the research capability first and pass its current evidence to this worker. Do not invent sources, summarize the narration, or claim an exact recorded duration. Use delegate_task with this assignment: ${JSON.stringify({tasks:[task]})}\n\nCURRENT USER BRIEF:\n${message}`};
}
export function validateWriterResponse(answer,minimumWords=150){
 answer=String(answer||'');
 const count=text=>(text.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)||[]).length;
 const blocks=[...answer.matchAll(/\[VOICEOVER\]((?:(?!\[VOICEOVER\])[\s\S])*?)\[\/VOICEOVER\]/gi)];
 const cleanRepeated=body=>{
  const clean=body.replace(/^[ \t]*\[VOICEOVER\][ \t]*(?:\r?\n|$)/gim,'').trim();
  if(/\[\/?VOICEOVER\]|https?:\/\/|^\s*(?:#{1,6}\s*)?(?:Sources?|Evidence links|Production notes?|Word count)\s*:/im.test(clean))return null;
  return clean;
 };
 const candidates=[];
 for(const frame of answer.matchAll(/\[VOICEOVER\]([\s\S]*?)\[\/VOICEOVER\]/gi)){
  if(/\[VOICEOVER\]/i.test(frame[1])){
   const repaired=cleanRepeated(frame[1]);
   if(repaired&&count(repaired)>=minimumWords){candidates.push({frame,narration:repaired,recovered:true});continue;}
   const inner=[...frame[0].matchAll(/\[VOICEOVER\]((?:(?!\[VOICEOVER\])[\s\S])*?)\[\/VOICEOVER\]/gi)].filter(m=>count(m[1])>=minimumWords).at(-1);
   if(inner)candidates.push({frame,narration:inner[1].trim(),recovered:false});
  }else if(count(frame[1])>=minimumWords)candidates.push({frame,narration:frame[1].trim(),recovered:false});
 }
 const match=candidates.at(-1);
 let narration,after,formatRecovered=false;
 if(match){narration=match.narration;after=answer.slice(match.frame.index+match.frame[0].length).trim();formatRecovered=match.recovered;}
 else{
  const opening=/^\s*(?:```[^\n]*\n)?\[VOICEOVER\]\s*/i.exec(answer);
  if(opening&&!blocks.length){
   const tail=answer.slice(opening[0].length);
   const stop=/\n\s*(?:```|Sources?\s*:|Evidence links\s*:|Production note\s*:|\*{0,2}(?:Word count|Estimated duration|Script stats)\b)/i.exec(tail);
   const body=cleanRepeated(stop?tail.slice(0,stop.index):tail);
   if(body&&count(body)>=minimumWords){narration=body;after=stop?tail.slice(stop.index):'';formatRecovered=true;}
  }
 }
 if(!narration){
  const short=blocks.at(-1);
  return short?{error:`Narration is too short: ${count(short[1])} spoken words; at least ${minimumWords} required.`,wordCount:count(short[1])}:{error:'The narration worker did not return the complete narration in the required voiceover block. Inspect before retrying.'};
 }
 const wordCount=count(narration);
 const sources=[...new Set((after.match(/https?:\/\/[^\s<>\"'`]+/g)||[]).map(url=>url.replace(/[).,;]+$/,'')))];
 const estimatedSeconds={fast:Math.floor(wordCount/180*60),relaxed:Math.ceil(wordCount/150*60)};
 return {narration,wordCount,estimatedSeconds,formatRecovered,answer:`## Voiceover\n\n${narration}\n\n---\nProduction note: ${wordCount} spoken words · estimated ${estimatedSeconds.fast}–${estimatedSeconds.relaxed} seconds at 150–180 WPM. Actual recorded timing depends on delivery.${sources.length?'\n\n## Evidence links\n'+sources.map(url=>'- '+url).join('\n'):''}`};
}
import { CAPABILITIES, delegatedTask, resolveCapability } from './profile-capabilities.mjs';
