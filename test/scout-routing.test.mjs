import test from 'node:test';
import assert from 'node:assert/strict';
import { isScoutRequest } from '../server/scout-routing.mjs';
import { prepareChiefDirection } from '../server/documents.mjs';
import {testProfiles} from './fixtures.mjs';

test('medical and animal topic requests delegate to Scout without requiring documents or extraction files', async()=>{
 for (const message of ['Find 10 surprising medical topics for my fact video.', 'Suggest 5 nature and animal facts for reels.', 'Give me topic titles about parasites.', 'Research three ideas about space.']) {
  assert(isScoutRequest(message));const result=await prepareChiefDirection(message,'unused',[],testProfiles);
  assert.equal(result.taskType,'research');assert.equal(result.promptKind,undefined);assert.equal(result.inputDocument,undefined);
  assert(result.message.includes('profile":"test-research'));assert(result.message.includes(message));
 }
});
test('Scout routing does not hijack existing image, video or both extraction requests',()=>{
 for (const message of ['Extract image prompts from these animal facts. Scene 01 Image Prompt: An owl.', 'Extract video prompts about viral animal topics. Scene 01 Video Prompt: Pan.', 'Use both workers to extract image and video prompts. Scene 01 Image Prompt: Body.', 'Hello there.']) assert.equal(isScoutRequest(message),false);
});
