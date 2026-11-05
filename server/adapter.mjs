import {CAPABILITIES} from './profile-capabilities.mjs';
const colors = ['#60ddff', '#ffa459', '#b8a1ff', '#77f5c3', '#ff83bb', '#ffd778'];

// One endpoint is one running Hermes profile, not a model or a subagent.
export function readEndpoints(env = process.env) {
  let entries;
  try {
    entries = env.HERMES_AGENTS ? JSON.parse(env.HERMES_AGENTS) : [{
      id: 'hermes', name: 'Hermes', url: env.HERMES_API_URL || 'http://127.0.0.1:8642',
      key: env.HERMES_API_KEY || env.API_SERVER_KEY
    }];
  } catch { throw new Error('HERMES_AGENTS must be a JSON array of {id, name, url, key} endpoints. In .env, keep HERMES_AGENTS on one line, wrap the array in single quotes, use double quotes inside JSON, and remove trailing commas. See .env.example.'); }
  if (!Array.isArray(entries) || !entries.length) throw new Error('Configure at least one Hermes endpoint.');
  const seen = new Set();
  const endpoints = entries.map(entry => {
    if (!entry || typeof entry.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(entry.id) || seen.has(entry.id)) {
      throw new Error('Hermes endpoint IDs must be unique and use 1–64 letters, numbers, underscores or hyphens.');
    }
    seen.add(entry.id);
    let url;
    try { url = new URL(entry.url); } catch { throw new Error('Each Hermes endpoint needs a valid local HTTP URL.'); }
    const path = url.pathname.match(/^\/(?:p\/([a-zA-Z0-9_-]+)(?:\/|$))?(?:v1\/?)?$/);
    if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || !path) {
      throw new Error('Hermes URLs must use loopback HTTP(S), with an optional /v1 path and no embedded credentials.');
    }
    const sampleProfiles = new Set(['your-coordinator-profile', 'your-worker-profile']);
    const sampleKeys = new Set(['COORDINATOR_PROFILE_KEY', 'WORKER_PROFILE_KEY', 'COORDINATOR_PROFILE_API_KEY', 'WORKER_PROFILE_API_KEY', 'PASTE_YOUR_KEY_HERE']);
    if (sampleProfiles.has(entry.profile) || sampleProfiles.has(path[1]) || sampleKeys.has(entry.key)) {
      throw new Error('Replace the placeholder profile names, URLs, and keys from .env.example in your private .env. Each key must match API_SERVER_KEY in that Hermes profile. Restart AgentDock after saving.');
    }
    if (typeof entry.key !== 'string' || !entry.key.trim() || /[\r\n]/.test(entry.key)) {
      throw new Error(env.HERMES_AGENTS
        ? 'Set the key field in each HERMES_AGENTS entry to that profile\'s API_SERVER_KEY. HERMES_API_KEY does not override HERMES_AGENTS. Save .env and restart AgentDock.'
        : 'Set HERMES_API_KEY to your Hermes API_SERVER_KEY, then restart AgentDock.');
    }
    if (entry.profile && !/^[a-zA-Z0-9_-]{1,64}$/.test(entry.profile)) throw new Error('Invalid Hermes profile name.');
    const capabilities = entry.capabilities ?? [];
    const supported = new Set(Object.values(CAPABILITIES));
    if (!Array.isArray(capabilities) || capabilities.some(value => typeof value !== 'string' || !supported.has(value))) throw new Error('Hermes capabilities must use the supported capability IDs listed in the setup guide.');
    const nativeCoordinator = entry.nativeCoordinator === true;
    return { id: entry.id, name: String(entry.name || entry.id).slice(0, 64), url: `${url.origin}${path[1] ? '/p/' + path[1] : ''}/v1`, key: entry.key,
      profile: entry.profile, role: entry.role, reportsTo: entry.reportsTo || null, capabilities, nativeCoordinator };
  });
  if (endpoints.filter(endpoint => endpoint.nativeCoordinator).length > 1) throw new Error('Mark at most one Hermes endpoint as the native coordinator.');
  if (endpoints.some(endpoint => endpoint.reportsTo && !endpoints.some(parent => parent.id === endpoint.reportsTo))) throw new Error('Each reportsTo value must match another Hermes endpoint ID.');
  return endpoints;
}

export async function readCompletionStream(body, onProgress = () => {}) {
  const decoder = new TextDecoder();
  let pending = '', answer = '', finish = null, usage, size = 0;
  function frame(text) {
    const lines = text.split('\n');
    const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim();
    const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return;
    let payload;
    try { payload = JSON.parse(data); } catch { throw new Error('Hermes returned an invalid streaming response. Inspect its session before retrying.'); }
    if (event === 'hermes.tool.progress') {
      onProgress({ progressNote: 'Hermes is using a tool; waiting for its result.' });
      return;
    }
    if (payload.error) throw new Error('Hermes reported a streaming error. Inspect its session before retrying.');
    const choice = payload.choices?.[0];
    if (typeof choice?.delta?.content === 'string') {
      answer += choice.delta.content;
      onProgress({ answer, progressNote: 'Hermes is writing its response…' });
    }
    if (choice?.finish_reason) finish = choice.finish_reason;
    if (payload.usage) usage = payload.usage;
  }
  for await (const chunk of body) {
    size += chunk.byteLength;
    if (size > 4 * 1024 * 1024) throw new Error('Hermes response exceeded the 4 MB bridge limit.');
    pending += decoder.decode(chunk, { stream: true }).replace(/\r/g, '');
    let end;
    while ((end = pending.indexOf('\n\n')) !== -1) {
      frame(pending.slice(0, end)); pending = pending.slice(end + 2);
    }
  }
  pending += decoder.decode();
  if (pending.trim()) frame(pending);
  if (!finish) throw new Error('Hermes response stream ended before completion. Inspect its session before retrying.');
  return { choices: [{ message: { content: answer }, finish_reason: finish }], usage };
}

export async function request(endpoint, path, { method = 'GET', body, sessionId, timeout = 15000, onProgress } = {}) {
  try {
    const response = await fetch(endpoint.url + path, {
      method, redirect: 'error', signal: AbortSignal.timeout(timeout),
      headers: { Authorization: `Bearer ${endpoint.key}`, 'Content-Type': 'application/json',
        ...(sessionId ? { 'X-Hermes-Session-Id': sessionId, 'Idempotency-Key': sessionId } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(response.status === 401 || response.status === 403
        ? 'Hermes authentication failed. Check the matching HERMES_AGENTS entry\'s key (or HERMES_API_KEY for single-profile setup) against that profile\'s API_SERVER_KEY, then restart AgentDock.'
        : response.status === 404
        ? 'Hermes returned HTTP 404. Check the configured profile name and URL. Shared gateways need profile multiplexing and a working /p/<profile>/v1/models route; separate profile gateways use their own listener URL.'
        : `Hermes returned HTTP ${response.status}. Inspect its gateway before retrying.`);
    }
    if (response.headers.get('content-type')?.includes('text/event-stream')) return await readCompletionStream(response.body, onProgress);
    let text = '', size = 0;
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > 4 * 1024 * 1024) throw new Error('Hermes response exceeded the 4 MB bridge limit.');
      text += decoder.decode(chunk, { stream: true });
    }
    text += decoder.decode();
    try { return JSON.parse(text); } catch { throw new Error('Hermes returned invalid JSON. Check the API URL and installed Hermes version.'); }
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError' || ['UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'].includes(error.cause?.code)) {
      throw new Error('Hermes request timed out. Work may still be running; inspect Hermes before retrying.');
    }
    // Upstream bodies and headers can contain credentials; never expose them.
    if (error.message.startsWith('Hermes ')) throw error;
    throw new Error('Cannot reach the local Hermes API. Enable API_SERVER_ENABLED and start hermes gateway.');
  }
}

export function normalizeRoster(profiles, tasks = new Map()) {
  return profiles.map((profile, index) => {
    const task = tasks.get(profile.id);
    return {
      id: profile.id, name: profile.name, role: profile.role || 'Hermes Agent profile', color: colors[index % colors.length],
      reportsTo: profile.reportsTo || null, nativeCoordinator: profile.nativeCoordinator || false, capabilities: profile.capabilities || [],
      model: profile.model, status: task?.status === 'running' ? 'working' : task?.status === 'failed' ? 'attention' : 'unknown',
      task: task?.message || 'No AgentDock-dispatched task', progress: null,
      tokens: task?.tokens ?? null, contextLimit: null, lastSeen: task?.completedAt ?? task?.startedAt ?? null,
      recent: false, sessions: null, answer: task?.answer || '', error: task?.error || '',
      taskStatus: task?.status || null, sessionId: task?.sessionId || null, startedAt: task?.startedAt ?? null,
      parentRunId: task?.parentRunId || null,
      activeCount: task?.activeCount || 0, queuedCount: task?.queuedCount || 0,
      progressNote: task?.progressNote || '', artifacts: task?.artifacts || [],
      statusSource: task ? 'AgentDock task execution; tokens are for this request only' : 'Hermes API profile; external activity and session totals are not observed'
    };
  });
}

export async function readRoster(tasks) {
  const profiles = await Promise.all(readEndpoints().map(async endpoint => {
    const payload = await request(endpoint, '/models');
    const model = payload?.data?.[0]?.id;
    if (typeof model !== 'string' || !model) throw new Error('Hermes /v1/models did not advertise a profile. Check the API version.');
    return { id: endpoint.id, name: endpoint.name, model, role: endpoint.role, reportsTo: endpoint.reportsTo, nativeCoordinator: endpoint.nativeCoordinator, capabilities: endpoint.capabilities };
  }));
  return normalizeRoster(profiles, tasks);
}

export async function sendTask(agentId, message, sessionId, onProgress) {
  const endpoint = readEndpoints().find(entry => entry.id === agentId);
  if (!endpoint) throw new Error('Hermes profile is no longer configured.');
  const result = await request(endpoint, '/chat/completions', {
    method: 'POST', sessionId, timeout: 30 * 60 * 1000, onProgress,
    body: { messages: [{ role: 'user', content: message }], stream: true, stream_options: { include_usage: true } }
  });
  const choice = result?.choices?.[0];
  const answer = choice?.message?.content;
  if (typeof answer !== 'string') throw new Error('Hermes returned no text result. Inspect the session before retrying.');
  const completed = choice.finish_reason === 'stop';
  return {
    status: completed ? 'completed' : 'failed', answer: answer.trim(),
    tokens: Number.isFinite(result.usage?.total_tokens) ? result.usage.total_tokens : null,
    ...(!completed ? { error: choice.finish_reason === 'length'
      ? 'Hermes stopped before completing the task (iteration or token limit). The partial answer is shown below.'
      : 'Hermes did not report successful completion. Inspect its session before retrying.' } : {})
  };
}

// Recovery is read-only: never resubmit work after a lost HTTP connection.
export async function recoverTask(agentId, sessionId, onProgress = () => {}, { pollInterval = 5000, timeout = 30 * 60 * 1000 } = {}) {
  const endpoint = readEndpoints().find(entry => entry.id === agentId);
  if (!endpoint || !/^aether-[a-zA-Z0-9-]+$/.test(sessionId)) throw new Error('Hermes session cannot be recovered automatically.');
  const api = { ...endpoint, url: endpoint.url.replace(/\/v1$/, '') };
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const payload = await request(api, `/api/sessions/${encodeURIComponent(sessionId)}/messages?limit=20&order=latest`);
    if (!Array.isArray(payload.data)) throw new Error('Hermes session history is unavailable. Inspect Hermes before retrying.');
    const latest = payload.data.filter(message => ['assistant', 'user', 'tool'].includes(message.role)).at(-1);
    if (latest?.role === 'assistant' && !latest.tool_calls?.length && ['stop', 'length', 'error', 'cancelled'].includes(latest.finish_reason)) {
      return {
        status: latest.finish_reason === 'stop' ? 'completed' : 'failed',
        answer: typeof latest.content === 'string' ? latest.content : '',
        ...(latest.finish_reason !== 'stop' ? { error: 'Hermes stopped before successful completion. Recovered reply is shown below.' } : {}),
        progressNote: 'Recovered from the existing Hermes session.'
      };
    }
    onProgress({ progressNote: 'Reconnected to the existing Hermes task. Waiting for its final reply…' });
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  throw new Error('Hermes session recovery timed out. The task may still be running; inspect Hermes before retrying.');
}
