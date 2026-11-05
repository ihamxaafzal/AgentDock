import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeProcessEnded} from '../server/native-coordinator.mjs';
test('restored observation detects a dead native process without confusing restricted access with exit',()=>{
 assert.equal(nativeProcessEnded({pid:123},()=>{}),false);
 assert.equal(nativeProcessEnded({pid:123},()=>{throw Object.assign(Error(),{code:'ESRCH'});}),true);
 assert.equal(nativeProcessEnded({pid:123},()=>{throw Object.assign(Error(),{code:'EPERM'});}),false);
 assert.equal(nativeProcessEnded({exited:true}),true);
 assert.equal(nativeProcessEnded({}),false);
});
