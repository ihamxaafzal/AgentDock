import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
const out = resolve('dist');
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp('public', out, { recursive: true });
await mkdir(resolve(out, 'vendor'), { recursive: true });
for (const file of ['three.module.js', 'three.core.js']) {
  await cp(resolve('node_modules/three/build', file), resolve(out, 'vendor', file));
}
await cp(resolve('node_modules/three/LICENSE'), resolve(out, 'vendor/THREE-LICENSE.txt'));
await cp('THIRD_PARTY_NOTICES.md', resolve(out, 'THIRD_PARTY_NOTICES.md'));
console.log('Built dist/ — static demo. Run npm start for the local AgentDock Hermes bridge.');
