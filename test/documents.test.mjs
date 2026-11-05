import test from 'node:test';import assert from 'node:assert/strict';import {Readable} from 'node:stream';import {mkdtemp,rm,readFile,mkdir,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import {receiveDocuments,artifactFile,prepareChiefDirection,collectArtifacts,missingPromptKinds,exportArtifacts} from '../server/documents.mjs';import {testProfiles} from './fixtures.mjs';
test('document attachments preserve file order and content; artifacts require a known task',async t=>{
 await mkdir(resolve('data'),{recursive:true});const root=await mkdtemp(resolve('data/doc-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const form=new FormData();form.append('documents',new Blob(['first']), 'b-first.txt');form.append('documents',new Blob(['second']), 'a-second.md');
 const request=new Request('http://localhost',{method:'POST',body:form});const req=Readable.from([Buffer.from(await request.arrayBuffer())]);req.headers={'content-type':request.headers.get('content-type')};
 const files=await receiveDocuments(req,root);assert.deepEqual(files.map(f=>f.name),['b-first.txt','a-second.md']);assert.equal(await readFile(files[0].path,'utf8'),'first');
 assert.equal(await artifactFile('../../secret.env',new Map()),null);
});
test('large pasted scene text is preserved as a document without changing ordinary directions',async t=>{
 await mkdir(resolve('data'),{recursive:true});const root=await mkdtemp(resolve('data/paste-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const ordinary='Please explain how the team works.';assert.deepEqual(await prepareChiefDirection(ordinary,root,[],testProfiles),{message:ordinary});
 const body='Scene 01\nImage Prompt: '+ 'اصل text. '.repeat(8000)+'\nImage-to-Video Prompt: Exclude this.\nVoice: Exclude this too.\n';
 const prepared=await prepareChiefDirection(body,root,[],testProfiles);assert.equal(await readFile(prepared.inputDocument.path,'utf8'),body);assert(prepared.message.includes(prepared.inputDocument.path.replaceAll('\\','\\\\')));assert(prepared.message.length<1000);
 const withInstruction=await prepareChiefDirection('Keep the prompts in source order.\n'+body,root,[],testProfiles);assert(withInstruction.message.startsWith('Keep the prompts in source order.'));
});

test('video extraction routes current mixed text to the video specialist',async t=>{
 await mkdir(resolve('data'),{recursive:true});const root=await mkdtemp(resolve('data/video-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const body='Extract only video prompts.\nScene 1\nImage Prompt: Still image.\nImage-to-Video Prompt: Orbit slowly.\nVoice: Ignore.';
 const result=await prepareChiefDirection(body,root,[],testProfiles);assert(result.message.includes('test-video'));assert(result.message.includes('aether_video_documents'));assert.equal(await readFile(result.inputDocument.path,'utf8'),body);
 const videoOnly=await prepareChiefDirection('Scene 1\nVideo Prompt: New motion.',root,[],testProfiles);assert(videoOnly.message.includes('test-video'));
});

test('only Notepad TXT is offered; legacy results migrate without editing original prompts',async t=>{
 await mkdir(resolve('data'),{recursive:true});const root=await mkdtemp(resolve('data/txt-test-'));const before=process.env.HERMES_EXTRACTION_DIR;process.env.HERMES_EXTRACTION_DIR=root;
 t.after(async()=>{if(before===undefined)delete process.env.HERMES_EXTRACTION_DIR;else process.env.HERMES_EXTRACTION_DIR=before;await rm(root,{recursive:true,force:true});});
 const stem='image-prompts-20261101-000000-0123456789';const original={documents:[{document_order:1,source:'input.txt'}],items:[{document_order:1,scene:'Scene 10',original_block:'Image Prompt: اصل text!'}],warnings:[]};
 await writeFile(resolve(root,stem+'.json'),JSON.stringify(original));const artifacts=await collectArtifacts([stem+'.json',stem+'.md']);assert.equal(artifacts.length,1);assert.equal(artifacts[0].name,stem+'.txt');assert.equal(artifacts[0].label,'Download prompts · Notepad (.txt)');
 const tasks=new Map([['chief',{artifacts}]]);const file=await artifactFile(stem+'.txt',tasks);assert.equal(file.type,'text/plain; charset=utf-8');assert.equal(file.bytes.subarray(0,3).toString('hex'),'efbbbf');assert.equal(file.bytes.toString('utf8'),'\uFEFFاصل text!');assert.deepEqual(await collectArtifacts([stem+'.txt',stem+'.txt']),artifacts);assert.equal((await artifactFile(stem+'.txt',tasks)).bytes.toString('utf8'),'\uFEFFاصل text!');
 assert.equal(await artifactFile(stem+'.json',tasks),null);assert.equal(await artifactFile(stem+'.md',tasks),null);assert.deepEqual(JSON.parse(await readFile(resolve(root,stem+'.json'),'utf8')),original);
});
test('flattened BOTH request preserves source, selects both workers and separates destination from input',async t=>{
 await mkdir(resolve('data'),{recursive:true});const root=await mkdtemp(resolve('data/both-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const text='Use both agent, Agent Image and Agent video and extract images prompt and extract video and save them in notepad on this location, C:\\Users\\TestUser\\Downloads\\Video . Here are all scenes: Scene 01 Image Prompt: First image. Image-to-Video Prompt: First motion. Voice: Ignore.';
 const prepared=await prepareChiefDirection(text,root,[],testProfiles);assert.equal(prepared.promptKind,'both');assert.equal(prepared.outputDirectory,'C:\\Users\\TestUser\\Downloads\\Video');assert(prepared.message.includes('test-images'));assert(prepared.message.includes('test-video'));assert.equal(await readFile(prepared.inputDocument.path,'utf8'),text);assert.equal(await readFile(resolve(prepared.inputDocument.path,'..','.aether-prompt-kind'),'utf8'),'both');
 assert.deepEqual(missingPromptKinds('both',[{name:'image-prompts-20261101-000000-0123456789.txt'}]),['video']);assert.deepEqual(missingPromptKinds('both',[{name:'image-prompts-20261101-000000-0123456789.txt'},{name:'video-prompts-20261101-000000-0123456789.txt'}]),[]);
});
test('two output types export idempotently to the requested folder and duplicate generated copies are hidden',async t=>{
 await mkdir(resolve('data'),{recursive:true});const root=await mkdtemp(resolve('data/export-test-'));const prior=process.env.HERMES_EXTRACTION_DIR;process.env.HERMES_EXTRACTION_DIR=root;t.after(async()=>{if(prior===undefined)delete process.env.HERMES_EXTRACTION_DIR;else process.env.HERMES_EXTRACTION_DIR=prior;await rm(root,{recursive:true,force:true});});
 const names=['image-prompts-20261101-000000-0123456789.txt','video-prompts-20261101-000000-0123456789.txt','video-prompts-20261101-000001-0123456789.txt'];await writeFile(resolve(root,names[0]),'Image body');for(const name of names.slice(1))await writeFile(resolve(root,name),'Video body');
 const artifacts=await collectArtifacts(names);assert.equal(artifacts.length,2);const destination=resolve(root,'chosen-folder');await exportArtifacts(artifacts,destination);await exportArtifacts(artifacts,destination);assert.equal(await readFile(resolve(destination,names[0]),'utf8'),'Image body');assert.equal(await readFile(resolve(destination,names[1]),'utf8'),'Video body');
 await writeFile(resolve(destination,names[0]),'User existing content');await assert.rejects(exportArtifacts(artifacts,destination));assert.equal(await readFile(resolve(destination,names[0]),'utf8'),'User existing content');
});
