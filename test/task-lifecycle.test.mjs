import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, access, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { resetTeamTasks, discardPreviousInputs } from '../server/task-lifecycle.mjs';

test('new tasks clear previous team state and managed prompt data while preserving current uploads and originals', async t => {
  await mkdir(resolve('data'), { recursive: true });
  const root = await mkdtemp(resolve('data/fresh-task-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const docs = resolve(root, 'documents', 'old'), extractionDir = resolve(root, 'results');
  await mkdir(docs, { recursive: true }); await mkdir(extractionDir);
  const oldInput = resolve(docs, 'old.txt'), currentInput = resolve(docs, 'new.txt'), original = resolve(root, 'original.txt');
  for (const path of [oldInput, currentInput, original]) await writeFile(path, path);
  const name = 'image-prompts-20261101-000000-0123456789.txt';
  await writeFile(resolve(extractionDir, name), 'OLD PROMPTS');
  const tasks = new Map([['chief', { inputDocument: { path: oldInput }, documentPaths: [original, currentInput], artifacts: [{ name }] }], ['worker', { answer: 'OLD REPLY', artifacts: [{ name }] }], ['other', { answer: 'KEEP' }]]);
  const previous = resetTeamTasks(tasks, 'chief', [{ id: 'chief' }, { id: 'worker', reportsTo: 'chief' }]);
  assert.equal(tasks.has('chief'), false); assert.equal(tasks.has('worker'), false); assert.equal(tasks.get('other').answer, 'KEEP');
  await discardPreviousInputs(previous, { dataDir: root, extractionDir, keepPaths: [currentInput] });
  await assert.rejects(access(oldInput)); await assert.rejects(access(resolve(extractionDir, name)));
  assert.equal(await readFile(currentInput, 'utf8'), currentInput); assert.equal(await readFile(original, 'utf8'), original);
});
