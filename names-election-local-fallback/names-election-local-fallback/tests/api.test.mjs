import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import { createLocalApi } from '../src/local/server.mjs';
import { LocalElectionStore } from '../src/local/store.mjs';
const manifest = JSON.parse(readFileSync(new URL('../fixtures/manifest.json', import.meta.url)));
const voters = JSON.parse(readFileSync(new URL('../fixtures/voters.json', import.meta.url)));
test('HTTP login, correct ballot, invalid submission rejection, duplicate vote rejection',async()=>{
 const store=new LocalElectionStore({manifest,voters});
 const server=createLocalApi({store}); server.listen(0,'127.0.0.1'); await once(server,'listening');
 const base=`http://127.0.0.1:${server.address().port}`;
 try {
   const health=await (await fetch(`${base}/api/health`)).json(); assert.equal(health.mode,'LOCAL_DEMO_ONLY');
   const login=await fetch(`${base}/api/dev/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({voterId:'marine-demo-001'})});
   assert.equal(login.status,200); const {token}=await login.json();
   const headers={'authorization':`Bearer ${token}`,'content-type':'application/json'};
   const ballot=await (await fetch(`${base}/api/ballot`,{headers})).json();
   assert.deepEqual(ballot.positions.map(p=>p.id),['president','secretary','vp_marine']);
   let response=await fetch(`${base}/api/votes`,{method:'POST',headers,body:JSON.stringify({selections:{president:'president_a',secretary:'secretary_a',vp_mechanical:'mechanical_a'}})});
   assert.equal(response.status,400);
   response=await fetch(`${base}/api/votes`,{method:'POST',headers,body:JSON.stringify({selections:{president:'president_b',secretary:'secretary_a',vp_marine:'marine_b'}})});
   assert.equal(response.status,201);
   response=await fetch(`${base}/api/votes`,{method:'POST',headers,body:JSON.stringify({selections:{president:'president_b',secretary:'secretary_a',vp_marine:'marine_b'}})});
   assert.equal(response.status,409);
   const counts=await (await fetch(`${base}/api/demo/results`,{headers})).json();
   assert.equal(counts.acceptedBallots,1);
 } finally { await new Promise(resolve=>server.close(resolve)); store.close(); }
});
