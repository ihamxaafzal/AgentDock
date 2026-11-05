import { unlink, rmdir } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';

export function resetTeamTasks(tasks, chiefId, endpoints) {
  const ids = new Set([chiefId, ...endpoints.filter(endpoint => endpoint.reportsTo === chiefId).map(endpoint => endpoint.id)]);
  const previous = [];
  for (const id of ids) { const task = tasks.get(id); if (task) previous.push(task); tasks.delete(id); }
  return previous;
}

export async function discardPreviousInputs(previous, { dataDir, extractionDir, keepPaths = [] }) {
  const canonical = value => { const path = resolve(value); return process.platform === 'win32' ? path.toLowerCase() : path; };
  const keep = new Set(keepPaths.filter(value => typeof value === 'string').map(canonical));
  const documentRoot = canonical(resolve(dataDir, 'documents')) + sep;
  const removed = new Set();
  async function remove(path, isDocument = false) {
    if (keep.has(canonical(path)) || removed.has(canonical(path))) return;
    try { await unlink(path); removed.add(canonical(path)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (isDocument && canonical(dirname(path)).startsWith(documentRoot)) {
      try { await rmdir(dirname(path)); } catch (error) { if (!['ENOTEMPTY', 'ENOENT', 'EEXIST'].includes(error.code)) throw error; }
    }
  }
  for (const task of previous) {
    for (const path of [task.inputDocument?.path, ...(task.documentPaths || [])]) {
      if (typeof path === 'string' && canonical(path).startsWith(documentRoot)) {
        if(task.taskType==='medical-scenes' && path===task.inputDocument?.path) await remove(resolve(dirname(path),'scene-drafts.json'));
        await remove(resolve(path), true);
      }
    }
    if (extractionDir) for (const file of task.artifacts || []) {
      if (!/^(?:(?:image|video)-prompts|medical-scenes)-\d{8}-\d{6}-[a-f0-9]{10}\.(txt|md|json)$/.test(file.name)) continue;
      for (const extension of ['txt', 'md', 'json']) await remove(resolve(extractionDir, file.name.replace(/\.(txt|md|json)$/, '.' + extension)));
    }
  }
}
