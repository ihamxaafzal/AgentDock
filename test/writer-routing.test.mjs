import test from 'node:test';
import assert from 'node:assert/strict';
import {isWriterRequest,prepareWriterDirection,validateWriterResponse} from '../server/writer-routing.mjs';
import {prepareChiefDirection} from '../server/documents.mjs';
import {testProfiles} from './fixtures.mjs';

test('repeated opening markers preserve every narration paragraph in order',()=>{
 const paragraphs=[1,2,3].map(n=>`Paragraph ${n} begins. `+'This narration explains the current topic in clear spoken language. '.repeat(8).trim());
 const answer=paragraphs.map(p=>'[VOICEOVER]\n'+p).join('\n\n')+'\n[/VOICEOVER]\nSources: https://example.org/current-source';
 const checked=validateWriterResponse(answer);
 assert.equal(checked.narration,paragraphs.join('\n\n'));assert.equal(checked.formatRecovered,true);
 assert(checked.answer.includes('https://example.org/current-source'));assert(!checked.narration.includes('[VOICEOVER]'));
 assert.equal(validateWriterResponse(answer.replace('[/VOICEOVER]','')).narration,checked.narration);
 assert(validateWriterResponse('[VOICEOVER]\nToo short.\n[VOICEOVER]\nStill too short.\n[/VOICEOVER]').error);
});

test('a complete worker narration missing only its closing marker is recovered without counting notes',()=>{
 const voice='A current scientific story explains one mechanism in plain language. '.repeat(18).trim();
 const result=validateWriterResponse('[VOICEOVER]\n'+voice+'\nSources: https://example.org/actual-evidence\nWord count: 999');
 assert.equal(result.narration,voice);assert.equal(result.formatRecovered,true);assert(result.answer.includes('https://example.org/actual-evidence'));
 assert(!result.narration.includes('Word count'));assert(!validateWriterResponse('[VOICEOVER]Too short.').narration);
 const complete='[VOICEOVER]'+voice+'[/VOICEOVER]\nFormat: [VOICEOVER] and [/VOICEOVER]';
 assert.equal(validateWriterResponse(complete).narration,voice);
});

test('writer brief puts the real profile and tools inside the delegated task',()=>{
 const prepared=prepareWriterDirection('Write about the current topic',testProfiles);
 const example=JSON.parse(prepared.message.match(/Use delegate_task with this assignment: (\{.*\})\n\nCURRENT USER BRIEF:/s)[1]);
 assert.equal(example.tasks[0].profile,'test-narration');
 assert.deepEqual(example.tasks[0].toolsets,['web']);
 assert.equal(example.profile,undefined);
 assert.match(prepared.message,/Verify supplied factual claims/);
});
test('script writing routes before topic research without requiring extraction documents',async()=>{
 for(const message of ['Write a shocking medical narration about fevers.','Create a voiceover about octopuses.','Find an animal topic and write a 60 second voiceover.','Write a U.S. English script about this topic.','I need a 50-second medical script.']){assert(isWriterRequest(message));const p=await prepareChiefDirection(message,'unused',[],testProfiles);assert.equal(p.taskType,'narration');assert(p.message.includes('test-narration'));assert(!p.inputDocument);assert(!p.promptKind);}
 for(const message of ['Extract video prompts from this script.','Extract image prompts about medical facts.','Find 10 shocking medical topics.','Give 10 animal topic ideas for my scripts.','Research three ideas.'])assert(!isWriterRequest(message));
});
test('voiceover floor scales for requested duration and cannot be spoofed by claimed timing or notes',()=>{
 assert.equal(prepareWriterDirection('Write a script',testProfiles).minimumNarrationWords,150);
 assert.equal(prepareWriterDirection('Write a 90 second script',testProfiles).minimumNarrationWords,270);
 assert.equal(prepareWriterDirection('Write a 2 minute script',testProfiles).minimumNarrationWords,360);
 assert(validateWriterResponse('[VOICEOVER]Only a tiny script.[/VOICEOVER]\nProduction note: 180 words, 60 seconds. '+ 'notes '.repeat(300)).error);
 assert(validateWriterResponse('No complete narration').error);
 const script='A surprising detail changes how this ordinary story unfolds. '.repeat(18);const result=validateWriterResponse('[VOICEOVER]'+script+'[/VOICEOVER]\nSources: https://example.org/evidence');assert(!result.error);assert(result.estimatedSeconds.fast>=50);assert(result.answer.includes('https://example.org/evidence'));assert(!result.answer.includes('[VOICEOVER]'));
 const claimed=validateWriterResponse('[VOICEOVER]'+script+'[/VOICEOVER]\nEstimated 20 words for 10 seconds. Sources: https://example.org/evidence');assert(!claimed.answer.includes('Estimated 20 words'));assert(claimed.answer.includes('## Evidence links'));
 const wrapped=validateWriterResponse('[VOICEOVER] wrapper commentary '+ 'extra '.repeat(100)+'[VOICEOVER]'+script+'[/VOICEOVER]');assert.equal(wrapped.wordCount,result.wordCount);assert(!wrapped.answer.includes('wrapper commentary'));assert(!wrapped.answer.includes('[VOICEOVER]'));
});
