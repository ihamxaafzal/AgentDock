import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { readEndpoints, normalizeRoster, readRoster, sendTask, request, readCompletionStream, recoverTask } from '../server/adapter.mjs';

test('endpoint configuration validates keys, loopback URLs and unique identities', () => {
  assert.equal(readEndpoints({ HERMES_API_KEY: 'test-key' })[0].url, 'http://127.0.0.1:8642/v1');
  assert.equal(readEndpoints({ HERMES_API_KEY: 'test-key', HERMES_API_URL: 'http://localhost:9000/v1/' })[0].url, 'http://localhost:9000/v1');
  assert.throws(() => readEndpoints({}), /HERMES_API_KEY/);
  assert.throws(() => readEndpoints({ HERMES_AGENTS: 'bad' }), /JSON array/);
  for (const url of ['https://remote.example','http://user:pass@localhost:8642','http://localhost:8642/other','file:///tmp']) {
    assert.throws(() => readEndpoints({ HERMES_API_KEY: 'key', HERMES_API_URL: url }));
  }
  assert.throws(() => readEndpoints({ HERMES_AGENTS: JSON.stringify([{id:'a',url:'http://localhost',key:'k'},{id:'a',url:'http://localhost',key:'k'}]) }), /unique/);
});

test('roster reports only known task state and request usage', () => {
  const profiles = [{ id:'a', name:'Alpha', model:'profile-a' }, { id:'b', name:'Beta', model:'profile-b' }];
  const roster = normalizeRoster(profiles, new Map([['a', {status:'running',message:'inspect',startedAt:Date.now()}]]));
  assert.equal(roster[0].status,'working'); assert.equal(roster[1].status,'unknown');
  assert.equal(roster[1].sessions,null); assert.equal(roster[1].tokens,null);
  assert.equal(roster[0].progress,null);
  assert.equal(normalizeRoster(profiles,new Map([['a',{status:'failed',tokens:42}]]))[0].tokens,42);
});

test('Hermes protocol discovery, dispatch, partial replies and sanitized failures', async t => {
  let mode = 'ok', seen;
  const mock = http.createServer(async (req,res) => {
    assert.equal(req.headers.authorization,'Bearer private-test-key');
    res.setHeader('Content-Type','application/json');
    if(mode==='auth') {res.writeHead(401); return res.end(JSON.stringify({secret:'private-test-key'}));}
    if(mode==='redirect') {res.writeHead(302,{Location:'http://remote.example'}); return res.end();}
    if(mode==='bad') return res.end('broken');
    if(mode==='slow') return setTimeout(()=>res.end('{}'),100);
    if(req.url==='/v1/models') return res.end(JSON.stringify({data:[{id:'my-profile'},{id:'another-model'}]}));
    let body=''; for await (const chunk of req) body+=chunk;
    seen={body:JSON.parse(body),headers:req.headers};
    res.end(JSON.stringify({choices:[{message:{content:'Inspected.'},finish_reason:mode==='partial'?'length':mode==='error'?'error':mode==='cancelled'?'cancelled':'stop'}],usage:{total_tokens:42}}));
  });
  mock.listen(0,'127.0.0.1'); await once(mock,'listening');
  t.after(()=>{mock.closeAllConnections(); mock.close();});
  const previous = {...process.env};
  process.env.HERMES_API_URL=`http://127.0.0.1:${mock.address().port}/v1`;
  process.env.HERMES_API_KEY='private-test-key'; delete process.env.HERMES_AGENTS;
  t.after(()=>{ for(const key of ['HERMES_API_URL','HERMES_API_KEY','HERMES_AGENTS']) {if(previous[key]===undefined) delete process.env[key]; else process.env[key]=previous[key];} });
  const roster = await readRoster(new Map());
  assert.equal(roster.length,1); assert.equal(roster[0].model,'my-profile');
  assert.equal(JSON.stringify(roster).includes('private-test-key'),false);
  const result=await sendTask('hermes','Inspect only','aether-test');
  assert.equal(result.status,'completed'); assert.equal(result.answer,'Inspected.'); assert.equal(result.tokens,42);
  assert.deepEqual(seen.body,{messages:[{role:'user',content:'Inspect only'}],stream:true,stream_options:{include_usage:true}});
  assert.equal(seen.headers['x-hermes-session-id'],'aether-test'); assert.equal(seen.headers['idempotency-key'],'aether-test');
  for(mode of ['partial','error','cancelled']) {const result=await sendTask('hermes','Inspect','new-id');assert.equal(result.status,'failed');assert.equal(result.answer,'Inspected.');}
  mode='auth'; await assert.rejects(readRoster(new Map()), error=>/authentication/.test(error.message)&&!error.message.includes('private-test-key'));
  mode='bad'; await assert.rejects(readRoster(new Map()),/invalid JSON/);
  mode='redirect'; await assert.rejects(readRoster(new Map()),/Cannot reach/);
  mode='slow'; await assert.rejects(request(readEndpoints()[0],'/models',{timeout:10}),/timed out/);
});


test('streams tool activity and Unicode reply text, and requires terminal completion', async () => {
  const updates=[];
  const frames=': keepalive\n\nevent: hermes.tool.progress\ndata: {"tool":"terminal"}\n\ndata: {"choices":[{"delta":{"content":"Done م"},"finish_reason":null}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"total_tokens":99}}\n\ndata: [DONE]\n\n';
  async function* bytes(text) { for(const b of Buffer.from(text)) yield Uint8Array.of(b); }
  const result=await readCompletionStream(bytes(frames), update=>updates.push(update));
  assert.equal(result.choices[0].message.content,'Done م');
  assert.equal(result.usage.total_tokens,99);
  assert.match(updates[0].progressNote,/using a tool/);
  assert.equal(updates[1].answer,'Done م');
  await assert.rejects(readCompletionStream(bytes('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n')),/before completion/);
});


test('recovery reads the existing session without submitting another task', async t => {
 const server=http.createServer((req,res)=>{
  assert.equal(req.method,'GET');
  assert.equal(req.url,'/api/sessions/aether-existing/messages?limit=20&order=latest');
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({data:[{role:'assistant',content:'Recovered final reply',finish_reason:'stop'},{role:'session_meta'}]}));
 });
 server.listen(0,'127.0.0.1'); await once(server,'listening');
 t.after(()=>{server.closeAllConnections();server.close();});
 const previous=process.env.HERMES_AGENTS;
 process.env.HERMES_AGENTS=JSON.stringify([{id:'recover',url:'http://127.0.0.1:'+server.address().port,key:'recovery-key'}]);
 t.after(()=>{if(previous===undefined) delete process.env.HERMES_AGENTS; else process.env.HERMES_AGENTS=previous;});
 const result=await recoverTask('recover','aether-existing');
 assert.equal(result.status,'completed');assert.equal(result.answer,'Recovered final reply');
});
