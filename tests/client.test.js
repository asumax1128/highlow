import test from 'node:test';
import assert from 'node:assert/strict';
import {read,load,record} from '../dist/storage.js';
import {RankingClient,SubmissionQueue,NETWORK_ERROR} from '../dist/ranking-client.js';

const KEY='high-low:v1';
const memory=(initial)=>{const map=new Map(initial===undefined?[]:[[KEY,initial]]),writes=[];return {map,writes,getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>{writes.push(k);map.set(k,v)},removeItem:k=>map.delete(k)}};

test('storage distinguishes empty data from a failed read and never overwrites after a failed read',()=>{
 assert.equal(read(memory()).status,'empty');
 const saved=JSON.stringify({version:1,records:{NORMAL:{best:900,plays:4,maxCombo:7,lastPlayed:'2026-11-01T00:00:00.000Z'}}});
 assert.equal(read(memory(saved)).status,'ok');
 let writes=0;const broken={getItem:()=>{throw Error('SecurityError')},setItem:()=>{writes++}};
 assert.equal(read(broken).status,'error');
 const result=record('NORMAL',{score:100,maxCombo:1},broken);
 assert.deepEqual(result,{isBest:false,saved:false,reason:'read-error'});
 assert.equal(writes,0,'a failed read must not be followed by a write');
 // Existing API shape is unchanged for callers of load().
 assert.deepEqual(load(broken),{version:1,records:{}});
});

test('storage does not write over data from an unknown future version',()=>{
 const future=JSON.stringify({version:2,records:{NORMAL:{best:5000}},extra:true});const store=memory(future);
 assert.equal(read(store).status,'future');
 const result=record('NORMAL',{score:100,maxCombo:1},store);
 assert.equal(result.saved,false);assert.equal(result.reason,'future-version');
 assert.equal(store.map.get(KEY),future);assert.equal(store.writes.length,0);
});

test('unreadable (corrupt) data is backed up before a fresh record is written',()=>{
 const store=memory('{not json');const result=record('EASY',{score:300,maxCombo:3},store);
 assert.equal(result.saved,true);
 assert.equal(store.map.get('high-low:v1:corrupt-backup'),'{not json');
 assert.equal(load(store).records.EASY.best,300);
});

test('successful saves still merge with existing records',()=>{
 const store=memory(JSON.stringify({version:1,records:{HARD:{best:700,plays:2,maxCombo:4,lastPlayed:null}}}));
 assert.equal(record('HARD',{score:500,maxCombo:9},store).isBest,false);
 const data=load(store).records.HARD;assert.equal(data.best,700);assert.equal(data.plays,3);assert.equal(data.maxCombo,9);
});

test('browser network errors are shown in Japanese, not as the browser message',async()=>{
 const client=new RankingClient({fetcher:async()=>{throw new TypeError('Failed to fetch')},timeout:100});
 await assert.rejects(client.call('profile'),e=>e.message===NETWORK_ERROR&&e.code==='NETWORK'&&!/Failed|Load failed/.test(e.message));
 const api=new RankingClient({fetcher:async()=>new Response(JSON.stringify({error:{code:'TIMING_MISMATCH',message:'試合時間と通信時間の差が大きいため登録できません。'}}))});
 await assert.rejects(api.call('submit'),e=>e.code==='TIMING_MISMATCH');
});

test('start is bounded by its own short timeout',async()=>{
 const client=new RankingClient({startTimeout:30,fetcher:async(url,options)=>{const {action}=JSON.parse(options.body);if(action==='profile')return new Response('{"player":{"nickname":null}}');return new Promise(()=>{})}});
 const started=Date.now();await assert.rejects(client.start('EASY'),/タイムアウト/);assert(Date.now()-started<1000);
 assert.equal(new RankingClient({gas:true}).startTimeout,5000);
});

test('failed submissions stay in the queue independently of any screen and can be resent later',async()=>{
 let online=false;const bodies=[];
 const client=new RankingClient({fetcher:async(url,options)=>{bodies.push(JSON.parse(options.body));if(!online)throw new TypeError('Load failed');return new Response('{"accepted":true,"registered":true}')}});
 const queue=new SubmissionQueue(client);const seen=[];queue.subscribe(e=>seen.push(e&&e.status));
 const answers=[{questionId:'NORMAL-1',choice:'LEFT',elapsed:812.5}];
 const first=await queue.add({runId:'run-1',difficulty:'NORMAL',score:100,answers});
 assert.equal(first.status,'failed');assert.equal(first.message,NETWORK_ERROR);
 // "Navigating" is just dropping every UI reference: the queue alone still knows the run, its history and its state.
 assert.deepEqual(queue.pending().map(e=>[e.runId,e.status,e.score]),[['run-1','failed',100]]);
 assert.deepEqual(queue.get('run-1').answers,answers);
 online=true;const second=await queue.retry('run-1');
 assert.equal(second.status,'done');assert.equal(second.response.registered,true);assert.equal(queue.pending().length,0);
 assert.deepEqual(bodies[0],bodies[1],'the resend is byte-for-byte the same history');
 assert.deepEqual(seen,['sending','failed','sending','done']);
});

test('server rejections that can never succeed are marked rejected and can be dismissed',async()=>{
 const client=new RankingClient({fetcher:async()=>new Response(JSON.stringify({error:{code:'TIMING_MISMATCH',message:'試合時間と通信時間の差が大きいため登録できません。'}}))});
 const queue=new SubmissionQueue(client);const entry=await queue.add({runId:'run-2',difficulty:'EASY',score:0,answers:[]});
 assert.equal(entry.status,'rejected');await queue.retryAll();assert.equal(client.fetcher.length>=0,true);
 assert.equal(queue.get('run-2').attempts,1,'retryAll does not resend rejected runs');
 queue.dismiss('run-2');assert.equal(queue.pending().length,0);
});

test('a second add for the same run reuses the existing entry',async()=>{
 let calls=0;const client=new RankingClient({fetcher:async()=>{calls++;throw new TypeError('Failed to fetch')}});const queue=new SubmissionQueue(client);
 await queue.add({runId:'r',difficulty:'HARD',score:1,answers:[]});await queue.add({runId:'r',difficulty:'HARD',score:1,answers:[]});
 assert.equal(queue.entries.length,1);assert.equal(calls,2);
});
