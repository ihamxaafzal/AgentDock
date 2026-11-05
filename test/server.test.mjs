import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('local bridge blocks unauthorized writes and foreign origins', async t => {
  const port = 49317;
  const child = spawn(process.execPath, [fileURLToPath(new URL('../server/index.mjs', import.meta.url))], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  t.after(() => child.kill());
  await Promise.race([once(child.stdout, 'data'), new Promise((_, reject) => { const timeout = setTimeout(() => reject(new Error('Server startup timed out')), 5000); timeout.unref(); })]);
  const base = `http://127.0.0.1:${port}`;
  assert.equal((await fetch(base)).status, 200);
  assert.equal((await fetch(base + '/api/tasks', { method: 'POST', body: '{}' })).status, 403);
  assert.equal((await fetch(base + '/api/bootstrap', { headers: { Origin: 'https://untrusted.example' } })).status, 403);
  const bootstrap = await (await fetch(base + '/api/bootstrap')).json();
  const headers = { 'X-Aether-Token': bootstrap.token, 'Content-Type': 'application/json' };
  assert.equal((await fetch(base + '/api/tasks', { method: 'POST', headers, body: JSON.stringify({ message: 'test', approved: false }) })).status, 400);
  assert.equal((await fetch(base + '/api/tasks', { method: 'POST', headers, body: JSON.stringify({ message: '', approved: true }) })).status, 400);
  assert.equal((await fetch(base + '/vendor/nonexistent.js')).status, 404);
  assert.equal((await fetch(base + '/vendor/three.module.js')).status, 200);
  assert.equal((await fetch(base + '/api/tasks', { headers })).status, 200);
  assert.equal((await fetch(base + '/api/hardware')).status,403);
  const hardware=await(await fetch(base+'/api/hardware',{headers})).json();assert(hardware.ram.totalBytes>0);assert(hardware.ram.usedBytes<=hardware.ram.totalBytes);assert(Array.isArray(hardware.gpus));
});

test('browser bridge accepts concurrent missions and queues overflow without replacing results', async t => {
  const longMessage = 'Inspect this test ' + 'م'.repeat(25000);
  let release;
  let calls = 0;
  let active=0,peak=0;
  const wait = new Promise(resolve => { release = resolve; });
  const mock = http.createServer(async (req, res) => {
    assert.equal(req.headers.authorization, 'Bearer integration-secret');
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/v1/models') return res.end(JSON.stringify({ data: [{ id: 'hermes-agent' }] }));
    assert.equal(req.url, '/v1/chat/completions');
    let body = ''; for await (const part of req) body += part;
    assert.equal(JSON.parse(body).messages[0].content, longMessage);
    assert.match(req.headers['x-hermes-session-id'], /^aether-/);
    calls++;
    active++;peak=Math.max(peak,active);
    await wait;
    active--;
    res.end(JSON.stringify({ choices: [{ message: { content: 'Mock task complete' }, finish_reason: 'stop' }], usage: { total_tokens: 123 } }));
  });
  mock.listen(0, '127.0.0.1'); await once(mock, 'listening');
  t.after(() => { release(); mock.closeAllConnections(); mock.close(); });
  const port = 49318;
  const dataDir=await mkdtemp(join(tmpdir(),'aether-missions-'));
  const child = spawn(process.execPath, [fileURLToPath(new URL('../server/index.mjs', import.meta.url))], {
    env: { ...process.env, AETHER_CONCURRENT_MISSIONS:'2', AETHER_DATA_DIR:dataDir, PORT: String(port), HERMES_AGENTS: '', HERMES_API_URL: `http://127.0.0.1:${mock.address().port}`, HERMES_API_KEY: 'integration-secret' },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
  });
  t.after(async () => {if(child.exitCode===null&&child.signalCode===null){const ended=once(child,'exit');child.kill();await ended;}await rm(dataDir,{recursive:true,force:true});});
  await Promise.race([once(child.stdout, 'data'), new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Server startup timed out')), 5000); timer.unref(); })]);
  const base = `http://127.0.0.1:${port}`;
  const bootstrap = await (await fetch(base + '/api/bootstrap')).json();
  assert.equal(bootstrap.backend, 'hermes');
  const headers = { 'X-Aether-Token': bootstrap.token, 'Content-Type': 'application/json' };
  const status = await (await fetch(base + '/api/status', { headers })).json();
  assert.equal((await fetch(base+'/api/settings',{method:'POST',headers,body:JSON.stringify({approved:true,concurrency:0})})).status,400);
  assert.equal((await fetch(base+'/api/settings',{method:'POST',headers,body:JSON.stringify({approved:true,concurrency:2})})).status,200);
  assert.equal((await fetch(base+'/api/tasks',{method:'POST',headers,body:JSON.stringify({agentId:'hermes',approved:true,message:'Task 1: Write after Task 2.\nTasks 2: Write after Task 1.'})})).status,400);
  assert.equal(status.connected, true); assert.equal(status.agents.length, 1);
  assert.equal(JSON.stringify(status).includes('integration-secret'), false);
  const send = agentId => fetch(base + '/api/tasks', { method: 'POST', headers, body: JSON.stringify({ agentId, message: longMessage, approved: true }) });
  assert.equal((await send('invented')).status, 400); assert.equal(calls, 0);
  assert.equal((await send('hermes')).status, 202);
  assert.equal((await send('hermes')).status, 202);
  const queued=await send('hermes');assert.equal(queued.status,202);
  assert.equal((await queued.json()).status,'queued');
  release();
  let task;
  for (let i = 0; i < 50; i++) {
    task = (await (await fetch(base + '/api/tasks', { headers })).json()).tasks.hermes;
    const all=(await(await fetch(base+'/api/tasks',{headers})).json()).missions;
    if(all.length===3&&all.every(t=>t.status==='completed'))break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  task=(await(await fetch(base+'/api/tasks',{headers})).json()).tasks.hermes;
  assert.equal(task.status, 'completed'); assert.equal(task.answer, 'Mock task complete'); assert.equal(task.tokens, 123); assert.equal(calls, 3);assert.equal(peak,2);
  const all=(await(await fetch(base+'/api/tasks',{headers})).json()).missions;
  assert.equal(new Set(all.map(m=>m.sessionId)).size,3);assert(all.every(m=>m.answer==='Mock task complete'));
});
