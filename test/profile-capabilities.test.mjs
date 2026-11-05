import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CAPABILITIES, delegatedTask, resolveCapability } from '../server/profile-capabilities.mjs';
import { readEndpoints } from '../server/adapter.mjs';
import { testProfiles } from './fixtures.mjs';

test('capability routing uses the configured Hermes profile and built-in tool mapping', () => {
  const endpoint = resolveCapability(testProfiles, CAPABILITIES.images);
  assert.equal(endpoint.id, 'images');
  assert.deepEqual(delegatedTask(endpoint, CAPABILITIES.images, 'Extract prompts', 'Use current input'), {
    profile: 'test-images', toolsets: ['aether_documents'], goal: 'Extract prompts', context: 'Use current input'
  });
});

test('missing and ambiguous capabilities fail before work is dispatched', () => {
  assert.throws(() => resolveCapability(testProfiles, 'unknown'), /No Hermes profile is assigned/);
  assert.throws(() => resolveCapability([...testProfiles, { ...testProfiles[1], id: 'images-two' }], CAPABILITIES.images), /More than one Hermes profile/);
});

test('endpoint configuration rejects unsupported capability names and duplicate coordinators', () => {
  const base = { id: 'worker', name: 'Worker', profile: 'worker', url: 'http://127.0.0.1:8642/p/worker', key: 'key' };
  assert.throws(() => readEndpoints({ HERMES_AGENTS: JSON.stringify([{ ...base, capabilities: ['private-role-name'] }]) }), /supported capability IDs/);
  assert.throws(() => readEndpoints({ HERMES_AGENTS: JSON.stringify([
    { ...base, id: 'one', nativeCoordinator: true },
    { ...base, id: 'two', profile: 'other', nativeCoordinator: true }
  ]) }), /at most one Hermes endpoint/);
});

test('the published environment template parses with its generic sample profiles', async () => {
  const template = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
  const value = /^HERMES_AGENTS='([^'\r\n]+)'$/m.exec(template)?.[1];
  assert.ok(value);
  const endpoints = readEndpoints({ HERMES_AGENTS: value });
  assert.equal(endpoints.find(endpoint => endpoint.nativeCoordinator)?.id, 'coordinator');
  assert.deepEqual(endpoints.find(endpoint => endpoint.id === 'worker-one').capabilities, ['topic-research']);
});
