import {mkdir,readFile,writeFile,stat} from 'node:fs/promises';
import {resolve,extname,join} from 'node:path';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {CAPABILITIES,delegatedTask,resolveCapability} from './profile-capabilities.mjs';
export function flowSettings(){return {mode:'Image',aspectRatio:'9:16',model:'Nano Banana 2.1',outputs:1,chromeProfile:process.env.AETHER_FLOW_CHROME_PROFILE||'Default',chromeExecutable:process.env.AETHER_FLOW_CHROME_EXECUTABLE||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'};}
export function flowOutput(){return resolve(process.env.AETHER_IMAGE_OUTPUT_DIR||join(homedir(),'Pictures','AgentDock'));}
export function isImageGenerationRequest(message){const intro=message.split(/\n\s*\n|\b(?:Image Prompt|Scene\s*\d+)\s*:/i)[0];return /\bgoogle\s+flow\b|\bflow\.google\.com\b/i.test(intro)||/\b(?:using|via|on|in|use)\s+flow\b/i.test(intro)&&/\b(?:images?|projects?)\b/i.test(intro)||/\b(?:create|generate)\b[\s\S]{0,65}\bimages?\b/i.test(intro);}
export function parseImagePrompts(text){
 text=String(text).replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').trim();
 const labelled=[...text.matchAll(/^(?:Image\s+Prompt|Prompt\s*\d+)\s*:\s*/gim)];
 const prompts=labelled.length?labelled.map((m,i)=>text.slice(m.index+m[0].length,labelled[i+1]?.index??text.length).split(/\n(?:Image.to.Video Prompt|Video Prompt|Voiceover|Narration|Scene\s*\d+)\s*:/i)[0].trim()):text.split(/\n\s*\n/).map(s=>s.trim()).filter(Boolean);
 if(!prompts.length||prompts.some(p=>p.length<25))throw Error('Supply image prompts separated by blank lines, or Image Prompt: labels. Each prompt must contain at least 25 characters.');
 return prompts;
}
export async function prepareImageGenerationDirection(message,directory,documents=[],existingJobPath,endpoints){
 if(existingJobPath){const job=JSON.parse(await readFile(existingJobPath,'utf8'));if(job.aether_flow_job!==1)throw Error('Invalid existing Flow job.');return imageGenerationBrief(job,existingJobPath,endpoints);}
 const explicit=[...message.matchAll(/[A-Za-z]:[\\/][^"\r\n]+?\.(?:txt|md)\b/gi)].map(m=>m[0]);
 const paths=[...new Set(documents.length?documents:explicit)],prompts=[];
 if(paths.length){for(const path of paths){if(!['.txt','.md'].includes(extname(path).toLowerCase()))throw Error('The image-generation workflow accepts a TXT or Markdown prompt list.');prompts.push(...parseImagePrompts(await readFile(path,'utf8')));}}
 else {const content=message.split(/\b(?:prompts?|images?)\s*:\s*/i).slice(1).join('Prompt: ');if(!content.trim())throw Error('Attach a TXT prompt list, or write Generate Images followed by Prompts: and your blank-line separated prompts.');prompts.push(...parseImagePrompts(content));}
 const id='flow-'+randomUUID(),folder=resolve(directory,id);await mkdir(folder,{recursive:true});
 const outputDirectory=join(flowOutput(),id),jobPath=resolve(folder,'flow-image-job.json');
 const job={aether_flow_job:1,id,createdAt:Date.now(),status:'pending',settings:flowSettings(),outputDirectory,projectUrl:null,items:prompts.map((prompt,i)=>({number:i+1,prompt,status:'pending'}))};
 await writeFile(jobPath,JSON.stringify(job,null,2));
 return imageGenerationBrief(job,jobPath,endpoints);
}
function imageGenerationBrief(job,jobPath,endpoints){
 const endpoint=resolveCapability(endpoints,CAPABILITIES.imageGeneration);
 const goal='Generate and save every image in the current Flow image job, in original order. Read the job with read_flow_image_job. Never report completion unless every numbered image has been downloaded and recorded.';
 const context='CURRENT JOB PATH: '+jobPath+'\nUse Google Flow in Chrome profile '+job.settings.chromeProfile+' only (browser executable: '+job.settings.chromeExecutable+'). Create a NEW project per batch, set Image, 9:16, Nano Banana 2.1, x1 before generating. One prompt at a time. Use the profile SOUL workflow and aether_flow tools. Preserve exact prompt wording. If browser access/login/credits/model is unavailable, pause_flow_image_job with the actual reason; do not substitute another model, spend credits on an upgrade, bypass challenges, or claim image creation. Resume pending items only.';
 const task=delegatedTask(endpoint,CAPABILITIES.imageGeneration,goal,context);
 return {taskType:'image-creation',requiredProfiles:[endpoint.id],flowJobPath:jobPath,imageCount:job.items.length,message:'This is actual image generation, not prompt extraction. Use delegate_task with exactly '+JSON.stringify({tasks:[task]})+'\nWait for the worker. Return the saved image count and exact output folder, or report its blocking reason. Respond in concise U.S. English.'};
}
export async function verifyImageGenerationResult(task){
 const job=JSON.parse(await readFile(task.flowJobPath,'utf8'));
 if(job.aether_flow_job!==1||job.status!=='completed'||!job.items.length||job.items.some(i=>i.status!=='saved'))throw Error(job.reason||'The image-generation job has not saved every image. Inspect the Flow job before retrying.');
 for(const item of job.items){if(!item.savedPath?.startsWith(job.outputDirectory+'\\')&&!item.savedPath?.startsWith(job.outputDirectory+'/'))throw Error('An image path is outside this batch folder.');if(!(await stat(item.savedPath)).isFile())throw Error('A recorded image is missing from disk.');}
 return {answer:`${job.items.length} images created and saved in prompt order.\n\nFolder: ${job.outputDirectory}\n\n${job.items.map(i=>String(i.number).padStart(3,'0')+' · '+i.savedPath).join('\n')}`,imageCount:job.items.length,imageOutputDirectory:job.outputDirectory};
}
